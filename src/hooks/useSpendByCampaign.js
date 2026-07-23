import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// Per-campaign Meta ad spend since `sinceDate` (YYYY-MM-DD), or all synced history
// when null. Via meta_spend_by_campaign rpc (exec + growth_manager). Powers the
// Ad spend / CAC drill-downs on the Booked Meetings tab. See
// src/38-meta-spend-by-campaign.sql.
export function useSpendByCampaign(sinceDate = null) {
  const { data, isPending, error } = useQuery({
    queryKey: ['meta-spend-by-campaign', sinceDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meta_spend_by_campaign', { p_since: sinceDate })
      if (error) throw error
      return data || []
    },
  })
  const campaigns = (data || [])
    .map(r => ({ id: r.campaign_id, name: r.campaign_name || r.campaign_id, spend: Number(r.spend) || 0 }))
    .sort((a, b) => b.spend - a.spend)
  const total = campaigns.reduce((s, c) => s + c.spend, 0)
  return { campaigns, total, loading: isPending, error: error ?? null }
}
