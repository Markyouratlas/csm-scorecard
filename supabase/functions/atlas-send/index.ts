// ============================================================
// Supabase Edge Function: atlas-send
// ============================================================
// Sends a human agent reply on an Atlas Blue conversation (iMessage) from the
// same Atlas Blue number the AI was using. This is the ONLY outbound path for
// Atlas Blue — never dialer-send (that's Twilio).
//
// Posts to Atlas send-human-response { sessionId, message, agentId } and mirrors
// the sent message into atlas_messages (role 'human') so it shows in the thread
// immediately. Requires the AE to have taken over (human_handoff = true).
//
// Invoke: supabase.functions.invoke('atlas-send', { body: { sessionId, message } })
// Deploy: supabase functions deploy atlas-send   (JWT verify ON — real rep)
// Secrets: ATLAS_API_KEY.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("ATLAS_API_KEY") || "";
    if (!apiKey) return json({ error: "ATLAS_API_KEY not set" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await userClient.from("profiles").select("id, name, role, role_type").eq("id", user.id).single();
    const isManager = !!prof && (prof.role === "executive" || prof.role === "manager" || prof.role_type === "executive");
    if (!prof || !(DIALER_ROLES.has(prof.role_type) || isManager)) return json({ error: "Forbidden" }, 403);

    const { sessionId, message } = await req.json().catch(() => ({}));
    const text = String(message || "").trim();
    if (!sessionId || !text) return json({ error: "sessionId and message are required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: s, error: sErr } = await admin.from("atlas_sessions")
      .select("id, campaign_id, contact_phone, contact_email, rep_id, human_handoff").eq("id", sessionId).maybeSingle();
    if (sErr) return json({ error: `Session lookup failed: ${sErr.message}` }, 500);
    if (!s) return json({ error: `Session not found: ${sessionId}` }, 404);
    const canActAny = isManager || prof.role_type === "growth_manager";
    if (!canActAny && s.rep_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (!s.human_handoff) return json({ error: "Take over the conversation first (AI still active)." }, 409);

    const res = await fetch(`${ATLAS_BASE}/campaign-chat/${encodeURIComponent(s.campaign_id)}/send-human-response`, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text, agentId: prof.id }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("atlas-send: Atlas rejected", res.status, "body:", body);
      return json({ error: `Atlas send ${res.status}: ${body}` }, 502);
    }

    // Mirror into the thread immediately (role 'human' distinguishes from AI).
    // Prefix the id so it never collides with a real Atlas RowKey synced later.
    const localId = `hs_${crypto.randomUUID()}`;
    await admin.from("atlas_messages").insert({
      id: localId, session_id: sessionId,
      contact_phone: s.contact_phone, contact_email: s.contact_email, rep_id: s.rep_id,
      role: "human", content: text, channel: "imessage", status: "sent",
      created_at: new Date().toISOString(),
    });

    return json({ ok: true });
  } catch (e: any) {
    console.error("atlas-send error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
