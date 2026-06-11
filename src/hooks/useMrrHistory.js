import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// =============================================================================
//  useMrrHistory
//
//  Reads the mrr_snapshots table (one row per stored month). This hook only
//  READS — all writes go through the upsert_mrr_snapshot RPC in the component,
//  never direct table writes.
//
//  Returns:
//    rows     — [{ month_key, mrr, customers, source, note, ... }] sorted by
//               month_key ascending
//    loading, error
//    refresh  — re-runs the fetch
// =============================================================================

export function useMrrHistory() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    rows: [],
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data, error } = await supabase
        .from('mrr_snapshots')
        .select('*')
        .order('month_key', { ascending: true })
      if (error) throw error
      setState({ loading: false, error: null, rows: data || [] })
    } catch (e) {
      console.error('useMrrHistory:', e)
      setState({ loading: false, error: e, rows: [] })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}
