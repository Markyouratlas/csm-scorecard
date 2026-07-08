// ============================================================
// Supabase Edge Function: dialer-send
// ============================================================
// Sends a message for a signed-in rep. Two channels:
//   - SMS (default): from the rep's OWN Twilio number (A2P Messaging Service).
//   - RCS (opt-in, channel:'rcs'): from the brand-level Atlas RCS agent
//     (TWILIO_RCS_FROM). RCS is not per-rep — it's one verified brand sender.
// If channel:'rcs' is requested but TWILIO_RCS_FROM isn't set yet (pre-verification),
// we GRACEFULLY FALL BACK to per-rep SMS. The response reports the channel actually
// used ({ channel }), and sms_messages.channel records it — the UI never lies.
//
// Invoke (browser): supabase.functions.invoke('dialer-send', { body: { to, body, dealId, channel } })
// Deploy: supabase functions deploy dialer-send   (JWT verify ON — real rep)
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_PHONE_NUMBER,
//          DIALER_SMS_STATUS_URL (optional, delivery/read callbacks),
//          TWILIO_RCS_FROM (optional flag — the RCS agent sender, e.g. "rcs:atlas_agent";
//            when set, channel:'rcs' sends RCS instead of falling back to SMS).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const DIALER_ROLES = new Set(["account_executive", "csm", "executive", "forward_deployed_engineer", "forward_deployed_engineer_lead"]);

// Normalize to E.164 so contact_phone matches inbound (Twilio always delivers E.164).
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
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await userClient.from("profiles").select("id, role, role_type, twilio_number").eq("id", user.id).single();
    if (!prof || !(DIALER_ROLES.has(prof.role_type) || prof.role === "executive")) return json({ error: "Forbidden" }, 403);

    const { to, body, dealId, channel } = await req.json().catch(() => ({}));
    const toNum = e164(String(to || ""));
    const text = String(body || "").trim();
    if (!toNum || !text) return json({ error: "to and body are required" }, 400);

    const from = e164(prof.twilio_number || Deno.env.get("TWILIO_PHONE_NUMBER") || "");
    if (!from) return json({ error: "No sending number assigned to this rep." }, 400);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const apiKey = Deno.env.get("TWILIO_API_KEY") || "";
    const apiSecret = Deno.env.get("TWILIO_API_SECRET") || "";
    const statusUrl = Deno.env.get("DIALER_SMS_STATUS_URL") || "";
    const rcsFrom = Deno.env.get("TWILIO_RCS_FROM") || "";

    // Decide the channel actually used. RCS only if requested AND the brand agent is
    // configured; otherwise fall back to per-rep SMS. RCS sender is brand-level (not
    // per-rep); Twilio itself falls back to SMS if the handset can't do RCS.
    const wantsRcs = channel === "rcs" && !!rcsFrom;
    const usedChannel = wantsRcs ? "rcs" : "sms";

    const form = new URLSearchParams({
      From: wantsRcs ? rcsFrom : from,
      To: toNum,
      Body: text,
    });
    if (statusUrl) form.set("StatusCallback", statusUrl);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const tw = await res.json();
    if (!res.ok) return json({ error: tw?.message || `Twilio ${res.status}`, code: tw?.code }, 502);

    // Log with the service role (no client insert policy on sms_messages).
    // from_number/line_number stay the rep's number for SMS; for RCS the brand
    // agent sent it, so from_number reflects the RCS sender.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("sms_messages").insert({
      rep_id: prof.id, ae_deal_id: dealId || null, contact_phone: toNum,
      from_number: wantsRcs ? rcsFrom : from, line_number: from, channel: usedChannel,
      direction: "outbound", body: text, status: tw?.status || "queued", twilio_sid: tw?.sid || null,
    }).select().single();

    return json({ ok: true, channel: usedChannel, message: row });
  } catch (e: any) {
    console.error("dialer-send error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
