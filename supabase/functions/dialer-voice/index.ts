// ============================================================
// Supabase Edge Function: dialer-voice
// ============================================================
// The TwiML App's Voice URL. Twilio POSTs here when a rep's browser Device places
// an outbound call (device.connect({ params:{ To } })). We return TwiML telling
// Twilio to <Dial> the target, using the rep's own number as caller ID.
//
// Public endpoint (Twilio has no Supabase JWT) → deploy --no-verify-jwt and
// authenticate by validating X-Twilio-Signature (HMAC-SHA1 over the exact
// configured URL + sorted POST params, signed with the Twilio AUTH TOKEN).
//
// Outbound identity: Twilio sends From="client:<profile.id>" (the token identity).
// We look up that rep's profiles.twilio_number for caller ID; fall back to the
// shared TWILIO_PHONE_NUMBER. (Per-rep numbers land in M1/M3; until the column
// exists the lookup silently falls back.)
//
// Deploy: supabase functions deploy dialer-voice --no-verify-jwt
// Secrets: TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, DIALER_VOICE_URL (the exact
//          public URL configured on the TwiML App, for signature validation).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};
const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/xml" } });
const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Twilio POST signature: base64( HMAC-SHA1( authToken, url + sortedConcat(params) ) ).
// `url` must be EXACTLY the URL configured on Twilio (proxies rewrite req.url), so
// we use DIALER_VOICE_URL when provided.
async function validTwilioSignature(url: string, params: URLSearchParams, authToken: string, provided: string): Promise<boolean> {
  if (!provided) return false;
  let data = url;
  for (const key of [...params.keys()].sort()) data += key + (params.get(key) ?? "");
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === provided;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const sharedNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || "";
  const configuredUrl = Deno.env.get("DIALER_VOICE_URL") || req.url;

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  // ---- Authenticate the webhook ----
  const provided = req.headers.get("X-Twilio-Signature") || "";
  if (!authToken || !(await validTwilioSignature(configuredUrl, params, authToken, provided))) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`, 403);
  }

  const to = (params.get("To") || "").trim();
  const from = params.get("From") || ""; // "client:<profile.id>" for outbound-from-browser
  const ref = (params.get("ref") || "").trim(); // client correlation id → call_logs.client_ref
  if (!to) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number was provided.</Say></Response>`);
  }

  // Caller ID = the rep's own number when we can resolve it, else the shared number.
  let callerId = sharedNumber;
  const identity = from.startsWith("client:") ? from.slice("client:".length) : null;
  if (identity) {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await admin.from("profiles").select("twilio_number").eq("id", identity).maybeSingle();
      if (data?.twilio_number) callerId = data.twilio_number;
    } catch { /* column may not exist yet (pre-M1) — fall back to shared number */ }
  }

  // Status callback on the dialed leg → dialer-status updates the call log with
  // authoritative status + duration. Pass the client ref so it finds the row.
  const statusBase = Deno.env.get("DIALER_STATUS_URL") || "";
  const cbAttrs = statusBase && ref
    ? ` statusCallback="${escapeXml(`${statusBase}?ref=${encodeURIComponent(ref)}`)}"` +
      ` statusCallbackEvent="answered completed" statusCallbackMethod="POST"`
    : "";

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Dial callerId="${escapeXml(callerId)}" answerOnBridge="true">` +
    `<Number${cbAttrs}>${escapeXml(to)}</Number></Dial></Response>`;
  return xml(twiml);
});
