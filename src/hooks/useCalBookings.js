import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// Friendly labels for known event-type slugs; unknown slugs fall back to the slug itself.
const EVENT_TYPE_LABELS = {
  'intro-to-atlas': 'Intro / Demo',
  'atlas-blue-action-call': 'Atlas Blue Action',
  'channel-partner-intro-call': 'Channel Partner',
  'follow-up-call': 'Follow Up',
}

const AD_DRIVEN_SLUG = 'atlas-blue-action-call'

function labelForSlug(slug) {
  return EVENT_TYPE_LABELS[slug] || slug || 'Unknown'
}

// Reads cal_bookings over a window (by when the booking was MADE) and aggregates
// booked-call counts for the dashboard.
export function useCalBookings(days = 30, refreshKey = 0) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    bookedCalls: 0,
    paidCount: 0,
    organicCount: 0,
    byEventType: [],
    series: [],
    paidSeries: [],
    cancelledCount: 0,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceISO = since.toISOString() // created_at_cal is timestamptz
      // days=0 → today only; since already equals ~now, gte filter handles it.

      const { data, error } = await supabase
        .from('cal_bookings')
        .select('uid, status, event_type_slug, created_at_cal, start_time')
        .gte('created_at_cal', sinceISO)
        .order('created_at_cal', { ascending: false })
        .limit(2000)

      if (error) throw error

      const rows = data || []

      // 1. Total booked calls made in the window.
      const bookedCalls = rows.length

      // 2. Count by event type (friendly label), sorted desc.
      const bySlug = new Map()
      // 3. Count by day (date portion of created_at_cal).
      const byDay = new Map()
      // 3b. Count by day for AD-DRIVEN (paid) rows only — pairs with ad spend.
      const paidByDay = new Map()
      // 4. Cancelled count (informational).
      let cancelledCount = 0
      // 5. Paid (ad-driven) count; organic is the remainder.
      let paidCount = 0

      for (const row of rows) {
        const slug = row.event_type_slug || null
        if (!bySlug.has(slug)) {
          bySlug.set(slug, { slug, label: labelForSlug(slug), count: 0 })
        }
        bySlug.get(slug).count++

        const day = row.created_at_cal ? row.created_at_cal.split('T')[0] : null
        if (day) byDay.set(day, (byDay.get(day) || 0) + 1)

        // Only Atlas Blue action calls are ad-driven; everything else is organic.
        if (slug === AD_DRIVEN_SLUG) {
          paidCount++
          if (day) paidByDay.set(day, (paidByDay.get(day) || 0) + 1)
        }

        if (row.status === 'cancelled') cancelledCount++
      }

      const organicCount = bookedCalls - paidCount

      const byEventType = [...bySlug.values()].sort((a, b) => b.count - a.count)

      const series = [...byDay.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      const paidSeries = [...paidByDay.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setState({ loading: false, error: null, bookedCalls, paidCount, organicCount, byEventType, series, paidSeries, cancelledCount })
    } catch (e) {
      console.error('useCalBookings:', e)
      setState({ loading: false, error: e, bookedCalls: 0, paidCount: 0, organicCount: 0, byEventType: [], series: [], paidSeries: [], cancelledCount: 0 })
    }
  }, [days, refreshKey])

  useEffect(() => { load() }, [load])
  return { ...state, refresh: load }
}
