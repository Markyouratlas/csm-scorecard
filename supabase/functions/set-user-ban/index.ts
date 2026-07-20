// ============================================================================
//  Supabase Edge Function: set-user-ban
// ============================================================================
//  Ban / unban a user (revoke or restore sign-in) — for people who leave the
//  company. Banning sets banned_until on auth.users (the real enforcement, via
//  the Admin API + service role, which can't be done from the browser). It ALSO
//  archives the profile (hide from the roster) and mirrors the state onto
//  profiles.banned so the UI can show it. Unbanning restores access + unarchives.
//
//  Body: { userId: string, ban: boolean }
//  Auth: signed-in EXECUTIVE only (verified against profiles.role/role_type).
//
//  Deploy: supabase functions deploy set-user-ban   (JWT verify ON — real user)
//  Uses the standard SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ban_duration units are ns/us/ms/s/m/h only — no days/years. ~100 years = permanent.
const BAN_DURATION = "876000h";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // ---- Auth: require a signed-in executive ----
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
    if (!(prof?.role === "executive" || prof?.role_type === "executive")) {
      return json({ error: "Forbidden — executive access required" }, 403);
    }

    const { userId, ban } = await req.json().catch(() => ({}));
    if (!userId) return json({ error: "userId is required" }, 400);
    if (userId === user.id) return json({ error: "You can't revoke your own access." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. The real enforcement — Auth ban / unban.
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: ban ? BAN_DURATION : "none",
    });
    if (banErr) return json({ error: `Auth ban failed: ${banErr.message}` }, 500);

    // 2. Mirror onto profiles for the UI. Banning also archives (hide);
    //    unbanning restores access + unarchives.
    const now = new Date().toISOString();
    const patch = ban
      ? { banned: true, banned_at: now, banned_by: user.id, archived_at: now }
      : { banned: false, banned_at: null, banned_by: null, archived_at: null };
    const { error: upErr } = await admin.from("profiles").update(patch).eq("id", userId);
    if (upErr) return json({ error: `Profile update failed: ${upErr.message}` }, 500);

    return json({ ok: true, banned: !!ban });
  } catch (e: any) {
    console.error("set-user-ban error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
