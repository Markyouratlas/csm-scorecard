// ============================================================
// Supabase Edge Function: attio-webhook  (Pipe 1 real-time)
// ============================================================
// Attio record.created / record.updated / record.deleted webhook for the deals object
// → keeps Heather's channel_deals rows live. Public webhook: verify the Attio-Signature
// HMAC-SHA256 (hex) over the RAW body BEFORE parsing, ack 200 within Attio's 5s window.
//
// Loop-safe: only native deals (empty external_id) are ingested; deals carrying an
// external_id (Portal deals pushed up in Pipe 2) are skipped, so they can't round-trip.
// Webhook payloads are minimal (id.record_id + actor), so we RE-FETCH the record.
//
// Deploy:  supabase functions deploy attio-webhook --no-verify-jwt   (public webhook —
//          the flag is NOT sticky, pass it on EVERY redeploy or it 401s before our code)
// Secrets: ATTIO_API_KEY, ATTIO_WEBHOOK_SECRET.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTIO_BASE = "https://api.attio.com/v2";
const DEALS = "deals";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, attio-signature" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = (s: string) => new TextEncoder().encode(s);

async function validAttioSig(secret: string, rawBody: string, provided: string): Promise<boolean> {
  if (!secret || !provided) return false;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-length hex compare (both sides hex of a 32-byte digest)
  const a = enc(hex), b = enc(provided.trim().toLowerCase());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- Field extraction — KEEP IN SYNC with attio-sync/index.ts ----
const firstVal = (rec: any, slug: string): any => {
  const a = rec?.values?.[slug];
  return Array.isArray(a) && a.length ? a[0] : null;
};
const textOf = (rec: any, slug: string): string | null => {
  const v = firstVal(rec, slug);
  return v == null ? null : (v.value ?? v.option?.title ?? v.status?.title ?? null);
};
const externalIdOf = (rec: any): string | null => {
  const v = textOf(rec, "external_id");
  return v && String(v).trim() ? String(v).trim() : null;
};
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
// Owner resolution — native Attio deals → their Attio OWNER's email (workspace member,
// matches the scorecard login); falls back to Heather if unresolved.
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
async function mapDeal(rec: any, ownerMap: Record<string, string> = {}): Promise<any | null> {
  if (externalIdOf(rec)) return null;
  const recordId = rec?.id?.record_id;
  if (!recordId) return null;
  const name = textOf(rec, "name");
  const value = currencyOf(rec, "value") ?? currencyOf(rec, "mrc") ?? currencyOf(rec, "projected_arr");
  const fields = {
    attio_record_id: recordId, origin: "attio", external_id: null,
    business_name: name || "Untitled deal",
    avg_value: value != null ? String(value) : null,
    status: textOf(rec, "stage") || "pending",
    portal_created_at: rec?.created_at || null,
    attio_updated_at: rec?.created_at || null,
    assigned_to: ownerMap[ownerIdOf(rec) || ""] || "heather@youratlas.com", // Attio owner's email (else Heather)
  };
  const content_hash = await sha256(JSON.stringify(fields));
  return { ...fields, content_hash, attio_raw: rec, synced_at: new Date().toISOString() };
}

// Phase B — Attio stage → portal slug (write-back). Mirror of SLUG_TO_STAGE in attio-push +
// docs/phase-b-integration.md. "Intro Call / Pre-Demo" is intentionally ABSENT (entry-stage
// guard: never overwrite a portal review status with the auto entry stage).
const STAGE_TO_SLUG: Record<string, string> = {
  "Demo scheduled": "demo_scheduled",
  "Demo complete": "demo_complete",
  "POC proposal sent": "poc_proposal_sent",
  "Closed won": "closed_won",
  "Closed lost": "closed_lost",
  "Closed - Churned": "closed_churned",
};

// Write Heather's Attio stage change BACK to the portal-originated channel_deals row
// (status-only, v1). The `neq` is the write-if-changed loop guard (no-op → no trigger).
async function writeBackPortalDeal(admin: any, rec: any, extId: string): Promise<void> {
  const stage = textOf(rec, "stage");
  const slug = stage ? STAGE_TO_SLUG[stage] : null;
  if (!slug) return; // entry stage / unknown / no stage → ignore
  const { error } = await admin.from("channel_deals")
    .update({ status: slug, synced_at: new Date().toISOString() })
    .eq("id", extId).eq("origin", "portal").neq("status", slug);
  if (error) throw new Error(error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const raw = await req.text();
    const secret = Deno.env.get("ATTIO_WEBHOOK_SECRET") || "";
    const provided = req.headers.get("Attio-Signature") || req.headers.get("X-Attio-Signature") || "";
    if (!(await validAttioSig(secret, raw, provided))) return json({ error: "forbidden" }, 403);

    const token = Deno.env.get("ATTIO_API_KEY") || "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ownerMap = await fetchOwnerEmailMap(token);

    const body = JSON.parse(raw || "{}");
    const events: any[] = Array.isArray(body?.events) ? body.events : [body];
    console.log("attio-webhook:", events.map((e) => e?.event_type).join(","));

    for (const ev of events) {
      const recordId = ev?.id?.record_id;
      const type: string = ev?.event_type || "";
      if (!recordId) continue;
      try {
        if (type.endsWith("deleted")) {
          await admin.from("channel_deals").delete().eq("origin", "attio").eq("attio_record_id", recordId);
          continue;
        }
        // created / updated — re-fetch the record for its current values.
        const res = await fetch(`${ATTIO_BASE}/objects/${DEALS}/records/${recordId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Attio get ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const rec = (await res.json())?.data;
        const extId = externalIdOf(rec);
        if (extId) { // Portal-originated deal → write Heather's stage change back to its row
          await writeBackPortalDeal(admin, rec, extId);
          continue;
        }
        const row = await mapDeal(rec, ownerMap);
        if (!row) continue; // malformed / no record id
        const { error } = await admin.from("channel_deals").upsert(row, { onConflict: "attio_record_id" });
        if (error) throw new Error(error.message);
      } catch (e: any) {
        await admin.from("sync_dead_letter").insert({ source: "attio-webhook", op: "webhook", ref: recordId, error: String(e?.message || e), payload: ev });
      }
    }

    return json({ ok: true, events: events.length });
  } catch (e: any) {
    console.error("attio-webhook error:", e);
    // Return 200 so Attio doesn't retry a payload we already dead-lettered; hard errors
    // (signature) already returned above.
    return json({ ok: false, error: e?.message || String(e) }, 200);
  }
});
