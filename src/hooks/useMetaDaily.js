import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

async function fetchMetaDaily(days) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('meta_ads_daily')
    .select('*')
    .gte('date_start', sinceStr)
    .order('date_start', { ascending: true })

  if (error) throw error

  // Aggregate per day across campaigns
  const byDay = new Map()
  for (const row of (data || [])) {
    const key = row.date_start
    if (!byDay.has(key)) {
      byDay.set(key, { date: key, spend: 0, impressions: 0, clicks: 0, reach: 0 })
    }
    const d = byDay.get(key)
    d.spend += row.spend || 0
    d.impressions += row.impressions || 0
    d.clicks += row.inline_link_clicks || 0
    d.reach += row.reach || 0
  }

  const series = [...byDay.values()].map(d => ({
    ...d,
    spend: Math.round(d.spend * 100) / 100,
    cpm: d.impressions > 0 ? Math.round((d.spend / d.impressions) * 1000 * 100) / 100 : 0,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  const totals = series.reduce((acc, d) => ({
    spend: acc.spend + d.spend,
    impressions: acc.impressions + d.impressions,
    clicks: acc.clicks + d.clicks,
    reach: acc.reach + d.reach,
  }), { spend: 0, impressions: 0, clicks: 0, reach: 0 })

  return { series, totals }
}

// Reads the daily time-series table and shapes it for charts (cached per `days`).
// Aggregates across ALL campaigns per calendar day.
export function useMetaDaily(days = 30, refreshKey = 0) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['meta-daily', days, refreshKey],
    queryFn: () => fetchMetaDaily(days),
  })
  return { series: data?.series ?? [], totals: data?.totals ?? null, loading: isPending, error: error ?? null, refresh: refetch }
}
