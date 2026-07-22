// ============================================================
// ghl-webinar-optin  (Phase 2 — real-time new-lead webhook)
//
// Receiver for a GoHighLevel Workflow "Custom Webhook" action fired on each
// workshop opt-in form submission. GHL does NOT sign workflow webhooks (Ed25519
// X-GHL-Signature is only for native marketplace webhooks), so this is gated by a
// shared `?token=` secret in the URL — same pattern as ghl-calls-inbound.
//
// It does NOT parse the GHL body (a workflow payload may lack the submission `id`
// we dedupe on, which would create duplicate rows). Instead it triggers an
// incremental re-pull of the opt-in form via ghl-webinar-signups-sync (maxPages:1
// = the most-recent page), so the new lead lands with the exact same
// ghl_submission_id key as the backfill/daily cron — zero chance of dupes.
//
// Deploy --no-verify-jwt. Secrets: WEBINAR_OPTIN_TOKEN (the ?token= value),
// CRON_SHARED_SECRET (to call the sync), SUPABASE_URL, SUPABASE_ANON_KEY.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = Deno.env.get("WEBINAR_OPTIN_TOKEN") || "";
    const provided = new URL(req.url).searchParams.get("token") || "";
    if (!token || provided !== token) return json({ error: "forbidden" }, 403);

    // Fire an incremental re-pull (reuses the sync's mapping + dedupe).
    const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const cron = Deno.env.get("CRON_SHARED_SECRET") || Deno.env.get("CRON_SECRET") || "";
    const r = await fetch(`${base}/functions/v1/ghl-webinar-signups-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anon,
        "Authorization": `Bearer ${anon}`,
        "X-Cron-Secret": cron,
      },
      body: JSON.stringify({ maxPages: 1 }),
    });
    const sync = await r.json().catch(() => ({}));
    // Always 200 back to GHL so it doesn't retry-storm; carry the sync result for logs.
    return json({ ok: true, synced: r.ok, sync });
  } catch (e) {
    return json({ ok: true, synced: false, error: String(e) });
  }
});
