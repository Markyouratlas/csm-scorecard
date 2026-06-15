import { useState, useEffect, useCallback } from 'react'
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

export function useProfitwellMetrics() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    metrics: [],   // [{ name, history, latest, months }]
    raw: [],       // raw rows for debugging
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data, error } = await supabase
        .from('profitwell_metrics')
        .select('*')
        .order('month_key', { ascending: true })

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
          // Rows arrive month_key asc, so history is already oldest → newest.
          const history = byName[name]
          const latest = history.reduce(
            (best, e) => (best == null || e.monthKey > best.monthKey ? e : best),
            null,
          )
          return { name, history, latest, months: history.length }
        })

      setState({ loading: false, error: null, metrics, raw: data || [] })
    } catch (e) {
      console.error('useProfitwellMetrics:', e)
      setState({ loading: false, error: e, metrics: [], raw: [] })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return {
    loading: state.loading,
    error: state.error,
    metrics: state.metrics,
    raw: state.raw,
    refresh: load,
  }
}
