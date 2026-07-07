// ============================================================
// Supabase Edge Function: dialer-sms-status
// ============================================================
// Twilio message StatusCallback (attached by dialer-send). Updates the outbound
// sms_messages row's status (sent/delivered/undelivered/failed) by MessageSid.
// Signature-validated; deploy --no-verify-jwt.
// Secret: TWILIO_AUTH_TOKEN, DIALER_SMS_STATUS_URL (exact configured URL).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature" };
const ok = () => new Response("", { status: 204, headers: cors });

async function validSig(url: string, p: URLSearchParams, token: string, provided: string): Promise<boolean> {
  if (!provided || !token) return false;
  let data = url;
  for (const k of [...p.keys()].sort()) data += k + (p.get(k) ?? "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === provided;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const url = Deno.env.get("DIALER_SMS_STATUS_URL") || req.url;
    const p = new URLSearchParams(await req.text());
    if (!(await validSig(url, p, token, req.headers.get("X-Twilio-Signature") || ""))) return ok();

    const sid = p.get("MessageSid") || p.get("SmsSid") || "";
    const status = p.get("MessageStatus") || p.get("SmsStatus") || "";
    if (sid && status) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("sms_messages").update({ status, updated_at: new Date().toISOString() }).eq("twilio_sid", sid);
    }
    return ok();
  } catch (e: any) {
    console.error("dialer-sms-status error:", e);
    return ok();
  }
});
