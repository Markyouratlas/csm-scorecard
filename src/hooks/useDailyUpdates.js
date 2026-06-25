import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { PACE_METRICS } from '../dailyUpdateFormat.js'

// =============================================================================
//  useDailyUpdates
//
//  Reads the two aggregate tables behind the Investor "Daily Update" tab:
//    - atlas_daily_updates  (one row per reported day: 8 metrics + snapshot +
//      qualitative founder fields)
//    - atlas_weekly_targets (editable weekly targets per metric_key)
//
//  Week-to-date (WTD) is derived in-app: the sum of each metric across the daily
//  rows from that day's Monday up to and including the day. Targets are weekly.
//
//  Both Odyssey (exec edit) and Investor (read-only) surfaces share these
//  React Query caches, so an exec's save shows up in the investor view instantly.
//
//  Resilient: if a table doesn't exist yet (migration not run), the query warns
//  and returns empty so the UI renders an empty state instead of crashing.
// =============================================================================

const DAILY_KEY = ['daily-updates']
const TARGETS_KEY = ['weekly-targets']
const PACE_KEYS = PACE_METRICS.map((m) => m.key)

// Local YYYY-MM-DD (no UTC shift).
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

// Monday (week_key) for a 'YYYY-MM-DD' string — local calendar math, matches
// Postgres date_trunc('week', …). Exported so the modal's week editor agrees.
export function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun..6=Sat
  const back = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - back)
  return ymd(d)
}

export function todayStr() {
  return ymd(new Date())
}

async function fetchDailyUpdates() {
  // ~180 days of history so the investor Daily tab can browse back through stored
  // days (one row/day, so this is tiny). WTD math still filters by week.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)
  const { data, error } = await supabase
    .from('atlas_daily_updates')
    .select('*')
    .gte('update_date', ymd(cutoff))
    .order('update_date', { ascending: false })
  if (error) {
    console.warn('useDailyUpdates: atlas_daily_updates unavailable (migration not run yet?) —', error.message)
    return []
  }
  return data || []
}

async function fetchWeeklyTargets() {
  const { data, error } = await supabase
    .from('atlas_weekly_targets')
    .select('week_key, metric_key, target_value')
  if (error) {
    console.warn('useDailyUpdates: atlas_weekly_targets unavailable (migration not run yet?) —', error.message)
    return []
  }
  return data || []
}

export function useDailyUpdates() {
  const queryClient = useQueryClient()

  const daysQ = useQuery({ queryKey: DAILY_KEY, queryFn: fetchDailyUpdates })
  const targetsQ = useQuery({ queryKey: TARGETS_KEY, queryFn: fetchWeeklyTargets })

  const days = daysQ.data || []
  const targetRows = targetsQ.data || []

  // Index daily rows by date, and targets by `${week_key}|${metric_key}`.
  const dayByDate = {}
  for (const r of days) dayByDate[r.update_date] = r
  const targetByKey = {}
  for (const t of targetRows) targetByKey[`${t.week_key}|${t.metric_key}`] = t.target_value

  const availableDates = days.map((r) => r.update_date) // newest → oldest
  const latestDate = availableDates[0] || null

  const getDay = (date) => dayByDate[date] || null

  // WTD per pace metric: sum of non-null daily values Monday→date (inclusive).
  // null when no day in the window carries a value for that metric.
  const getWeekToDate = (date) => {
    if (!date) return {}
    const monday = mondayOf(date)
    const inWindow = days.filter((r) => r.update_date >= monday && r.update_date <= date)
    const out = {}
    // PACE metrics + calls_unqualified (not a pace metric, but needed to back
    // unqualified calls out of the close-rate denominator).
    for (const key of [...PACE_KEYS, 'calls_unqualified']) {
      let sum = null
      for (const r of inWindow) {
        if (r[key] != null) sum = (sum || 0) + Number(r[key])
      }
      out[key] = sum
    }
    return out
  }

  // Weekly target for a metric in the week containing `date` (or a raw weekKey).
  const getWeeklyTargetForDate = (date, metricKey) =>
    date ? (targetByKey[`${mondayOf(date)}|${metricKey}`] ?? null) : null
  const getWeeklyTarget = (weekKey, metricKey) =>
    targetByKey[`${weekKey}|${metricKey}`] ?? null

  // All weekly targets for the week containing `date` → { [metricKey]: value }.
  const getWeeklyTargets = (date) => {
    const out = {}
    if (!date) return out
    const monday = mondayOf(date)
    for (const t of targetRows) if (t.week_key === monday) out[t.metric_key] = t.target_value
    return out
  }

  // ---- writes (exec only; RLS enforces) ----

  const save = useCallback(async (date, fields, userId) => {
    const row = {
      ...fields,
      update_date: date,
      updated_at: new Date().toISOString(),
      ...(userId ? { updated_by: userId } : {}),
    }
    const { error } = await supabase
      .from('atlas_daily_updates')
      .upsert(row, { onConflict: 'update_date' })
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: DAILY_KEY })
  }, [queryClient])

  const saveWeeklyTarget = useCallback(async (weekKey, metricKey, value, userId) => {
    const target_value = value === '' || value == null ? null : Number(value)
    const { error } = await supabase
      .from('atlas_weekly_targets')
      .upsert(
        { week_key: weekKey, metric_key: metricKey, target_value, updated_at: new Date().toISOString(), ...(userId ? { updated_by: userId } : {}) },
        { onConflict: 'week_key,metric_key' },
      )
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: TARGETS_KEY })
  }, [queryClient])

  return {
    loading: daysQ.isPending || targetsQ.isPending,
    error: daysQ.error || targetsQ.error || null,
    days,
    availableDates,
    latestDate,
    getDay,
    getWeekToDate,
    getWeeklyTarget,
    getWeeklyTargetForDate,
    getWeeklyTargets,
    save,
    saveWeeklyTarget,
    refresh: () => { daysQ.refetch(); targetsQ.refetch() },
  }
}
