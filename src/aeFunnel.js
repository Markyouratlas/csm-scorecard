import { AE_ATTENDED_STATUSES } from './roleConstants'

// =============================================================================
//  AE funnel — derived from the Meetings tracker (ae_deals)
//
//  The AE "Daily funnel" (Demos Booked / Demos Completed / Closes) is no longer
//  hand-typed — it is computed from the per-meeting outcomes in ae_deals, which
//  makes the Meetings table the single source of truth and lets the funnel + all
//  downstream Odyssey/investor numbers update the moment a status changes.
//
//  Mapping (see CLAUDE.md / plan):
//    demosBooked      = meetings that day in any status EXCEPT 'Rescheduled' /
//                       'Deleted' ('Deleted' is a soft-delete, backed out of all metrics)
//    demosCompleted   = meetings the prospect attended (AE_ATTENDED_STATUSES,
//                       which includes 'Unqualified' — they showed up)
//    demosUnqualified = meetings marked 'Unqualified' (subset of completed) — used
//                       to exclude non-fits from the close-rate denominator
//    trialSignups     = meetings marked 'Closed Won'   (the "Closes" column)
//
//  A meeting lands on a (week, dayIdx) by its meeting_at in **America/Toronto** —
//  identical to the edge function (ae-meetings-sync), so the client and the
//  nightly server recompute always bucket a meeting into the same day/week
//  regardless of the viewer's browser timezone. dayIdx is JS getDay (0=Sun..6=Sat),
//  matching how weekly_scorecards.data.daily is indexed.
// =============================================================================

const TZ = 'America/Toronto'

// Toronto calendar date ('YYYY-MM-DD') of an instant.
function torontoYMD(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
// Monday (YYYY-MM-DD) of the week containing a 'YYYY-MM-DD'.
function mondayOfYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() === 0 ? 6 : dt.getUTCDay() - 1))
  return dt.toISOString().slice(0, 10)
}
// JS getDay (0=Sun..6=Sat) of a 'YYYY-MM-DD'.
function dayIdxOfYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Monday (YYYY-MM-DD) of the week a meeting falls in, in Toronto — so the
// Meetings list and the derived funnel group meetings identically.
export function weekKeyOfMeeting(meetingAt) {
  if (!meetingAt) return null
  return mondayOfYMD(torontoYMD(new Date(meetingAt)))
}

// Returns a 7-element array indexed by getDay():
//   [{ demosBooked, demosCompleted, demosUnqualified, trialSignups }, …]
export function deriveFunnelWeek(deals, weekKey) {
  const out = Array.from({ length: 7 }, () => ({ demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0 }))
  for (const d of deals || []) {
    if (!d.meeting_at) continue
    const ymd = torontoYMD(new Date(d.meeting_at))
    if (mondayOfYMD(ymd) !== weekKey) continue
    const idx = dayIdxOfYMD(ymd)
    if (d.status !== 'Rescheduled' && d.status !== 'Deleted') out[idx].demosBooked += 1
    if (AE_ATTENDED_STATUSES.includes(d.status)) out[idx].demosCompleted += 1
    if (d.status === 'Unqualified') out[idx].demosUnqualified += 1
    if (d.status === 'Closed Won') out[idx].trialSignups += 1
  }
  return out
}

// Closeable demos held = the close-rate denominator: demos completed minus the
// unqualified (showed-but-not-a-fit) ones. Single source of truth so the AE
// scorecard, Odyssey, and the tooltips that explain them can never disagree.
export function closeableHeld(demosCompleted, demosUnqualified) {
  return (Number(demosCompleted) || 0) - (Number(demosUnqualified) || 0)
}

// True when an existing daily array already matches the derived funnel for the
// AE funnel fields — used to avoid redundant writes / autosave churn.
export function funnelMatches(daily, derived) {
  for (let i = 0; i < 7; i++) {
    const c = (daily && daily[i]) || {}
    const x = derived[i]
    if ((Number(c.demosBooked) || 0) !== x.demosBooked) return false
    if ((Number(c.demosCompleted) || 0) !== x.demosCompleted) return false
    if ((Number(c.demosUnqualified) || 0) !== x.demosUnqualified) return false
    if ((Number(c.trialSignups) || 0) !== x.trialSignups) return false
  }
  return true
}
