// ============================================================
// Supabase Edge Function: atlas-start
// ============================================================
// Starts a NEW Atlas Blue conversation with a contact who has no existing session
// (send-human-response needs a sessionId, so we must create one first). Uses Atlas
// "schedule session" with the AE's typed first message, then enables human handoff
// so the AE keeps control, and mirrors the session + message locally.
//
// Invoke: supabase.functions.invoke('atlas-start', { body: { to, name, message, dealId } })
// Deploy: supabase functions deploy atlas-start   (JWT verify ON — real rep)
// Secrets: ATLAS_API_KEY, ATLAS_CAMPAIGN_IDS (first id = the Atlas Blue campaign).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ATLAS_BASE = "https://api.youratlas.com/v1/api";
const DIALER_ROLES = new Set(["account_executive", "csm", "executive", "forward_deployed_engineer", "forward_deployed_engineer_lead", "growth_manager"]);

function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("ATLAS_API_KEY") || "";
    const campaignId = (Deno.env.get("ATLAS_CAMPAIGN_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
    if (!apiKey || !campaignId) return json({ error: "ATLAS_API_KEY / ATLAS_CAMPAIGN_IDS not set" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await userClient.from("profiles").select("id, role, role_type").eq("id", user.id).single();
    const isManager = !!prof && (prof.role === "executive" || prof.role === "manager" || prof.role_type === "executive");
    if (!prof || !(DIALER_ROLES.has(prof.role_type) || isManager)) return json({ error: "Forbidden" }, 403);

    const { to, name, message, dealId } = await req.json().catch(() => ({}));
    const toNum = e164(String(to || ""));
    const text = String(message || "").trim();
    if (!toNum || !text) return json({ error: "to and message are required" }, 400);

    // 1. Schedule the session (sends the AE's message as the first message).
    const schedRes = await fetch(`${ATLAS_BASE}/campaign-chat/${encodeURIComponent(campaignId)}/sessions/sms/schedule`, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ customerPhoneNumber: toNum, customerName: (name || "there"), customMessage: text }),
    });
    const sched = await schedRes.json().catch(() => ({}));
    if (!schedRes.ok) {
      console.error("atlas-start: schedule failed", schedRes.status, JSON.stringify(sched));
      return json({ error: sched?.message || `Atlas schedule ${schedRes.status}`, atlas: sched }, 502);
    }
    const sessionId = sched?.sessionId || sched?.SessionId || sched?.RowKey;
    if (!sessionId) return json({ error: "No sessionId returned by Atlas", atlas: sched }, 502);

    // 2. Enable human handoff so the AE keeps control (best-effort).
    try {
      await fetch(`${ATLAS_BASE}/campaign-chat/${encodeURIComponent(campaignId)}/contacts/${encodeURIComponent(toNum)}/human-handoff`, {
        method: "POST", headers: { "api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }),
      });
    } catch (e) { console.warn("atlas-start: handoff enable failed", String(e)); }

    // 3. Mirror the session + first message locally.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nowIso = new Date().toISOString();
    await admin.from("atlas_sessions").upsert({
      id: sessionId, campaign_id: campaignId, contact_phone: toNum, contact_email: null,
      title: `${toNum} ${nowIso}`, status: "pending_human_response", ae_deal_id: dealId || null,
      rep_id: prof.id, human_handoff: true, created_at: nowIso, updated_at: nowIso,
    }, { onConflict: "id" });
    await admin.from("atlas_messages").insert({
      id: `hs_${crypto.randomUUID()}`, session_id: sessionId, contact_phone: toNum, contact_email: null,
      rep_id: prof.id, role: "human", content: text, channel: "imessage", status: "sent", created_at: nowIso,
    });

    return json({ ok: true, sessionId });
  } catch (e: any) {
    console.error("atlas-start error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
