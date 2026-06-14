import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { getWeekKey, stepWeek } from './dateUtils'

// Returns the current month key in YYYY-MM format.
export function getMonthKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Format month key for display: "2026-04" → "April 2026"
export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Returns all the weekly week_keys (Mondays as YYYY-MM-DD) that fall in the given month.
// We include any week whose Monday is in this month.
export function weekKeysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  // Last calendar day of the month as a YYYY-MM-DD string. ISO date strings
  // compare lexicographically, so the loop bound needs no Date/timezone math.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lastDayStr = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  // Canonical Monday key for the week containing the 1st (noon-UTC anchor keeps
  // the company-tz calendar date on the intended day). Reuses getWeekKey so this
  // is guaranteed consistent with how week_keys are actually stored.
  let cursor = getWeekKey(new Date(Date.UTC(y, m - 1, 1, 12)))
  const keys = []
  while (cursor <= lastDayStr) {
    keys.push(cursor)
    cursor = stepWeek(cursor, 1)
  }
  return keys
}

const toIso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Loads all weekly scorecards in the given month + the monthly-only data.
//
//   const { weeks, monthly, loading, refreshMonthly } = useMtdData(userId, monthKey)
//
//   weeks   = array of { week_key, data } for this month (most recent first)
//   monthly = single object with monthly-only fields (e.g. NRR inputs, NPS, CAC)
export function useMtdData(userId, monthKey) {
  const [weeks, setWeeks] = useState([])
  const [monthly, setMonthly] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId || !monthKey) return
    setLoading(true)
    const keys = weekKeysInMonth(monthKey)

    const [weeklyRes, monthlyRes] = await Promise.all([
      supabase
        .from('weekly_scorecards')
        .select('week_key, data')
        .eq('user_id', userId)
        .in('week_key', keys),
      supabase
        .from('monthly_scorecards')
        .select('data')
        .eq('user_id', userId)
        .eq('month_key', monthKey)
        .maybeSingle(),
    ])

    if (weeklyRes.error) console.error('MTD weekly load error', weeklyRes.error)
    if (monthlyRes.error) console.error('MTD monthly load error', monthlyRes.error)

    setWeeks(weeklyRes.data || [])
    setMonthly(monthlyRes.data?.data || {})
    setLoading(false)
  }, [userId, monthKey])

  useEffect(() => { load() }, [load])

  // Save monthly-only data (NRR inputs, NPS, CAC, etc.)
  const saveMonthly = useCallback(async (newData) => {
    const merged = { ...(monthly || {}), ...newData }
    setMonthly(merged)
    const { error } = await supabase
      .from('monthly_scorecards')
      .upsert({
        user_id: userId,
        month_key: monthKey,
        data: merged,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month_key' })
    if (error) console.error('Monthly save error', error)
  }, [userId, monthKey, monthly])

  return { weeks, monthly, loading, saveMonthly, refresh: load }
}

// Sum a numeric field across all weekly daily entries in the month.
// Pass extractor: (dailyEntry) => number
export function sumMonthly(weeks, extractor) {
  let total = 0
  for (const w of weeks) {
    const daily = (w.data && w.data.daily) || []
    for (const day of daily) {
      const v = Number(extractor(day || {})) || 0
      total += v
    }
  }
  return total
}

// Average an array of weekly-derived values (skipping non-numbers)
export function avgWeekly(weeks, extractor) {
  const values = []
  for (const w of weeks) {
    const v = extractor(w.data || {})
    if (v !== null && v !== undefined && !isNaN(Number(v))) {
      values.push(Number(v))
    }
  }
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}
