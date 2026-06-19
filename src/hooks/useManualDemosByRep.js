import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// Per-AE manually-logged "demos booked" for a scorecard week (Monday YYYY-MM-DD).
// Sums data.daily[].demosBooked per AE, matching useOdysseyMetrics' aggregation.
export function useManualDemosByRep(weekKey, refreshKey = 0) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], total: 0 })

  const load = useCallback(async () => {
    if (!weekKey) { setState({ loading: false, error: null, rows: [], total: 0 }); return }
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      // AE profiles (names + role filter).
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, name, role_type')
        .is('archived_at', null)
        .eq('role_type', 'account_executive')
      if (pErr) throw pErr
      const aeById = new Map((profiles || []).map(p => [p.id, p]))
      const aeIds = [...aeById.keys()]
      if (aeIds.length === 0) { setState({ loading: false, error: null, rows: [], total: 0 }); return }

      // This week's scorecards for those AEs.
      const { data: cards, error: sErr } = await supabase
        .from('weekly_scorecards')
        .select('user_id, data')
        .eq('week_key', weekKey)
        .in('user_id', aeIds)
      if (sErr) throw sErr

      // Sum data.daily[].demosBooked per AE.
      const byRep = new Map()
      for (const card of (cards || [])) {
        const daily = card.data?.daily || []
        const sum = daily.reduce((s, d) => s + (Number(d?.demosBooked) || 0), 0)
        if (sum > 0 || byRep.has(card.user_id)) {
          byRep.set(card.user_id, (byRep.get(card.user_id) || 0) + sum)
        }
      }

      // Build rows for ALL AEs (so reps who logged 0 still show), name from profile.
      const rows = aeIds.map(id => ({
        name: aeById.get(id)?.name || 'Unknown',
        count: byRep.get(id) || 0,
      })).sort((a, b) => b.count - a.count)

      const total = rows.reduce((s, r) => s + r.count, 0)
      setState({ loading: false, error: null, rows, total })
    } catch (e) {
      console.error('useManualDemosByRep:', e)
      setState({ loading: false, error: e, rows: [], total: 0 })
    }
  }, [weekKey, refreshKey])

  useEffect(() => { load() }, [load])
  return { ...state, refresh: load }
}
