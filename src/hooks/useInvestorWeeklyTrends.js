import { useDailyUpdates, mondayOf } from './useDailyUpdates.js'
import { useAtlasTargets } from './useAtlasTargets.js'
import { getWeekKey, stepWeek } from '../dateUtils.js'
import { closeableHeld } from '../aeFunnel.js'

// =============================================================================
//  useInvestorWeeklyTrends
//
//  The investor-readable backbone for the Weekly department scorecards. Produces
//  8-week trend arrays + latest values from ONLY investor-readable aggregate
//  tables — never raw tables (lineage law):
//    • Weekly metrics ← sum of atlas_daily_updates (Mon–Sun) per week, last 8 wks
//      (ad spend, demos booked/held, closes, new MRR + derived show/close/CPD/ADS)
//    • Monthly metrics ← atlas_targets latest actual + month history sparkline
//      (churn %, NRR, PRs deployed) — these are monthly, surfaced labeled as MTD.
//
//  Output keys mirror INITIAL_TRENDS so WeeklyView can drop them straight in for
//  the WIREABLE tiles. BLOCKED tiles have no key here → they go to Coming Soon.
// =============================================================================

const WEEKS = 8

export function useInvestorWeeklyTrends() {
  const du = useDailyUpdates()
  const at = useAtlasTargets()

  // Last 8 week Mondays, oldest → newest (so .at(-1) is the current week).
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => stepWeek(getWeekKey(), -(WEEKS - 1 - i)))

  const sumWeek = (wk, key) => {
    let s = null
    for (const r of du.days || []) {
      if (mondayOf(r.update_date) !== wk) continue
      if (r[key] != null) s = (s || 0) + Number(r[key])
    }
    return s
  }
  const series = (key) => weekKeys.map((wk) => sumWeek(wk, key) ?? 0)

  const adSpend = series('ad_spend')
  const callsBooked = series('calls_booked')
  const callsHeld = series('calls_held')
  const callsUnq = series('calls_unqualified')
  const dealsClosed = series('deals_closed')
  const mrrAdded = series('mrr_added')

  const showRate = weekKeys.map((_, i) => (callsBooked[i] > 0 ? Math.round((callsHeld[i] / callsBooked[i]) * 100) : 0))
  const closeRate = weekKeys.map((_, i) => {
    const c = closeableHeld(callsHeld[i], callsUnq[i])
    return c > 0 ? Math.round((dealsClosed[i] / c) * 100) : 0
  })
  const costPerDemo = weekKeys.map((_, i) => (callsBooked[i] > 0 ? Math.round(adSpend[i] / callsBooked[i]) : 0))
  const avgDealSize = weekKeys.map((_, i) => (dealsClosed[i] > 0 ? Math.round(mrrAdded[i] / dealsClosed[i]) : 0))

  // Monthly metric → short sparkline of its actuals (oldest→newest), latest last,
  // so a tile's `.at(-1)` is the most recent actual. Empty array = no data yet.
  const monthlySeries = (metricKey) => {
    const hist = (at.getMonthHistory ? at.getMonthHistory(metricKey) : []) || []
    const vals = hist.map((h) => Number(h.actual)).filter((v) => Number.isFinite(v))
    return vals
  }

  // WIREABLE trend arrays, keyed to match INITIAL_TRENDS for drop-in substitution.
  const real = {
    // weekly (atlas_daily_updates)
    totalAdSpend: adSpend,
    demosBooked: callsBooked,
    demosCompleted: callsHeld,
    showRate,
    closeRate,
    newMRR: mrrAdded,
    avgDealSize,
    costPerDemo,
    // monthly (atlas_targets, latest-month actual; sparkline = month history)
    churnRate: monthlySeries('churn-pct'),
    NRR: monthlySeries('net-rev-retention'),
    prsDeployed: monthlySeries('prs-deployed'),
  }

  return {
    loading: du.loading || at.loading,
    weekKeys,
    real,
    // which metric keys are backed by real data (everything else → Coming Soon)
    wiredKeys: Object.keys(real),
  }
}
