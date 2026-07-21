import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { mondayOfYMD, dayIdxOfYMD, weekKeyOfMeeting, dayIdxOfMeeting } from '../aeFunnel.js'
import { stepWeek } from '../dateUtils.js'

// =============================================================================
//  useAtlasBlueWebinar
//
//  Powers Nick's "Atlas Blue Webinar" funnel tab — the "Atlas Blue - Workshop"
//  Meta campaign (a separate campaign from the Atlas Blue iMessage funnel). Only
//  Ad Spend + Visitors are available from Meta today; the later funnel stages
//  (registrations / attendees / booked calls) have no source yet, so they aren't
//  rendered. Everything here is derived from `meta_ads_daily`, filtered to the one
//  workshop campaign_id (by id, not name, so a rename can't break it).
//
//    adSpend  = meta_ads_daily.spend
//    visitors = the 'landing_page_view' action out of the raw `actions` jsonb
//    cost/visitor (derived in the view) = adSpend / visitors
//
//  Workshop opt-ins (the registration stage) are now LIVE — pulled from
//  `webinar_signups` (GHL native opt-in form, see ghl-webinar-signups-sync) and
//  bucketed by submitted_at into the same week/day grid so they line up with the
//  Meta spend/visitors. cost/opt-in (derived in the view) = adSpend / signups.
//
//  Returns:
//    viewedWeekDays — 7-element array (getDay 0=Sun..6=Sat) of { adSpend, visitors, signups }
//    weeklyTrend    — [{ weekKey, adSpend, visitors, signups }] oldest→newest, length `weeks`
//    recentSignups  — [{ name, email, phone, revenueBand, source, submittedAt }] newest→oldest
//    revenueBreakdown — [{ band, count }] desc, over the loaded window
//    totalSignups   — count of opt-ins in the loaded window
// =============================================================================

const WEBINAR_CAMPAIGN_ID = '120246016759050144' // "Atlas Blue - Workshop"

const metaAction = (actions, type) => {
  if (!Array.isArray(actions)) return 0
  let n = 0
  for (const a of actions) if (a?.action_type === type) n += Number(a.value) || 0
  return n
}

export function useAtlasBlueWebinar(weekKey, weeks = 8) {
  const chartStart = stepWeek(weekKey, -(weeks - 1)) // oldest week in the chart window

  const { data, isPending, error } = useQuery({
    queryKey: ['atlas-blue-webinar', weekKey, weeks],
    enabled: !!weekKey,
    queryFn: async () => {
      const [metaRes, signupRes] = await Promise.all([
        supabase
          .from('meta_ads_daily')
          .select('date_start, spend, actions')
          .eq('campaign_id', WEBINAR_CAMPAIGN_ID)
          .gte('date_start', chartStart),
        supabase
          .from('webinar_signups')
          .select('full_name, email, phone, revenue_band, source, submitted_at')
          .gte('submitted_at', chartStart)
          .order('submitted_at', { ascending: false }),
      ])
      if (metaRes.error) console.warn('atlas blue webinar — meta_ads_daily read failed:', metaRes.error.message)
      if (signupRes.error) console.warn('atlas blue webinar — webinar_signups read failed:', signupRes.error.message)
      return { metaRows: metaRes.data || [], signups: signupRes.data || [] }
    },
  })

  const metaRows = data?.metaRows || []
  const signups = data?.signups || []

  // ----- Viewed week: per-day Ad Spend + Visitors + Opt-ins -----
  const viewedWeekDays = Array.from({ length: 7 }, () => ({ adSpend: 0, visitors: 0, signups: 0 }))
  for (const r of metaRows) {
    if (!r.date_start || mondayOfYMD(r.date_start) !== weekKey) continue
    const cell = viewedWeekDays[dayIdxOfYMD(r.date_start)]
    cell.adSpend += Number(r.spend) || 0
    cell.visitors += metaAction(r.actions, 'landing_page_view')
  }
  for (const s of signups) {
    if (!s.submitted_at || weekKeyOfMeeting(s.submitted_at) !== weekKey) continue
    viewedWeekDays[dayIdxOfMeeting(s.submitted_at)].signups += 1
  }

  // ----- Weekly trend: one row per week in the chart window -----
  const byWeek = {}
  const wk0 = (wk) => (byWeek[wk] ||= { adSpend: 0, visitors: 0, signups: 0 })
  for (const r of metaRows) {
    if (!r.date_start) continue
    const agg = wk0(mondayOfYMD(r.date_start))
    agg.adSpend += Number(r.spend) || 0
    agg.visitors += metaAction(r.actions, 'landing_page_view')
  }
  for (const s of signups) {
    if (!s.submitted_at) continue
    wk0(weekKeyOfMeeting(s.submitted_at)).signups += 1
  }
  const weeklyTrend = []
  for (let i = 0; i < weeks; i++) {
    const wk = stepWeek(chartStart, i)
    const agg = byWeek[wk] || { adSpend: 0, visitors: 0, signups: 0 }
    weeklyTrend.push({ weekKey: wk, adSpend: agg.adSpend, visitors: agg.visitors, signups: agg.signups })
  }

  // ----- Recent opt-ins + revenue-band breakdown (over the loaded window) -----
  const recentSignups = signups.map(s => ({
    name: s.full_name || '', email: s.email || '', phone: s.phone || '',
    revenueBand: s.revenue_band || '', source: s.source || '', submittedAt: s.submitted_at,
  }))
  const bandCounts = {}
  for (const s of signups) { const b = s.revenue_band || 'Unknown'; bandCounts[b] = (bandCounts[b] || 0) + 1 }
  const revenueBreakdown = Object.entries(bandCounts)
    .map(([band, count]) => ({ band, count }))
    .sort((a, b) => b.count - a.count)

  return {
    viewedWeekDays, weeklyTrend, recentSignups, revenueBreakdown,
    totalSignups: signups.length, loading: isPending, error: error ?? null,
  }
}
