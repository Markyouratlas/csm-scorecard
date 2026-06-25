// ============================================================
// Supabase Edge Function: weekly-update-autofill
// ============================================================
// Runs each Friday to stamp the CURRENT week's end-of-week snapshot
// (live committed MRR + distinct in-MRR customers) into atlas_weekly_updates,
// so the investor Weekly Update row exists automatically and WoW deltas work —
// the exec only adds the narrative / Core Rocks / Asks / cash-on-hand / runway.
//
// The 8 weekly metrics + targets + derived ratios are computed live in the app
// (summed from the daily rows), so they're NOT written here. FILL-ONLY-BLANKS:
// total_mrr/total_customers are only set if not already present, so an exec's
// edits are never overwritten.
//
// Auth: cron secret (X-Cron-Secret == CRON_SHARED_SECRET) or service-role bearer.
// Deploy JWT-off:  supabase functions deploy weekly-update-autofill --no-verify-jwt
// Body: { weekKey?: 'YYYY-MM-DD' } (defaults to the current week, Toronto).
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "America/Toronto";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() === 0 ? 6 : dt.getUTCDay() - 1));
  return dt.toISOString().slice(0, 10);
}
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Committed MRR + distinct in-MRR customers (mirrors useRevenueBreakdown / the
// daily autofill) from the synced commission_customers + recurring manual_revenue.
const CURRENT_SUB = new Set(["active", "trialing", "past_due"]);
function discountedNet(listMrr: number, d: any): number {
  const applies = d && (d.duration === "forever" || d.duration === "repeating");
  if (!applies) return listMrr;
  if (d.percent_off > 0) return listMrr * (1 - d.percent_off / 100);
  if (d.amount_off > 0) return Math.max(0, listMrr - d.amount_off / 100);
  return listMrr;
}
async function liveMrrAndCustomers(admin: any): Promise<{ mrr: number; customers: number }> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("commission_customers").select("stripe_customer_id, name, subscriptions").range(from, from + 999);
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
  const { data: manual } = await admin
    .from("manual_revenue").select("amount, customer_name").eq("voided", false).eq("entry_type", "recurring");
  for (const m of manual || []) { mrr += num(m.amount); keys.add("manual:" + (m.customer_name || "")); }
  return { mrr: Math.round(mrr), customers: keys.size };
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

    let weekKey = mondayOf(torontoToday());
    try {
      const body = await req.json();
      if (body?.weekKey && /^\d{4}-\d{2}-\d{2}$/.test(body.weekKey)) weekKey = mondayOf(body.weekKey);
    } catch { /* default */ }

    const { data: existing } = await admin
      .from("atlas_weekly_updates")
      .select("week_key, total_mrr, total_customers, pipeline_amount, pipeline_count")
      .eq("week_key", weekKey).maybeSingle();

    const live = await liveMrrAndCustomers(admin);

    // Pipeline = OPEN AE opportunities (anything not closed), forecast from each
    // deal's expected_mrr (the AE's in-flight estimate; falls back to a matched
    // actual MRR if no forecast is set). Amount = sum of expected MRR; count =
    // open deals that carry a forecast. From ae_deals.
    const CLOSED_STATUSES = new Set(["Closed Won", "Closed Lost"]);
    let pipelineAmount = 0, pipelineCount = 0;
    {
      const { data: deals } = await admin.from("ae_deals").select("status, mrr, expected_mrr");
      for (const d of deals || []) {
        if (CLOSED_STATUSES.has(d.status)) continue;
        const forecast = num(d.expected_mrr) || num(d.mrr);
        if (forecast <= 0) continue;
        pipelineAmount += forecast;
        pipelineCount++;
      }
    }

    const patch: Record<string, any> = { week_key: weekKey };
    if (!existing || existing.total_mrr == null) patch.total_mrr = live.mrr;
    if (!existing || existing.total_customers == null) patch.total_customers = live.customers;
    if (!existing || existing.pipeline_amount == null) patch.pipeline_amount = Math.round(pipelineAmount);
    if (!existing || existing.pipeline_count == null) patch.pipeline_count = pipelineCount;

    // Always upsert so the row exists (creates the week; fills only blank snapshot fields).
    const { error: upErr } = await admin
      .from("atlas_weekly_updates")
      .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: "week_key" });
    if (upErr) throw upErr;

    return json({ ok: true, weekKey, wrote: Object.keys(patch).filter((k) => k !== "week_key"), total_mrr: live.mrr, total_customers: live.customers });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
