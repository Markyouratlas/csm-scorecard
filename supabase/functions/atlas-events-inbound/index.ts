// ============================================================
// Supabase Edge Function: atlas-events-inbound
// ============================================================
// Atlas Events Gateway webhook (message_received / message_sent /
// message_session_completed). Keeps atlas_sessions + atlas_messages fresh in
// near-real-time so the messenger updates without a manual re-sync and always
// targets the CURRENT session.
//
// Atlas does NOT sign webhooks — we protect the URL with a secret token in the
// query string (?token=<ATLAS_WEBHOOK_TOKEN>). Payload is a JSON ARRAY of events;
// message events carry campaignId + customerNumber (no sessionId), so for each
// affected contact we do a TARGETED pull from the REST API (real RowKeys) and
// upsert — correct + naturally deduped.
//
// Deploy --no-verify-jwt. Secrets: ATLAS_API_KEY, ATLAS_WEBHOOK_TOKEN,
//   ATLAS_CAMPAIGN_IDS (to bound which campaigns we touch).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ATLAS_BASE = "https://api.youratlas.com/v1/api";

function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}
const last10 = (raw: string) => (raw || "").replace(/\D/g, "").slice(-10);
const isEmail = (s: string) => /@/.test(s || "");
const CLOSED = new Set(["Closed Won", "Closed Lost", "Unqualified", "Deleted"]);
function asArray(resp: any): any[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") {
    for (const k of ["value", "data", "sessions", "messages", "phoneNumbers", "result", "items"]) if (Array.isArray(resp[k])) return resp[k];
    const f = Object.values(resp).find((v) => Array.isArray(v)); if (Array.isArray(f)) return f as any[];
  }
  return [];
}
async function atlasGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${ATLAS_BASE}${path}`, { headers: { "api-key": apiKey, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Atlas ${res.status} on ${path}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = Deno.env.get("ATLAS_WEBHOOK_TOKEN") || "";
    const provided = new URL(req.url).searchParams.get("token") || "";
    if (!token || provided !== token) return new Response("forbidden", { status: 403, headers: cors });

    const apiKey = Deno.env.get("ATLAS_API_KEY") || "";
    const allowed = new Set((Deno.env.get("ATLAS_CAMPAIGN_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean));
    const body = await req.json().catch(() => []);
    const events = Array.isArray(body) ? body : [body];

    // Unique (campaignId, customerNumber) to refresh.
    const pairs = new Map<string, { campaignId: string; contact: string }>();
    for (const ev of events) {
      const campaignId = ev?.campaignId || ev?.CampaignId;
      const contact = ev?.customerNumber || ev?.CustomerNumber || ev?.contact;
      if (!campaignId || !contact) continue;
      if (allowed.size && !allowed.has(campaignId)) continue;
      pairs.set(`${campaignId}|${contact}`, { campaignId, contact });
    }
    if (!pairs.size) return new Response(JSON.stringify({ ok: true, refreshed: 0 }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve campaign meta (name + sending number) once.
    const meta = new Map<string, { name: string | null; number: string | null }>();
    try {
      const camps = asArray(await atlasGet(`/campaign`, apiKey));
      let phones: any[] = [];
      try { phones = asArray(await atlasGet(`/campaign-chat/phone-numbers`, apiKey)); } catch { /* optional */ }
      for (const c of camps) {
        const id = c.RowKey || c.id; if (!id) continue;
        const pn = phones.find((p) => p.RowKey === c.ChatPhoneNumberId) || phones.find((p) => p.CampaignId === id);
        meta.set(id, { name: c.name || c.BusinessName || null, number: pn?.PhoneNumber || null });
      }
    } catch (e) { console.warn("campaign meta failed", String(e)); }

    let refreshed = 0;
    for (const { campaignId, contact } of pairs.values()) {
      try {
        const email = isEmail(contact) ? contact.toLowerCase() : null;
        const phone = !email ? e164(contact) : null;
        const tail = last10(phone || contact);

        // Link to a deal for this contact (phone last-10, else email).
        let deal: any = null;
        if (email) {
          const { data } = await admin.from("ae_deals").select("id, ae_id, status").ilike("customer_email", email).order("meeting_at", { ascending: false }).limit(20);
          deal = (data || [])[0] || null;
        } else {
          const { data } = await admin.from("ae_deals").select("id, ae_id, status, customer_phone").ilike("customer_phone", `%${tail}`).order("meeting_at", { ascending: false }).limit(20);
          const m = (data || []).filter((d) => last10(d.customer_phone || "") === tail);
          deal = m.find((d) => !CLOSED.has(d.status)) || m[0] || null;
        }
        const repId = deal?.ae_id || null;
        const cm = meta.get(campaignId) || { name: null, number: null };

        // Pull this campaign's sessions, keep the ones for this contact.
        const sessions = asArray(await atlasGet(`/campaign-chat/${encodeURIComponent(campaignId)}`, apiKey))
          .filter((s) => {
            const c = (s.ContactIdentification || "").trim();
            return isEmail(c) ? c.toLowerCase() === email : last10(e164(c)) === tail;
          })
          .sort((a, b) => new Date(b.Timestamp || 0).getTime() - new Date(a.Timestamp || 0).getTime());
        if (!sessions.length) continue;

        for (const s of sessions) {
          const sessionId = s.RowKey || s.AIProviderSessionId; if (!sessionId) continue;
          await admin.from("atlas_sessions").upsert({
            id: sessionId, campaign_id: campaignId,
            contact_phone: phone, contact_email: email,
            title: s.Tittle || s.Title || null, status: s.Status || null,
            previous_session_id: s.PreviousSessionId || null,
            campaign_name: cm.name, line_number: cm.number,
            ae_deal_id: deal?.id || null, rep_id: repId,
            created_at: s.Timestamp || null, updated_at: new Date().toISOString(),
          }, { onConflict: "id" });
        }

        // Refresh messages for the current (newest) session.
        const current = sessions[0].RowKey || sessions[0].AIProviderSessionId;
        const msgs = asArray(await atlasGet(`/campaign-chat/sessions/${current}/messages`, apiKey))
          .filter((m) => m.Channel === "imessage" && (m.Content || "").trim() && (m.Role === "user" || m.Role === "assistant"))
          .map((m) => ({
            id: m.RowKey, session_id: current, contact_phone: phone, contact_email: email, rep_id: repId,
            role: m.Role, content: m.Content, channel: "imessage", status: m.Status || null,
            atlas_phone_number_id: m.ChatPhoneNumberId || null, created_at: m.CreatedAt || m.Timestamp || null,
          }));
        if (msgs.length) await admin.from("atlas_messages").upsert(msgs, { onConflict: "id" });
        refreshed++;
      } catch (e) { console.warn("refresh failed", campaignId, String(e)); }
    }

    return new Response(JSON.stringify({ ok: true, refreshed }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("atlas-events-inbound error:", e);
    // Always 200 so Atlas doesn't retry-storm.
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
