import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { stepWeek } from '../dateUtils.js'
import { useDailyUpdates, mondayOf } from './useDailyUpdates.js'
import { PACE_METRICS, WEEKLY_TARGET_KEYS } from '../dailyUpdateFormat.js'

// =============================================================================
//  useWeeklyUpdate
//
//  Backs the investor "Weekly Update". Reuses useDailyUpdates for the daily rows
//  (summed Mon–Sun into "This Wk" per metric) and the weekly targets (the SAME
//  atlas_weekly_targets the daily uses). Adds atlas_weekly_updates — the
//  weekly-only narrative + snapshot extras (churned/pipeline/cash/runway) + Core
//  Rocks + Asks + the end-of-week MRR/customers snapshot used for WoW deltas.
// =============================================================================

const WEEKLY_KEY = ['weekly-updates']
const PACE_KEYS = PACE_METRICS.map((m) => m.key)

async function fetchWeeklyUpdates() {
  const { data, error } = await supabase
    .from('atlas_weekly_updates')
    .select('*')
    .order('week_key', { ascending: false })
    .limit(52)
  if (error) {
    console.warn('useWeeklyUpdate: atlas_weekly_updates unavailable (migration not run yet?) —', error.message)
    return []
  }
  return data || []
}

export function useWeeklyUpdate() {
  const queryClient = useQueryClient()
  const du = useDailyUpdates()
  const { data, isPending, error, refetch } = useQuery({ queryKey: WEEKLY_KEY, queryFn: fetchWeeklyUpdates })

  const weeks = data || []
  const byWeek = {}
  for (const w of weeks) byWeek[w.week_key] = w

  const getWeek = (weekKey) => byWeek[weekKey] || null

  // Per-metric manual overrides stored on the week row (jsonb keyed by metric).
  // Presence of a key = override in effect (so an override of 0 is honored).
  const getMetricOverrides = (weekKey) => {
    const o = byWeek[weekKey]?.metric_overrides
    return o && typeof o === 'object' ? o : {}
  }

  // Pure sum of the week's daily rows (Mon–Sun) per pace metric — the calculated
  // baseline, before any manual override.
  const thisWeekCalculated = (weekKey) => {
    const rows = du.days.filter((r) => mondayOf(r.update_date) === weekKey)
    const out = {}
    // PACE metrics + calls_unqualified (backs unqualified out of the close-rate denom).
    for (const k of [...PACE_KEYS, 'calls_unqualified']) {
      let sum = null
      for (const r of rows) if (r[k] != null) sum = (sum || 0) + Number(r[k])
      out[k] = sum
    }
    return out
  }

  // Effective "This Wk": a manual override wins over the calculated daily sum.
  // This is what the investor post + UI read, so overrides flow everywhere.
  const thisWeekTotals = (weekKey) => {
    const calc = thisWeekCalculated(weekKey)
    const ov = getMetricOverrides(weekKey)
    const out = {}
    for (const k of PACE_KEYS) out[k] = k in ov && ov[k] != null ? Number(ov[k]) : calc[k]
    out.calls_unqualified = calc.calls_unqualified // not overridable; feeds close-rate denom
    return out
  }

  // Weekly targets for the week (pace + derived) — reuse the daily store.
  const getWeeklyTargets = (weekKey) => {
    const out = {}
    for (const k of WEEKLY_TARGET_KEYS) out[k] = du.getWeeklyTarget(weekKey, k)
    return out
  }

  // WoW deltas from the stored end-of-week snapshot vs the prior week's.
  const wowDeltas = (weekKey) => {
    const cur = byWeek[weekKey]
    const prev = byWeek[stepWeek(weekKey, -1)]
    const d = (a, b) => (a != null && b != null ? Number(a) - Number(b) : null)
    return { mrr: d(cur?.total_mrr, prev?.total_mrr), customers: d(cur?.total_customers, prev?.total_customers) }
  }

  const availableWeeks = weeks.map((w) => w.week_key) // newest → oldest
  const latestWeek = availableWeeks[0] || null

  const save = useCallback(async (weekKey, fields, userId) => {
    const row = { ...fields, week_key: weekKey, updated_at: new Date().toISOString(), ...(userId ? { updated_by: userId } : {}) }
    const { error } = await supabase.from('atlas_weekly_updates').upsert(row, { onConflict: 'week_key' })
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: WEEKLY_KEY })
  }, [queryClient])

  return {
    loading: isPending || du.loading,
    error: error || du.error || null,
    weeks,
    availableWeeks,
    latestWeek,
    getWeek,
    thisWeekTotals,
    thisWeekCalculated,
    getMetricOverrides,
    getWeeklyTargets,
    wowDeltas,
    saveWeeklyTarget: du.saveWeeklyTarget, // same atlas_weekly_targets store as daily
    save,
    refresh: () => { refetch(); du.refresh() },
  }
}
