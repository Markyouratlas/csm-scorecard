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

// Numeric value from a currency (currency_value) or number (value) attribute.
const currencyOf = (rec: any, slug: string): number | null => {
  const v = firstVal(rec, slug);
  if (!v) return null;
  const n = v.currency_value ?? v.value;
  return n != null ? Number(n) : null;
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Owner resolution — native Attio deals are assigned to their Attio OWNER's email (a
// workspace member; matches the scorecard login), so Heather's deals go to Heather and a
// deal Omer owns in Attio would go to Omer. Falls back to Heather if the owner can't be
// resolved (e.g. the token lacks user_management:read).
const ownerIdOf = (rec: any): string | null => firstVal(rec, "owner")?.referenced_actor_id || null;
async function fetchOwnerEmailMap(token: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${ATTIO_BASE}/workspace_members`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return {};
    const j = await res.json();
    const map: Record<string, string> = {};
    for (const m of j?.data || []) {
      const id = m?.id?.workspace_member_id; const email = (m?.email_address || "").toLowerCase();
      if (id && email) map[id] = email;
    }
    return map;
  } catch { return {}; }
}

// Attio deal record → channel_deals row (id omitted → DB default). Returns null for
// records that carry an external_id (Portal deals — never ingested here).
export async function mapDeal(rec: any, ownerMap: Record<string, string> = {}): Promise<any | null> {
  if (externalIdOf(rec)) return null;
  const recordId = rec?.id?.record_id;
  if (!recordId) return null;

  const name = textOf(rec, "name");
  // Keep the REAL Attio stage title (Heather's view is pipeline-aware). value falls
  // back to mrc → projected_arr when the deal has no `value` set.
  const value = currencyOf(rec, "value") ?? currencyOf(rec, "mrc") ?? currencyOf(rec, "projected_arr");

  const fields = {
    attio_record_id: recordId,
    origin: "attio",
    external_id: null,
    business_name: name || "Untitled deal",   // channel_deals.business_name is NOT NULL
    avg_value: value != null ? String(value) : null,
    status: textOf(rec, "stage") || "pending",
    portal_created_at: rec?.created_at || null,
    attio_updated_at: rec?.created_at || null, // no reliable per-record updated ts; informational
    assigned_to: ownerMap[ownerIdOf(rec) || ""] || "heather@youratlas.com", // Attio owner's email (else Heather)
  };
  const content_hash = await sha256(JSON.stringify(fields));
  return { ...fields, content_hash, attio_raw: rec, synced_at: new Date().toISOString() };
}

// Phase B — Attio stage → portal slug (write-back). KEEP IN SYNC with attio-webhook +
// attio-push + docs/phase-b-integration.md. "Intro Call / Pre-Demo" is intentionally ABSENT
// (entry-stage guard). status-only (v1); the `neq` is the write-if-changed loop guard.
const STAGE_TO_SLUG: Record<string, string> = {
  "Demo scheduled": "demo_scheduled",
  "Demo complete": "demo_complete",
  "POC proposal sent": "poc_proposal_sent",
  "Closed won": "closed_won",
  "Closed lost": "closed_lost",
  "Closed - Churned": "closed_churned",
};
async function writeBackPortalDeal(admin: any, rec: any, extId: string): Promise<void> {
  const stage = textOf(rec, "stage");
  const slug = stage ? STAGE_TO_SLUG[stage] : null;
  if (!slug) return;
  const { error } = await admin.from("channel_deals")
    .update({ status: slug, synced_at: new Date().toISOString() })
    .eq("id", extId).eq("origin", "portal").neq("status", slug);
  if (error) throw new Error(error.message);
}

async function runSync(admin: any, token: string) {
  const records = await queryAllDeals(token);
  const ownerMap = await fetchOwnerEmailMap(token);
  const rows: any[] = [];
  const seen: string[] = [];
  const failures: any[] = [];
  let writtenBack = 0;

  for (const rec of records) {
    try {
      const extId = externalIdOf(rec);
      if (extId) { // Portal-originated deal → write its Attio stage back to the portal row
        await writeBackPortalDeal(admin, rec, extId);
        writtenBack++;
        continue;
      }
      const row = await mapDeal(rec, ownerMap);
      if (!row) continue; // malformed — skip
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

  console.log(`attio-sync: ${records.length} fetched · ${upserted} upserted · ${writtenBack} written-back · ${deleted} deleted · ${failures.length} failures`);
  return { ok: true, fetched: records.length, ingested: rows.length, upserted, writtenBack, deleted, failures: failures.length };
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
