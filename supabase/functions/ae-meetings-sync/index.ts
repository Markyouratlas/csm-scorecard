// ============================================================
// Supabase Edge Function: ae-meetings-sync
// ============================================================
// Auto-imports every AE's CURRENT-WEEK calendar meetings into ae_deals, so the
// meeting tracker fills itself without anyone clicking "Sync meetings". Mirrors
// the client importCalMeetings: match cal_bookings.host_name → the AE's profile
// name, insert any not already present (status 'Scheduled'). Idempotent via the
// unique(ae_id, booking_uid) index, so it never duplicates or overwrites the
// AE's outcome edits.
//
// Auth: cron secret (X-Cron-Secret == CRON_SHARED_SECRET) or a service-role
// bearer. Deploy with JWT verification OFF so the cron gateway doesn't block it:
//   supabase functions deploy ae-meetings-sync --no-verify-jwt
//
// Invoke (cron): net.http_post with header X-Cron-Secret.
// Returns: { ok, weekKey, aeCount, bookingsScanned, inserted }
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "America/Toronto";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// UTC instant of 00:00 America/Toronto for a 'YYYY-MM-DD'.
function torontoMidnightUnix(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(base).reduce((a: any, x) => (a[x.type] = x.value, a), {});
  const asTor = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? "0" : p.hour), +p.minute, +p.second);
  return Math.floor((base.getTime() + (base.getTime() - asTor)) / 1000);
}
function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() === 0 ? 6 : dt.getUTCDay() - 1));
  return dt.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: cron secret or service-role bearer.
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = isServiceRole || (!!cronSecret && (req.headers.get("X-Cron-Secret") || "") === cronSecret);
    if (!isCron) return json({ error: "Unauthorized" }, 401);

    // Current week window (Mon 00:00 → next Mon 00:00, Toronto), optional body override.
    let weekKey = mondayOf(torontoToday());
    try {
      const body = await req.json();
      if (body?.weekKey && /^\d{4}-\d{2}-\d{2}$/.test(body.weekKey)) weekKey = mondayOf(body.weekKey);
    } catch { /* default */ }
    const startMs = torontoMidnightUnix(weekKey) * 1000;
    const sinceISO = new Date(startMs).toISOString();
    const untilISO = new Date(startMs + 7 * 86400000).toISOString();

    // AE name → id map (host_name on the booking matches the AE's profile name).
    const { data: aes } = await admin
      .from("profiles").select("id, name")
      .eq("role_type", "account_executive").is("archived_at", null);
    const aeByName = new Map<string, string>();
    for (const a of aes || []) if (a.name) aeByName.set(a.name.trim().toLowerCase(), a.id);
    if (aeByName.size === 0) return json({ ok: true, weekKey, aeCount: 0, bookingsScanned: 0, inserted: 0 });

    // This week's meetings (by scheduled start), non-cancelled.
    const { data: bookings, error: bErr } = await admin
      .from("cal_bookings")
      .select("uid, host_name, attendee_name, attendee_email, start_time, event_type_slug, status")
      .gte("start_time", sinceISO)
      .lt("start_time", untilISO)
      .neq("status", "cancelled")
      .limit(5000);
    if (bErr) return json({ error: bErr.message }, 500);

    // Build candidate rows for bookings hosted by a known AE.
    const rows: any[] = [];
    for (const b of bookings || []) {
      const aeId = b.host_name ? aeByName.get(b.host_name.trim().toLowerCase()) : null;
      if (!aeId || !b.uid) continue;
      rows.push({
        ae_id: aeId,
        source: "cal",
        booking_uid: b.uid,
        customer_name: b.attendee_name || null,
        customer_email: b.attendee_email || null,
        meeting_at: b.start_time || null,
        event_type: b.event_type_slug || null,
        status: "Scheduled",
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      // ignoreDuplicates: existing (ae_id, booking_uid) rows are left untouched,
      // so AE status/MRR/cash edits are never clobbered.
      const { data, error: insErr } = await admin
        .from("ae_deals")
        .upsert(rows, { onConflict: "ae_id,booking_uid", ignoreDuplicates: true })
        .select("id");
      if (insErr) return json({ error: insErr.message }, 500);
      inserted = data?.length ?? 0;
    }

    return json({ ok: true, weekKey, aeCount: aeByName.size, bookingsScanned: (bookings || []).length, inserted });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
