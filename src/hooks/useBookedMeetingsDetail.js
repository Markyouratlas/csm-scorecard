import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// Per-booking detail for the Booked Meetings drill-down (customer, host, meeting
// date, sales status, cash/MRR + Stripe products for Closed Won). Reads the
// booked_meetings_detail SECURITY DEFINER rpc (exec + growth_manager) — see
// src/34-booked-meetings-detail.sql. Windowed by created_at_cal over `days`.
export function useBookedMeetingsDetail(days = 56) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, isPending, error } = useQuery({
    queryKey: ['booked-meetings-detail', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('booked_meetings_detail', { p_since: since })
      if (error) throw error
      return data || []
    },
  })
  return { rows: data || [], loading: isPending, error: error ?? null }
}
