// ============================================================
// Supabase Edge Function: attio-push  (Pipe 2 — Scorecard → Attio)
// ============================================================
// Pushes PORTAL-registered channel deals (channel_deals.origin='portal') UP into Attio.
// Assert order (Attio never auto-creates referenced records): company → person → deal.
// Company is matched/created by the contact's email domain (personal-email domains skipped);
// person by email (with E.164 phone). The deal is asserted on external_id (= the portal deal
// id = channel_deals.id), so re-pushing updates rather than duplicates.
//
// Written fields: external_id, name, value, associated_company, associated_people, plus the
// portal's channel context in custom attributes (partner_company, tsd, call_volume, pain_point,
// crm) + deal_registered date. stage + owner are set ONLY on create (Attio requires them) and
// omitted on update, so a re-push never clobbers Heather's Attio pipeline/owner edits. Loop-safe:
// the pushed deal has an external_id, so Pipe 1 (attio-sync/attio-webhook) skips it.
//
// {setup:true} provisions the custom attributes (incl. unique external_id) via the server token.
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

// Attributes the sync provisions on the Attio deals object (via {setup:true}), using
// the server-side token so no one pastes the 64-char key into a shell. external_id is
// the unique sync key; the rest hold the portal's channel context (no native Attio field).
const SYNC_ATTRS: Array<{ title: string; slug: string; type: string; unique?: boolean; description: string }> = [
  { title: "External ID",     slug: "external_id",     type: "text", unique: true, description: "Portal deal id — Scorecard sync key (do not edit)" },
  { title: "Partner Company", slug: "partner_company", type: "text", description: "Channel partner company (from the Deals Portal)" },
  { title: "TSD",             slug: "tsd",             type: "text", description: "Technology Services Distributor (from the Deals Portal)" },
  { title: "Call Volume",     slug: "call_volume",     type: "text", description: "Prospect call volume (from the Deals Portal)" },
  { title: "Pain Point",      slug: "pain_point",      type: "text", description: "Prospect pain point (from the Deals Portal)" },
  { title: "CRM",             slug: "crm",             type: "text", description: "Prospect's CRM (from the Deals Portal)" },
];

// Create one attribute; idempotent (treats "already exists" as success).
async function createAttr(token: string, def: typeof SYNC_ATTRS[number]): Promise<any> {
  const res = await fetch(`${ATTIO_BASE}/objects/deals/attributes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { title: def.title, description: def.description, api_slug: def.slug, type: def.type, is_required: false, is_unique: !!def.unique, is_multiselect: false, config: {} } }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { slug: def.slug, created: true };
  const msg = JSON.stringify(body);
  if (res.status === 409 || /already exist|slug|conflict|duplicate|unique/i.test(msg)) return { slug: def.slug, exists: true };
  throw new Error(`create ${def.slug} ${res.status}: ${msg.slice(0, 200)}`);
}

async function ensureAttributes(token: string): Promise<any[]> {
  const out: any[] = [];
  for (const def of SYNC_ATTRS) out.push(await createAttr(token, def));
  return out;
}

const parseNum = (v: any): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) || n === 0 ? null : n;
};

// Normalize a phone to E.164 (+1XXXXXXXXXX). Returns null if we can't confidently
// normalize — Attio rejects numbers without country info, so we skip rather than fail.
const e164 = (raw: any): string | null => {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
};

// Company domain from a contact email — but not personal-email providers (those aren't
// the company). Attio matches/creates companies by domain, so no domain → no company.
const PERSONAL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com"]);
const domainFromEmail = (email: any): string | null => {
  const m = /@([^@\s]+)$/.exec(String(email || "").trim().toLowerCase());
  const d = m?.[1];
  return d && !PERSONAL_DOMAINS.has(d) ? d : null;
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
    partner_company: row.partner_company || null,
    tsd: row.tsd_name || null,
    call_volume: row.call_volume || null,
    pain_point: row.pain_point || null,
    crm: row.crm || null,
    deal_registered: row.portal_created_at || null,
  };
}

// Assert the contact person (best-effort; non-fatal) → returns record_id or null.
async function assertPerson(f: any, token: string): Promise<string | null> {
  if (!f.contact_email) return null;
  const values: any = { email_addresses: [{ email_address: f.contact_email }] };
  if (f.contact_name) {
    const parts = String(f.contact_name).trim().split(/\s+/);
    values.name = [{ first_name: parts[0] || f.contact_name, last_name: parts.slice(1).join(" ") || "", full_name: f.contact_name }];
  }
  const phone = e164(f.contact_phone);
  if (phone) values.phone_numbers = [{ original_phone_number: phone }];
  const r = await attioPut(`/objects/people/records?matching_attribute=email_addresses`, { data: { values } }, token);
  return r?.data?.id?.record_id || null;
}

// Assert the company from the contact's email domain (best-effort; non-fatal) → record_id
// or null. Attio matches/creates companies by domain; personal-email domains are skipped.
async function assertCompany(f: any, token: string): Promise<string | null> {
  const domain = domainFromEmail(f.contact_email);
  if (!domain) return null;
  const values: any = { domains: [{ domain }], name: [{ value: f.name }] };
  const r = await attioPut(`/objects/companies/records?matching_attribute=domains`, { data: { values } }, token);
  return r?.data?.id?.record_id || null;
}

// Does a deal already exist for this external_id? Lets us set the required stage +
// owner ONLY on create, so a re-push never clobbers Heather's Attio pipeline edits.
async function findDealByExternalId(extId: string, token: string): Promise<string | null> {
  const res = await fetch(`${ATTIO_BASE}/objects/deals/records/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { external_id: extId }, limit: 1 }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j?.data?.[0]?.id?.record_id || null;
}

// Assert the deal on external_id → returns the deal record_id.
async function assertDeal(f: any, personId: string | null, companyId: string | null, token: string): Promise<string> {
  const existingId = await findDealByExternalId(f.external_id, token);
  const values: any = {
    external_id: [{ value: f.external_id }],
    name: [{ value: f.name }],
  };
  if (f.value != null) values.value = [{ currency_value: f.value }];
  if (personId) values.associated_people = [{ target_object: "people", target_record_id: personId }];
  if (companyId) values.associated_company = [{ target_object: "companies", target_record_id: companyId }];
  // Portal-owned channel context (the portal is the source → always written).
  if (f.partner_company) values.partner_company = [{ value: f.partner_company }];
  if (f.tsd) values.tsd = [{ value: f.tsd }];
  if (f.call_volume) values.call_volume = [{ value: f.call_volume }];
  if (f.pain_point) values.pain_point = [{ value: f.pain_point }];
  if (f.crm) values.crm = [{ value: f.crm }];
  if (f.deal_registered) values.deal_registered = [{ value: String(f.deal_registered).slice(0, 10) }];
  if (!existingId) {
    // CREATE — Attio requires stage + owner on new deals. Entry stage + default owner;
    // omitted on UPDATE so Heather's Attio pipeline/owner edits are preserved.
    values.stage = [{ status: "Intro Call / Pre-Demo" }];
    const owner = Deno.env.get("ATTIO_DEAL_OWNER_EMAIL");
    if (owner) values.owner = [{ workspace_member_email_address: owner }];
  }
  const r = await attioPut(`/objects/deals/records?matching_attribute=external_id`, { data: { values } }, token);
  const id = r?.data?.id?.record_id;
  if (!id) throw new Error("Attio deal assert returned no record_id");
  return id;
}

async function pushRow(admin: any, row: any, token: string): Promise<"pushed" | "skipped"> {
  const f = pushFields(row);
  const hash = await sha256(JSON.stringify(f));
  if (row.attio_record_id && row.content_hash === hash) return "skipped"; // no-op

  let companyId: string | null = null, personId: string | null = null;
  try { companyId = await assertCompany(f, token); }
  catch (e: any) { await admin.from("sync_dead_letter").insert({ source: "attio-push", op: "push-company", ref: String(row.id), error: String(e?.message || e), payload: { email: f.contact_email } }); }
  try { personId = await assertPerson(f, token); }
  catch (e: any) { await admin.from("sync_dead_letter").insert({ source: "attio-push", op: "push-person", ref: String(row.id), error: String(e?.message || e), payload: { email: f.contact_email } }); }

  const dealId = await assertDeal(f, personId, companyId, token);
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

    // ---- One-time setup: provision the sync attributes on the Attio deals object ----
    if (body?.setup === true) {
      const attributes = await ensureAttributes(token);
      return json({ ok: true, attributes }, 200);
    }

    // ---- Diagnostic: list the deals object's attributes (which are required?) ----
    if (body?.diag === true) {
      const res = await fetch(`${ATTIO_BASE}/objects/deals/attributes`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      const attrs = (j?.data || []).map((a: any) => ({ id: a?.id?.attribute_id, slug: a?.api_slug, title: a?.title, type: a?.type, required: a?.is_required }));
      return json({ ok: true, required: attrs.filter((a: any) => a.required), all: attrs }, 200);
    }

    // ---- Diagnostic: list the deals `stage` pipeline (all configured statuses) ----
    if (body?.stages === true) {
      const res = await fetch(`${ATTIO_BASE}/objects/deals/attributes/stage/statuses`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      const stages = (j?.data || []).map((s: any) => ({ title: s?.title, archived: !!s?.is_archived }));
      return json({ ok: true, stages }, 200);
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
