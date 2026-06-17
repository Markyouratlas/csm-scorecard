import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// Reads the most recent synced_at across Meta daily data, for a "last synced" display.
export function useMetaLastSync(refreshKey = 0) {
  const [lastSync, setLastSync] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meta_ads_daily')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
      if (error) throw error
      setLastSync(data && data.length ? data[0].synced_at : null)
    } catch (e) {
      console.error('useMetaLastSync:', e)
      setLastSync(null)
    } finally {
      setLoading(false)
    }
  }, [refreshKey])

  useEffect(() => { load() }, [load])
  return { lastSync, loading, refresh: load }
}
