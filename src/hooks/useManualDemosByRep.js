import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

const EMPTY_DEMOS = { rows: [], total: 0 }

async function fetchManualDemosByRep(weekKey) {
  // AE profiles (names + role filter).
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, role_type')
    .is('archived_at', null)
    .eq('role_type', 'account_executive')
  if (pErr) throw pErr
  const aeById = new Map((profiles || []).map(p => [p.id, p]))
  const aeIds = [...aeById.keys()]
  if (aeIds.length === 0) return { rows: [], total: 0 }

  // This week's scorecards for those AEs.
  const { data: cards, error: sErr } = await supabase
    .from('weekly_scorecards')
    .select('user_id, data')
    .eq('week_key', weekKey)
    .in('user_id', aeIds)
  if (sErr) throw sErr

  // Sum data.daily[].demosBooked per AE.
  const byRep = new Map()
  for (const card of (cards || [])) {
    const daily = card.data?.daily || []
    const sum = daily.reduce((s, d) => s + (Number(d?.demosBooked) || 0), 0)
    if (sum > 0 || byRep.has(card.user_id)) {
      byRep.set(card.user_id, (byRep.get(card.user_id) || 0) + sum)
    }
  }

  // Build rows for ALL AEs (so reps who logged 0 still show), name from profile.
  const rows = aeIds.map(id => ({
    name: aeById.get(id)?.name || 'Unknown',
    count: byRep.get(id) || 0,
  })).sort((a, b) => b.count - a.count)

  const total = rows.reduce((s, r) => s + r.count, 0)
  return { rows, total }
}

// Per-AE manually-logged "demos booked" for a scorecard week (Monday YYYY-MM-DD).
// Sums data.daily[].demosBooked per AE, matching useOdysseyMetrics' aggregation.
// Cached per weekKey; idle (no weekKey) reports not-loading with empty rows.
export function useManualDemosByRep(weekKey, refreshKey = 0) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['manual-demos-by-rep', weekKey, refreshKey],
    queryFn: () => fetchManualDemosByRep(weekKey),
    enabled: !!weekKey,
  })
  return { ...(data ?? EMPTY_DEMOS), loading: !!weekKey && isPending, error: error ?? null, refresh: refetch }
}
