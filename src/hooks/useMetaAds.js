import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

export function useMetaAds(datePreset = 'last_7d') {
  const [state, setState] = useState({ loading: true, error: null, rows: [], summary: null })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data, error } = await supabase
        .from('meta_ads_metrics')
        .select('*')
        .eq('date_preset', datePreset)
        .order('fetch_date', { ascending: false })

      if (error) throw error

      // Keep only the most recent fetch_date row per campaign
      const latestByCampaign = new Map()
      for (const row of (data || [])) {
        if (!latestByCampaign.has(row.campaign_id)) {
          latestByCampaign.set(row.campaign_id, row)
        }
      }
      const rows = [...latestByCampaign.values()]

      // Summary totals across all campaigns
      const activeCampaigns = rows.filter(r => r.status === 'ACTIVE')
      const summary = {
        totalSpend: rows.reduce((s, r) => s + (r.spend || 0), 0),
        totalImpressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
        totalClicks: rows.reduce((s, r) => s + (r.inline_link_clicks || 0), 0),
        totalReach: rows.reduce((s, r) => s + (r.reach || 0), 0),
        avgCpm: rows.filter(r => r.cpm).length
          ? rows.filter(r => r.cpm).reduce((s, r) => s + r.cpm, 0) / rows.filter(r => r.cpm).length
          : null,
        avgCtr: rows.filter(r => r.ctr).length
          ? rows.filter(r => r.ctr).reduce((s, r) => s + r.ctr, 0) / rows.filter(r => r.ctr).length
          : null,
        activeCampaignCount: activeCampaigns.length,
        totalCampaignCount: rows.length,
        fetchedAt: data?.[0]?.fetch_date ?? null,
      }

      setState({ loading: false, error: null, rows, summary })
    } catch (e) {
      console.error('useMetaAds:', e)
      setState({ loading: false, error: e, rows: [], summary: null })
    }
  }, [datePreset])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}
