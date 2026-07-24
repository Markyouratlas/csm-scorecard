// ============================================================
// Supabase Edge Function: collected-not-closed-autoclose
// ============================================================
// Daily job. Finds OPEN ae_deals whose customer is already paying in Stripe
// (a "collected but not closed" deal) and auto-closes only the confident-full
// ones — flipping status -> 'Closed Won', which fires the existing DB triggers
// (closed_at stamp + Fulfillment routing). Deposits and partial payments are
// left alone; a customer who already has a Closed Won deal is never touched
// (the double-close guard we learned from Ryan Walsh).
//
// "Confident full" = collected Stripe cash has reached the deal's expected
// upfront (one_time) when one is set, else at least one full month of MRR.
// Anything below the bar is a likely deposit -> surfaced in the UI, never
// auto-closed here.
//
// Every auto-close stamps ae_deals.auto_closed_at + appends an audit note, so
// the exec My View "Auto-closed" list and the AE both see it happened. The AE
// can still open the deal and add their own notes afterward.
//
// Auth: cron secret (X-Cron-Secret == CRON_SHARED_SECRET) or service-role bearer.
// Deploy JWT-off:  supabase functions deploy collected-not-closed-autoclose --no-verify-jwt
// Body: { dryRun?: boolean } — dryRun returns the candidates WITHOUT mutating.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lc = (v: any) => String(v || "").trim().toLowerCase();

// Open = not already resolved one way or another. Mirrors the collected_not_closed rpc.
const OPEN_EXCLUDE = new Set([
  "Closed Won", "Closed Lost", "Deposit collected", "Deleted", "Unqualified", "No-show", "Intro", "Rescheduled",
]);

function sumCash(cc: any): number {
  let total = 0;
  for (const bag of [cc?.monthly_cash_received, cc?.monthly_cash_received_manual]) {
    if (bag && typeof bag === "object") for (const k of Object.keys(bag)) total += num(bag[k]);
  }
  return total;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: cron secret or service-role bearer.
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = isServiceRole || (!!cronSecret && (req.headers.get("X-Cron-Secret") || "") === cronSecret);
    if (!isCron) return json({ error: "Unauthorized" }, 401);

    let dryRun = false;
    try { const body = await req.json(); dryRun = !!body?.dryRun; } catch { /* default live */ }

    // All Stripe customers (paginated) -> lookup maps by stripe id + lowercased email,
    // carrying summed collected cash.
    const byStripe = new Map<string, { collected: number; email: string }>();
    const byEmail = new Map<string, { collected: number; sid: string }>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("commission_customers")
        .select("stripe_customer_id, email, monthly_cash_received, monthly_cash_received_manual")
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const c of data) {
        const collected = sumCash(c);
        if (c.stripe_customer_id) byStripe.set(c.stripe_customer_id, { collected, email: lc(c.email) });
        if (c.email) byEmail.set(lc(c.email), { collected, sid: c.stripe_customer_id });
      }
      if (data.length < 1000) break;
    }

    // Every open deal + its AE.
    const { data: deals, error: dErr } = await admin
      .from("ae_deals")
      .select("id, customer_name, customer_email, payment_email, status, one_time, mrr, ae_id, matched_stripe_customer_id, notes")
      .not("status", "in", `(${[...OPEN_EXCLUDE].map((s) => `"${s}"`).join(",")})`);
    if (dErr) throw dErr;

    // Closed Won lookup for the double-close guard (by stripe id + by email).
    const wonStripe = new Set<string>();
    const wonEmail = new Set<string>();
    {
      const { data: won } = await admin
        .from("ae_deals")
        .select("matched_stripe_customer_id, customer_email")
        .eq("status", "Closed Won");
      for (const w of won || []) {
        if (w.matched_stripe_customer_id) wonStripe.add(w.matched_stripe_customer_id);
        if (w.customer_email) wonEmail.add(lc(w.customer_email));
      }
    }

    const candidates: any[] = [];
    for (const d of deals || []) {
      // Match this deal to a Stripe customer (by matched id, then contact/payment email).
      let sid = d.matched_stripe_customer_id || null;
      let collected = 0;
      if (sid && byStripe.has(sid)) collected = byStripe.get(sid)!.collected;
      else {
        const hit = byEmail.get(lc(d.customer_email)) || byEmail.get(lc(d.payment_email));
        if (hit) { collected = hit.collected; sid = sid || hit.sid; }
      }
      if (collected <= 0) continue; // not paying -> not our concern

      // Confident-full bar: expected upfront if set, else one full month of MRR.
      const bar = num(d.one_time) > 0 ? num(d.one_time) : num(d.mrr);
      const isFull = bar > 0 ? collected >= bar : false; // no bar at all -> can't be confident
      const alreadyClosed =
        (sid && wonStripe.has(sid)) || wonEmail.has(lc(d.customer_email));

      candidates.push({
        deal_id: d.id, customer_name: d.customer_name, customer_email: d.customer_email,
        status: d.status, one_time: num(d.one_time), mrr: num(d.mrr), collected, bar,
        is_full: isFull, already_closed: !!alreadyClosed, stripe_customer_id: sid, notes: d.notes,
      });
    }

    const toClose = candidates.filter((c) => c.is_full && !c.already_closed);

    if (dryRun) {
      return json({
        ok: true, dryRun: true,
        wouldClose: toClose.map(({ notes, ...c }) => c),
        skippedDeposit: candidates.filter((c) => !c.is_full).map(({ notes, ...c }) => c),
        skippedAlreadyClosed: candidates.filter((c) => c.already_closed).map(({ notes, ...c }) => c),
      });
    }

    const nowIso = new Date().toISOString();
    const closed: any[] = [];
    for (const c of toClose) {
      const auditLine = `[auto-closed ${nowIso.slice(0, 10)}] Customer paying in Stripe ($${Math.round(c.collected).toLocaleString()} collected${c.bar ? ` of $${Math.round(c.bar).toLocaleString()} expected` : ""}) — auto-set to Closed Won.`;
      const notes = c.notes ? `${c.notes}\n${auditLine}` : auditLine;
      const { error: upErr } = await admin
        .from("ae_deals")
        .update({ status: "Closed Won", auto_closed_at: nowIso, notes })
        .eq("id", c.deal_id)
        .neq("status", "Closed Won"); // last-write guard against a race
      if (upErr) { closed.push({ deal_id: c.deal_id, error: upErr.message }); continue; }
      closed.push({ deal_id: c.deal_id, customer_name: c.customer_name, collected: c.collected });
    }

    return json({ ok: true, closedCount: closed.filter((c) => !c.error).length, closed });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
