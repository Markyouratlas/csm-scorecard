// ============================================================
// Supabase Edge Function: profitwell-sync  (POPULATE VERSION)
// ============================================================
// Fetches ProfitWell's FULL monthly metric catalog (every trend it exposes
// for this account, no ?metrics= filter) and UPSERTS every metric/month
// into public.profitwell_metrics.
//
// This function writes ONLY to public.profitwell_metrics. It does NOT touch
// atlas_targets, commission_customers, profiles, or any other table. It
// NEVER logs or returns any key (neither the ProfitWell key nor the
// Supabase service role key).
//
// Deploy:
//   supabase functions deploy profitwell-sync
//   supabase secrets set PROFITWELL_API_KEY=...
//
// Invoke from the frontend:
//   const { data, error } = await supabase.functions.invoke('profitwell-sync')
//
// Required env vars:
//   SUPABASE_URL                (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-injected by Supabase)
//   PROFITWELL_API_KEY          <-- set via `supabase secrets set`
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ProfitWell monthly metrics endpoint. The TRAILING SLASH on /monthly/ is
// required — without it ProfitWell 301-redirects and the request fails.
// We intentionally pass NO ?metrics= filter: per ProfitWell's docs, omitting
// it returns ALL available metric trends for the account.
const PROFITWELL_METRICS_URL =
  "https://api.profitwell.com/v2/metrics/monthly/";

const BATCH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("PROFITWELL_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "PROFITWELL_API_KEY not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ---- Fetch the full catalog from ProfitWell ----
    // ProfitWell auth is a BARE key in the Authorization header — no
    // "Bearer " prefix.
    const res = await fetch(PROFITWELL_METRICS_URL, {
      headers: { Authorization: apiKey },
    });

    const raw = await res.text();
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }

    // body.data is an object keyed by metric trend name, each value being an
    // array of { date, value } entries. If it's missing (e.g. a 400/401),
    // return the raw parsed body verbatim so we can read the error.
    const data = body && typeof body === "object" ? body.data : null;
    if (!data || typeof data !== "object") {
      return new Response(
        JSON.stringify({ status: res.status, body }, null, 2),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Build rows: one per (metric_name, month) ----
    // PW date is 'YYYY-MM'; append '-01' to form a first-of-month month_key.
    // value may be null — KEEP null, do NOT coerce to 0.
    const syncedAt = new Date().toISOString();
    const rows: any[] = [];
    const metricNames = Object.keys(data).sort();
    const monthsSeen = new Set<string>();

    for (const metricName of metricNames) {
      const arr = Array.isArray(data[metricName]) ? data[metricName] : [];
      for (const entry of arr) {
        const monthKey = `${entry.date}-01`;
        monthsSeen.add(monthKey);
        rows.push({
          metric_name: metricName,
          month_key: monthKey,
          value: entry.value == null ? null : Number(entry.value),
          synced_at: syncedAt,
        });
      }
    }

    // ---- Upsert into public.profitwell_metrics in batches of 500 ----
    // Service role client, matching stripe-sync's exact pattern.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let rowsUpserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error: upErr } = await admin
        .from("profitwell_metrics")
        .upsert(batch, { onConflict: "metric_name,month_key" });
      if (upErr) {
        // Stop on first failure — do not keep writing.
        return new Response(
          JSON.stringify({
            error: "Upsert failed",
            batchIndex: i / BATCH,
            supabaseError: upErr.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      rowsUpserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        metricsCount: metricNames.length,
        rowsUpserted,
        monthsSeen: monthsSeen.size,
        sampleMetric: metricNames[0] || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
