import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useDailyUpdatePreview
//
//  Invokes `daily-update-autofill` in PREVIEW mode for a specific date and
//  returns the computed source values (Stripe cash, Cal calls booked, scorecard
//  calls held / deals closed / new customers / ad spend, atlas_targets snapshot)
//  WITHOUT writing anything. This is the single date-aware calc shared with the
//  morning cron, so the exec form can pre-fill ANY selected date — not just today.
//
//  Resilient: if the function isn't deployed yet, the query errors and `computed`
//  stays null, so the form falls back to its today-only client sources.
// =============================================================================

export function useDailyUpdatePreview(date, { enabled = true } = {}) {
  const { data, isPending, error } = useQuery({
    queryKey: ['daily-update-preview', date],
    enabled: enabled && !!date,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-update-autofill', { body: { date, preview: true } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data?.computed ?? {}
    },
  })

  return { computed: data ?? null, loading: isPending, error: error ?? null }
}
