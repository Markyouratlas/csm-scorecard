// ============================================================
// Supabase Edge Function: dialer-status
// ============================================================
// Twilio call status callback for the dialed (prospect) leg. Updates the matching
// call_logs row (found by the client_ref we pass on the statusCallback URL, or by
// CallSid) with the authoritative status + duration. The rep's disposition/notes
// are written separately by the client; this just enriches the outcome.
//
// Public webhook → deploy --no-verify-jwt; validate X-Twilio-Signature.
// Secrets: TWILIO_AUTH_TOKEN, DIALER_STATUS_URL (the base statusCallback URL,
//   i.e. https://<ref>.supabase.co/functions/v1/dialer-status).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};
const ok = () => new Response("", { status: 204, headers: cors });

// Map Twilio CallStatus → our call_logs.status vocabulary.
function mapStatus(s: string): string {
  switch (s) {
    case "completed": return "completed";
    case "no-answer": return "no-answer";
    case "busy": return "busy";
    case "failed": return "failed";
    case "canceled": return "canceled";
    case "in-progress": case "answered": return "in-progress";
    default: return s || "initiated";
  }
}

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
    const base = Deno.env.get("DIALER_STATUS_URL") || "";
    const ref = new URL(req.url).searchParams.get("ref") || "";
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);

    // Twilio signs the exact URL incl. our ?ref= query. Reconstruct it from the base.
    const signedUrl = ref ? `${base}?ref=${ref}` : base;
    const provided = req.headers.get("X-Twilio-Signature") || "";
    if (!(await validSig(signedUrl, params, authToken, provided))) return ok(); // ignore unverified

    const callSid = params.get("CallSid") || "";
    const status = mapStatus(params.get("CallStatus") || "");
    const durationStr = params.get("CallDuration") || params.get("DialCallDuration") || "";
    const duration = durationStr ? parseInt(durationStr, 10) : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (duration != null && !Number.isNaN(duration)) patch.duration_seconds = duration;
    if (callSid) patch.twilio_call_sid = callSid;
    if (["completed", "no-answer", "busy", "failed", "canceled"].includes(status)) patch.ended_at = new Date().toISOString();

    // Prefer the client_ref (present from call start); fall back to CallSid.
    const q = admin.from("call_logs").update(patch);
    const { error } = ref ? await q.eq("client_ref", ref) : await q.eq("twilio_call_sid", callSid);
    if (error) console.warn("call_logs status update failed:", error.message);

    return ok();
  } catch (e: any) {
    console.error("dialer-status error:", e);
    return ok(); // never make Twilio retry-storm
  }
});
