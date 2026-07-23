import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// Total Meta ad spend since `sinceDate` (YYYY-MM-DD), or all synced history when
// sinceDate is null. Summed server-side (meta_total_spend rpc, exec + growth_manager)
// so it's correct as meta_ads_daily grows past the client row cap. Powers the
// blended CAC on the Booked Meetings tab. See src/37-meta-total-spend.sql.
export function useTotalAdSpend(sinceDate = null) {
  const { data, isPending, error } = useQuery({
    queryKey: ['meta-total-spend', sinceDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meta_total_spend', { p_since: sinceDate })
      if (error) throw error
      return Number(data) || 0
    },
  })
  return { spend: data || 0, loading: isPending, error: error ?? null }
}
