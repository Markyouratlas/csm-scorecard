// ============================================================
// Supabase Edge Function: cal-booking-inbound
// ============================================================
// Cal.com BOOKING_CREATED webhook → INSTANT booking → deal → Atlas link.
// When a prospect books, we (1) upsert the ae_deal immediately (host → AE,
// idempotent with the 3h ae-meetings-sync cron), and (2) link any Atlas Blue
// conversation for that prospect (by phone/email) to the deal + rep, so the AE
// sees the pre-meeting iMessage thread + blue badge the moment the booking lands
// instead of waiting for a sync.
//
// Public webhook → deploy --no-verify-jwt. Cal.com doesn't require signing, but
// supports it: we verify X-Cal-Signature-256 (HMAC-SHA256 hex over the raw body)
// against CAL_WEBHOOK_SECRET, OR a ?token= against CAL_WEBHOOK_TOKEN. One must match.
//
// Secrets: CAL_WEBHOOK_SECRET (recommended) and/or CAL_WEBHOOK_TOKEN.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cal-signature-256" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = (s: string) => new TextEncoder().encode(s);
const last10 = (raw: string) => (raw || "").replace(/\D/g, "").slice(-10);
function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}

// Mirror cal-sync's extractPhone against the webhook payload (attendees[0].phoneNumber
// or the booking-form responses); anchored so a Zoom URL isn't mistaken for a phone.
function extractPhone(p: any): string | null {
  const looks = (v: any) => (typeof v === "string" && /^\+?[0-9][0-9 ()\-]{6,}$/.test(v.trim())) ? v.trim() : null;
  const r = p?.responses || {};
  const rv = (k: string) => (r[k] && typeof r[k] === "object" ? r[k].value : r[k]);
  return looks(p?.attendees?.[0]?.phoneNumber) || looks(rv("attendeePhoneNumber")) || looks(rv("smsReminderNumber")) || looks(rv("phone")) || looks(p?.location) || null;
}

async function validCalSig(secret: string, rawBody: string, provided: string): Promise<boolean> {
  if (!secret || !provided) return false;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === provided.trim().toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const raw = await req.text();

    // ---- Authenticate (signature OR URL token) ----
    const secret = Deno.env.get("CAL_WEBHOOK_SECRET") || "";
    const urlToken = Deno.env.get("CAL_WEBHOOK_TOKEN") || "";
    const providedToken = new URL(req.url).searchParams.get("token") || "";
    const sigOk = secret ? await validCalSig(secret, raw, req.headers.get("X-Cal-Signature-256") || "") : false;
    const tokenOk = urlToken ? providedToken === urlToken : false;
    if (!sigOk && !tokenOk) return json({ error: "forbidden" }, 403);

    const body = JSON.parse(raw || "{}");
    const trigger = body?.triggerEvent || body?.event || "";
    if (trigger && trigger !== "BOOKING_CREATED") return json({ ok: true, ignored: trigger });

    const p = body?.payload || body;
    // Log the first payloads so we can confirm the exact Cal.com webhook shape.
    console.log("cal-booking-inbound payload keys:", Object.keys(p || {}).join(","));

    const uid = p?.uid || p?.bookingUid || p?.booking?.uid || null;
    const hostName = (p?.organizer?.name || p?.hosts?.[0]?.name || p?.user?.name || "").trim();
    const att = p?.attendees?.[0] || {};
    const customerName = att?.name || null;
    const customerEmail = (att?.email || "").trim().toLowerCase() || null;
    const phone = e164(extractPhone(p) || "");
    const startTime = p?.startTime || p?.start || null;
    const eventType = p?.eventType?.slug || p?.type || p?.eventTypeSlug || null;

    if (!uid || !hostName) return json({ ok: true, skipped: "missing uid/host", uid, hostName });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Host name → AE profile id (matches ae-meetings-sync).
    const { data: profs } = await admin.from("profiles").select("id, name");
    const aeId = (profs || []).find((r) => (r.name || "").trim().toLowerCase() === hostName.toLowerCase())?.id || null;
    if (!aeId) return json({ ok: true, skipped: "no AE match for host", hostName });

    // 1. Upsert the deal (idempotent with the cron via unique(ae_id, booking_uid)).
    await admin.from("ae_deals").upsert({
      ae_id: aeId, source: "cal", booking_uid: uid,
      customer_name: customerName, customer_email: customerEmail, customer_phone: phone || null,
      meeting_at: startTime, event_type: eventType, status: "Scheduled",
    }, { onConflict: "ae_id,booking_uid", ignoreDuplicates: true });
    const { data: deal } = await admin.from("ae_deals").select("id").eq("ae_id", aeId).eq("booking_uid", uid).maybeSingle();
    const dealId = deal?.id || null;

    // 2. Link any Atlas Blue conversation for this prospect to the deal + rep.
    //    Try PHONE (last-10) first; if that links nothing (e.g. the booking had no
    //    phone, or the Atlas session is email/Apple-ID keyed), fall back to EMAIL.
    //    Denormalized rep_id on messages powers RLS.
    const now = new Date().toISOString();
    let linked = 0, linkBy: string | null = null;
    if (dealId) {
      const tail = last10(phone);
      if (tail) {
        const { data: s } = await admin.from("atlas_sessions").update({ ae_deal_id: dealId, rep_id: aeId, updated_at: now })
          .ilike("contact_phone", `%${tail}`).select("id");
        linked = s?.length || 0;
        if (linked) { linkBy = "phone"; await admin.from("atlas_messages").update({ rep_id: aeId }).ilike("contact_phone", `%${tail}`); }
      }
      if (linked === 0 && customerEmail) {
        const { data: s } = await admin.from("atlas_sessions").update({ ae_deal_id: dealId, rep_id: aeId, updated_at: now })
          .ilike("contact_email", customerEmail).select("id");
        linked = s?.length || 0;
        if (linked) { linkBy = "email"; await admin.from("atlas_messages").update({ rep_id: aeId }).ilike("contact_email", customerEmail); }
      }
    }

    return json({ ok: true, dealId, aeId, linkedSessions: linked, linkBy });
  } catch (e: any) {
    console.error("cal-booking-inbound error:", e);
    return json({ ok: false, error: e?.message || String(e) }, 200); // never make Cal retry-storm
  }
});
