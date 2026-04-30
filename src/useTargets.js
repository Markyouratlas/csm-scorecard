import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// Loads role-default + user-override targets, returns merged map keyed by metric_key.
//
// Returns:
//   targets:  { [metric_key]: { value, comparator, unit, source: 'default' | 'override' } }
//   loading:  bool
//   refresh:  () => Promise — re-loads targets from DB
export function useTargets(userId, roleType) {
  const [targets, setTargets] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId || !roleType) return
    setLoading(true)
    // Pull role defaults + this user's overrides in one query
    const { data, error } = await supabase
      .from('metric_targets')
      .select('user_id, role_type, metric_key, target_value, comparator, unit')
      .or(`user_id.eq.${userId},and(user_id.is.null,role_type.eq.${roleType})`)

    if (error) {
      console.error('Targets load error', error)
      setLoading(false)
      return
    }

    const merged = {}
    // First pass: defaults
    for (const row of (data || []).filter(r => r.user_id === null)) {
      merged[row.metric_key] = {
        value: row.target_value,
        comparator: row.comparator,
        unit: row.unit,
        source: 'default',
      }
    }
    // Second pass: overrides win
    for (const row of (data || []).filter(r => r.user_id === userId)) {
      merged[row.metric_key] = {
        value: row.target_value,
        comparator: row.comparator,
        unit: row.unit,
        source: 'override',
      }
    }
    setTargets(merged)
    setLoading(false)
  }, [userId, roleType])

  useEffect(() => { load() }, [load])

  return { targets, loading, refresh: load }
}

// Save a user override for a metric. Pass target_value=null to clear (revert to default).
export async function saveTargetOverride(userId, metricKey, value, comparator, unit) {
  if (value === null || value === undefined || value === '') {
    // Clear the override
    await supabase
      .from('metric_targets')
      .delete()
      .eq('user_id', userId)
      .eq('metric_key', metricKey)
    return { cleared: true }
  }
  const { error } = await supabase
    .from('metric_targets')
    .upsert({
      user_id: userId,
      metric_key: metricKey,
      target_value: Number(value),
      comparator: comparator || 'gte',
      unit: unit || 'number',
    }, { onConflict: 'user_id,metric_key' })
  if (error) throw error
  return { saved: true }
}
