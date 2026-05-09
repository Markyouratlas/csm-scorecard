import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'
import { getWeekKey, businessDaysBetween } from '../dateUtils.js'
import { weekKeysInMonth, getMonthKey } from '../useMtd.js'
import { customerTtfv, avgTtfv } from '../constants.js'

// =============================================================================
//  useExecutiveMetrics
//
//  One hook, one source of truth. Returns the full executive view of the team's
//  performance — pulled from existing weekly_scorecards + cancellations data.
//
//  This phase wires up everything we can compute from data the team is already
//  entering. External-API-dependent metrics (Stripe MRR, GA4 visitors, etc.)
//  are returned as nulls — the dashboard renders them as "Awaiting <provider> keys"
//  placeholders.
//
//  Design notes:
//    - Fetches ONCE on mount + when refreshKey changes. Multi-week aggregation is
//      not cheap; we don't want to re-fetch on every render.
//    - Returns a flat `metrics` object plus `meta` describing data freshness.
//    - All metrics handle the "no data yet" case gracefully — return null, not
//      zero, so the UI can distinguish "no data" from "literally zero".
//
//  Usage in LeadershipDashboardView:
//    const { metrics, loading, error, refresh } = useExecutiveMetrics()
//    {loading ? <Skeleton /> : <Tile value={metrics.cs.activationRate} />}
// =============================================================================

export function useExecutiveMetrics() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    metrics: null,
    meta: null,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      // Step 1: pull the active team — non-archived profiles.
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .is('archived_at', null)
      if (pErr) throw pErr

      // Step 2: figure out which weeks we need to scan.
      // Strategy: current week (for "this week" rollups) + all weeks in current
      // month (for "this month" rollups). De-duplicated.
      const thisWeek = getWeekKey()
      const monthKey = getMonthKey()
      const monthWeeks = weekKeysInMonth(monthKey)
      const allWeekKeys = Array.from(new Set([thisWeek, ...monthWeeks]))

      // Step 3: pull every weekly scorecard for those weeks across the team.
      // One query, indexed by (week_key, user_id), should be cheap.
      const { data: scorecards, error: sErr } = await supabase
        .from('weekly_scorecards')
        .select('*')
        .in('week_key', allWeekKeys)
      if (sErr) throw sErr

      // Step 4: pull team-wide cancellations (no time filter — we'll bucket
      // them in JS since the table is small and bucketing is cheap).
      const memberIds = (profiles || []).map(p => p.id)
      let cancellations = []
      if (memberIds.length) {
        const { data: cancels, error: cErr } = await supabase
          .from('cancellations')
          .select('*')
          .in('csm_id', memberIds)
        if (cErr) throw cErr
        cancellations = cancels || []
      }

      // Step 5: aggregate.
      const metrics = aggregate({
        profiles: profiles || [],
        scorecards: scorecards || [],
        cancellations,
        thisWeek,
        monthWeeks,
      })

      setState({
        loading: false,
        error: null,
        metrics,
        meta: {
          memberCount: (profiles || []).length,
          thisWeek,
          monthKey,
          fetchedAt: new Date(),
        },
      })
    } catch (e) {
      console.error('useExecutiveMetrics:', e)
      setState({ loading: false, error: e, metrics: null, meta: null })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}

// =============================================================================
//  Aggregation — pure functions, easy to test.
// =============================================================================

function aggregate({ profiles, scorecards, cancellations, thisWeek, monthWeeks }) {
  // Build a (userId -> profile) lookup so we can attribute scorecard data to roles.
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))

  // Group scorecards: by-user per week, plus a flat list for this-week vs this-month.
  const thisWeekCards = scorecards.filter(s => s.week_key === thisWeek)
  const thisMonthCards = scorecards.filter(s => monthWeeks.includes(s.week_key))

  // Helper: filter cards to a specific role.
  const cardsByRole = (cards, roleType) =>
    cards.filter(c => profileById[c.user_id]?.role_type === roleType)

  return {
    cs: aggregateCs({ thisWeekCards, thisMonthCards, cancellations, profileById, profiles, cardsByRole }),
    sales: aggregateSales({ thisWeekCards, thisMonthCards, cardsByRole }),
    marketing: aggregateMarketing({ thisWeekCards, cardsByRole }),
    product: aggregateProduct({ thisWeekCards, cardsByRole }),
    growth: aggregateGrowth({ thisWeekCards, cardsByRole }),
    revenue: aggregateRevenue({ thisMonthCards, cardsByRole }),
  }
}

// ----- Customer Success ------------------------------------------------------
function aggregateCs({ thisWeekCards, thisMonthCards, cancellations, profileById, profiles, cardsByRole }) {
  // Time-to-First-Value: pull every CSM's ttfvCustomers from THIS WEEK's cards
  // and average them. (Customers carry over week-to-week; latest snapshot is
  // the source of truth.)
  const csmCards = cardsByRole(thisWeekCards, 'csm')
  const allCustomers = csmCards.flatMap(c => c.data?.ttfvCustomers || [])
  const validCustomers = allCustomers.filter(c => c.name && c.name.trim() && customerTtfv(c) > 0)
  const avgTtfvDays = validCustomers.length ? avgTtfv(validCustomers) : null

  // Implementations completed this month: count Implementation specialists'
  // projects where status === 'done'. Projects live inside the weekly card.data.
  const implCardsMonth = cardsByRole(thisMonthCards, 'implementation')
  // De-dupe projects across weeks by id (a project appears in many weekly cards).
  const allProjects = new Map()
  for (const card of implCardsMonth) {
    for (const p of (card.data?.projects || [])) {
      if (p.id) allProjects.set(p.id, p)
    }
  }
  const completedImplementations = [...allProjects.values()].filter(p => p.status === 'done').length

  // On-time activation %: of projects with full SLA data (infoReceivedDate +
  // activatedDate set), what fraction hit the 2-business-day SLA. Matches the
  // SLA computation in ImplementationView. We're conservative: only count
  // `done` projects (in-flight ones aren't "activations" yet).
  const slaProjects = [...allProjects.values()].filter(p =>
    p.status === 'done' && p.infoReceivedDate && p.activatedDate
  )
  const slaResults = slaProjects.map(p => {
    const days = businessDaysBetween(p.infoReceivedDate, p.activatedDate)
    return { onTime: days !== null && days <= 2 }
  })
  const onTimeCount = slaResults.filter(r => r.onTime).length
  const onTimeActivationPct = slaResults.length
    ? Math.round((onTimeCount / slaResults.length) * 100)
    : null

  // Tickets resolved this week: sum of daily.completed for both Implementation
  // and Support roles.
  const implWeek = cardsByRole(thisWeekCards, 'implementation')
  const supportWeek = cardsByRole(thisWeekCards, 'support')
  const implCompleted = sumOverDailies(implWeek, 'completed')
  const supportCompleted = sumOverDailies(supportWeek, 'ticketsClosed')
  const ticketsResolvedWeek = implCompleted + supportCompleted

  // Churn this month: count cancellations whose cancelled_date falls in this month.
  const monthStart = startOfMonth(new Date())
  const cancelledThisMonth = cancellations.filter(c =>
    c.cancelled_date && new Date(c.cancelled_date + 'T00:00:00') >= monthStart
  )
  const mrrLostThisMonth = cancelledThisMonth.reduce((s, c) => s + (Number(c.monthly_amount) || 0), 0)

  return {
    avgTtfvDays,                      // number | null — days
    completedImplementations,         // number — count this month
    onTimeActivationPct,              // 0-100 | null
    ticketsResolvedWeek,              // number — count this week
    cancellationsThisMonth: cancelledThisMonth.length,
    mrrLostThisMonth,                 // number — dollars
    // Churn rate calculation requires Stripe customer count — left as null.
    churnRatePct: null,
  }
}

// ----- Sales (AE) ------------------------------------------------------------
function aggregateSales({ thisWeekCards, thisMonthCards, cardsByRole }) {
  const aeWeek = cardsByRole(thisWeekCards, 'account_executive')
  const aeMonth = cardsByRole(thisMonthCards, 'account_executive')

  const demosBookedWeek = sumOverDailies(aeWeek, 'demosBooked')
  const demosCompletedWeek = sumOverDailies(aeWeek, 'demosCompleted')
  const showUpRatePct = demosBookedWeek
    ? Math.round((demosCompletedWeek / demosBookedWeek) * 100)
    : null

  // De-dupe deals across the month (a deal appears in many weekly cards).
  const allDeals = new Map()
  for (const card of aeMonth) {
    for (const d of (card.data?.deals || [])) {
      if (d.id) allDeals.set(d.id, d)
    }
  }
  const wonDeals = [...allDeals.values()].filter(d => d.stage === 'Won')
  const newMrrClosedMonth = wonDeals.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const avgDealSize = wonDeals.length
    ? Math.round(wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0) / wonDeals.length)
    : null

  // Close rate this month: won / (won + lost).
  const lostDeals = [...allDeals.values()].filter(d => d.stage === 'Lost')
  const decided = wonDeals.length + lostDeals.length
  const closeRatePct = decided ? Math.round((wonDeals.length / decided) * 100) : null

  return {
    demosBookedWeek,
    showUpRatePct,
    closeRatePct,
    avgDealSize,
    newMrrClosedMonth,
  }
}

// ----- Marketing (Growth + Ad Strategist) ------------------------------------
function aggregateMarketing({ thisWeekCards, cardsByRole }) {
  const growthWeek = cardsByRole(thisWeekCards, 'growth_manager')
  const adWeek = cardsByRole(thisWeekCards, 'ad_strategist')

  const totalAdSpend = sumOverDailies(growthWeek, 'adSpend') + sumOverDailies(adWeek, 'adSpend')
  const websiteVisitors = sumOverDailies(growthWeek, 'websiteVisitors') + sumOverDailies(adWeek, 'websiteVisitors')
  const optins = sumOverDailies(growthWeek, 'optins') + sumOverDailies(adWeek, 'optins')
  const organicLeads = sumOverDailies(growthWeek, 'organicLeads')
  const paidAdLeads = sumOverDailies(growthWeek, 'leads') + sumOverDailies(adWeek, 'leads')

  const optInRatePct = websiteVisitors
    ? Math.round((optins / websiteVisitors) * 1000) / 10  // 1 decimal
    : null
  const costPerLead = paidAdLeads
    ? Math.round((totalAdSpend / paidAdLeads) * 100) / 100
    : null

  return {
    totalAdSpend,
    websiteVisitors,
    organicLeads,
    paidAdLeads,
    optInRatePct,
    costPerLead,
  }
}

// ----- Product (Engineering) -------------------------------------------------
function aggregateProduct({ thisWeekCards, cardsByRole }) {
  const engWeek = cardsByRole(thisWeekCards, 'engineer')
  // Engineer scorecards have prsMerged + bugsIntroduced as week-level fields.
  const prsDeployedWeek = engWeek.reduce((s, c) => s + (Number(c.data?.prsMerged) || 0), 0)
  const newBugsWeek = engWeek.reduce((s, c) => s + (Number(c.data?.bugsIntroduced) || 0), 0)

  // Engineering velocity: total bullets across all themes (a rough throughput proxy).
  const velocityBullets = engWeek.reduce((s, c) => {
    const themes = c.data?.themes || []
    return s + themes.reduce((t, theme) => t + (theme.bullets?.length || 0), 0)
  }, 0)

  return {
    prsDeployedWeek,
    newBugsWeek,
    velocityBullets,
  }
}

// ----- Growth (Trials + Pipeline) --------------------------------------------
function aggregateGrowth({ thisWeekCards, cardsByRole }) {
  const aeWeek = cardsByRole(thisWeekCards, 'account_executive')
  const growthWeek = cardsByRole(thisWeekCards, 'growth_manager')

  const trialsStartedWeek =
    sumOverDailies(aeWeek, 'trialSignups') +
    sumOverDailies(growthWeek, 'trialSignups')

  return {
    trialsStartedWeek,
    // Trial → Paid conversion + activation rate need Amplitude — left as null.
    trialToPaidPct: null,
    userActivationRatePct: null,
    partnerPipeline: null,
  }
}

// ----- Revenue (mostly external-API; some MRR can be derived from won deals) -
function aggregateRevenue({ thisMonthCards, cardsByRole }) {
  // We don't have Stripe yet, but new MRR closed by AEs this month is a real
  // (partial) signal of revenue motion. The rest stays null until Stripe lands.
  const aeMonth = cardsByRole(thisMonthCards, 'account_executive')
  const allDeals = new Map()
  for (const card of aeMonth) {
    for (const d of (card.data?.deals || [])) if (d.id) allDeals.set(d.id, d)
  }
  const wonDeals = [...allDeals.values()].filter(d => d.stage === 'Won')
  const newMrrClosedMonth = wonDeals.reduce((s, d) => s + (Number(d.mrr) || 0), 0)

  return {
    newMrrClosedMonth,        // partial: this is "new MRR signed", not "Total MRR"
    totalMrr: null,           // Stripe
    customers: null,          // Stripe
    arpu: null,               // Stripe
    grossMarginPct: null,     // requires costs data
    cac: null,                // requires Stripe + ad spend math
    ltvCacRatio: null,        // ProfitWell
    cacPaybackMonths: null,   // ProfitWell
    nrrPct: null,             // ProfitWell
  }
}

// =============================================================================
//  Helpers
// =============================================================================

// Sum a single daily field across a list of weekly scorecards.
// Each card.data has { daily: [day0, day1, ..., day6] } where each day has
// the field as a number. Defensive against missing data.
function sumOverDailies(cards, fieldName) {
  let total = 0
  for (const card of cards) {
    const daily = card.data?.daily || []
    for (const day of daily) {
      total += Number(day?.[fieldName]) || 0
    }
  }
  return total
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
