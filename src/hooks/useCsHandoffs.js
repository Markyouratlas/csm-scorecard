import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// ============================================================================
//  useCsHandoffs(assigneeName)
//
//  "New customers from Sales" — now PER-PERSON. A Closed Won deal auto-creates a
//  fulfillment_clients row (see 28-fulfillment-from-closed-won.sql); an exec/lead
//  assigns it to a CSM or FDE in the Fulfillment view (fulfillment_clients.csm =
//  that person's name). This hook returns the customers assigned to the current
//  user so the CS/FDE hand-off panel shows only THEIR onboarding queue.
//
//  Matches by profile name (fulfillment_clients.csm is a text name populated from
//  the profiles-backed assignee dropdown, so it equals profiles.name). RLS lets
//  any staff read fulfillment_clients; we filter by the assignee here.
// ============================================================================

// Stages that mean onboarding is essentially finished (collapsed in the panel).
const DONE_STAGES = new Set(['ongoing', 'cancelled'])

export function useCsHandoffs(assigneeName) {
  const { data, isPending, error } = useQuery({
    queryKey: ['cs-handoffs', assigneeName || null],
    enabled: !!assigneeName,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fulfillment_clients')
        .select('id, name, poc_email, poc_phone, mrr, stage, csm, ae_deal_id, created_at')
        .eq('csm', assigneeName)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const clients = data || []
  return {
    active: clients.filter((c) => !DONE_STAGES.has(c.stage)),
    done: clients.filter((c) => DONE_STAGES.has(c.stage)),
    loading: !!assigneeName && isPending,
    error: error || null,
  }
}
