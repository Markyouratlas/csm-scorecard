// ============================================================
// Supabase Edge Function: stripe-failed-payments
// ============================================================
// The dunning call-list. Live-fetches Stripe invoices that are in dunning —
// auto-collection invoices whose payment has FAILED (status=open with a retry
// attempt) plus status=uncollectible (Stripe gave up — highest priority) — and
// enriches each customer with a phone number so the exec can call them from the
// in-app dialer. Phone precedence: our own ae_deals / fulfillment rows first
// (free, already E.164-ish), then a GoHighLevel contacts lookup by email.
//
// Nothing is stored — it's a read-only, on-demand snapshot (like stripe-daily-cash).
//
// Exec-only: the caller's JWT must belong to an executive. Stripe secret stays
// server-side; GHL lookup runs server-side too.
//
// Deploy (JWT on — signed-in exec call, NOT a public webhook):
//   supabase functions deploy stripe-failed-payments
//   (STRIPE_SECRET_KEY, GHL_API_KEY, GHL_LOCATION_ID already exist — no new secret)
//
// Invoke:  supabase.functions.invoke('stripe-failed-payments')
// Returns: { rows: [ { customer_id, name, email, phone, phone_source,
//   amount_due, currency, attempt_count, next_attempt, created, status,
//   plan, hosted_invoice_url, subscription_id } ], count, generatedAt }
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";
const GHL_HOST = "https://services.leadconnectorhq.com";
const GHL_VER = "2021-07-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const lc = (v: any) => String(v || "").trim().toLowerCase();

// Normalize a raw phone to E.164 (mirrors cal-booking-inbound's e164 helper).
function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}

async function stripeRequest(path: string, sk: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${sk}` } });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function stripePaginate(resource: string, sk: string, query = ""): Promise<any[]> {
  const items: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  while (true) {
    if (++pages > 50) throw new Error(`Pagination runaway on ${resource}`);
    const params = new URLSearchParams(query);
    params.set("limit", "100");
    if (startingAfter) params.set("starting_after", startingAfter);
    const j = await stripeRequest(`/${resource}?${params.toString()}`, sk);
    items.push(...(j.data || []));
    if (!j.has_more || !j.data?.length) break;
    startingAfter = j.data[j.data.length - 1].id;
  }
  return items;
}

// GHL contacts search by email → E.164 phone (mirrors cal-booking-inbound).
async function ghlPhoneByEmail(email: string, key: string, loc: string): Promise<string> {
  try {
    const g = await fetch(
      `${GHL_HOST}/contacts/?locationId=${encodeURIComponent(loc)}&query=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${key}`, Version: GHL_VER } },
    );
    if (!g.ok) return "";
    const gj = await g.json().catch(() => ({}));
    const list: any[] = gj?.contacts || [];
    const hit = list.find((c) => lc(c?.email) === lc(email) && c?.phone) || list.find((c) => c?.phone);
    return e164(hit?.phone || "");
  } catch { return ""; }
}

const unix = (n: any) => (n ? new Date(Number(n) * 1000).toISOString() : null);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

    // ---- Auth: executive only ----
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const { data: profile } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
    const isExec = profile?.role === "executive" || profile?.role_type === "executive";
    if (!isExec) return json({ error: "Forbidden — executive access required" }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- 1. Find every payment problem ----
    // Detect from the SUBSCRIPTION status (incomplete / past_due / unpaid) — this
    // catches "incomplete" first-payment failures that never log an invoice
    // attempt_count — plus uncollectible + attempted-open invoices as a backstop
    // (final notices / subs Stripe already canceled). Dedup by invoice id; the
    // richer signal wins (incomplete > uncollectible > retrying).
    const seen = new Set<string>();
    const dunning: { inv: any; kind: string }[] = [];
    const add = (inv: any, kind: string) => {
      if (!inv || typeof inv !== "object" || !inv.id || seen.has(inv.id)) return;
      const owed = (inv.amount_remaining != null ? inv.amount_remaining : inv.amount_due) || 0;
      if (owed <= 0) return;
      seen.add(inv.id);
      dunning.push({ inv, kind });
    };

    // Problem subscriptions (latest_invoice expanded gives us the failing invoice).
    // NO collection_method filter here — a past_due/unpaid/incomplete customer is
    // overdue whether they're auto-charged or billed by sent invoice (e.g. higher
    // plans like Atlas Growth invoiced manually).
    for (const st of ["incomplete", "incomplete_expired", "past_due", "unpaid"]) {
      const subs = await stripePaginate("subscriptions", sk, `status=${st}&expand[]=data.latest_invoice`);
      for (const s of subs) add(s.latest_invoice, st.startsWith("incomplete") ? "incomplete" : "open");
    }
    // Uncollectible invoices — Stripe gave up (sub may already be canceled).
    for (const inv of await stripePaginate("invoices", sk, "status=uncollectible")) add(inv, "uncollectible");
    // Attempted-but-still-open AUTO-charge invoices — backstop for anything the
    // subs missed (here we DO require auto-charge + a failed attempt, so we don't
    // pull in send_invoice invoices that are simply awaiting their due date).
    for (const inv of await stripePaginate("invoices", sk, "status=open")) {
      if (inv.collection_method === "charge_automatically" && (inv.attempt_count || 0) > 0) add(inv, "open");
    }

    // ---- 2. Shape rows ----
    const rows = dunning.map(({ inv, kind }) => {
      const line = Array.isArray(inv.lines?.data) ? inv.lines.data[0] : null;
      return {
        invoice_id: inv.id,
        customer_id: inv.customer || null,
        name: inv.customer_name || null,
        email: lc(inv.customer_email),
        phone: "", phone_source: null as string | null,
        amount_due: Math.round((((inv.amount_remaining ?? inv.amount_due) || 0) / 100) * 100) / 100,
        currency: (inv.currency || "usd").toLowerCase(),
        attempt_count: inv.attempt_count || 0,
        next_attempt: unix(inv.next_payment_attempt),
        created: unix(inv.created),
        auto: inv.collection_method === "charge_automatically",
        status: kind, // 'incomplete' (first payment failed) | 'open' (retrying) | 'uncollectible' (given up)
        plan: line?.description || null,
        hosted_invoice_url: inv.hosted_invoice_url || null,
        subscription_id: (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id) || null,
      };
    });

    // ---- 3. Enrich phone: our DB first, then GHL ----
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];
    const byStripe = new Map<string, string>(); // custId -> phone
    const byEmail = new Map<string, string>();   // email  -> phone
    const remember = (sid: any, em: any, ph: any) => {
      const p = e164(ph || "");
      if (!p) return;
      if (sid && !byStripe.has(sid)) byStripe.set(sid, p);
      if (em && !byEmail.has(lc(em))) byEmail.set(lc(em), p);
    };
    if (custIds.length || emails.length) {
      const [d1, d2, f1] = await Promise.all([
        custIds.length ? admin.from("ae_deals").select("matched_stripe_customer_id, customer_email, customer_phone").in("matched_stripe_customer_id", custIds).not("customer_phone", "is", null) : Promise.resolve({ data: [] }),
        emails.length ? admin.from("ae_deals").select("matched_stripe_customer_id, customer_email, customer_phone").in("customer_email", emails).not("customer_phone", "is", null) : Promise.resolve({ data: [] }),
        custIds.length ? admin.from("fulfillment_clients").select("matched_stripe_customer_id, poc_phone").in("matched_stripe_customer_id", custIds).not("poc_phone", "is", null) : Promise.resolve({ data: [] }),
      ]);
      for (const r of (d1 as any).data || []) remember(r.matched_stripe_customer_id, r.customer_email, r.customer_phone);
      for (const r of (d2 as any).data || []) remember(r.matched_stripe_customer_id, r.customer_email, r.customer_phone);
      for (const r of (f1 as any).data || []) remember(r.matched_stripe_customer_id, null, r.poc_phone);
    }

    // GHL fallback for anyone still without a phone (dedup by email).
    const ghlKey = Deno.env.get("GHL_API_KEY") || "";
    const ghlLoc = Deno.env.get("GHL_LOCATION_ID") || "";
    const ghlCache = new Map<string, string>();
    for (const r of rows) {
      let phone = (r.customer_id && byStripe.get(r.customer_id)) || byEmail.get(r.email) || "";
      let source: string | null = phone ? "atlas" : null;
      if (!phone && r.email && ghlKey && ghlLoc) {
        if (!ghlCache.has(r.email)) ghlCache.set(r.email, await ghlPhoneByEmail(r.email, ghlKey, ghlLoc));
        phone = ghlCache.get(r.email) || "";
        if (phone) source = "ghl";
      }
      r.phone = phone;
      r.phone_source = source;
    }

    // Sort: uncollectible first, then by amount owed desc.
    rows.sort((a, b) =>
      (a.status === "uncollectible" ? 0 : 1) - (b.status === "uncollectible" ? 0 : 1) ||
      b.amount_due - a.amount_due);

    return json({ rows, count: rows.length, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
