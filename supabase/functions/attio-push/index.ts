// ============================================================
// Supabase Edge Function: attio-push  (Pipe 2 — Scorecard → Attio)
// ============================================================
// Pushes PORTAL-registered channel deals (channel_deals.origin='portal') UP into Attio.
// Assert order (Attio never auto-creates referenced records): person → deal. Company is
// skipped (portal rows carry no domain to match on). The deal is asserted on external_id
// (= the portal deal id = channel_deals.id), so re-pushing updates rather than duplicates.
//
// We write ONLY identity/registration fields (external_id, name, value, associated_people).
// We deliberately DON'T write stage/owner — Attio owns those after creation, so a re-push
// never clobbers Heather's pipeline edits. Loop-safe: the pushed deal has an external_id,
// so Pipe 1 (attio-sync/attio-webhook) skips it and never pulls it back.
//
// Invoked two ways:
//   • Supabase Database Webhook on channel_deals insert/update  → body { record: {...} }
//   • Manual backfill (curl / cron)                              → empty body → all portal rows
//
// Auth: X-Cron-Secret / service-role (webhook + backfill) OR a signed-in executive.
// Deploy:  supabase functions deploy attio-push   (JWT verify ON — not a public webhook)
// Secrets: ATTIO_API_KEY (needs record read-write + object-config read), CRON_SHARED_SECRET.
// PREREQ:  a UNIQUE `external_id` text attribute must exist on the Attio deals object.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTIO_BASE = "https://api.attio.com/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function attioPut(path: string, body: unknown, token: string, tries = 0): Promise<any> {
  const res = await fetch(`${ATTIO_BASE}${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429 && tries < 5) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return attioPut(path, body, token, tries + 1);
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// One-time: create the unique `external_id` text attribute on the deals object using
// the server-side token (so no one has to paste the 64-char key into a shell).
// Idempotent — treats "already exists" as success.
async function ensureExternalIdAttribute(token: string): Promise<any> {
  const res = await fetch(`${ATTIO_BASE}/objects/deals/attributes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { title: "External ID", api_slug: "external_id", type: "text", is_required: false, is_unique: true, is_multiselect: false } }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, created: true, slug: body?.data?.api_slug || "external_id" };
  const msg = JSON.stringify(body);
  if (res.status === 409 || /already exist|slug|conflict|duplicate/i.test(msg)) return { ok: true, created: false, exists: true, detail: msg.slice(0, 200) };
  throw new Error(`create external_id attribute ${res.status}: ${msg.slice(0, 300)}`);
}

const parseNum = (v: any): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) || n === 0 ? null : n;
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The set of fields we push — also the basis for the no-op content hash.
function pushFields(row: any) {
  return {
    external_id: String(row.id),
    name: row.business_name || "Untitled deal",
    value: parseNum(row.avg_value),
    contact_email: row.contact_email || null,
    contact_name: row.contact_name || null,
    contact_phone: row.contact_phone || null,
  };
}

// Assert the contact person (best-effort; non-fatal if it fails) → returns record_id or null.
async function assertPerson(f: any, token: string): Promise<string | null> {
  if (!f.contact_email) return null;
  const values: any = { email_addresses: [{ email_address: f.contact_email }] };
  if (f.contact_name) {
    const parts = String(f.contact_name).trim().split(/\s+/);
    values.name = [{ first_name: parts[0] || f.contact_name, last_name: parts.slice(1).join(" ") || "", full_name: f.contact_name }];
  }
  if (f.contact_phone) values.phone_numbers = [{ original_phone_number: f.contact_phone }];
  const r = await attioPut(`/objects/people/records?matching_attribute=email_addresses`, { data: { values } }, token);
  return r?.data?.id?.record_id || null;
}

// Assert the deal on external_id → returns the deal record_id.
async function assertDeal(f: any, personId: string | null, token: string): Promise<string> {
  const values: any = {
    external_id: [{ value: f.external_id }],
    name: [{ value: f.name }],
  };
  if (f.value != null) values.value = [{ currency_value: f.value }];
  if (personId) values.associated_people = [{ target_object: "people", target_record_id: personId }];
  const r = await attioPut(`/objects/deals/records?matching_attribute=external_id`, { data: { values } }, token);
  const id = r?.data?.id?.record_id;
  if (!id) throw new Error("Attio deal assert returned no record_id");
  return id;
}

async function pushRow(admin: any, row: any, token: string): Promise<"pushed" | "skipped"> {
  const f = pushFields(row);
  const hash = await sha256(JSON.stringify(f));
  if (row.attio_record_id && row.content_hash === hash) return "skipped"; // no-op

  let personId: string | null = null;
  try { personId = await assertPerson(f, token); }
  catch (e: any) { await admin.from("sync_dead_letter").insert({ source: "attio-push", op: "push-person", ref: String(row.id), error: String(e?.message || e), payload: { email: f.contact_email } }); }

  const dealId = await assertDeal(f, personId, token);
  await admin.from("channel_deals").update({
    attio_record_id: dealId, external_id: f.external_id, content_hash: hash, synced_at: new Date().toISOString(),
  }).eq("id", row.id);
  return "pushed";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Auth ----
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = isServiceRole || (!!cronSecret && (req.headers.get("X-Cron-Secret") || "") === cronSecret);
    if (!isCron) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
      if (!(prof?.role === "executive" || prof?.role_type === "executive")) return json({ error: "Forbidden" }, 403);
    }

    const token = Deno.env.get("ATTIO_API_KEY");
    if (!token) return json({ ok: false, error: "ATTIO_API_KEY not set" }, 500);

    const body = await req.json().catch(() => ({}));

    // ---- One-time setup: create the unique external_id attribute in Attio ----
    if (body?.setup === true) {
      const result = await ensureExternalIdAttribute(token);
      return json(result, 200);
    }

    // ---- Which rows? DB-webhook single row, else all portal rows (backfill) ----
    let rows: any[] = [];
    if (body?.record) {
      if (body.record.origin === "portal") rows = [body.record]; // ignore Pipe-1 (attio) writes
    } else {
      const { data } = await admin.from("channel_deals").select("*").eq("origin", "portal");
      rows = data || [];
    }

    let pushed = 0, skipped = 0, failed = 0;
    for (const row of rows) {
      try {
        const r = await pushRow(admin, row, token);
        r === "pushed" ? pushed++ : skipped++;
      } catch (e: any) {
        failed++;
        await admin.from("sync_dead_letter").insert({ source: "attio-push", op: "push", ref: String(row.id), error: String(e?.message || e), payload: { business_name: row.business_name } });
      }
      await new Promise((r) => setTimeout(r, 60)); // stay under Attio's ~25 writes/sec
    }

    console.log(`attio-push: ${rows.length} portal rows · ${pushed} pushed · ${skipped} skipped · ${failed} failed`);
    return json({ ok: true, considered: rows.length, pushed, skipped, failed });
  } catch (e: any) {
    console.error("attio-push error:", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
