import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useCsHandoffs
//
//  The Sales → CS/FDE hand-off queue. When an AE marks an ae_deals row
//  'Closed Won', it surfaces here as a callable new-customer contact for every
//  CSM + FDE (shared queue). RLS ("CS and FDE read Closed Won ae_deals") scopes
//  the read to Closed Won rows only; the mark_cs_onboarded() rpc is the only way
//  CS/FDE can write (it toggles just the onboarded flag — never sales fields).
//
//  Returns { active, onboarded } split on cs_onboarded_at, each newest-first,
//  with the closing AE's name resolved best-effort. markOnboarded(id, done)
//  toggles a contact between the two lists.
// =============================================================================

export function useCsHandoffs() {
  const queryClient = useQueryClient()
  const KEY = ['cs-handoffs']

  const { data, isPending, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: deals, error: dErr } = await supabase
        .from('ae_deals')
        .select('id, customer_name, customer_phone, customer_email, mrr, meeting_at, ae_id, status, cs_onboarded_at, cs_onboarded_by')
        .eq('status', 'Closed Won')
        .order('meeting_at', { ascending: false })
      if (dErr) {
        console.warn('useCsHandoffs: ae_deals read failed (migration not run / no access?) —', dErr.message)
        return []
      }
      const rows = deals || []

      // Resolve AE (and onboarder) names best-effort — degrade gracefully if
      // profiles aren't readable for this role.
      const ids = [...new Set(rows.flatMap(d => [d.ae_id, d.cs_onboarded_by]).filter(Boolean))]
      let names = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids)
        names = Object.fromEntries((profs || []).map(p => [p.id, p.name]))
      }
      return rows.map(d => ({
        ...d,
        ae_name: names[d.ae_id] || null,
        onboarded_by_name: names[d.cs_onboarded_by] || null,
      }))
    },
  })

  const rows = data || []
  const active = rows.filter(d => !d.cs_onboarded_at)
  const onboarded = rows.filter(d => d.cs_onboarded_at)

  const markOnboarded = useCallback(async (id, done = true) => {
    const { error } = await supabase.rpc('mark_cs_onboarded', { p_deal_id: id, p_done: done })
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: KEY })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    active,
    onboarded,
    loading: isPending,
    error: error ?? null,
    markOnboarded,
    refresh: refetch,
  }
}
