// ============================================================
// Supabase Edge Function: daily-update-autofill
// ============================================================
// Runs each morning (via cron) to seed the PREVIOUS day's row in
// atlas_daily_updates from live sources, so the investor Daily Update is
// ready to review without anyone opening the form:
//
//   cash_stripe     ← Stripe charges (succeeded, captured, USD) for the day
//   cash_collected  ← cash_stripe + any existing wire/ACH
//   calls_booked    ← AE scorecards: demosBooked at that day index
//   calls_held      ← AE scorecards: demosCompleted at that day index
//   calls_unqualified ← AE scorecards: demosUnqualified (subset of held; backed
//                       out of the close-rate denominator so non-fits don't lower it)
//   deals_closed    ← AE scorecards: trialSignups at that day index
//     (those 3 AE funnel fields are themselves derived from the ae_deals meeting
//      tracker — see ae-meetings-sync, which writes them into weekly_scorecards
//      at :45, before this 13:00 UTC run — so calls here reflect real meetings)
//   ad_spend        ← Growth + Ad Strategist scorecards: adSpend that day
//   total_mrr       ← latest atlas_targets 'total-mrr' actual (aggregate)
//   total_customers ← latest atlas_targets 'total-customers' actual
//
// FILL-ONLY-BLANKS: it never overwrites a value already in the row, so an
// exec's manual edits always win. Stripe cash is authoritative (a real 0 is
// written); scorecard-derived fields (the meeting-derived calls + closes, ad
// spend) are only written when > 0 (so an un-logged day stays blank for manual
// entry rather than a wrong 0).
//
// Auth: a cron call (header X-Cron-Secret == CRON_SHARED_SECRET) OR a signed-in
// executive (for manual trigger / backfill). Body: { date?: 'YYYY-MM-DD' }
// (defaults to yesterday in America/Toronto).
//
// Deploy:
//   supabase functions deploy daily-update-autofill
//   (uses existing STRIPE_SECRET_KEY + CRON_SHARED_SECRET secrets)
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";
const TZ = "America/Toronto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- Stripe ----
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
    if (++pages > 100) throw new Error(`Pagination runaway on ${resource}`);
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

// ---- Dates ----
function torontoMidnightUnix(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(base).reduce((a: any, x) => (a[x.type] = x.value, a), {});
  const asTor = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? "0" : p.hour), +p.minute, +p.second);
  return Math.floor((base.getTime() + (base.getTime() - asTor)) / 1000);
}
function torontoDateMinus(n: number): string {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}
function dayIdxOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat (matches scorecards)
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().slice(0, 10);
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ---- Live committed MRR + distinct in-MRR customers ----
// Mirrors useRevenueBreakdown so the snapshot matches the Odyssey hero: sum each
// current subscription's net (after ongoing discounts) committed MRR across the
// synced Stripe data, plus recurring manual_revenue. Current = active/trialing/
// past_due (paused subs keep 'active' status); canceled/expired are excluded.
const CURRENT_SUB = new Set(["active", "trialing", "past_due"]);
function discountedNet(listMrr: number, d: any): number {
  const applies = d && (d.duration === "forever" || d.duration === "repeating");
  if (!applies) return listMrr;
  if (d.percent_off > 0) return listMrr * (1 - d.percent_off / 100);
  if (d.amount_off > 0) return Math.max(0, listMrr - d.amount_off / 100);
  return listMrr;
}
async function liveMrrAndCustomers(admin: any): Promise<{ mrr: number; customers: number }> {
  // Paginate (Supabase caps a query at ~1000 rows).
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("commission_customers")
      .select("stripe_customer_id, name, subscriptions")
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  let mrr = 0;
  const keys = new Set<string>();
  for (const c of rows) {
    const subs = Array.isArray(c.subscriptions) ? c.subscriptions : [];
    let inMrr = false;
    for (const s of subs) {
      if (!s || !CURRENT_SUB.has(s.status)) continue;
      mrr += discountedNet(num(s.mrr), s.discount || null);
      inMrr = true;
    }
    if (inMrr) keys.add(c.stripe_customer_id || c.name || "");
  }
  // Recurring manual revenue (bank transfers Stripe didn't see) counts too.
  const { data: manual } = await admin
    .from("manual_revenue").select("amount, customer_name")
    .eq("voided", false).eq("entry_type", "recurring");
  for (const m of manual || []) {
    mrr += num(m.amount);
    keys.add("manual:" + (m.customer_name || ""));
  }
  return { mrr: Math.round(mrr), customers: keys.size };
}

// Monthly recurring revenue of a Stripe subscription (normalize any interval → month).
function mrrOfSub(sub: any): number {
  if (!sub.items?.data) return 0;
  let cents = 0;
  for (const item of sub.items.data) {
    const unit = item.price?.unit_amount || 0;
    const qty = item.quantity || 1;
    const interval = item.price?.recurring?.interval || "month";
    const ic = item.price?.recurring?.interval_count || 1;
    let f = 1 / ic;
    if (interval === "year") f = 1 / (12 * ic);
    else if (interval === "week") f = (52 / 12) / ic;
    else if (interval === "day") f = (365 / 12) / ic;
    cents += unit * qty * f;
  }
  return cents / 100;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Auth: cron secret / service-role / executive ----
    // Accept a matching X-Cron-Secret OR a service-role bearer (whichever the
    // schedule sends), else require a signed-in executive for manual runs.
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = isServiceRole || (!!cronSecret && (req.headers.get("X-Cron-Secret") || "") === cronSecret);
    if (!isCron) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
      if (!(prof?.role === "executive" || prof?.role_type === "executive")) {
        return json({ error: "Forbidden — executive access required" }, 403);
      }
    }

    // ---- Target date (default: yesterday Toronto) + preview flag ----
    let date = torontoDateMinus(1);
    let preview = false;
    let recompute = false; // overwrite the meeting-derived funnel fields (self-healing Sync)
    try {
      const body = await req.json();
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) date = body.date;
      if (body?.preview === true) preview = true;
      if (body?.recompute === true) recompute = true;
    } catch { /* default */ }

    const dayIdx = dayIdxOf(date);
    const weekKey = mondayOf(date);

    // ---- Existing row (fill-only-blanks) ----
    const { data: existing } = await admin
      .from("atlas_daily_updates").select("*").eq("update_date", date).maybeSingle();

    // ---- 1) Stripe cash for the day ---- (skipped in recompute: funnel-only, cheap)
    let cashStripe: number | null = null;
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (sk && !recompute) {
      const start = torontoMidnightUnix(date);
      const charges = await stripePaginate("charges", sk, `created[gte]=${start}&created[lt]=${start + 86400}`);
      let gross = 0;
      for (const ch of charges) {
        if (ch.status !== "succeeded" || ch.paid !== true) continue;
        if (ch.currency && ch.currency !== "usd") continue;
        const cap = (ch.amount_captured != null ? ch.amount_captured : ch.amount) || 0;
        if (cap > 0) gross += cap / 100;
      }
      cashStripe = Math.round(gross * 100) / 100;
    }

    // ---- 1b) MRR added: gross new MRR from subscriptions created that day ----
    let mrrAdded: number | null = null;
    if (sk && !recompute) {
      const start = torontoMidnightUnix(date);
      const subs = await stripePaginate("subscriptions", sk,
        `created[gte]=${start}&created[lt]=${start + 86400}&status=all&expand[]=data.items.data.price`);
      let m = 0;
      for (const s of subs) m += mrrOfSub(s);
      mrrAdded = Math.round(m * 100) / 100;
    }

    // ---- Scorecard-derived: calls booked, calls held, deals closed, ad spend ----
    // All from the AE/Growth/Ad daily scorecard entries at the date's day index.
    // Calls Booked (demos booked) + Calls Held (demos completed) come from the same
    // source, so the show-up rate always reconciles (held ≤ booked).
    let callsBooked = 0, callsHeld = 0, callsUnqualified = 0, dealsClosed = 0, adSpend = 0;
    {
      const { data: profs } = await admin.from("profiles").select("id, role_type").is("archived_at", null);
      const roleById: Record<string, string> = {};
      for (const p of profs || []) roleById[p.id] = p.role_type;
      const { data: cards } = await admin.from("weekly_scorecards").select("user_id, data").eq("week_key", weekKey);
      for (const c of cards || []) {
        const role = roleById[c.user_id];
        const day = (c.data?.daily || [])[dayIdx] || {};
        if (role === "account_executive") {
          callsBooked += num(day.demosBooked);
          callsHeld += num(day.demosCompleted);     // all held, incl. unqualified
          callsUnqualified += num(day.demosUnqualified); // backed out of the close-rate denom
          dealsClosed += num(day.trialSignups);
        }
        if (role === "growth_manager" || role === "ad_strategist") {
          adSpend += num(day.adSpend);
        }
      }
    }

    // ---- 4) Snapshot from atlas_targets latest actuals ----
    const latestActual = async (metricKey: string): Promise<number | null> => {
      const { data } = await admin
        .from("atlas_targets").select("actual_value")
        .eq("metric_key", metricKey).not("actual_value", "is", null)
        .order("month_key", { ascending: false }).limit(1).maybeSingle();
      return data?.actual_value != null ? Number(data.actual_value) : null;
    };
    // Snapshot: live committed MRR + customers from the synced Stripe data
    // (matches the Odyssey hero). Fall back to the latest stored atlas_targets
    // actual only if the Stripe data isn't synced yet. Skipped in recompute mode.
    let totalMrr: number | null = null;
    let totalCustomers: number | null = null;
    if (!recompute) {
      const live = await liveMrrAndCustomers(admin);
      totalMrr = live.mrr > 0 ? live.mrr : await latestActual("total-mrr");
      totalCustomers = live.customers > 0 ? live.customers : await latestActual("total-customers");

      // Materialize live committed MRR + customers (+ ARPU) into atlas_targets'
      // CURRENT-MONTH actuals (source 'stripe'). The Investor hero reads
      // atlas_targets (it can't query Stripe), so without this it shows the stale
      // backfilled actual instead of the live figure the Odyssey hero shows.
      // Never overwrites a manual exec override (source='manual').
      if (live.mrr > 0) {
        const monthKey = date.slice(0, 7) + "-01";
        const writeActual = async (metricKey: string, value: number) => {
          const { data: ex } = await admin.from("atlas_targets")
            .select("actual_source").eq("metric_key", metricKey).eq("month_key", monthKey).maybeSingle();
          if (ex?.actual_source === "manual") return; // exec override wins
          await admin.from("atlas_targets").upsert(
            { metric_key: metricKey, month_key: monthKey, actual_value: value, actual_source: "stripe", updated_at: new Date().toISOString() },
            { onConflict: "metric_key,month_key" },
          );
        };
        await writeActual("total-mrr", live.mrr);
        if (live.customers > 0) {
          await writeActual("total-customers", live.customers);
          await writeActual("arpu", Math.round(live.mrr / live.customers));
        }
      }
    }
    const newCustomers = dealsClosed; // spec: same trigger as Deals Closed

    // ---- Preview mode: return the computed source values WITHOUT writing ----
    // Used by the exec form to pre-fill the SELECTED date (any date) from one
    // server-side calc. Authoritative sources (Stripe cash, Cal calls) return a
    // real 0; scorecard-derived fields return null when 0 so an un-logged past
    // day stays blank for manual entry rather than a misleading 0.
    if (preview) {
      return json({ date, computed: {
        cash_stripe: cashStripe,
        calls_booked: callsBooked > 0 ? callsBooked : null,
        calls_held: callsHeld > 0 ? callsHeld : null,
        deals_closed: dealsClosed > 0 ? dealsClosed : null,
        new_customers: newCustomers > 0 ? newCustomers : null,
        ad_spend: adSpend > 0 ? adSpend : null,
        mrr_added: mrrAdded,
        total_mrr: totalMrr,
        total_customers: totalCustomers,
      } });
    }

    // ---- RECOMPUTE (self-healing Sync): OVERWRITE the meeting-derived funnel
    // fields from the scorecards, so stale/inconsistent values (e.g. a held with
    // no booked) self-correct. Leaves cash / ad spend / snapshot / narrative
    // untouched. >0 → value, else null (clears a stale value when meetings now
    // show none). ----
    if (recompute) {
      const f = (v: number) => (v > 0 ? v : null);
      const allZero = !(callsBooked || callsHeld || callsUnqualified || dealsClosed || newCustomers);
      if (allZero && !existing) {
        return json({ ok: true, date, wrote: [], message: "No funnel data for this day." });
      }
      const patch: Record<string, any> = {
        calls_booked: f(callsBooked),
        calls_held: f(callsHeld),
        calls_unqualified: f(callsUnqualified),
        deals_closed: f(dealsClosed),
        new_customers: f(newCustomers),
      };
      const { error: upErr } = await admin
        .from("atlas_daily_updates")
        .upsert({ update_date: date, ...patch, updated_at: new Date().toISOString() }, { onConflict: "update_date" });
      if (upErr) throw upErr;
      return json({ ok: true, date, recompute: true, wrote: Object.keys(patch), values: patch });
    }

    // ---- Build patch: only set columns that are currently blank ----
    const blank = (k: string) => !existing || existing[k] == null;
    const patch: Record<string, any> = {};
    // authoritative (write even 0)
    if (blank("cash_stripe") && cashStripe != null) patch.cash_stripe = cashStripe;
    if (blank("calls_booked") && callsBooked > 0) patch.calls_booked = callsBooked;
    // scorecard-derived (only when > 0, so un-logged days stay blank)
    if (blank("calls_held") && callsHeld > 0) patch.calls_held = callsHeld;
    if (blank("calls_unqualified") && callsUnqualified > 0) patch.calls_unqualified = callsUnqualified;
    if (blank("deals_closed") && dealsClosed > 0) patch.deals_closed = dealsClosed;
    if (blank("new_customers") && newCustomers > 0) patch.new_customers = newCustomers;
    if (blank("ad_spend") && adSpend > 0) patch.ad_spend = adSpend;
    if (blank("mrr_added") && mrrAdded != null) patch.mrr_added = mrrAdded;
    // snapshot
    if (blank("total_mrr") && totalMrr != null) patch.total_mrr = totalMrr;
    if (blank("total_customers") && totalCustomers != null) patch.total_customers = totalCustomers;
    // total cash = (new or existing) stripe + existing wire/ACH, only if total is blank
    if (blank("cash_collected")) {
      const stripe = patch.cash_stripe ?? existing?.cash_stripe ?? null;
      const wire = existing?.cash_wire_ach ?? null;
      if (stripe != null || wire != null) patch.cash_collected = (Number(stripe) || 0) + (Number(wire) || 0);
    }

    if (Object.keys(patch).length === 0) {
      return json({ ok: true, date, wrote: [], message: "Nothing to fill (row already complete or no source data)." });
    }

    const { error: upErr } = await admin
      .from("atlas_daily_updates")
      .upsert({ update_date: date, ...patch, updated_at: new Date().toISOString() }, { onConflict: "update_date" });
    if (upErr) throw upErr;

    return json({ ok: true, date, wrote: Object.keys(patch), values: patch, triggered_by: isCron ? "cron" : "exec" });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
