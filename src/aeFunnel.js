import { getWeekKey } from './dateUtils'
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
//    demosBooked    = meetings that day in any status EXCEPT 'Rescheduled'
//    demosCompleted = meetings the prospect attended (AE_ATTENDED_STATUSES)
//    trialSignups   = meetings marked 'Closed Won'   (the "Closes" column)
//
//  A meeting lands on a (week, dayIdx) by its meeting_at in LOCAL time:
//  weekKey = getWeekKey(date), dayIdx = date.getDay() (0=Sun..6=Sat) — matching
//  how MeetingsTable groups and how weekly_scorecards.data.daily is indexed.
//  The edge function (ae-meetings-sync) re-implements this same rule in Deno
//  using America/Toronto, since it can't import app code.
// =============================================================================

// Returns a 7-element array indexed by getDay(): [{ demosBooked, demosCompleted, trialSignups }, …]
export function deriveFunnelWeek(deals, weekKey) {
  const out = Array.from({ length: 7 }, () => ({ demosBooked: 0, demosCompleted: 0, trialSignups: 0 }))
  for (const d of deals || []) {
    if (!d.meeting_at) continue
    const dt = new Date(d.meeting_at)
    if (getWeekKey(dt) !== weekKey) continue
    const idx = dt.getDay()
    if (d.status !== 'Rescheduled') out[idx].demosBooked += 1
    if (AE_ATTENDED_STATUSES.includes(d.status)) out[idx].demosCompleted += 1
    if (d.status === 'Closed Won') out[idx].trialSignups += 1
  }
  return out
}

// True when an existing daily array already matches the derived funnel for the 3
// AE funnel fields — used to avoid redundant writes / autosave churn.
export function funnelMatches(daily, derived) {
  for (let i = 0; i < 7; i++) {
    const c = (daily && daily[i]) || {}
    const x = derived[i]
    if ((Number(c.demosBooked) || 0) !== x.demosBooked) return false
    if ((Number(c.demosCompleted) || 0) !== x.demosCompleted) return false
    if ((Number(c.trialSignups) || 0) !== x.trialSignups) return false
  }
  return true
}
