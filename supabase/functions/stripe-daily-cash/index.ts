// ============================================================
// Supabase Edge Function: stripe-daily-cash
// ============================================================
// Returns the GROSS cash collected on a single Toronto calendar day —
// the sum of all succeeded, captured USD charges created that day
// (both subscription-invoice payments and one-off charges). This is the
// "Cash Collected" figure for the investor Daily Update; refunds are
// reported separately (not subtracted from gross), per the investor spec.
//
// Exec-only: the caller's JWT must belong to an executive — investors and
// staff never see daily cash. The Stripe secret stays server-side.
//
// Deploy:
//   supabase functions deploy stripe-daily-cash
//   (STRIPE_SECRET_KEY is already set from stripe-sync — no new secret needed)
//
// Invoke from the frontend (exec only):
//   supabase.functions.invoke('stripe-daily-cash', { body: { date: '2026-06-23' } })
//   // date optional — defaults to today in America/Toronto
//
// Returns: { date, grossCash, refunds, netCash, count, currency: 'usd' }
//
// Env (auto-injected except the Stripe key):
//   SUPABASE_URL, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";
const TZ = "America/Toronto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- Stripe paginate (same shape as stripe-sync) ----
async function stripeRequest(path: string, sk: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${sk}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Stripe ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function stripePaginate(resource: string, sk: string, query = ""): Promise<any[]> {
  const items: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  while (true) {
    pages++;
    if (pages > 100) throw new Error(`Pagination runaway on ${resource}`);
    const params = new URLSearchParams(query);
    params.set("limit", "100");
    if (startingAfter) params.set("starting_after", startingAfter);
    const j = await stripeRequest(`/${resource}?${params.toString()}`, sk);
    items.push(...(j.data || []));
    if (!j.has_more) break;
    startingAfter = j.data[j.data.length - 1].id;
  }
  return items;
}

// ---- Toronto day → unix-second bounds ----
// The UTC instant of 00:00 America/Toronto on the given YYYY-MM-DD.
function torontoMidnightUnix(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(base).reduce((a: any, p) => (a[p.type] = p.value, a), {});
  const asToronto = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offset = base.getTime() - asToronto;
  return Math.floor((base.getTime() + offset) / 1000);
}

// Today's Toronto calendar date as YYYY-MM-DD.
function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

    // ---- Auth: executive only ----
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const { data: profile } = await userClient
      .from("profiles").select("role, role_type").eq("id", user.id).single();
    const isExec = profile?.role === "executive" || profile?.role_type === "executive";
    if (!isExec) return json({ error: "Forbidden — executive access required" }, 403);

    // ---- Date window ----
    let date = torontoToday();
    try {
      const body = await req.json();
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) date = body.date;
    } catch { /* no body → default today */ }
    const start = torontoMidnightUnix(date);
    const end = start + 86400;

    // ---- Sum succeeded, captured USD charges for the day ----
    const charges = await stripePaginate("charges", sk, `created[gte]=${start}&created[lt]=${end}`);
    let grossCash = 0;
    let refunds = 0;
    let count = 0;
    for (const ch of charges) {
      if (ch.status !== "succeeded" || ch.paid !== true) continue;
      if (ch.currency && ch.currency !== "usd") continue;
      const captured = (ch.amount_captured != null ? ch.amount_captured : ch.amount) || 0;
      if (captured <= 0) continue;
      grossCash += captured / 100;
      refunds += (ch.amount_refunded || 0) / 100;
      count++;
    }

    return json({
      date,
      grossCash: Math.round(grossCash * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      netCash: Math.round((grossCash - refunds) * 100) / 100,
      count,
      currency: "usd",
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
