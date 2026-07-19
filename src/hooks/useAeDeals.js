import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useAeDeals
//
//  The AE's per-meeting deal records (ae_deals table). Rows are auto-imported
//  from cal_bookings where the AE is the host, then the AE sets the outcome
//  (status), MRR + one-time payment, and notes. The Daily Funnel / Active
//  Pipeline / Closed bucket are all filters over these rows.
//
//  importCalMeetings(weekKey, hostEmail) pulls that week's calendar meetings for
//  the AE and inserts any that aren't already rows (idempotent via the
//  unique(ae_id, booking_uid) index). Only meaningful when viewing your OWN
//  scorecard (RLS requires ae_id = auth.uid()).
// =============================================================================

// Toronto-midnight UTC instant for a Monday 'YYYY-MM-DD' (mirrors useCalBookingsByRep).
function torontoMidnightOfDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const TZ = 'America/Toronto'
  const base = new Date(Date.UTC(y, m - 1, d))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(base).reduce((a, p) => (a[p.type] = p.value, a), {})
  const asTorontoMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  )
  return new Date(base.getTime() + (base.getTime() - asTorontoMs))
}
function torontoNextMonday(dateStr) {
  return new Date(torontoMidnightOfDateStr(dateStr).getTime() + 7 * 24 * 60 * 60 * 1000)
}

export function useAeDeals(aeId) {
  const queryClient = useQueryClient()
  const KEY = ['ae-deals', aeId]

  const { data, isPending, error, refetch } = useQuery({
    queryKey: KEY,
    enabled: !!aeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ae_deals')
        .select('*')
        .eq('ae_id', aeId)
        .order('meeting_at', { ascending: true })
      if (error) {
        console.warn('useAeDeals: ae_deals unavailable (migration not run yet?) —', error.message)
        return []
      }
      return data || []
    },
  })

  const deals = data || []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY })

  // Import this week's Cal.com meetings hosted by the AE into ae_deals. Matches on
  // host_name (the rep's display name = profiles.name), which works whether the AE
  // is viewing their own scorecard or an exec is drilling in. Inserts only meetings
  // that aren't already rows; returns how many were added.
  const importCalMeetings = useCallback(async (weekKey, hostName) => {
    if (!weekKey || !hostName) return 0
    const sinceISO = torontoMidnightOfDateStr(weekKey).toISOString()
    const untilISO = torontoNextMonday(weekKey).toISOString()
    const { data: bookings, error: bErr } = await supabase
      .from('cal_bookings')
      .select('uid, attendee_name, attendee_email, attendee_phone, start_time, event_type_slug, status, host_name')
      .ilike('host_name', hostName)              // host = this AE by display name
      .gte('start_time', sinceISO)
      .lt('start_time', untilISO)
      .neq('status', 'cancelled')
    if (bErr) { console.warn('importCalMeetings: cal_bookings read failed —', bErr.message); return 0 }
    if (!bookings || bookings.length === 0) return 0

    const existing = new Set(deals.filter(d => d.booking_uid).map(d => d.booking_uid))
    const toInsert = bookings
      .filter(b => b.uid && !existing.has(b.uid))
      .map(b => ({
        ae_id: aeId,
        source: 'cal',
        booking_uid: b.uid,
        customer_name: b.attendee_name || null,
        customer_email: b.attendee_email || null,
        customer_phone: b.attendee_phone || null,
        meeting_at: b.start_time || null,
        event_type: b.event_type_slug || null,
        status: 'Scheduled',
      }))
    if (toInsert.length === 0) return 0
    // ignoreDuplicates so a concurrent import can't error on the unique index.
    const { error: insErr } = await supabase
      .from('ae_deals')
      .upsert(toInsert, { onConflict: 'ae_id,booking_uid', ignoreDuplicates: true })
    if (insErr) { console.warn('importCalMeetings: insert failed —', insErr.message); return 0 }
    invalidate()
    return toInsert.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeId, deals])

  const save = useCallback(async (id, patch) => {
    const { error } = await supabase
      .from('ae_deals')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: aeId })
      .eq('id', id)
    if (error) throw error
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeId])

  const addManual = useCallback(async (fields = {}) => {
    const { data: row, error } = await supabase
      .from('ae_deals')
      .insert({ ae_id: aeId, source: 'manual', status: 'Scheduled', ...fields })
      .select()
      .single()
    if (error) throw error
    invalidate()
    return row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeId])

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('ae_deals').delete().eq('id', id)
    if (error) throw error
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live Stripe lookup by email → fill mrr/one_time + matched id (read-only fields).
  // Returns the match payload ({ matched, mrr, one_time, stripe_customer_id, name }).
  const matchStripe = useCallback(async (id, email) => {
    const e = (email || '').trim()
    if (!e) throw new Error('Enter an email to match.')
    const { data, error } = await supabase.functions.invoke('stripe-customer-match', { body: { email: e } })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    const patch = {
      mrr: data?.mrr ?? null,
      one_time: data?.one_time ?? null,
      matched_stripe_customer_id: data?.stripe_customer_id ?? null,
    }
    const deal = deals.find(d => d.id === id)
    // On a successful match, backfill the customer's name + email from Stripe when
    // the deal has none — e.g. manually-added deals or ad/phoneless bookings that
    // arrived without an attendee name. Never overwrite a value the AE already set.
    if (data?.stripe_customer_id) {
      if (data.name && !((deal?.customer_name || '').trim())) patch.customer_name = data.name
      if (!((deal?.customer_email || '').trim())) patch.customer_email = e
    }
    // Default the close/cash date to Stripe's cash-collected date — but never
    // overwrite a date the AE set by hand (closed_at_source === 'manual').
    if (data?.cash_collected_at && deal?.closed_at_source !== 'manual') {
      patch.closed_at = data.cash_collected_at
      patch.closed_at_source = 'stripe'
    }
    await save(id, patch)
    return data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, deals])

  return {
    deals,
    loading: !!aeId && isPending,
    error: error ?? null,
    importCalMeetings,
    save,
    addManual,
    remove,
    matchStripe,
    refresh: refetch,
  }
}
