import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

const EMPTY = { rows: [], loading: false }

// Per-AE weekly funnel (demos booked/completed/unqualified + closes) for a
// scorecard week (Monday YYYY-MM-DD). Sums weekly_scorecards.data.daily[] per AE,
// matching useOdysseyMetrics' aggregation — so the exec Sales tiles and this
// breakdown always agree. Note: trialSignups (Closes) already reflects the
// close-week bucketing baked into the persisted funnel. Mirrors useManualDemosByRep.
async function fetchDailyFunnelByRep(weekKey) {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name')
    .is('archived_at', null)
    .eq('role_type', 'account_executive')
  if (pErr) throw pErr
  const aeById = new Map((profiles || []).map(p => [p.id, p]))
  const aeIds = [...aeById.keys()]
  if (aeIds.length === 0) return { rows: [] }

  const { data: cards, error: sErr } = await supabase
    .from('weekly_scorecards')
    .select('user_id, data')
    .eq('week_key', weekKey)
    .in('user_id', aeIds)
  if (sErr) throw sErr

  const byRep = new Map()
  for (const card of (cards || [])) {
    const daily = card.data?.daily || []
    const agg = daily.reduce((a, d) => ({
      demosBooked: a.demosBooked + (Number(d?.demosBooked) || 0),
      demosCompleted: a.demosCompleted + (Number(d?.demosCompleted) || 0),
      demosUnqualified: a.demosUnqualified + (Number(d?.demosUnqualified) || 0),
      trialSignups: a.trialSignups + (Number(d?.trialSignups) || 0),
    }), { demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0 })
    byRep.set(card.user_id, agg)
  }

  const rows = aeIds.map(id => {
    const a = byRep.get(id) || { demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0 }
    return { name: aeById.get(id)?.name || 'Unknown', ...a }
  })
  return { rows }
}

export function useDailyFunnelByRep(weekKey, refreshKey = 0) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['daily-funnel-by-rep', weekKey, refreshKey],
    queryFn: () => fetchDailyFunnelByRep(weekKey),
    enabled: !!weekKey,
  })
  return { ...(data ?? EMPTY), loading: !!weekKey && isPending, error: error ?? null, refresh: refetch }
}
