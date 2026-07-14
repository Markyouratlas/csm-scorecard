// ============================================================
// Supabase Edge Function: attio-sync
// ============================================================
// Pipe 1 (Attio → Scorecard). Pulls NATIVE Attio channel-partner deals into Heather's
// channel_deals table and repairs drift. Runs as:
//   • one-time backfill / manual refresh, and
//   • a nightly reconciliation cron.
//
// Scope guard (loop-safe): we only ingest deals whose custom `external_id` attribute
// is EMPTY. Portal deals we later push up to Attio (Pipe 2) always carry an external_id,
// so they're skipped here and never pulled back as duplicates. The guard lives in THIS
// code (Attio's "is empty" filter operator isn't reliably documented).
//
// Every deal's full record is stored in channel_deals.attio_raw, so no data is lost even
// where the typed field map is incomplete (contact/company live on referenced records,
// enriched in a follow-up). Confirm the deal attribute slugs against a live sample.
//
// Auth: X-Cron-Secret / service-role (cron) OR a signed-in executive (manual).
// Deploy:  supabase functions deploy attio-sync   (JWT verify ON — not a webhook)
// Secrets: ATTIO_API_KEY, CRON_SHARED_SECRET.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTIO_BASE = "https://api.attio.com/v2";
const DEALS = "deals";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- Attio REST helpers ----
async function attioFetch(path: string, init: RequestInit, token: string, tries = 0): Promise<Response> {
  const res = await fetch(`${ATTIO_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (res.status === 429 && tries < 5) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return attioFetch(path, init, token, tries + 1);
  }
  return res;
}

// Page through every deal record (limit/offset until a short page).
async function queryAllDeals(token: string): Promise<any[]> {
  const all: any[] = [];
  const limit = 500;
  let offset = 0, pages = 0;
  while (true) {
    if (++pages > 100) throw new Error("Attio pagination runaway (>50k deals)");
    const res = await attioFetch(`/objects/${DEALS}/records/query`, { method: "POST", body: JSON.stringify({ limit, offset }) }, token);
    if (!res.ok) throw new Error(`Attio query ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const rows: any[] = j.data || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

// ---- Field extraction (defensive — Attio wraps every attribute in an array) ----
const firstVal = (rec: any, slug: string): any => {
  const a = rec?.values?.[slug];
  return Array.isArray(a) && a.length ? a[0] : null;
};
const textOf = (rec: any, slug: string): string | null => {
  const v = firstVal(rec, slug);
  return v == null ? null : (v.value ?? v.option?.title ?? v.status?.title ?? null);
};
// external_id is empty on native deals (attribute absent or blank).
export const externalIdOf = (rec: any): string | null => {
  const v = textOf(rec, "external_id");
  return v && String(v).trim() ? String(v).trim() : null;
};

// Map Attio deal stage → the channel_deals qualified/pending model. CONFIRM against
// Heather's real Attio stages; unmapped stages fall to 'pending'.
function mapStatus(stage: string | null): string {
  const s = (stage || "").toLowerCase();
  if (/won|qualif|closed won|active|live|signed/.test(s)) return "qualified";
  return "pending";
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Attio deal record → channel_deals row (id omitted → DB default). Returns null for
// records that carry an external_id (Portal deals — never ingested here).
export async function mapDeal(rec: any): Promise<any | null> {
  if (externalIdOf(rec)) return null;
  const recordId = rec?.id?.record_id;
  if (!recordId) return null;

  const name = textOf(rec, "name");
  const stage = textOf(rec, "stage");
  const valueNum = firstVal(rec, "value")?.currency_value;
  const status = mapStatus(stage);

  const fields = {
    attio_record_id: recordId,
    origin: "attio",
    external_id: null,
    business_name: name || "Untitled deal",   // channel_deals.business_name is NOT NULL
    avg_value: valueNum != null ? String(valueNum) : null,
    status,
    portal_created_at: rec?.created_at || null,
    attio_updated_at: rec?.created_at || null, // no reliable per-record updated ts; informational
  };
  const content_hash = await sha256(JSON.stringify(fields));
  return { ...fields, content_hash, attio_raw: rec, synced_at: new Date().toISOString() };
}

async function runSync(admin: any, token: string) {
  const records = await queryAllDeals(token);
  const rows: any[] = [];
  const seen: string[] = [];
  const failures: any[] = [];

  for (const rec of records) {
    try {
      const row = await mapDeal(rec);
      if (!row) continue; // Portal deal (has external_id) or malformed — skip
      rows.push(row);
      seen.push(row.attio_record_id);
    } catch (e: any) {
      failures.push({ source: "attio-sync", op: "backfill", ref: rec?.id?.record_id || null, error: String(e?.message || e), payload: rec });
    }
  }

  let upserted = 0;
  if (rows.length) {
    // Upsert in chunks so one bad row doesn't sink the batch.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await admin.from("channel_deals").upsert(chunk, { onConflict: "attio_record_id" });
      if (error) {
        failures.push({ source: "attio-sync", op: "backfill", ref: null, error: error.message, payload: { count: chunk.length } });
      } else {
        upserted += chunk.length;
      }
    }
  }

  // Reconcile deletions: remove origin='attio' rows whose Attio record vanished.
  // Guard: only when we actually fetched records (never mass-delete on an API blip).
  let deleted = 0;
  if (records.length > 0 && seen.length > 0) {
    const { data: existing } = await admin.from("channel_deals").select("attio_record_id").eq("origin", "attio");
    const gone = (existing || []).map((r: any) => r.attio_record_id).filter((id: string) => id && !seen.includes(id));
    if (gone.length) {
      const { error } = await admin.from("channel_deals").delete().in("attio_record_id", gone);
      if (error) failures.push({ source: "attio-sync", op: "reconcile", ref: null, error: error.message, payload: { gone } });
      else deleted = gone.length;
    }
  }

  if (failures.length) await admin.from("sync_dead_letter").insert(failures);

  console.log(`attio-sync: ${records.length} fetched · ${upserted} upserted · ${deleted} deleted · ${failures.length} failures`);
  return { ok: true, fetched: records.length, ingested: rows.length, upserted, deleted, failures: failures.length };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Auth: cron secret / service-role, else a signed-in executive ----
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
      if (!(prof?.role === "executive" || prof?.role_type === "executive")) {
        return json({ error: "Forbidden — executive access required" }, 403);
      }
    }

    const token = Deno.env.get("ATTIO_API_KEY");
    if (!token) return json({ ok: false, error: "ATTIO_API_KEY not set" }, 500);

    const result = await runSync(admin, token);
    return json(result, 200);
  } catch (e: any) {
    console.error("attio-sync error:", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
