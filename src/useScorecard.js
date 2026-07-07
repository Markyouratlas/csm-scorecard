import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { getWeekKey, stepWeek } from './dateUtils'
import { fireConfetti } from './confetti'
import { useScorecardEditable } from './ScorecardEditContext'

// Generic hook used by every role's scorecard view.
//
// What it owns:
//   • Loading + saving the week data from weekly_scorecards
//   • Week navigation state (when the user is on their own scorecard)
//   • Submission state (submitted_at, submit/unsubmit, lock rules)
//   • Auto-save suppression when the week is locked
//
// What callers pass in:
//   • userId — profile.id
//   • propWeekKey — undefined when user is viewing own scorecard; set when
//     an exec drills in via ScorecardViewer (which owns the weekKey there)
//   • blankFactory — function returning a blank shape for this role
//
// What callers get back:
//   const {
//     weekData, setWeekData, update,
//     weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek,
//     loading, saving, savedAt,
//     submittedAt, isLocked, submit, unsubmit, submitting,
//   } = useScorecard(profile.id, propWeekKey, BLANK_FACTORY)
//
// Backward compatibility: older call sites that pass (userId, weekKey, blankFactory)
// with a CONCRETE weekKey string still work — when the second arg is a non-empty
// string the hook treats it as the exec-drill-in path.
export function useScorecard(userId, propWeekKey, blankFactory, carryForward = []) {
  const editable = useScorecardEditable()
  const isExecDrillIn = typeof propWeekKey === 'string' && propWeekKey.length > 0
  const [ownWeekKey, setOwnWeekKey] = useState(getWeekKey())
  const weekKey = isExecDrillIn ? propWeekKey : ownWeekKey
  const currentWeekKey = getWeekKey()
  const isViewingCurrentWeek = weekKey === currentWeekKey

  const [weekData, setWeekData] = useState(null)
  const [submittedAt, setSubmittedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Lock rule mirrors the DB policy: a week is locked only after it's no
  // longer the current week. During the current week the user can unsubmit
  // and edit freely.
  const isLocked = !!submittedAt && !isViewingCurrentWeek

  // Load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSubmittedAt(null)
    setSavedAt(null)

    const load = async () => {
      const { data, error } = await supabase
        .from('weekly_scorecards')
        .select('data, submitted_at')
        .eq('user_id', userId)
        .eq('week_key', weekKey)
        .maybeSingle()
      if (cancelled) return
      if (error) console.error('Load error', error)

      const blank = blankFactory()
      const loaded = data?.data || {}
      let merged = deepMerge(blank, loaded)

      // Carry-forward: for the current week (never an exec drill-in), seed each
      // opted-in field that is currently EMPTY from the most recent prior week
      // that has a non-empty array for it. Seeding on "empty" (not only "no row
      // yet") matters because a server sync — ae-meetings-sync — now pre-creates
      // the AE's weekly row with deals:[] before they open the app; the old
      // `!data` guard would have skipped carry-forward in that case, so the
      // ongoing pipeline (and Growth experiments / Implementation projects)
      // wouldn't persist. Once seeded, autosave writes it into this week, so it
      // won't re-seed on the next load, and it rolls forward each new week.
      const needsCarry = !isExecDrillIn && weekKey === currentWeekKey
        && Array.isArray(carryForward) && carryForward.length > 0
        && carryForward.some(field => !Array.isArray(merged[field]) || merged[field].length === 0)
      if (needsCarry) {
        const { data: priorRows, error: priorErr } = await supabase
          .from('weekly_scorecards')
          .select('week_key, data')
          .eq('user_id', userId)
          .lt('week_key', currentWeekKey)
          .order('week_key', { ascending: false })
          .limit(8)
        if (cancelled) return
        if (priorErr) {
          console.error('Carry-forward load error', priorErr)
        } else if (priorRows && priorRows.length > 0) {
          const seeded = { ...merged }
          for (const field of carryForward) {
            // Only seed fields that are empty this week (don't clobber edits).
            if (Array.isArray(seeded[field]) && seeded[field].length > 0) continue
            for (const row of priorRows) {
              const val = row.data?.[field]
              if (Array.isArray(val) && val.length > 0) {
                seeded[field] = val.map(item => ({ ...item }))
                break
              }
            }
          }
          merged = seeded
        }
      }

      setWeekData(merged)
      setSubmittedAt(data?.submitted_at || null)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId, weekKey])

  // Save (debounced) — skipped when locked
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
    if (!editable) return
    if (!weekData || loading) return
    if (isLocked) return
    const t = setTimeout(() => save(weekData), 800)
    return () => clearTimeout(t)
  }, [weekData, loading, save, isLocked, editable])

  // Submit / Unsubmit
  const submit = useCallback(async () => {
    if (!weekData || submittedAt) return
    setSubmitting(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('weekly_scorecards')
      .upsert({
        user_id: userId,
        week_key: weekKey,
        data: weekData,
        submitted_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,week_key' })
    setSubmitting(false)
    if (error) {
      console.error('Submit error', error)
      alert('Could not submit: ' + error.message)
      return
    }
    setSubmittedAt(now)
    fireConfetti({ count: 150 })
  }, [userId, weekKey, weekData, submittedAt])

  const unsubmit = useCallback(async () => {
    if (!submittedAt) return
    setSubmitting(true)
    const { error } = await supabase
      .from('weekly_scorecards')
      .update({ submitted_at: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('week_key', weekKey)
    setSubmitting(false)
    if (error) {
      console.error('Unsubmit error', error)
      alert('Could not unsubmit: ' + error.message)
      return
    }
    setSubmittedAt(null)
  }, [userId, weekKey, submittedAt])

  // Convenience updater: setData(prev => ...)
  const update = useCallback((updater) => {
    setWeekData(prev => updater(prev))
  }, [])

  return {
    weekData, setWeekData, update,
    weekKey,
    // Setter is a no-op when exec is driving — keeps callers safe to call either way
    setWeekKey: isExecDrillIn ? () => {} : setOwnWeekKey,
    isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    loading, saving, savedAt,
    submittedAt, isLocked, submit, unsubmit, submitting,
  }
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
