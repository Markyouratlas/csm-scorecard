import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { mondayOfYMD, dayIdxOfYMD, weekKeyOfMeeting, dayIdxOfMeeting } from '../aeFunnel.js'
import { stepWeek } from '../dateUtils.js'

// =============================================================================
//  useAtlasBlueWebinar
//
//  Powers Nick's "Atlas Blue Webinar" funnel tab — the Atlas Blue workshop
//  Meta campaign(s) (separate from the Atlas Blue iMessage funnel). Ad Spend +
//  Visitors come from Meta; Opt-ins (registration stage) come from webinar_signups.
//  Ad data is derived from `meta_ads_daily`, filtered to the workshop campaign ids
//  in WEBINAR_CAMPAIGN_IDS (the campaign was relaunched under a new id mid-July, so
//  we match a LIST of ids — add any future relaunch id there).
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
//  Campaign filtering: the tab lists each workshop campaign as a checkbox; the
//  caller passes `deselectedIds` (ids the user unchecked) and every Meta figure
//  (viewed week, trend, lifetime totals) is computed over the still-selected
//  campaigns only. Opt-ins come from the single opt-in form and aren't attributable
//  to a specific Meta campaign, so they are NOT filtered by campaign.
//
//  Returns:
//    viewedWeekDays — 7-element array (getDay 0=Sun..6=Sat) of { adSpend, visitors, signups }
//    weeklyTrend    — [{ weekKey, adSpend, visitors, signups }] oldest→newest, length `weeks`
//    campaigns      — [{ id, name, adSpend, visitors, firstDay, lastDay }] (for the checkboxes)
//    lifetime       — { adSpend, visitors, signups } over the FULL campaign history (selected only)
//    recentSignups  — [{ name, email, phone, revenueBand, source, submittedAt }] newest→oldest
//    revenueBreakdown — [{ band, count }] desc, all-time
//    totalSignups   — count of all opt-ins (not campaign-filtered)
// =============================================================================

// The workshop has run under two Meta campaign ids (renamed/relaunched mid-July) —
// same Atlas Blue workshop funnel, so we aggregate both. Add new ids here if it's
// relaunched again.
const WEBINAR_CAMPAIGN_IDS = [
  '120246016759050144', // "Atlas Blue - Workshop"            (~through Jul 15)
  '120246289486080144', // "Stop Hiring, Start Cloning Workshop" (Jul 17+, matches the opt-in form)
]

const metaAction = (actions, type) => {
  if (!Array.isArray(actions)) return 0
  let n = 0
  for (const a of actions) if (a?.action_type === type) n += Number(a.value) || 0
  return n
}

export function useAtlasBlueWebinar(weekKey, weeks = 8, deselectedIds = []) {
  const chartStart = stepWeek(weekKey, -(weeks - 1)) // oldest week in the chart window

  const { data, isPending, error } = useQuery({
    // Fetch the FULL workshop history once (meta_ads_daily is ~90d; campaigns are
    // recent, so this is the whole campaign) — week/selection filtering is done in JS.
    queryKey: ['atlas-blue-webinar'],
    queryFn: async () => {
      const [metaRes, signupRes] = await Promise.all([
        supabase
          .from('meta_ads_daily')
          .select('campaign_id, campaign_name, date_start, spend, actions')
          .in('campaign_id', WEBINAR_CAMPAIGN_IDS),
        supabase
          .from('webinar_signups')
          .select('full_name, email, phone, revenue_band, source, submitted_at')
          .order('submitted_at', { ascending: false }),
      ])
      if (metaRes.error) console.warn('atlas blue webinar — meta_ads_daily read failed:', metaRes.error.message)
      if (signupRes.error) console.warn('atlas blue webinar — webinar_signups read failed:', signupRes.error.message)
      return { metaRows: metaRes.data || [], signups: signupRes.data || [] }
    },
  })

  const allMetaRows = data?.metaRows || []
  const signups = data?.signups || []

  // ----- Per-campaign breakdown (for the checkboxes) over full history -----
  const campMap = {}
  for (const r of allMetaRows) {
    const c = (campMap[r.campaign_id] ||= { id: r.campaign_id, name: r.campaign_name || r.campaign_id, adSpend: 0, visitors: 0, firstDay: null, lastDay: null })
    c.name = r.campaign_name || c.name
    c.adSpend += Number(r.spend) || 0
    c.visitors += metaAction(r.actions, 'landing_page_view')
    if (r.date_start && (!c.firstDay || r.date_start < c.firstDay)) c.firstDay = r.date_start
    if (r.date_start && (!c.lastDay || r.date_start > c.lastDay)) c.lastDay = r.date_start
  }
  const campaigns = Object.values(campMap).sort((a, b) => (a.firstDay || '').localeCompare(b.firstDay || ''))

  // Apply the checkbox selection — only rows from still-selected campaigns count.
  const deselected = new Set(deselectedIds || [])
  const metaRows = allMetaRows.filter(r => !deselected.has(r.campaign_id))

  // ----- Lifetime totals (full campaign history, selected campaigns only) -----
  const lifetime = { adSpend: 0, visitors: 0, signups: signups.length }
  for (const r of metaRows) {
    lifetime.adSpend += Number(r.spend) || 0
    lifetime.visitors += metaAction(r.actions, 'landing_page_view')
  }

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
    viewedWeekDays, weeklyTrend, campaigns, lifetime, recentSignups, revenueBreakdown,
    totalSignups: signups.length, loading: isPending, error: error ?? null,
  }
}
