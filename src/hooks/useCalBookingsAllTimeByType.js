import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// All-time booked-meeting counts per event-type slug (test bookings excluded),
// via the cal_bookings_alltime_by_type SECURITY DEFINER rpc (exec + growth_manager).
// See src/36-cal-bookings-alltime-by-type.sql. Powers the Booked Meetings tab's
// "All-Time" hero cards.
export function useCalBookingsAllTimeByType() {
  const { data, isPending, error } = useQuery({
    queryKey: ['cal-bookings-alltime-by-type'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cal_bookings_alltime_by_type')
      if (error) throw error
      return data || []
    },
  })
  const bySlug = {}
  for (const r of data || []) bySlug[r.event_type_slug ?? '(none)'] = Number(r.n) || 0
  const total = Object.values(bySlug).reduce((a, b) => a + b, 0)
  return { bySlug, total, loading: isPending, error: error ?? null }
}
