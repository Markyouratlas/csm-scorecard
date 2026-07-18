// ============================================================
// Supabase Edge Function: dialer-token
// ============================================================
// Mints a short-lived Twilio Voice AccessToken for a SIGNED-IN rep (AE/CSM), so
// the browser @twilio/voice-sdk Device can place/receive calls without ever
// seeing Twilio secrets. Identity = the rep's profile.id (multi-tenant).
//
// The Twilio AccessToken is an HS256 JWT with a very specific shape — the Node
// SDK can't run in Deno, so we hand-build it with `jose`:
//   header : { typ:'JWT', alg:'HS256', cty:'twilio-fpa;v=1' }   ← cty REQUIRED
//   claims : { jti, iss=apiKey(SK…), sub=accountSid(AC…), iat, exp,
//              grants: { identity, voice: { outgoing:{application_sid}, incoming:{allow} } } }
// Signed with the API SECRET.
//
// Invoke (browser, authenticated):
//   const { data } = await supabase.functions.invoke('dialer-token')
//   // data = { identity, token }
//   const device = new Device(data.token)
//
// Deploy: supabase functions deploy dialer-token   (JWT verify ON — real user)
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Roles allowed to use the dialer.
const DIALER_ROLES = new Set(["account_executive", "csm", "executive", "forward_deployed_engineer", "forward_deployed_engineer_lead", "channel_sales"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // ---- Auth: require a signed-in rep ----
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await userClient
      .from("profiles").select("id, role, role_type").eq("id", user.id).single();
    const allowed = prof && (DIALER_ROLES.has(prof.role_type) || prof.role === "executive");
    if (!allowed) return json({ error: "Forbidden — dialer access required" }, 403);

    // ---- Twilio config ----
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const apiKey = Deno.env.get("TWILIO_API_KEY") || "";
    const apiSecret = Deno.env.get("TWILIO_API_SECRET") || "";
    const twimlAppSid = Deno.env.get("TWILIO_TWIML_APP_SID") || "";
    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      return json({ error: "Twilio secrets not configured" }, 500);
    }

    const identity = prof.id;
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = 3600;

    // Twilio-exact JWT. jti must be unique; Twilio uses `${apiKey}-${timestamp}`.
    const token = await new SignJWT({
      jti: `${apiKey}-${nowSec}`,
      grants: {
        identity,
        voice: {
          outgoing: { application_sid: twimlAppSid },
          incoming: { allow: true },
        },
      },
    })
      .setProtectedHeader({ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" })
      .setIssuer(apiKey)        // iss = SK…
      .setSubject(accountSid)   // sub = AC…
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + ttl)
      .sign(new TextEncoder().encode(apiSecret));

    return json({ identity, token, ttl });
  } catch (e: any) {
    console.error("dialer-token error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
