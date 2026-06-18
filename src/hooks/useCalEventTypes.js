import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// Lists every distinct event-type slug ever seen in cal_bookings (via the
// cal_distinct_event_types RPC) merged with the cal_event_type_config table,
// for the tagging panel. Exposes saveType to set a slug's ad-driven flag + label.
export function useCalEventTypes(refreshKey = 0) {
  const [state, setState] = useState({ loading: true, error: null, types: [] })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      // Distinct slugs + counts. RPC returns the literal '(none)' for the null group.
      const { data: rpcData, error: rpcError } = await supabase.rpc('cal_distinct_event_types')
      if (rpcError) throw rpcError

      // Current config (ad-driven flag + label overrides).
      const { data: cfgData, error: cfgError } = await supabase
        .from('cal_event_type_config')
        .select('slug, label, is_ad_driven')
      if (cfgError) throw cfgError
      const cfgMap = new Map((cfgData || []).map(c => [c.slug, c]))

      const types = (rpcData || []).map(({ slug, n }) => {
        // The '(none)' sentinel is the null-slug group — there's no real slug to
        // write, so mark it non-taggable.
        const isNull = slug === '(none)'
        return {
          slug,
          count: Number(n),
          label: cfgMap.get(slug)?.label ?? null,
          isAdDriven: cfgMap.get(slug)?.is_ad_driven ?? false,
          isConfigured: isNull ? true : cfgMap.has(slug),
          isNull,
        }
      }).sort((a, b) => b.count - a.count)

      setState({ loading: false, error: null, types })
    } catch (e) {
      console.error('useCalEventTypes:', e)
      setState({ loading: false, error: e, types: [] })
    }
  }, [refreshKey])

  useEffect(() => { load() }, [load])

  const saveType = useCallback(async (slug, { isAdDriven, label }) => {
    // Upsert the config row for this slug. Never call for the '(none)' sentinel.
    const row = { slug, is_ad_driven: isAdDriven, updated_at: new Date().toISOString() }
    if (label !== undefined) row.label = label
    const { error } = await supabase
      .from('cal_event_type_config')
      .upsert(row, { onConflict: 'slug' })
    if (error) throw error
    await load() // refresh after save
  }, [load])

  return { ...state, refresh: load, saveType }
}
