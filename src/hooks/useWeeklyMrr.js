import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { recentWeekKeys, stepWeek } from '../dateUtils.js'

// =============================================================================
//  useWeeklyMrr
//
//  Builds an N-week MRR trajectory for the executive hero charts. We only have
//  real MONTHLY MRR anchors (atlas_targets 'total-mrr' actuals + the live current
//  month), so the in-between weeks are LINEARLY INTERPOLATED. An executive can
//  later correct any week with a real figure — those manual overrides live in the
//  `weekly_mrr` table and WIN over the interpolated value.
//
//  Shared by the Odyssey + Investor heroes via the ['weekly-mrr'] React Query
//  cache, so a manual weekly edit propagates to both views.
//
//  Args:  { monthlyAnchors: [{monthKey:'YYYY-MM', mrr}], liveMrr:number|null, weeks }
//  Returns: { series:[{week,weekKey,mrr,source}], saveWeek, loading, refresh }
// =============================================================================

const WEEKLY_MRR_KEY = ['weekly-mrr']

// Fetch manual weekly overrides → { [week_key]: mrr }. Resilient: if the table
// doesn't exist yet (migration not run), returns {} so the series still renders.
async function fetchWeeklyOverrides() {
  const { data, error } = await supabase
    .from('weekly_mrr')
    .select('week_key, mrr, source')
  if (error) {
    console.warn('useWeeklyMrr: weekly_mrr unavailable (migration not run yet?) —', error.message)
    return {}
  }
  const map = {}
  for (const row of data || []) {
    if (row.mrr != null) map[row.week_key] = Number(row.mrr)
  }
  return map
}

// 'YYYY-MM-DD' → ms at UTC midnight (stable, timezone-independent ordering).
function toUTCms(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Linear-interpolate MRR at timestamp t from sorted [{t, mrr}] anchors.
// Before the first / after the last anchor, clamp to that anchor's value.
function interpolate(anchors, t) {
  if (!anchors.length) return null
  if (t <= anchors[0].t) return anchors[0].mrr
  if (t >= anchors[anchors.length - 1].t) return anchors[anchors.length - 1].mrr
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1]
    if (t >= a.t && t <= b.t) {
      const frac = (b.t - a.t) === 0 ? 0 : (t - a.t) / (b.t - a.t)
      return a.mrr + (b.mrr - a.mrr) * frac
    }
  }
  return anchors[anchors.length - 1].mrr
}

export function useWeeklyMrr({ monthlyAnchors = [], liveMrr = null, weeks = 8 } = {}) {
  const queryClient = useQueryClient()
  const { data: overrides, isPending, refetch } = useQuery({
    queryKey: WEEKLY_MRR_KEY,
    queryFn: fetchWeeklyOverrides,
  })

  const ov = overrides || {}

  // Window: the recent N weeks, EXTENDED to include any manually-added weeks
  // (past or future), filled contiguously so the trajectory has no gaps.
  const baseWeeks = recentWeekKeys(weeks)            // oldest → newest, current week last
  const currentWeek = baseWeeks[baseWeeks.length - 1]
  const known = [...baseWeeks, ...Object.keys(ov)]
  const startKey = known.reduce((min, k) => (k < min ? k : min), baseWeeks[0])
  const endKey = known.reduce((max, k) => (k > max ? k : max), currentWeek)
  const weekKeys = []
  for (let k = startKey, guard = 0; k <= endKey && guard < 520; k = stepWeek(k, 1), guard++) weekKeys.push(k)

  // Monthly anchors (first-of-month points) + a live "now" anchor on the current week.
  const anchors = monthlyAnchors
    .filter(a => a && a.mrr != null)
    .map(a => ({ t: toUTCms(`${a.monthKey}-01`), mrr: Number(a.mrr) }))
    .sort((x, y) => x.t - y.t)
  if (liveMrr != null) {
    const nowT = toUTCms(currentWeek)
    const idx = anchors.findIndex(a => a.t === nowT)
    if (idx >= 0) anchors[idx] = { t: nowT, mrr: liveMrr }
    else { anchors.push({ t: nowT, mrr: liveMrr }); anchors.sort((x, y) => x.t - y.t) }
  }

  // Month-aware x-axis label: "Mon D" on the first week of each month, else "D".
  const labelFor = (wk, i) => {
    const d = new Date(wk + 'T00:00:00')
    const mon = d.toLocaleDateString('en-US', { month: 'short' })
    if (i === 0) return `${mon} ${d.getDate()}`
    const prev = new Date(weekKeys[i - 1] + 'T00:00:00')
    return prev.getMonth() !== d.getMonth() ? `${mon} ${d.getDate()}` : `${d.getDate()}`
  }

  const series = weekKeys.map((wk, i) => {
    const label = labelFor(wk, i)
    if (ov[wk] != null) return { week: `W${i + 1}`, weekKey: wk, label, mrr: Math.round(ov[wk]), source: 'manual' }
    const v = interpolate(anchors, toUTCms(wk))
    return { week: `W${i + 1}`, weekKey: wk, label, mrr: v != null ? Math.round(v) : null, source: v != null ? 'interpolated' : 'none' }
  })

  // Upsert a manual weekly override; optimistically update the shared cache.
  const saveWeek = useCallback(async (weekKey, mrr) => {
    const value = mrr === '' || mrr == null ? null : Number(mrr)
    const { error } = await supabase
      .from('weekly_mrr')
      .upsert({ week_key: weekKey, mrr: value, source: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'week_key' })
    if (error) throw error
    queryClient.setQueryData(WEEKLY_MRR_KEY, (old) => ({ ...(old || {}), [weekKey]: value }))
  }, [queryClient])

  return { series, saveWeek, loading: isPending, refresh: refetch }
}
