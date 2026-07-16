import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useOpenPartnerPipeline
//
//  Reads the server-computed "open partner pipeline" value from the
//  investor-readable atlas_weekly_updates table (partner_pipeline_amount is written
//  by the channel_deals trigger + weekly-update-autofill; see
//  src/20-open-partner-pipeline.sql). Returns the current value + WoW delta.
//
//  Investors can't read channel_deals, so this stored value is the single source of
//  truth every investor-facing surface reads.
// =============================================================================

export function useOpenPartnerPipeline() {
  const { data, isPending } = useQuery({
    queryKey: ['open-partner-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('atlas_weekly_updates')
        .select('week_key, partner_pipeline_amount')
        .not('partner_pipeline_amount', 'is', null)
        .order('week_key', { ascending: false })
        .limit(2)
      if (error) {
        console.warn('useOpenPartnerPipeline: unavailable —', error.message)
        return { value: null, deltaPct: null }
      }
      const rows = data || []
      const value = rows[0]?.partner_pipeline_amount ?? null
      const prior = rows[1]?.partner_pipeline_amount ?? null
      const deltaPct =
        value != null && prior != null && Number(prior) !== 0
          ? ((Number(value) - Number(prior)) / Number(prior)) * 100
          : null
      return { value: value != null ? Number(value) : null, deltaPct }
    },
  })

  return { loading: isPending, value: data?.value ?? null, deltaPct: data?.deltaPct ?? null }
}
