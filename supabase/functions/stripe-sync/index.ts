// ============================================================
// Supabase Edge Function: stripe-sync
// ============================================================
// Pulls all Stripe customers + subscriptions + paid invoices, computes
// month-by-month MRR and cash-received per customer for the trailing
// 13 months, captures per-sub detail (status, renewal, MRR, product),
// and upserts into commission_customers. Preserves commission_assignments
// via the unique index on stripe_customer_id (assignments survive re-sync).
//
// Deploy:
//   supabase functions deploy stripe-sync
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//
// Invoke from the frontend:
//   const { data, error } = await supabase.functions.invoke('stripe-sync')
//
// Returns: { ok, status: "accepted", ... } immediately. Sync runs in
// background; check commission_audit_log for completion.
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
//
// IMPORTANT: This function returns 202 Accepted immediately and runs the
// actual sync in the background using EdgeRuntime.waitUntil(). This is
// necessary because Stripe accounts with thousands of customers can take
// 2-5 minutes to fully sync — well beyond Supabase's 60-150 second function
// timeout for synchronous responses.
//
// The caller (UI button or cron) doesn't wait. To know if the sync finished,
// check commission_customers.last_synced_at — it updates row-by-row as the
// upsert progresses. When the most recent timestamp matches "right now,"
// the sync has finished.
//
// The audit log entry is written at the END of the background work, so its
// presence is another signal that the run completed.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (!sk) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth: two valid paths (see comments above the original code).
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecretHeader = req.headers.get("X-Cron-Secret") || "";
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const isServiceRoleCall = !!cronSecret && cronSecretHeader === cronSecret;

    // `actorId` is stored for the audit log. For cron calls it stays null
    // (the audit log accepts null actor_id for system events).
    let actorId: string | null = null;

    if (!isServiceRoleCall) {
      // Path A: verify user is a signed-in manager.
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
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
      actorId = user.id;
    }

    // Kick the actual sync work off into the background. Deno's EdgeRuntime
    // keeps the worker alive after we return the 202 response, so the long-
    // running sync continues to completion.
    //
    // @ts-ignore — EdgeRuntime is a Supabase-specific global, not in @types/deno
    EdgeRuntime.waitUntil(runSync(sk, actorId, isServiceRoleCall));

    return new Response(
      JSON.stringify({
        ok: true,
        status: "accepted",
        message: "Sync started. Check commission_customers.last_synced_at in 2-5 minutes to confirm completion.",
        triggered_by: isServiceRoleCall ? "cron" : "user",
        actor_id: actorId,
        started_at: new Date().toISOString(),
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ------------------------------------------------------------
// runSync — the actual sync logic
// ------------------------------------------------------------
// Runs in the background after the handler responds. Errors are caught and
// logged to commission_audit_log so they're visible in the dashboard.
async function runSync(sk: string, actorId: string | null, isServiceRoleCall: boolean) {
  const t0 = Date.now();
  const errors: string[] = [];

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Fetch from Stripe ----
    const monthCols = lastNMonths(TRAILING_MONTHS);
    // Calculate the cutoff for invoice fetching: start of the earliest month in monthCols.
    // We want all paid invoices from the trailing 13 months (matches monthly_mrr window).
    const earliestMonth = monthCols[0]; // e.g. "2025-05"
    const invoiceCutoffTs = Math.floor(new Date(earliestMonth + "-01T00:00:00Z").getTime() / 1000);
    const invoiceQuery = `status=paid&created[gte]=${invoiceCutoffTs}`;

    const [customers, subs, invoices] = await Promise.all([
      stripePaginate("customers", sk),
      stripePaginate("subscriptions", sk, "status=all&expand[]=data.items.data.price"),
      stripePaginate("invoices", sk, invoiceQuery),
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
        // Cash actually collected per month (sourced from paid invoices, not
        // subscription state). This is the basis for residual commission math.
        monthly_cash_received: Object.fromEntries(monthCols.map((m) => [m, 0])),
        // Phase 2: per-sub detail for the drill-down UI (status pills, renewal dates).
        // subscriptions is an array of { id, status, product_label, mrr, current_period_end, ... }
        // current_period_end is the earliest renewal date across all ACTIVE subs (for sorting).
        subscriptions: [] as any[],
        current_period_end: null as string | null,
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

      // Phase 2: capture per-sub detail for the drill-down UI.
      // Build a product label by concatenating each item's price.nickname
      // (or product id fallback). This gives the UI a human-readable name.
      const productLabels: string[] = [];
      for (const item of s.items?.data || []) {
        const nickname = item.price?.nickname;
        const productId = item.price?.product;
        if (nickname) productLabels.push(nickname);
        else if (productId) productLabels.push(String(productId));
      }
      const productLabel = productLabels.length > 0 ? productLabels.join(" + ") : "Subscription";

      // current_period_end is Stripe's "next billing date" (or expiry for canceled).
      const periodEndIso = s.current_period_end
        ? new Date(s.current_period_end * 1000).toISOString()
        : null;

      row.subscriptions.push({
        id: s.id,
        status: s.status,                              // active | canceled | past_due | trialing | paused | incomplete | unpaid
        product_label: productLabel,
        mrr: subMrr,
        current_period_end: periodEndIso,
        cancel_at_period_end: s.cancel_at_period_end || false,
        created: s.created ? new Date(s.created * 1000).toISOString() : null,
        canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
        ended_at: s.ended_at ? new Date(s.ended_at * 1000).toISOString() : null,
      });

      // Track the earliest upcoming current_period_end across all ACTIVE subs.
      // This becomes the customer's "next renewal" scalar for dashboard sorting.
      const isActiveStatus = ["active", "trialing", "past_due"].includes(s.status);
      if (isActiveStatus && periodEndIso) {
        if (!row.current_period_end || periodEndIso < row.current_period_end) {
          row.current_period_end = periodEndIso;
        }
      }
    }

    // ---- Aggregate cash received per customer per month from paid invoices ----
    // Invoices have amount_paid (cents) and status_transitions.paid_at (unix
    // timestamp). We bucket by the month the invoice was paid.
    for (const inv of invoices) {
      const row = byId[inv.customer];
      if (!row) continue;
      const paidAtTs = inv.status_transitions?.paid_at;
      if (!paidAtTs) continue;
      const paidMonth = ymOf(new Date(paidAtTs * 1000));
      if (!row.monthly_cash_received.hasOwnProperty(paidMonth)) continue; // outside our window
      const amountDollars = (inv.amount_paid || 0) / 100;
      row.monthly_cash_received[paidMonth] += amountDollars;
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
    // Count customers whose subscriptions array was populated, so we can
    // verify the Phase 2 code path actually ran (same diagnostic pattern as
    // invoices_fetched on the Phase 1 fix).
    const customersWithSubs = upsertRows.filter((r) => r.subscriptions && r.subscriptions.length > 0).length;

    await admin.from("commission_audit_log").insert({
      actor_id: actorId,  // null for cron, user id for UI button
      action: "stripe_sync",
      target_type: "customer",
      target_id: null,
      after_value: {
        customers_upserted: upserted,
        customers_fetched: customers.length,
        subscriptions_fetched: subs.length,
        invoices_fetched: invoices.length,
        customers_with_subs_populated: customersWithSubs,
        months: monthCols,
        duration_ms: Date.now() - t0,
        triggered_by: isServiceRoleCall ? "cron" : "user",
        errors,
      },
    });

    // Background work complete. Nothing to return — the original 202 already shipped.
    console.log(`[stripe-sync] Sync complete: ${upserted} customers, ${Date.now() - t0}ms`);
  } catch (e: any) {
    console.error(`[stripe-sync] Background sync failed:`, e);
    // Try to log the failure to the audit log for visibility
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await admin.from("commission_audit_log").insert({
        actor_id: actorId,
        action: "stripe_sync_failed",
        target_type: "customer",
        target_id: null,
        after_value: {
          error: e?.message || String(e),
          duration_ms: Date.now() - t0,
          triggered_by: isServiceRoleCall ? "cron" : "user",
        },
      });
    } catch {
      // Best-effort logging — if even this fails, we've at least got console.error
    }
  }
}
