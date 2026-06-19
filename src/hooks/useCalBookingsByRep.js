import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// Toronto-midnight UTC instant for a Monday 'YYYY-MM-DD' (mirrors useCalBookings).
function torontoMidnightOfDateStr(dateStr) {
  if (!dateStr) return null
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
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second)
  )
  const offsetMs = base.getTime() - asTorontoMs
  return new Date(base.getTime() + offsetMs)
}

// Exclusive upper bound = Monday 00:00 Toronto of the FOLLOWING week.
function torontoNextMondayOfDateStr(dateStr) {
  const mon = torontoMidnightOfDateStr(dateStr)
  if (!mon) return null
  return new Date(mon.getTime() + 7 * 24 * 60 * 60 * 1000)
}

// Per-host Cal bookings for a scorecard week (Monday YYYY-MM-DD), windowed
// Monday→now in Toronto to match useCalBookings. Splits paid vs organic using
// cal_event_type_config (ad-driven slugs). `filter` ('all'|'paid'|'organic')
// narrows to a subset; each host row carries a `meetings` array for drill-down.
export function useCalBookingsByRep(weekKey, filter = 'all', dateField = 'created', refreshKey = 0) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], total: 0 })

  const load = useCallback(async () => {
    if (!weekKey) { setState({ loading: false, error: null, rows: [], total: 0 }); return }
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const scheduled = dateField === 'scheduled'
      const filterCol = scheduled ? 'start_time' : 'created_at_cal'
      const since = torontoMidnightOfDateStr(weekKey)
      const sinceISO = since.toISOString()
      const untilISO = scheduled ? torontoNextMondayOfDateStr(weekKey).toISOString() : null

      // Ad-driven slugs from config (for paid/organic split per host).
      const { data: cfgData, error: cfgError } = await supabase
        .from('cal_event_type_config')
        .select('slug, label, is_ad_driven')
      if (cfgError) throw cfgError
      const adDrivenSet = new Set((cfgData || []).filter(c => c.is_ad_driven).map(c => c.slug))
      const cfgLabel = new Map((cfgData || []).map(c => [c.slug, c.label]))

      // Bookings made this week.
      let q = supabase
        .from('cal_bookings')
        .select('uid, host_name, host_email, attendee_name, event_type_slug, created_at_cal, start_time, status')
        .gte(filterCol, sinceISO)
      if (untilISO) q = q.lt(filterCol, untilISO)
      q = q.order('created_at_cal', { ascending: false }).limit(2000)
      const { data, error } = await q
      if (error) throw error

      // Group by host; track total / paid / organic + individual meetings.
      const byHost = new Map()
      for (const b of (data || [])) {
        const isPaid = adDrivenSet.has(b.event_type_slug)
        // Apply the filter — skip bookings outside the requested subset.
        if (filter === 'paid' && !isPaid) continue
        if (filter === 'organic' && isPaid) continue

        const name = b.host_name || b.host_email || 'Unknown'
        if (!byHost.has(name)) byHost.set(name, { name, count: 0, paid: 0, organic: 0, meetings: [] })
        const h = byHost.get(name)
        h.count++
        if (isPaid) h.paid++
        else h.organic++
        h.meetings.push({
          uid: b.uid,
          customer: b.attendee_name || '(no name)',
          date: scheduled ? b.start_time : b.created_at_cal, // ISO; UI formats (start_time in scheduled mode)
          eventType: b.event_type_slug || '(none)',
          eventLabel: cfgLabel.get(b.event_type_slug) || b.event_type_slug || '(none)',
          status: b.status || null,
          isPaid,
        })
      }

      // Sort each host's meetings newest-first.
      for (const h of byHost.values()) {
        h.meetings.sort((a, b) => String(b.date).localeCompare(String(a.date)))
      }

      const rows = [...byHost.values()].sort((a, b) => b.count - a.count)
      const total = rows.reduce((s, r) => s + r.count, 0)
      setState({ loading: false, error: null, rows, total })
    } catch (e) {
      console.error('useCalBookingsByRep:', e)
      setState({ loading: false, error: e, rows: [], total: 0 })
    }
  }, [weekKey, filter, dateField, refreshKey])

  useEffect(() => { load() }, [load])
  return { ...state, refresh: load }
}
