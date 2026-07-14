import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useGa4Metrics — reads the GA4 aggregates (ga4_daily_metrics + ga4_daily_events)
//  written by the ga4-sync edge function, for Nick's "Website (GA4)" tab. Reads the
//  tables directly (RLS lets exec/growth_manager read); never hits GA4 live.
//
//  window { from, to } ('YYYY-MM-DD'; `to` optional = today) = the date range to read;
//  aggregates client-side. The Growth tab derives it from the 7/30/90 pills OR a
//  custom date-range picker.
//
//  Returns:
//    channelRows — [{ channel, sessions, activeUsers, keyEvents, rate }] desc by sessions
//    dailyTrend  — [{ date, label, sessions, activeUsers }] asc by date
//    totals      — { sessions, activeUsers, keyEvents, optInRate }
//    optIns      — { voice_clone_optin, imessage_clone_optin, demo_booked } (window sums)
//    hasData     — false until the first sync has populated the tables
//
//  NOTE: activeUsers is a SUM of daily active users over the window — GA4 dedupes
//  users at the range level, so this over-counts vs the GA4 UI range total (it's a
//  scorecard approximation, same treatment as Meta "reach"). Sessions / key events /
//  opt-in counts are additive and match. optInRate is sessions-weighted, so it equals
//  the true overall session-key-event rate: Σ(rate·sessions) / Σ(sessions).
// =============================================================================

const OPT_IN_EVENTS = ['voice_clone_optin', 'imessage_clone_optin', 'demo_booked']

async function fetchGa4(from, to) {
  let metricsQ = supabase.from('ga4_daily_metrics')
    .select('date, channel, sessions, active_users, key_events, session_key_event_rate')
    .gte('date', from)
  let eventsQ = supabase.from('ga4_daily_events')
    .select('date, event_name, event_count')
    .gte('date', from)
  if (to) { metricsQ = metricsQ.lte('date', to); eventsQ = eventsQ.lte('date', to) }
  metricsQ = metricsQ.order('date', { ascending: true })
  eventsQ = eventsQ.order('date', { ascending: true })

  const [{ data: metrics, error: mErr }, { data: events, error: eErr }] = await Promise.all([metricsQ, eventsQ])
  if (mErr) throw mErr
  if (eErr) throw eErr

  // Per-channel rollup + per-day trend.
  const byChannel = new Map()
  const byDay = new Map()
  let sumSessions = 0, sumActive = 0, sumKeyEvents = 0, weightedRate = 0
  for (const r of (metrics || [])) {
    const s = Number(r.sessions) || 0
    const au = Number(r.active_users) || 0
    const ke = Number(r.key_events) || 0
    const rate = Number(r.session_key_event_rate) || 0
    sumSessions += s; sumActive += au; sumKeyEvents += ke; weightedRate += rate * s

    const ch = byChannel.get(r.channel) || { channel: r.channel, sessions: 0, activeUsers: 0, keyEvents: 0, rateWeighted: 0 }
    ch.sessions += s; ch.activeUsers += au; ch.keyEvents += ke; ch.rateWeighted += rate * s
    byChannel.set(r.channel, ch)

    const d = byDay.get(r.date) || { date: r.date, sessions: 0, activeUsers: 0 }
    d.sessions += s; d.activeUsers += au
    byDay.set(r.date, d)
  }

  const channelRows = [...byChannel.values()]
    .map(c => ({ channel: c.channel, sessions: c.sessions, activeUsers: c.activeUsers, keyEvents: c.keyEvents, rate: c.sessions > 0 ? c.rateWeighted / c.sessions : 0 }))
    .sort((a, b) => b.sessions - a.sessions)

  const dailyTrend = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))

  const optIns = { voice_clone_optin: 0, imessage_clone_optin: 0, demo_booked: 0 }
  for (const e of (events || [])) {
    if (e.event_name in optIns) optIns[e.event_name] += Number(e.event_count) || 0
  }

  const totals = {
    sessions: sumSessions,
    activeUsers: sumActive,
    keyEvents: sumKeyEvents,
    optInRate: sumSessions > 0 ? weightedRate / sumSessions : null,
  }

  return { channelRows, dailyTrend, totals, optIns, hasData: (metrics || []).length > 0 }
}

// Accepts an explicit date window { from, to } ('YYYY-MM-DD'; `to` optional = today).
export function useGa4Metrics({ from, to } = {}, refreshKey = 0) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['ga4-metrics', from, to, refreshKey],
    enabled: !!from,
    queryFn: () => fetchGa4(from, to),
  })
  return {
    channelRows: data?.channelRows ?? [],
    dailyTrend: data?.dailyTrend ?? [],
    totals: data?.totals ?? null,
    optIns: data?.optIns ?? { voice_clone_optin: 0, imessage_clone_optin: 0, demo_booked: 0 },
    hasData: data?.hasData ?? false,
    loading: isPending,
    error: error ?? null,
    refresh: refetch,
  }
}

export { OPT_IN_EVENTS }
