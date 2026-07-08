// ============================================================
// Supabase Edge Function: atlas-handoff
// ============================================================
// Toggles Atlas Blue human handoff for a session's contact: the AI pauses so an
// AE can reply as a human (and back). Atlas's endpoint ALTERNATES state, so we
// flip our own authoritative atlas_sessions.human_handoff in lockstep.
//
// Invoke: supabase.functions.invoke('atlas-handoff', { body: { sessionId } })
// Deploy: supabase functions deploy atlas-handoff   (JWT verify ON — real rep)
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
const DIALER_ROLES = new Set(["account_executive", "csm", "executive", "forward_deployed_engineer", "forward_deployed_engineer_lead"]);

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
    const { data: prof } = await userClient.from("profiles").select("id, role, role_type").eq("id", user.id).single();
    const isManager = !!prof && (prof.role === "executive" || prof.role === "manager" || prof.role_type === "executive");
    if (!prof || !(DIALER_ROLES.has(prof.role_type) || isManager)) return json({ error: "Forbidden" }, 403);

    const reqBody = await req.json().catch(() => ({}));
    const sessionId = reqBody?.sessionId;
    if (!sessionId) return json({ error: "sessionId is required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: s } = await admin.from("atlas_sessions")
      .select("id, campaign_id, contact_phone, contact_email, rep_id, human_handoff").eq("id", sessionId).maybeSingle();
    if (!s) return json({ error: `Session not found: ${sessionId}` }, 404);
    // Only the owning AE (or a manager/exec) may take over.
    if (!isManager && s.rep_id !== user.id) return json({ error: "Forbidden" }, 403);

    const contact = s.contact_phone || s.contact_email;
    if (!s.campaign_id || !contact) return json({ error: "Session missing campaign/contact" }, 400);

    // The endpoint SETS handoff state (requires { enabled }), it doesn't blind-toggle.
    // Optional body { enable } overrides; default flips our current flag.
    const next = typeof reqBody?.enable === "boolean" ? reqBody.enable : !s.human_handoff;

    const url = `${ATLAS_BASE}/campaign-chat/${encodeURIComponent(s.campaign_id)}/contacts/${encodeURIComponent(contact)}/human-handoff`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("atlas-handoff: Atlas rejected", res.status, "url:", url, "body:", body);
      return json({ error: `Atlas handoff ${res.status}`, atlas: body }, 502);
    }

    const patch: Record<string, any> = { human_handoff: next, updated_at: new Date().toISOString() };
    if (next) patch.status = "pending_human_response";
    else if (s.status === "pending_human_response") patch.status = "active";
    await admin.from("atlas_sessions").update(patch).eq("id", sessionId);

    return json({ ok: true, human_handoff: next });
  } catch (e: any) {
    console.error("atlas-handoff error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
