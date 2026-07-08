// ============================================================
// Supabase Edge Function: dialer-recording-media
// ============================================================
// Authenticated proxy for a call recording. The browser can't put a Supabase JWT
// on an <audio src>, and Twilio recordings need account credentials to fetch — so
// the client calls this with its session token, we re-check access via RLS (read
// the call_logs row with the CALLER's client → rep sees own, managers/execs all),
// then stream the Twilio media back. Nothing is ever public.
//
// Invoke: supabase.functions.invoke('dialer-recording-media', { body: { logId } })
// Deploy: supabase functions deploy dialer-recording-media   (JWT verify ON)
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { logId } = await req.json().catch(() => ({}));
    if (!logId) return json({ error: "logId is required" }, 400);

    // RLS decides visibility: this read only succeeds if the caller may see the row.
    const { data: row, error } = await userClient
      .from("call_logs").select("recording_url").eq("id", logId).maybeSingle();
    if (error) return json({ error: error.message }, 403);
    if (!row) return json({ error: "Not found" }, 404);
    if (!row.recording_url) return json({ error: "No recording for this call" }, 404);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    // Append .mp3 to get the media file; the RecordingUrl itself is the API resource.
    const mediaUrl = row.recording_url.endsWith(".mp3") ? row.recording_url : `${row.recording_url}.mp3`;
    const tw = await fetch(mediaUrl, { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } });
    if (!tw.ok || !tw.body) return json({ error: `Twilio media ${tw.status}` }, 502);

    // Use octet-stream (not audio/mpeg) so supabase.functions.invoke returns a real
    // Blob on the client — it parses audio/* as text, which corrupts the MP3.
    return new Response(tw.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e: any) {
    console.error("dialer-recording-media error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
