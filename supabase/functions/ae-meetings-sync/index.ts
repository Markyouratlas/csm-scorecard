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
// THEN recomputes the AE Daily Funnel from the meetings (the single source of
// truth): demosBooked/demosCompleted/trialSignups are derived from each AE's
// ae_deals and written into weekly_scorecards.data.daily, so every downstream
// Odyssey/investor metric (all read weekly_scorecards) reflects real calendar
// outcomes. This cron fires at :45; daily-update-autofill runs at 13:00 UTC — so
// the 12:45 run lands the funnel before the daily investor post reads it.
//
// Invoke (cron): net.http_post with header X-Cron-Secret.
// Body: { weekKey?: 'YYYY-MM-DD', backfill?: true }. backfill recomputes the
//   funnel for EVERY AE-week that has meetings (one-time history pass).
// Returns: { ok, weekKey, backfill, aeCount, bookingsScanned, inserted, funnelWeeksWritten }
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
// Toronto calendar date ('YYYY-MM-DD') of an instant, and its JS getDay (0=Sun..6=Sat).
function torontoYMD(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayIdxOfYMD(ymd: string): number {
  const [y, m, dd] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

// Mirrors src/aeFunnel.js: Booked = any status except 'Rescheduled'; Completed =
// attended (incl. 'Unqualified' — they showed); demosUnqualified = 'Unqualified'
// (excluded from the close-rate denominator); Closes = 'Closed Won'. Keep in sync.
const ATTENDED = new Set(["Showed", "Unqualified", "Proposal sent", "Follow-up", "Closed Won", "Closed Lost"]);

// Pure: compute one (AE, week) funnel from its meetings and merge into the
// existing weekly_scorecards.data, returning the row to upsert — or null when
// there's nothing to write (no existing row + all-zero, or already identical).
// Only the funnel fields are touched; other daily fields, deals, notes, and
// submitted_at are preserved. The orchestrator batches the actual I/O.
function funnelUpsertRow(aeId: string, weekKey: string, rows: any[], existingData: any, nowISO: string): any | null {
  const daily = Array.from({ length: 7 }, () => ({ demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0 }));
  for (const d of rows) {
    if (!d.meeting_at) continue;
    const idx = dayIdxOfYMD(torontoYMD(new Date(d.meeting_at)));
    if (d.status !== "Rescheduled") daily[idx].demosBooked += 1;
    if (ATTENDED.has(d.status)) daily[idx].demosCompleted += 1;
    if (d.status === "Unqualified") daily[idx].demosUnqualified += 1;
    if (d.status === "Closed Won") daily[idx].trialSignups += 1;
  }
  const allZero = daily.every((x) => !x.demosBooked && !x.demosCompleted && !x.demosUnqualified && !x.trialSignups);
  const exists = existingData != null;
  if (!exists && allZero) return null; // nothing to record; don't create an empty row

  const base = existingData && typeof existingData === "object" ? existingData : {};
  const baseDaily = Array.isArray(base.daily) ? base.daily : [];

  // Skip if the funnel is already identical (avoids churn on every sync).
  if (exists) {
    let changed = false;
    for (let i = 0; i < 7; i++) {
      const c = baseDaily[i] || {};
      if ((Number(c.demosBooked) || 0) !== daily[i].demosBooked
        || (Number(c.demosCompleted) || 0) !== daily[i].demosCompleted
        || (Number(c.demosUnqualified) || 0) !== daily[i].demosUnqualified
        || (Number(c.trialSignups) || 0) !== daily[i].trialSignups) { changed = true; break; }
    }
    if (!changed) return null;
  }

  const newDaily = Array.from({ length: 7 }, (_, i) => ({
    ...(baseDaily[i] || {}),
    demosBooked: daily[i].demosBooked,
    demosCompleted: daily[i].demosCompleted,
    demosUnqualified: daily[i].demosUnqualified,
    trialSignups: daily[i].trialSignups,
  }));
  const newData = { ...base, daily: newDaily, deals: Array.isArray(base.deals) ? base.deals : [] };
  return { user_id: aeId, week_key: weekKey, data: newData, updated_at: nowISO };
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
    let backfill = false;
    try {
      const body = await req.json();
      if (body?.weekKey && /^\d{4}-\d{2}-\d{2}$/.test(body.weekKey)) weekKey = mondayOf(body.weekKey);
      if (body?.backfill === true) backfill = true;
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

    // ---- Recompute the AE Daily Funnel from meetings → weekly_scorecards ----
    // Default: just this week's funnel for every known AE (so an AE whose meetings
    // all moved away is zeroed, not left stale). Backfill: every AE-week that has
    // meetings. Idempotent; preserves manual daily fields, deals, notes, lock.
    let funnelWeeksWritten = 0;
    {
      let q = admin.from("ae_deals").select("ae_id, meeting_at, status").not("meeting_at", "is", null);
      if (!backfill) q = q.gte("meeting_at", sinceISO).lt("meeting_at", untilISO);
      const { data: allDeals, error: dErr } = await q.limit(50000);
      if (dErr) return json({ error: dErr.message }, 500);

      const groups = new Map<string, { aeId: string; weekKey: string; rows: any[] }>();
      const touch = (aeId: string, wk: string) => {
        const key = aeId + "|" + wk;
        let g = groups.get(key);
        if (!g) { g = { aeId, weekKey: wk, rows: [] }; groups.set(key, g); }
        return g;
      };
      for (const d of allDeals || []) {
        if (!d.ae_id) continue;
        const wk = mondayOf(torontoYMD(new Date(d.meeting_at)));
        if (!backfill && wk !== weekKey) continue; // safety: this week only in default mode
        touch(d.ae_id, wk).rows.push(d);
      }
      // Default mode: ensure every known AE's current week is recomputed even with no meetings.
      if (!backfill) for (const aeId of aeByName.values()) touch(aeId, weekKey);

      // Batch-fetch existing scorecard rows for all groups in one query, build the
      // merged rows in memory, then upsert them in a single round-trip (instead of
      // a SELECT + UPSERT per AE-week).
      const aeIds = [...new Set([...groups.values()].map((g) => g.aeId))];
      const weekKeys = [...new Set([...groups.values()].map((g) => g.weekKey))];
      const existingByKey = new Map<string, any>();
      if (aeIds.length && weekKeys.length) {
        const { data: existingRows, error: exErr } = await admin
          .from("weekly_scorecards").select("user_id, week_key, data")
          .in("user_id", aeIds).in("week_key", weekKeys);
        if (exErr) return json({ error: exErr.message }, 500);
        for (const r of existingRows || []) existingByKey.set(r.user_id + "|" + r.week_key, r.data);
      }

      const nowISO = new Date().toISOString();
      const upserts: any[] = [];
      for (const g of groups.values()) {
        const existingData = existingByKey.has(g.aeId + "|" + g.weekKey) ? existingByKey.get(g.aeId + "|" + g.weekKey) : null;
        const row = funnelUpsertRow(g.aeId, g.weekKey, g.rows, existingData, nowISO);
        if (row) upserts.push(row);
      }
      if (upserts.length) {
        const { error: upErr } = await admin
          .from("weekly_scorecards").upsert(upserts, { onConflict: "user_id,week_key" });
        if (upErr) return json({ error: upErr.message }, 500);
      }
      funnelWeeksWritten = upserts.length;
    }

    return json({ ok: true, weekKey, backfill, aeCount: aeByName.size, bookingsScanned: (bookings || []).length, inserted, funnelWeeksWritten });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
