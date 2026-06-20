import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// Lists every distinct event-type slug ever seen in cal_bookings (via the
// cal_distinct_event_types RPC) merged with the cal_event_type_config table,
// for the tagging panel. Exposes saveType to set a slug's ad-driven flag + label.
async function fetchCalEventTypes() {
  // Distinct slugs + counts. RPC returns the literal '(none)' for the null group.
  const { data: rpcData, error: rpcError } = await supabase.rpc('cal_distinct_event_types')
  if (rpcError) throw rpcError

  // Current config (ad-driven flag + label overrides).
  const { data: cfgData, error: cfgError } = await supabase
    .from('cal_event_type_config')
    .select('slug, label, is_ad_driven')
  if (cfgError) throw cfgError
  const cfgMap = new Map((cfgData || []).map(c => [c.slug, c]))

  return (rpcData || []).map(({ slug, n }) => {
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
}

// Lists every distinct event-type slug ever seen in cal_bookings (via the
// cal_distinct_event_types RPC) merged with the cal_event_type_config table,
// for the tagging panel. Exposes saveType to set a slug's ad-driven flag + label.
export function useCalEventTypes(refreshKey = 0) {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['cal-event-types', refreshKey],
    queryFn: fetchCalEventTypes,
  })

  const saveType = useCallback(async (slug, { isAdDriven, label }) => {
    // Upsert the config row for this slug. Never call for the '(none)' sentinel.
    const row = { slug, is_ad_driven: isAdDriven, updated_at: new Date().toISOString() }
    if (label !== undefined) row.label = label
    const { error: saveErr } = await supabase
      .from('cal_event_type_config')
      .upsert(row, { onConflict: 'slug' })
    if (saveErr) throw saveErr
    // Refresh the tag list. The ad-driven config also drives the paid/organic
    // split in cal bookings, so refresh those caches too.
    await queryClient.invalidateQueries({ queryKey: ['cal-event-types'] })
    queryClient.invalidateQueries({ queryKey: ['cal-bookings'] })
    queryClient.invalidateQueries({ queryKey: ['cal-bookings-by-rep'] })
  }, [queryClient])

  return { types: data ?? [], loading: isPending, error: error ?? null, refresh: refetch, saveType }
}
