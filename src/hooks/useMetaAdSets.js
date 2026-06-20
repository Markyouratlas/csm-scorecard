import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

function audienceOf(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('cold')) return 'Cold'
  if (n.includes('warm')) return 'Warm'
  return 'Other'
}

function actionValue(actions, type) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(a => a.action_type === type)
  return hit ? Number(hit.value) || 0 : 0
}

async function fetchMetaAdSets(days) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  // days=0 → today only; since already equals today's date, gte filter handles it.

  const { data, error } = await supabase
    .from('meta_ad_sets_daily')
    .select('*')
    .gte('date_start', sinceStr)
    .order('date_start', { ascending: false })

  if (error) throw error

  // Aggregate per ad set across the window
  const byAdSet = new Map()
  for (const row of (data || [])) {
    if (!byAdSet.has(row.adset_id)) {
      byAdSet.set(row.adset_id, {
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        audience: audienceOf(row.adset_name),
        spend: 0, impressions: 0, reach: 0, clicks: 0, totalClicks: 0,
        testDrive: 0, conversions: 0,
      })
    }
    const a = byAdSet.get(row.adset_id)
    a.spend += row.spend || 0
    a.impressions += row.impressions || 0
    a.reach += row.reach || 0
    a.clicks += row.inline_link_clicks || 0
    // Derive raw click counts from Meta's stored rates so we can aggregate accurately.
    // total clicks = ctr% × impressions; link clicks already stored as inline_link_clicks.
    a.totalClicks += row.ctr != null && row.impressions ? (row.ctr / 100) * row.impressions : 0
    a.testDrive += actionValue(row.actions, 'offsite_conversion.fb_pixel_custom')
    a.conversions += actionValue(row.actions, 'complete_registration')
  }

  const adSets = [...byAdSet.values()].map(a => ({
    ...a,
    spend: Math.round(a.spend * 100) / 100,
    cpm: a.impressions > 0 ? Math.round((a.spend / a.impressions) * 1000 * 100) / 100 : 0,
    totalCtr: a.impressions > 0 ? Math.round((a.totalClicks / a.impressions) * 10000) / 100 : 0,
    linkCtr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
  })).sort((x, y) => y.spend - x.spend)

  // Group into Cold / Warm summaries
  const summarize = (aud) => {
    const rows = adSets.filter(a => a.audience === aud)
    const spend = rows.reduce((s, r) => s + r.spend, 0)
    const impressions = rows.reduce((s, r) => s + r.impressions, 0)
    const linkClicks = rows.reduce((s, r) => s + r.clicks, 0)
    const totalClicks = rows.reduce((s, r) => s + r.totalClicks, 0)
    return {
      count: rows.length,
      spend: Math.round(spend * 100) / 100,
      avgCpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0,
      totalCtr: impressions > 0 ? Math.round((totalClicks / impressions) * 10000) / 100 : 0,
      linkCtr: impressions > 0 ? Math.round((linkClicks / impressions) * 10000) / 100 : 0,
      testDrive: rows.reduce((s, r) => s + r.testDrive, 0),
      conversions: rows.reduce((s, r) => s + r.conversions, 0),
    }
  }

  const groups = { Cold: summarize('Cold'), Warm: summarize('Warm') }

  return { adSets, groups }
}

// Reads ad-set daily rows over a window, aggregates per ad set (cached per `days`).
export function useMetaAdSets(days = 30, refreshKey = 0) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['meta-adsets', days, refreshKey],
    queryFn: () => fetchMetaAdSets(days),
  })
  return { adSets: data?.adSets ?? [], groups: data?.groups ?? null, loading: isPending, error: error ?? null, refresh: refetch }
}
