import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// Generic hook used by every role's scorecard view.
// Loads this week's data for the user, auto-saves with debounce.
//
//   const { weekData, setWeekData, loading, saving, savedAt, update } = useScorecard(userId, weekKey, blankFactory)
export function useScorecard(userId, weekKey, blankFactory) {
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  // Load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('weekly_scorecards')
      .select('data')
      .eq('user_id', userId)
      .eq('week_key', weekKey)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Load error', error)
        const blank = blankFactory()
        const loaded = data?.data || {}
        setWeekData(deepMerge(blank, loaded))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId, weekKey])

  // Save (debounced)
  const save = useCallback(async (newData) => {
    setSaving(true)
    const { error } = await supabase
      .from('weekly_scorecards')
      .upsert({
        user_id: userId,
        week_key: weekKey,
        data: newData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_key' })
    setSaving(false)
    if (error) {
      console.error('Save error', error)
    } else {
      setSavedAt(new Date())
    }
  }, [userId, weekKey])

  useEffect(() => {
    if (!weekData || loading) return
    const t = setTimeout(() => save(weekData), 800)
    return () => clearTimeout(t)
  }, [weekData, loading, save])

  // Convenience updater: setData(prev => ...)
  const update = useCallback((updater) => {
    setWeekData(prev => updater(prev))
  }, [])

  return { weekData, setWeekData, loading, saving, savedAt, update }
}

// Deep merge: preserves shape from blank, overlays loaded values
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target
  const out = Array.isArray(target) ? [...target] : { ...target }
  for (const k of Object.keys(source)) {
    if (source[k] !== null && typeof source[k] === 'object' && !Array.isArray(source[k])
        && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      out[k] = deepMerge(target[k], source[k])
    } else if (source[k] !== undefined) {
      out[k] = source[k]
    }
  }
  return out
}
