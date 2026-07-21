// ============================================================
// ghl-webinar-signups-sync
//
// Backfills / reconciles webinar opt-in signups from the GoHighLevel v2 API into
// public.webinar_signups. Pages GET /forms/submissions for the workshop opt-in
// form and upserts on ghl_submission_id (idempotent — re-runnable, so this also
// serves as the daily reconciliation job; Phase 2's webhook shares the dedupe key).
//
// Auth: X-Cron-Secret == CRON_SECRET (cron/manual) OR a signed-in executive.
// Deploy --no-verify-jwt (this repo's public-gateway pattern; auth enforced above).
// Secrets: GHL_API_KEY (Private Integration token), GHL_LOCATION_ID, CRON_SECRET.
//
// GHL submission shape (verified live):
//   top-level: id, contactId, formId, name, email, createdAt, others{...}
//   others:    full_name, email, phone (E.164), <revenue-band qualifier>,
//              eventData{ source, medium, page.url, fbEventId, ... }
// Attribution is mostly "Direct traffic" (custom landing page) — fb* ids are the
// realistic Meta-match hook, so we keep those + a lean source/medium/url set.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const GHL_HOST = "https://services.leadconnectorhq.com";
const GHL_VER = "2021-07-28";
// The workshop opt-in form. Overridable via env if it ever changes / a sibling is added.
const DEFAULT_FORM_ID = "3nmXZEM7jE796XhIsFVV";
const DEFAULT_FORM_NAME = "Stop Hiring, Start Cloning Workshop - Optin";

// Pick a phone from the submission: prefer the friendly `others.phone`, else scan
// others' string values for the first E.164-looking one (robust to form changes).
function pickPhone(others: Record<string, any>): string | null {
  if (typeof others?.phone === "string" && others.phone.trim()) return others.phone.trim();
  for (const v of Object.values(others || {})) {
    if (typeof v === "string" && /^\+?\d[\d\s().-]{7,}$/.test(v.trim())) return v.trim();
  }
  return null;
}

// The revenue-band qualifier comes back under a dynamic field id (not a friendly
// key). Heuristic: the first `others` string value that looks like a money band.
function pickRevenueBand(others: Record<string, any>): string | null {
  for (const v of Object.values(others || {})) {
    if (typeof v === "string" && /\$\s?\d|\bunder\b|\bover\b|\bmillion\b|\bM\b/i.test(v) && v.length < 40) {
      return v.trim();
    }
  }
  return null;
}

function mapSubmission(s: any, formId: string, formName: string) {
  const o = s?.others || {};
  const ev = o?.eventData || {};
  // Keep raw but drop the giant signatureHash blob.
  const raw = { ...s, others: { ...o } };
  if (raw.others?.signatureHash) delete raw.others.signatureHash;
  return {
    ghl_submission_id: String(s?.id || o?.submissionId || ""),
    ghl_contact_id: s?.contactId || null,
    form_id: formId,
    form_name: formName,
    full_name: o?.full_name || s?.name || null,
    email: (o?.email || s?.email || null),
    phone: pickPhone(o),
    revenue_band: pickRevenueBand(o),
    submitted_at: s?.createdAt || null,
    source: ev?.source || null,
    medium: ev?.medium || null,
    landing_page_url: ev?.page?.url || ev?.documentURL || null,
    fb_event_id: ev?.fbEventId || null,
    raw,
    synced_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const key = Deno.env.get("GHL_API_KEY") || "";
    const loc = Deno.env.get("GHL_LOCATION_ID") || "";
    if (!key || !loc) return json({ error: "GHL_API_KEY / GHL_LOCATION_ID not set" }, 500);

    // ---- Auth: cron secret OR signed-in executive ----
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const providedCron = req.headers.get("x-cron-secret") || "";
    let authed = !!cronSecret && providedCron === cronSecret;
    if (!authed) {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
        authed = !!prof && (prof.role === "executive" || prof.role_type === "executive");
      }
    }
    if (!authed) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const formId = body.formId || Deno.env.get("WEBINAR_FORM_ID") || DEFAULT_FORM_ID;
    const formName = body.formName || DEFAULT_FORM_NAME;
    const maxPages = Number(body.maxPages) || 500; // safety cap

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const H = { Authorization: `Bearer ${key}`, Version: GHL_VER, Accept: "application/json" };

    let page = 1, pulled = 0, upserted = 0, pages = 0;
    let total: number | null = null;
    while (page && pages < maxPages) {
      const qs = new URLSearchParams({ locationId: loc, formId, limit: "100", page: String(page) });
      const r = await fetch(`${GHL_HOST}/forms/submissions?${qs}`, { headers: H });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json({ error: `GHL ${r.status}`, detail: txt.slice(0, 400), pages, pulled, upserted }, 502);
      }
      const j = await r.json();
      total = j?.meta?.total ?? total;
      const subs: any[] = j?.submissions || [];
      pages++;
      if (!subs.length) break;

      const rows = subs.map((s) => mapSubmission(s, formId, formName)).filter((x) => x.ghl_submission_id);
      pulled += rows.length;
      if (rows.length) {
        const { error, count } = await admin
          .from("webinar_signups")
          .upsert(rows, { onConflict: "ghl_submission_id", count: "exact" });
        if (error) return json({ error: error.message, pages, pulled, upserted }, 500);
        upserted += count ?? rows.length;
      }
      const next = j?.meta?.nextPage;
      page = (typeof next === "number" && next > page) ? next : 0;
    }

    return json({ ok: true, formId, formName, total, pages, pulled, upserted });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
