import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { weekKeyOfMeeting, dayIdxOfMeeting, mondayOfYMD, dayIdxOfYMD } from '../aeFunnel.js'
import { AE_ATTENDED_STATUSES } from '../roleConstants.js'
import { stepWeek } from '../dateUtils.js'

// =============================================================================
//  useAtlasBlueFunnel
//
//  Powers Nick's "Atlas Blue" funnel tab in GrowthView. Everything except the
//  two manual top-of-funnel inputs (Visitors, Test Drives — typed by Nick and
//  read straight from weekData in GrowthView) is derived here:
//
//  • Booked / Completed / New Customers / Cash / Deal Value — from ad-driven
//    ae_deals via the SECURITY DEFINER rpc `atlas_blue_deals`
//    (src/13-atlas-blue-funnel.sql); the Growth Manager can't read ae_deals
//    directly. Status math mirrors the AE Daily Funnel EXACTLY (same rules +
//    Toronto week/day bucketing from aeFunnel.js) so the two can't disagree:
//      booked      = status not in (Rescheduled, Deleted)  [Deleted excluded by the rpc]
//      completed   = status in AE_ATTENDED_STATUSES         (includes Unqualified — they showed)
//      unqualified = status === 'Unqualified'               (backed out of the close denominator)
//      newCustomers= status === 'Closed Won'
//      cash        = Σ one_time of Closed Won              (Stripe-matched actual cash)
//      dealValue   = Σ mrr of Closed Won                   (Stripe-matched contracted MRR)
//
//  • Ad Spend — auto-pulled from Meta (`meta_ads_daily.spend`, daily rows summed
//    per day/week). NOTE: this is total Meta spend across all campaigns; it equals
//    "Atlas Blue" spend only if every Meta campaign is Atlas Blue. Add a
//    campaign_name filter here if non-Blue campaigns ever run. meta_ads_daily only
//    covers ~90 days, so weeks older than that show $0 spend.
//
//  Args:
//    userId  — the Growth Manager's profile id (kept for RLS/query-key symmetry)
//    weekKey — the week currently being viewed (Monday YYYY-MM-DD)
//    weeks   — how many trailing weeks the Weekly Overview chart should cover
//
//  Returns:
//    viewedWeekDays — 7-element array (getDay 0=Sun..6=Sat) of auto metrics for weekKey,
//                     incl. per-day adSpend
//    weeklyTrend    — [{ weekKey, adSpend, cashCollected, bookedCalls, completed,
//                        newCustomers, dealValue, roas }] oldest→newest, length `weeks`
// =============================================================================

const blankDay = () => ({
  adSpend: 0, demosBooked: 0, demosCompleted: 0, demosUnqualified: 0,
  newCustomers: 0, cashCollected: 0, dealValue: 0,
})

export function useAtlasBlueFunnel(userId, weekKey, weeks = 8) {
  const chartStart = stepWeek(weekKey, -(weeks - 1)) // oldest week in the chart window

  const { data, isPending, error } = useQuery({
    queryKey: ['atlas-blue-funnel', userId, weekKey, weeks],
    enabled: !!userId && !!weekKey,
    queryFn: async () => {
      // Fetch a hair before the oldest Monday so Toronto-vs-UTC edges never drop
      // a Sunday-night meeting; we re-bucket precisely on the client anyway.
      const since = new Date(`${chartStart}T00:00:00Z`)
      since.setUTCDate(since.getUTCDate() - 2)

      const [{ data: deals, error: dErr }, { data: metaRows, error: mErr }] = await Promise.all([
        supabase.rpc('atlas_blue_deals', { p_since: since.toISOString() }),
        supabase
          .from('meta_ads_daily')
          .select('date_start, spend')
          .gte('date_start', chartStart),
      ])
      if (dErr) throw dErr
      // Meta spend is a nice-to-have; if that table read fails, keep the funnel
      // working with $0 spend rather than blanking the whole tab.
      if (mErr) console.warn('atlas blue funnel — meta_ads_daily read failed:', mErr.message)
      return { deals: deals || [], metaRows: mErr ? [] : (metaRows || []) }
    },
  })

  const deals = data?.deals || []
  const metaRows = data?.metaRows || []

  // ----- Viewed week: per-day auto metrics for the two tables -----
  const viewedWeekDays = Array.from({ length: 7 }, blankDay)
  for (const d of deals) {
    if (weekKeyOfMeeting(d.meeting_at) !== weekKey) continue
    const idx = dayIdxOfMeeting(d.meeting_at)
    if (idx == null) continue
    const cell = viewedWeekDays[idx]
    // Deleted is already excluded by the rpc; Rescheduled still needs backing out
    // of the booked count.
    if (d.status !== 'Rescheduled') cell.demosBooked += 1
    if (AE_ATTENDED_STATUSES.includes(d.status)) cell.demosCompleted += 1
    if (d.status === 'Unqualified') cell.demosUnqualified += 1
    if (d.status === 'Closed Won') {
      cell.newCustomers += 1
      cell.cashCollected += Number(d.one_time) || 0
      cell.dealValue += Number(d.mrr) || 0
    }
  }
  // Meta ad spend for the viewed week, placed on the matching weekday.
  for (const r of metaRows) {
    if (!r.date_start || mondayOfYMD(r.date_start) !== weekKey) continue
    viewedWeekDays[dayIdxOfYMD(r.date_start)].adSpend += Number(r.spend) || 0
  }

  // ----- Weekly trend: one row per week in the chart window -----
  const adSpendByWeek = {}
  for (const r of metaRows) {
    if (!r.date_start) continue
    const wk = mondayOfYMD(r.date_start)
    adSpendByWeek[wk] = (adSpendByWeek[wk] || 0) + (Number(r.spend) || 0)
  }
  const dealAggByWeek = {}
  for (const d of deals) {
    const wk = weekKeyOfMeeting(d.meeting_at)
    if (!wk) continue
    const agg = (dealAggByWeek[wk] ||= { bookedCalls: 0, completed: 0, newCustomers: 0, cashCollected: 0, dealValue: 0 })
    if (d.status !== 'Rescheduled') agg.bookedCalls += 1
    if (AE_ATTENDED_STATUSES.includes(d.status)) agg.completed += 1
    if (d.status === 'Closed Won') {
      agg.newCustomers += 1
      agg.cashCollected += Number(d.one_time) || 0
      agg.dealValue += Number(d.mrr) || 0
    }
  }

  const weeklyTrend = []
  for (let i = 0; i < weeks; i++) {
    const wk = stepWeek(chartStart, i)
    const adSpend = adSpendByWeek[wk] || 0
    const agg = dealAggByWeek[wk] || { bookedCalls: 0, completed: 0, newCustomers: 0, cashCollected: 0, dealValue: 0 }
    weeklyTrend.push({
      weekKey: wk,
      adSpend,
      cashCollected: agg.cashCollected,
      bookedCalls: agg.bookedCalls,
      completed: agg.completed,
      newCustomers: agg.newCustomers,
      dealValue: agg.dealValue,
      roas: adSpend > 0 ? agg.cashCollected / adSpend : null,
    })
  }

  // Raw deals for the viewed week (with dayIdx), so the drill-down modal can
  // list the actual customers/prospects behind any bottom-funnel number.
  const viewedWeekDeals = deals
    .filter(d => weekKeyOfMeeting(d.meeting_at) === weekKey)
    .map(d => ({ ...d, dayIdx: dayIdxOfMeeting(d.meeting_at) }))

  return {
    viewedWeekDays,
    viewedWeekDeals,
    weeklyTrend,
    loading: isPending,
    error: error ?? null,
  }
}
