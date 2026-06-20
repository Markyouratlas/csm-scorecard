import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useProfitwellMetrics
//
//  Fetches the profitwell_metrics table (one row per metric_name × month_key)
//  and groups it into a per-metric shape for display.
//
//  Shape returned:
//    metrics: [
//      {
//        name,                              // metric_name
//        history: [{ monthKey, value }],    // oldest → newest
//        latest:  { monthKey, value },      // entry with the max month_key
//        months:  count,
//      }
//    ]  // sorted by name asc
//
//  Caching: fetched once on mount; manual refresh available via refresh().
// =============================================================================

function monthKeyFromDate(d) {
  // d is a Postgres date string 'YYYY-MM-DD' (or a Date). Return 'YYYY-MM'.
  // Do NOT use new Date(d) + getMonth(): date-only strings parse as UTC and
  // local getters can roll back a day west of UTC, shifting the month
  // (e.g. '2026-05-01' reads as April in Toronto). Slice the string instead.
  if (!d) return null
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.slice(0, 7)
}

async function fetchProfitwellMetrics() {
  // Only the most recent months are needed for this "latest value" panel
  // (with room for a short trend later). Newest-first + a bounded limit means
  // we never drag full history across the wire and never hit Supabase's
  // default 1000-row cap as months accumulate. 500 rows >> the metric count,
  // so every metric's latest month is always included.
  const { data, error } = await supabase
    .from('profitwell_metrics')
    .select('*')
    .order('month_key', { ascending: false })
    .limit(500)

  if (error) throw error

  // Group rows by metric_name.
  const byName = {}
  for (const row of data || []) {
    const mk = monthKeyFromDate(row.month_key)
    if (!mk) continue
    if (!byName[row.metric_name]) byName[row.metric_name] = []
    byName[row.metric_name].push({
      monthKey: mk,
      value: row.value != null ? Number(row.value) : null,
    })
  }

  const metrics = Object.keys(byName)
    .sort((a, b) => a.localeCompare(b))
    .map(name => {
      const history = byName[name]
      history.sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      const latest = history.reduce(
        (best, e) => (best == null || e.monthKey > best.monthKey ? e : best),
        null,
      )
      return { name, history, latest, months: history.length }
    })

  return { metrics, raw: data || [] }
}

export function useProfitwellMetrics() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['profitwell-metrics'],
    queryFn: fetchProfitwellMetrics,
  })
  return {
    loading: isPending,
    error: error ?? null,
    metrics: data?.metrics ?? [],
    raw: data?.raw ?? [],
    refresh: refetch,
  }
}
