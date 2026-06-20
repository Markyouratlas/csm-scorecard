import { useRevenueBreakdown } from './useRevenueBreakdown.js'
import { useAtlasTargets } from './useAtlasTargets.js'
import { useWeeklyMrr } from './useWeeklyMrr.js'

// =============================================================================
//  useExecutiveStats — the SINGLE source of truth for the executive hero,
//  shared by the Odyssey view and the Investor (Odyssey Gold) view.
//
//  Resolution precedence per metric (mirrors the original Odyssey hero):
//    1. current-month manual override (atlas_targets, source='manual') → 'edited'
//    2. live value (Stripe via useRevenueBreakdown)                    → 'live'
//    3. most recent stored actual (atlas_targets backfill)             → 'asof'
//    (no value anywhere)                                               → 'none'
//
//  Because it reads the shared ['atlas-targets'] / ['revenue-breakdown'] /
//  ['weekly-mrr'] React Query caches, an edit made in one view shows up in the
//  other instantly — figures are piped, never recomputed separately.
//
//  Returns resolved stat objects { value, status, source, asOfMonth } plus the
//  annual targets, the weekly MRR trajectory, and the manual/stored economics
//  actuals used by the lower "Unit Economics" tiles.
// =============================================================================
export function useExecutiveStats() {
  const rev = useRevenueBreakdown()
  const targets = useAtlasTargets()

  // Live Stripe-derived actuals.
  const liveMrr = rev.totals?.committedContracted || null
  const liveCustomers = liveMrr == null ? null
    : new Set(rev.allSubRecords.filter(r => r.inMrr).map(r => r.stripeCustomerId || r.name)).size
  const liveArpu = (liveMrr != null && liveCustomers) ? liveMrr / liveCustomers : null

  const resolveStat = (metricKey, liveValue) => {
    const cur = targets.getMonthValue(metricKey, targets.currentMonthKey)
    if (cur?.actual != null && cur.source === 'manual') {
      return { value: cur.actual, status: 'edited', source: 'manual', asOfMonth: null }
    }
    if (liveValue != null) {
      return { value: liveValue, status: 'live', source: 'stripe', asOfMonth: null }
    }
    const latest = targets.getLatestActual(metricKey)
    return {
      value: latest?.actual ?? null,
      status: latest?.actual != null ? 'asof' : 'none',
      source: latest?.source ?? null,
      asOfMonth: latest?.monthKey ?? null,
    }
  }

  const mrr = resolveStat('total-mrr', liveMrr)
  const customers = resolveStat('total-customers', liveCustomers)
  const arpu = resolveStat('arpu', liveArpu)

  const currentYear = new Date().getFullYear()
  const mrrAnnualTarget = targets.getAnnualTarget('total-mrr', currentYear)
                       ?? targets.getAnnualTarget('total-mrr', currentYear + 1)
  const customersAnnualTarget = targets.getAnnualTarget('total-customers', currentYear)
                             ?? targets.getAnnualTarget('total-customers', currentYear + 1)

  // Monthly anchors for the weekly trajectory: every total-mrr actual we have.
  const monthlyAnchors = targets.getMonthHistory('total-mrr')
    .filter(h => h.actual != null)
    .map(h => ({ monthKey: h.monthKey, mrr: h.actual }))
  const weeklyMrr = useWeeklyMrr({ monthlyAnchors, liveMrr, weeks: 8 })

  // Manual / stored economics actuals — drive the lower Unit Economics tiles.
  // null where the exec hasn't entered a figure and no integration feeds it.
  const econ = {
    nrr:         targets.getLatestActual('net-rev-retention'),
    grossMargin: targets.getLatestActual('gross-margin'),
    ltvCac:      targets.getLatestActual('ltv-cac'),
    cac:         targets.getLatestActual('cac'),
  }

  return {
    loading: rev.loading || targets.loading,
    mrr, customers, arpu,
    mrrAnnualTarget, customersAnnualTarget,
    weeklyMrr,
    econ,
    targets,
  }
}
