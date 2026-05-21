// ============================================================
// Supabase Edge Function: stripe-sync
// ============================================================
// Pulls all Stripe customers + subscriptions, computes month-by-month MRR
// per customer for the trailing 13 months, and upserts into
// commission_customers. Preserves commission_assignments via the unique
// index on stripe_customer_id (assignments survive re-sync).
//
// Deploy:
//   supabase functions deploy stripe-sync
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//
// Invoke from the frontend:
//   const { data, error } = await supabase.functions.invoke('stripe-sync')
//
// Returns: { customers_upserted: N, months: [...], generated_at: ISO,
//            duration_ms: N, errors: [...] }
//
// Required env vars (auto-injected by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SECRET_KEY     <-- set via `supabase secrets set`
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";
const TRAILING_MONTHS = 13;
const SELF_SERVE_MAX_MRR = 100;
const AE_ERA_START = "2025-11-01";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ------------------------------------------------------------
// Stripe helpers
// ------------------------------------------------------------
async function stripeRequest(path: string, sk: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function stripePaginate(resource: string, sk: string, query = ""): Promise<any[]> {
  const items: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  while (true) {
    pages++;
    if (pages > 200) throw new Error(`Pagination runaway on ${resource} (>20k records)`);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (query) {
      const qp = new URLSearchParams(query);
      qp.forEach((v, k) => params.set(k, v));
    }
    if (startingAfter) params.set("starting_after", startingAfter);
    const j = await stripeRequest(`/${resource}?${params.toString()}`, sk);
    items.push(...(j.data || []));
    if (!j.has_more) break;
    startingAfter = j.data[j.data.length - 1].id;
  }
  return items;
}

// ------------------------------------------------------------
// Date helpers
// ------------------------------------------------------------
function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastNMonths(n: number): string[] {
  const cols: string[] = [];
  const now = new Date();
  // Anchor at the first of the current month, UTC
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    cols.push(ymOf(d));
  }
  return cols;
}

// Months a subscription was active (inclusive of start month, exclusive of end month).
function activeMonthsForSub(sub: any, monthCols: string[]): string[] {
  if (!sub.start_date) return [];
  const startMo = ymOf(new Date(sub.start_date * 1000));
  const endMo = sub.canceled_at
    ? ymOf(new Date(sub.canceled_at * 1000))
    : sub.ended_at
    ? ymOf(new Date(sub.ended_at * 1000))
    : null;
  return monthCols.filter((m) => m >= startMo && (!endMo || m < endMo || m === endMo));
}

// MRR for a subscription = sum of (unit_amount * quantity * recurring_factor) for active items
function mrrOfSub(sub: any): number {
  if (!sub.items?.data) return 0;
  let cents = 0;
  for (const item of sub.items.data) {
    const unit = item.price?.unit_amount || 0;
    const qty = item.quantity || 1;
    const interval = item.price?.recurring?.interval || "month";
    const intervalCount = item.price?.recurring?.interval_count || 1;
    // Normalize to monthly
    let monthlyFactor = 1;
    if (interval === "year") monthlyFactor = 1 / (12 * intervalCount);
    else if (interval === "week") monthlyFactor = (52 / 12) / intervalCount;
    else if (interval === "day") monthlyFactor = (365 / 12) / intervalCount;
    else monthlyFactor = 1 / intervalCount; // month
    cents += unit * qty * monthlyFactor;
  }
  return cents / 100;
}

// ------------------------------------------------------------
// Main handler
// ------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  const errors: string[] = [];

  try {
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (!sk) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth: require a signed-in user, and they must be a commission manager.
    // We verify by calling profiles with the user's JWT (so RLS applies).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: profile, error: profErr } = await userClient
      .from("profiles")
      .select("role, role_type, is_team_lead")
      .eq("id", user.id)
      .single();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const isManager =
      profile.role === "executive" ||
      profile.role === "manager" ||
      profile.is_team_lead === true ||
      ["ceo", "coo", "cto", "cfo", "vp"].includes(profile.role_type);
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Forbidden — manager access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use service-role client for the upsert so RLS doesn't block writes.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Fetch from Stripe ----
    const monthCols = lastNMonths(TRAILING_MONTHS);
    const [customers, subs] = await Promise.all([
      stripePaginate("customers", sk),
      stripePaginate("subscriptions", sk, "status=all&expand[]=data.items.data.price"),
    ]);

    // ---- Build per-customer monthly MRR ----
    const byId: Record<string, any> = {};
    for (const c of customers) {
      if (!c.email) continue; // skip customers without an email
      byId[c.id] = {
        stripe_customer_id: c.id,
        email: c.email,
        name: c.name || c.email,
        start_date: null as string | null,
        end_date: null as string | null,
        max_mrr: 0,
        is_self_serve: false,
        is_ae_era: false,
        is_active_ever: false,
        monthly_mrr: Object.fromEntries(monthCols.map((m) => [m, 0])),
      };
    }

    for (const s of subs) {
      const row = byId[s.customer];
      if (!row) continue;
      const subMrr = mrrOfSub(s);
      const activeMonths = activeMonthsForSub(s, monthCols);
      for (const m of activeMonths) {
        row.monthly_mrr[m] += subMrr;
      }
      const subStart = s.start_date
        ? new Date(s.start_date * 1000).toISOString().slice(0, 10)
        : null;
      const subEnd = s.canceled_at
        ? new Date(s.canceled_at * 1000).toISOString().slice(0, 10)
        : s.ended_at
        ? new Date(s.ended_at * 1000).toISOString().slice(0, 10)
        : null;
      // earliest start across all subs
      if (subStart && (!row.start_date || subStart < row.start_date)) row.start_date = subStart;
      // latest end (only if all subs ended)
      if (subEnd && (!row.end_date || subEnd > row.end_date)) row.end_date = subEnd;
      if (!subEnd) row.end_date = null; // any active sub clears end_date
    }

    // Derive flags
    const upsertRows: any[] = [];
    for (const row of Object.values(byId) as any[]) {
      const monthlyVals = Object.values(row.monthly_mrr) as number[];
      row.max_mrr = Math.max(0, ...monthlyVals);
      row.is_self_serve = row.max_mrr > 0 && row.max_mrr <= SELF_SERVE_MAX_MRR;
      row.is_ae_era = row.start_date ? row.start_date >= AE_ERA_START : false;
      row.is_active_ever = row.max_mrr > 0;
      // Skip rows with no payment history AND no subscription (clutter)
      if (row.max_mrr === 0 && !row.start_date) continue;
      upsertRows.push({ ...row, last_synced_at: new Date().toISOString() });
    }

    // ---- Upsert in batches of 500 ----
    const BATCH = 500;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += BATCH) {
      const batch = upsertRows.slice(i, i + BATCH);
      const { error: upErr } = await admin
        .from("commission_customers")
        .upsert(batch, { onConflict: "stripe_customer_id" });
      if (upErr) {
        errors.push(`Batch ${i / BATCH}: ${upErr.message}`);
      } else {
        upserted += batch.length;
      }
    }

    // ---- Reconcile assignments: if an assignment row has no stripe_customer_id
    // but its email matches a customer, fill in the stripe_customer_id. This
    // is the "email fallback" you asked for.
    const { data: legacyAssignments } = await admin
      .from("commission_assignments")
      .select("id, email, stripe_customer_id")
      .is("stripe_customer_id", null);
    if (legacyAssignments && legacyAssignments.length > 0) {
      const emailMap = new Map<string, string>();
      for (const r of upsertRows) emailMap.set(r.email.toLowerCase(), r.stripe_customer_id);
      let reconciled = 0;
      for (const a of legacyAssignments) {
        const match = emailMap.get(a.email.toLowerCase());
        if (match) {
          const { error: rErr } = await admin
            .from("commission_assignments")
            .update({ stripe_customer_id: match })
            .eq("id", a.id);
          if (!rErr) reconciled++;
        }
      }
      if (reconciled > 0) errors.push(`(info) Reconciled ${reconciled} legacy assignments by email.`);
    }

    // ---- Audit log entry ----
    await admin.from("commission_audit_log").insert({
      actor_id: user.id,
      action: "stripe_sync",
      target_type: "customer",
      target_id: null,
      after_value: {
        customers_upserted: upserted,
        months: monthCols,
        duration_ms: Date.now() - t0,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        customers_upserted: upserted,
        customers_fetched: customers.length,
        subscriptions_fetched: subs.length,
        months: monthCols,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message, duration_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
