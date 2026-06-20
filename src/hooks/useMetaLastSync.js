import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

async function fetchMetaLastSync() {
  const { data, error } = await supabase
    .from('meta_ads_daily')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length ? data[0].synced_at : null
}

// Reads the most recent synced_at across Meta daily data, for a "last synced" display.
export function useMetaLastSync(refreshKey = 0) {
  const { data, isPending, refetch } = useQuery({
    queryKey: ['meta-last-sync', refreshKey],
    queryFn: fetchMetaLastSync,
  })
  return { lastSync: data ?? null, loading: isPending, refresh: refetch }
}
