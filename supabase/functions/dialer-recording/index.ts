// ============================================================
// Supabase Edge Function: dialer-recording
// ============================================================
// Twilio recordingStatusCallback (attached to the <Dial record> in dialer-voice).
// When a call recording finishes, store its RecordingUrl on the call_logs row:
//   - outbound: matched by the client `ref` we pass on the callback URL (?ref=)
//   - inbound : no ref → matched by CallSid (the client stored call.parameters.CallSid)
//
// Public webhook → deploy --no-verify-jwt; authenticated by X-Twilio-Signature.
// Secrets: TWILIO_AUTH_TOKEN, DIALER_RECORDING_URL (the exact base callback URL,
//   i.e. https://<ref>.supabase.co/functions/v1/dialer-recording).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};
const ok = () => new Response("", { status: 204, headers: cors });

async function validSig(url: string, params: URLSearchParams, authToken: string, provided: string): Promise<boolean> {
  if (!provided || !authToken) return false;
  let data = url;
  for (const key of [...params.keys()].sort()) data += key + (params.get(key) ?? "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === provided;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const base = Deno.env.get("DIALER_RECORDING_URL") || "";
    const ref = new URL(req.url).searchParams.get("ref") || "";
    const params = new URLSearchParams(await req.text());

    // Twilio signs the EXACT URL incl. our ?ref= query.
    const signedUrl = ref ? `${base}?ref=${ref}` : base;
    if (!(await validSig(signedUrl, params, authToken, req.headers.get("X-Twilio-Signature") || ""))) return ok();

    const status = params.get("RecordingStatus") || "";
    if (status && status !== "completed") return ok(); // only store the finished recording
    const recordingUrl = params.get("RecordingUrl") || "";
    const callSid = params.get("CallSid") || "";
    const duration = params.get("RecordingDuration") || "";
    if (!recordingUrl) return ok();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const patch: Record<string, any> = { recording_url: recordingUrl, updated_at: new Date().toISOString() };
    // Backfill duration if the status callback didn't already set it.
    const d = duration ? parseInt(duration, 10) : NaN;
    if (!Number.isNaN(d) && d > 0) patch.duration_seconds = d;

    const q = admin.from("call_logs").update(patch);
    const { error } = ref ? await q.eq("client_ref", ref) : await q.eq("twilio_call_sid", callSid);
    if (error) console.warn("call_logs recording update failed:", error.message);

    return ok();
  } catch (e: any) {
    console.error("dialer-recording error:", e);
    return ok(); // never make Twilio retry-storm
  }
});
