import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useStripeDailyCash
//
//  Calls the exec-only `stripe-daily-cash` edge function to get the gross cash
//  collected (succeeded, captured USD charges) on a single Toronto day. Used to
//  pre-fill the Stripe portion of the Daily Update form. The Stripe secret stays
//  server-side; only executives can invoke (the function checks the JWT).
//
//  Resilient: if the function isn't deployed yet, the query errors and the hook
//  returns nulls so the form falls back to a manual Stripe entry.
//
//  Returns: { cash, refunds, net, count, loading, error }
// =============================================================================

export function useStripeDailyCash(date, { enabled = true } = {}) {
  const { data, isPending, error } = useQuery({
    queryKey: ['stripe-daily-cash', date],
    enabled: enabled && !!date,
    staleTime: 5 * 60 * 1000,
    retry: false, // don't hammer if the function isn't deployed
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('stripe-daily-cash', { body: { date } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
  })

  return {
    cash: data?.grossCash ?? null,
    refunds: data?.refunds ?? null,
    net: data?.netCash ?? null,
    count: data?.count ?? null,
    loading: isPending,
    error: error ?? null,
  }
}
