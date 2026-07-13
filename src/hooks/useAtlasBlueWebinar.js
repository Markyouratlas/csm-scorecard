import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { mondayOfYMD, dayIdxOfYMD } from '../aeFunnel.js'
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
//  Returns:
//    viewedWeekDays — 7-element array (getDay 0=Sun..6=Sat) of { adSpend, visitors }
//    weeklyTrend    — [{ weekKey, adSpend, visitors }] oldest→newest, length `weeks`
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
      const { data: metaRows, error: mErr } = await supabase
        .from('meta_ads_daily')
        .select('date_start, spend, actions')
        .eq('campaign_id', WEBINAR_CAMPAIGN_ID)
        .gte('date_start', chartStart)
      if (mErr) { console.warn('atlas blue webinar — meta_ads_daily read failed:', mErr.message); return { metaRows: [] } }
      return { metaRows: metaRows || [] }
    },
  })

  const metaRows = data?.metaRows || []

  // ----- Viewed week: per-day Ad Spend + Visitors -----
  const viewedWeekDays = Array.from({ length: 7 }, () => ({ adSpend: 0, visitors: 0 }))
  for (const r of metaRows) {
    if (!r.date_start || mondayOfYMD(r.date_start) !== weekKey) continue
    const cell = viewedWeekDays[dayIdxOfYMD(r.date_start)]
    cell.adSpend += Number(r.spend) || 0
    cell.visitors += metaAction(r.actions, 'landing_page_view')
  }

  // ----- Weekly trend: one row per week in the chart window -----
  const byWeek = {}
  for (const r of metaRows) {
    if (!r.date_start) continue
    const wk = mondayOfYMD(r.date_start)
    const agg = (byWeek[wk] ||= { adSpend: 0, visitors: 0 })
    agg.adSpend += Number(r.spend) || 0
    agg.visitors += metaAction(r.actions, 'landing_page_view')
  }
  const weeklyTrend = []
  for (let i = 0; i < weeks; i++) {
    const wk = stepWeek(chartStart, i)
    const agg = byWeek[wk] || { adSpend: 0, visitors: 0 }
    weeklyTrend.push({ weekKey: wk, adSpend: agg.adSpend, visitors: agg.visitors })
  }

  return { viewedWeekDays, weeklyTrend, loading: isPending, error: error ?? null }
}
