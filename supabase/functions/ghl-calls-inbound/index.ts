// ============================================================
// Supabase Edge Function: ghl-calls-inbound
// ============================================================
// Receives each GHL dial from a GoHighLevel Workflow → Custom Webhook and records
// it in ghl_call_events, mapping the dialing GHL user's email to the rep's profile
// (via their login email). The scorecard combines these with the in-app dialer's
// call_logs for a total dial count per rep.
//
// GHL doesn't sign these — protect the URL with a token: ?token=<GHL_CALLS_TOKEN>.
// The GHL admin maps whichever call tokens exist to this JSON body (flexible keys):
//   { userEmail, calledAt?, direction?, contactId?, messageId? }
//
// Deploy --no-verify-jwt. Secrets: GHL_CALLS_TOKEN.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = Deno.env.get("GHL_CALLS_TOKEN") || "";
    const provided = new URL(req.url).searchParams.get("token") || "";
    if (!token || provided !== token) return json({ error: "forbidden" }, 403);

    const b = await req.json().catch(() => ({}));
    // Flexible field names — the GHL workflow maps tokens to these keys.
    const userEmail = String(b.userEmail || b.user_email || b.email || b.user?.email || "").trim().toLowerCase();
    const ghlUserId = String(b.ghlUserId || b.ghl_user_id || "").trim() || null;
    const ghlUserName = String(b.ghlUserName || b.ghl_user_name || "").trim() || null;
    const calledAtRaw = b.calledAt || b.timestamp || b.dateAdded || b.date || null;
    const calledAt = calledAtRaw ? new Date(calledAtRaw).toISOString() : new Date().toISOString();
    const direction = String(b.direction || "outbound").toLowerCase().includes("in") ? "inbound" : "outbound";
    const contactId = b.contactId || b.contact_id || b.contact?.id || null;
    const callStatus = b.callStatus || b.call_status || null;
    const messageId = b.messageId || b.callId || b.message_id || null;

    if (!userEmail && !ghlUserId) return json({ ok: true, skipped: "no user identity" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Attribution: rep by login email ({{user.email}}), else fall back to a
    // profiles.ghl_user_id mapping matched on Phone Call User Id.
    let repId: string | null = null, matchedBy: string | null = null;
    if (userEmail) {
      try {
        const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const u = (data?.users || []).find((x) => (x.email || "").toLowerCase() === userEmail);
        if (u?.id) { repId = u.id; matchedBy = "email"; }
      } catch (e) { console.warn("listUsers failed", String(e)); }
    }
    if (!repId && ghlUserId) {
      const { data: p } = await admin.from("profiles").select("id").eq("ghl_user_id", ghlUserId).maybeSingle();
      if (p?.id) { repId = p.id; matchedBy = "ghl_user_id"; }
    }
    // Last resort: match the dialing GHL user's NAME to a profile name (GHL users
    // are the same people as scorecard profiles). Precedence: email > id > name.
    if (!repId && ghlUserName) {
      const { data: ps } = await admin.from("profiles").select("id").ilike("name", ghlUserName).limit(2);
      if (ps && ps.length === 1) { repId = ps[0].id; matchedBy = "name"; }
    }

    // Dedupe key: Message Id if present, else composite of dialer+contact+time.
    const naturalKey = messageId || `${ghlUserId || userEmail}|${contactId || ""}|${calledAt}`;

    const { error } = await admin.from("ghl_call_events").upsert({
      rep_id: repId, ghl_user_email: userEmail || null, ghl_user_id: ghlUserId, ghl_user_name: ghlUserName,
      contact_id: contactId, direction, call_status: callStatus, called_at: calledAt,
      ghl_message_id: messageId, natural_key: naturalKey,
    }, { onConflict: "natural_key", ignoreDuplicates: true });
    if (error) { console.warn("ghl_call_events insert:", error.message); return json({ ok: false, error: error.message }); }

    return json({ ok: true, repMatched: !!repId, matchedBy, direction });
  } catch (e: any) {
    console.error("ghl-calls-inbound error:", e);
    return json({ ok: false, error: e?.message || String(e) });
  }
});
