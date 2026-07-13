// ============================================================
// Supabase Edge Function: ga4-sync
// ============================================================
// Pulls Google Analytics 4 aggregates for property 443554875 and stores them for
// Nick's Growth "Website (GA4)" scorecard. Runs daily (cron) over a rolling 90-day
// window so late-arriving / re-finalized GA4 data (24–48h) self-corrects on re-pull;
// also invokable by a signed-in exec / growth_manager as a manual "Refresh now".
//
// Two separate reports (the metric+dimension combos aren't compatible in one):
//   A · main   dims date + sessionDefaultChannelGroup; metrics sessions,
//              activeUsers, keyEvents, sessionKeyEventRate  → ga4_daily_metrics
//   B · events dims date + eventName (filtered to the 3 opt-ins); metric eventCount
//              → ga4_daily_events
//
// Auth to GA4 (Deviation 1): NO @google-analytics/data (gRPC/Node, won't run in
// Deno). We mint an OAuth token from the service account with Web Crypto (RS256)
// and call the Data API over REST.
//
// Deploy:  supabase functions deploy ga4-sync   (JWT verify ON — not a webhook)
// Secrets: GA4_SA_KEY_B64 (base64 of the service-account JSON), CRON_SHARED_SECRET.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROPERTY_ID = "443554875"; // numeric GA4 property id — NEVER the G- measurement id
const GA4_BASE = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const OPT_IN_EVENTS = ["voice_clone_optin", "imessage_clone_optin", "demo_booked"];
const WINDOW = "90daysAgo"; // rolling re-pull window (start), end = today

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- Service-account OAuth token (RS256 JWT → access token) ----------

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string): string => b64url(new TextEncoder().encode(s));

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; exp: number } | null = null; // module-scope cache (~1h life)

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const b64 = Deno.env.get("GA4_SA_KEY_B64");
  if (!b64) throw new Error("GA4_SA_KEY_B64 not set");
  const sa = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  if (!sa.client_email || !sa.private_key) throw new Error("Service-account JSON missing client_email/private_key");

  const iat = now;
  const exp = iat + 3600;
  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Token exchange ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);

  cachedToken = { token: body.access_token, exp: iat + (body.expires_in || 3600) };
  return cachedToken.token;
}

// ---------- GA4 Data API ----------

async function runReport(token: string, reportBody: any): Promise<any> {
  const res = await fetch(`${GA4_BASE}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(reportBody),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`runReport ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

// GA4 returns the date dimension as 'YYYYMMDD'.
const ymd = (raw: string): string =>
  raw && raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
const num = (v: string | undefined): number => Number(v) || 0;

async function runSync() {
  const token = await getAccessToken();
  const syncedAt = new Date().toISOString();

  // ---- Report A: sessions / users / key events / rate, by date × channel ----
  const mainRes = await runReport(token, {
    dateRanges: [{ startDate: WINDOW, endDate: "today" }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }, { name: "sessionKeyEventRate" }],
    limit: 100000,
  });
  const metricRows = (mainRes.rows || []).map((r: any) => ({
    date: ymd(r.dimensionValues?.[0]?.value),
    channel: r.dimensionValues?.[1]?.value || "(not set)",
    sessions: num(r.metricValues?.[0]?.value),
    active_users: num(r.metricValues?.[1]?.value),
    key_events: num(r.metricValues?.[2]?.value),
    session_key_event_rate: num(r.metricValues?.[3]?.value),
    synced_at: syncedAt,
  }));

  // ---- Report B: opt-in event counts, by date × eventName (filtered) ----
  const evRes = await runReport(token, {
    dateRanges: [{ startDate: WINDOW, endDate: "today" }],
    dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: OPT_IN_EVENTS } } },
    limit: 100000,
  });
  const eventRows = (evRes.rows || []).map((r: any) => ({
    date: ymd(r.dimensionValues?.[0]?.value),
    event_name: r.dimensionValues?.[1]?.value,
    event_count: num(r.metricValues?.[0]?.value),
    synced_at: syncedAt,
  }));

  const totalSessions = metricRows.reduce((s: number, r: any) => s + r.sessions, 0);
  console.log(`ga4-sync: GA4 returned ${metricRows.length} metric rows (${totalSessions} sessions), ${eventRows.length} event rows — upserting…`);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (metricRows.length) {
    const { error } = await admin.from("ga4_daily_metrics").upsert(metricRows, { onConflict: "date,channel" });
    if (error) throw new Error(`ga4_daily_metrics upsert: ${error.message}`);
  }
  if (eventRows.length) {
    const { error } = await admin.from("ga4_daily_events").upsert(eventRows, { onConflict: "date,event_name" });
    if (error) throw new Error(`ga4_daily_events upsert: ${error.message}`);
  }

  return { ok: true, mainRows: metricRows.length, eventRows: eventRows.length, totalSessions };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // ---- Auth: cron secret / service-role, else a signed-in exec / growth_manager ----
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = isServiceRole || (!!cronSecret && (req.headers.get("X-Cron-Secret") || "") === cronSecret);
    if (!isCron) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
      const ok = prof && (prof.role === "executive" || prof.role_type === "executive" || prof.role_type === "growth_manager");
      if (!ok) return json({ error: "Forbidden — executive or growth access required" }, 403);
    }

    const result = await runSync();
    return json(result, 200);
  } catch (e: any) {
    console.error("ga4-sync error:", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
