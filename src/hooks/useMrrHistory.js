import { useQuery } from '@tanstack/react-query'
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

async function fetchMrrHistory() {
  const { data, error } = await supabase
    .from('mrr_snapshots')
    .select('*')
    .order('month_key', { ascending: true })
  if (error) throw error
  return data || []
}

export function useMrrHistory() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['mrr-history'],
    queryFn: fetchMrrHistory,
  })
  return { loading: isPending, error: error ?? null, rows: data ?? [], refresh: refetch }
}
