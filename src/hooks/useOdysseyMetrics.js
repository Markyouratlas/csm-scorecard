import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'
import { recentWeekKeys } from '../dateUtils.js'

// =============================================================================
//  useOdysseyMetrics
//
//  Fetches the full data set the Odyssey tab needs to render the prototype's
//  layout with REAL numbers:
//    - today      → today's daily totals across roles (using daily[dayIdx])
//    - thisWeek   → this week's roll-ups (sum of daily entries)
//    - thisMonth  → this month's roll-ups
//    - trends     → 8-week history per metric, for sparklines
//    - monthly    → monthly snapshot (for derived ARPU/CAC etc.) — mostly null until Stripe
//    - awaiting   → map of which metric keys are awaiting external integration
//
//  The data shape mirrors what AtlasOdysseyPrototype expects via DataContext,
//  so we can render the same components with the same conventions.
//
//  Returns null values (not zeros) wherever data is genuinely missing — the UI
//  uses null to mean "Awaiting" and 0 to mean "literally zero this period".
// =============================================================================

const TODAY_DAY_INDEX = (() => {
  // 0 = Sunday in JS, but our scorecards use 0=Sun .. 6=Sat too (matches getDay)
  return new Date().getDay()
})()

async function fetchOdysseyMetrics() {
  // ---- Fetch team profiles ----
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .is('archived_at', null)
  if (pErr) throw pErr

  // ---- Fetch the last 8 weeks of scorecards for sparkline history ----
  const weekKeys = recentWeekKeys(8)
  const { data: scorecards, error: sErr } = await supabase
    .from('weekly_scorecards')
    .select('*')
    .in('week_key', weekKeys)
  if (sErr) throw sErr

  // ---- Fetch cancellations (small table) for churn metrics ----
  const memberIds = (profiles || []).map(p => p.id)
  let cancellations = []
  if (memberIds.length) {
    const { data: cancels } = await supabase
      .from('cancellations')
      .select('*')
      .in('csm_id', memberIds)
    cancellations = cancels || []
  }

  // ---- Aggregate ----
  const result = aggregate({
    profiles: profiles || [],
    scorecards: scorecards || [],
    cancellations,
    weekKeys,
  })

  return {
    ...result,
    meta: {
      memberCount: (profiles || []).length,
      weekKeys,
      fetchedAt: new Date(),
    },
  }
}

export function useOdysseyMetrics() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['odyssey-metrics'],
    queryFn: fetchOdysseyMetrics,
  })
  return {
    today: data?.today ?? null,
    thisWeek: data?.thisWeek ?? null,
    thisMonth: data?.thisMonth ?? null,
    trends: data?.trends ?? null,
    monthly: data?.monthly ?? null,
    awaiting: data?.awaiting ?? null,
    meta: data?.meta ?? null,
    loading: isPending,
    error: error ?? null,
    refresh: refetch,
  }
}

// =============================================================================
//  Aggregation
// =============================================================================

function aggregate({ profiles, scorecards, cancellations, weekKeys }) {
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))
  const cardsByWeekRole = (weekKey, roleType) =>
    scorecards.filter(c =>
      c.week_key === weekKey &&
      profileById[c.user_id]?.role_type === roleType
    )

  const currentWeek = weekKeys[weekKeys.length - 1]

  // ---- Per-week aggregates for sparkline history ----
  // For each metric we care about we produce an 8-element array.
  const weekTotals = {
    // Sales / AE
    demosBooked: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'account_executive'), 'demosBooked')),
    demosCompleted: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'account_executive'), 'demosCompleted')),
    demosUnqualified: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'account_executive'), 'demosUnqualified')),
    trialSignups: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'account_executive'), 'trialSignups')),

    // Marketing / Growth
    websiteVisitors: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'growth_manager'), 'websiteVisitors')),
    organicLeads: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'growth_manager'), 'organicLeads')),
    paidLeads: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'growth_manager'), 'leads')),
    optins: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'growth_manager'), 'optins')),
    growthAdSpend: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'growth_manager'), 'adSpend')),

    // Ad Strategist
    adAdSpend: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'ad_strategist'), 'adSpend')),
    adClicks: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'ad_strategist'), 'clicks')),
    adImpressions: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'ad_strategist'), 'impressions')),
    adLeads: weekKeys.map(wk => sumDaily(cardsByWeekRole(wk, 'ad_strategist'), 'leads')),

    // Engineering
    prsMerged: weekKeys.map(wk =>
      cardsByWeekRole(wk, 'engineer').reduce((s, c) => s + (Number(c.data?.prsMerged) || 0), 0)
    ),
    prsDeployed: weekKeys.map(wk =>
      cardsByWeekRole(wk, 'engineer').reduce((s, c) => s + (Number(c.data?.prsDeployed) || 0), 0)
    ),
    newBugs: weekKeys.map(wk =>
      cardsByWeekRole(wk, 'engineer').reduce((s, c) => s + (Number(c.data?.bugsIntroduced) || 0), 0)
    ),
  }

  // Derived: total ad spend = growth + ad strategist combined
  weekTotals.totalAdSpend = weekKeys.map((_, i) =>
    (weekTotals.growthAdSpend[i] || 0) + (weekTotals.adAdSpend[i] || 0)
  )

  // Derived: show rate, close rate (per week)
  weekTotals.showRate = weekKeys.map((_, i) => {
    const b = weekTotals.demosBooked[i]
    const c = weekTotals.demosCompleted[i]
    return b > 0 ? Math.round((c / b) * 100) : null
  })
  // Close rate denominator excludes unqualified demos (showed but not a fit).
  weekTotals.closeRate = weekKeys.map((_, i) => {
    const closeable = weekTotals.demosCompleted[i] - (weekTotals.demosUnqualified[i] || 0)
    const t = weekTotals.trialSignups[i]
    return closeable > 0 ? Math.round((t / closeable) * 100) : null
  })

  // Derived: cost per lead, cost per demo
  weekTotals.costPerLead = weekKeys.map((_, i) => {
    const spend = weekTotals.totalAdSpend[i]
    const leads = (weekTotals.paidLeads[i] || 0) + (weekTotals.adLeads[i] || 0)
    return leads > 0 ? Math.round(spend / leads) : null
  })

  // Opt-in rate as percentage of visitors
  weekTotals.optInRate = weekKeys.map((_, i) => {
    const visitors = weekTotals.websiteVisitors[i]
    const opts = weekTotals.optins[i] || 0
    return visitors > 0 ? Number(((opts / visitors) * 100).toFixed(1)) : null
  })

  // ---- TODAY (current day-of-week index, this week only) ----
  const todayCards = scorecards.filter(c => c.week_key === currentWeek)
  const aeToday = todayCards.filter(c => profileById[c.user_id]?.role_type === 'account_executive')
  const growthToday = todayCards.filter(c => profileById[c.user_id]?.role_type === 'growth_manager')
  const adToday = todayCards.filter(c => profileById[c.user_id]?.role_type === 'ad_strategist')

  const dayIdx = TODAY_DAY_INDEX
  const today = {
    // Sales · AE
    callsBookedToday: sumDailyAtDay(aeToday, dayIdx, 'demosBooked'),
    callsHeldToday: sumDailyAtDay(aeToday, dayIdx, 'demosCompleted'),
    unqualifiedToday: sumDailyAtDay(aeToday, dayIdx, 'demosUnqualified'),
    noShowsToday: Math.max(0,
      sumDailyAtDay(aeToday, dayIdx, 'demosBooked') - sumDailyAtDay(aeToday, dayIdx, 'demosCompleted')
    ),
    customersClosedToday: sumDailyAtDay(aeToday, dayIdx, 'trialSignups'),
    newMRRToday: null, // requires deal-level MRR per day — not tracked daily

    // Sales · SDR (not a separate role yet)
    demosBookedToday: sumDailyAtDay(aeToday, dayIdx, 'demosBooked'),
    callsBookedToday2: null,

    // Marketing Manager (Growth)
    adSpendToday:
      sumDailyAtDay(growthToday, dayIdx, 'adSpend') +
      sumDailyAtDay(adToday, dayIdx, 'adSpend'),
    cpcToday: null, // derived from impressions/clicks
    paidLeadsToday:
      sumDailyAtDay(growthToday, dayIdx, 'leads') +
      sumDailyAtDay(adToday, dayIdx, 'leads'),
    organicLeadsToday: sumDailyAtDay(growthToday, dayIdx, 'organicLeads'),
    websiteVisitorsToday: sumDailyAtDay(growthToday, dayIdx, 'websiteVisitors'),

    // CS Manager — daily not tracked at this granularity
    onTimeActivationsToday: null,
    lateActivationsToday: null,
    implementationsToday: null,
    churnEventsToday: null,
    churnMRRToday: null,

    // Support Lead — daily not tracked
    ticketsResolvedToday: null,

    // Engineering Lead — daily not tracked
    prsDeployedToday: null,
    newBugsToday: null,

    // Growth / Ops — trials are now in trialSignups (renamed "Closes")
    trialsStartedToday: sumDailyAtDay(growthToday, dayIdx, 'trialSignups'),
    trialActivationsToday: null,

    // Channel Partnership — not tracked yet
    partnerOppsToday: null,
    partnerCallsToday: null,
    partnerPipelineAdded: null,
    partnerPipeline: null,

    // Stripe-dependent
    cashCollectedToday: null,
    positiveCashToday: null,
    mrrCurrent: null,
    mrrTarget: null,
    arpu: null,
  }

  // Derived: show rate today, close rate today
  today.showRateToday = today.callsBookedToday > 0
    ? Math.round((today.callsHeldToday / today.callsBookedToday) * 100)
    : 0
  const closeableHeldToday = today.callsHeldToday - today.unqualifiedToday
  today.closeRateToday = closeableHeldToday > 0
    ? Math.round((today.customersClosedToday / closeableHeldToday) * 100)
    : 0

  // CPC today: derived from ad strategist impressions/clicks if available
  const adClicksToday = sumDailyAtDay(adToday, dayIdx, 'clicks')
  today.cpcToday = adClicksToday > 0
    ? Number((today.adSpendToday / adClicksToday).toFixed(2))
    : null

  // ---- TRENDS (8-week arrays for sparklines) ----
  // Convert null entries to 0 for visualization (or keep nulls explicit).
  // Sparklines need numeric arrays. We use 0 for missing weeks.
  const sanitize = (arr) => arr.map(v => v == null ? 0 : Number(v))
  const trends = {
    demosBooked: sanitize(weekTotals.demosBooked),
    showRate: sanitize(weekTotals.showRate),
    demosCompleted: sanitize(weekTotals.demosCompleted),
    closeRate: sanitize(weekTotals.closeRate),
    organicLeads: sanitize(weekTotals.organicLeads),
    paidLeads: sanitize(weekTotals.paidLeads),
    websiteVisitors: sanitize(weekTotals.websiteVisitors),
    optInRate: sanitize(weekTotals.optInRate),
    costPerLead: sanitize(weekTotals.costPerLead),
    totalAdSpend: sanitize(weekTotals.totalAdSpend),
    prsDeployed: sanitize(weekTotals.prsDeployed),
    newBugs: sanitize(weekTotals.newBugs),

    // These remain placeholders since their data sources don't exist yet —
    // Odyssey will mark them as awaiting.
    avgDealSize: [],
    newMRR: [],
    churnRate: [],
    NRR: [],
    onTimeActivation: [],
    ticketsResolved: [],
    implementations: [],
    timeToValue: [],
    userAdoption: [],
    trialsStarted: sanitize(weekTotals.trialSignups),
    trialToPaid: [],
    activationRate: [],
    totalMRR: [],
    totalCustomers: [],
    costPerDemo: [], // could derive but rarely meaningful
    CAC: [],
  }

  // ---- THIS WEEK rollups (sum of daily entries this week + week-level fields) ----
  const thisWeek = {
    demosBookedWeek: trends.demosBooked[trends.demosBooked.length - 1] || 0,
    demosCompletedWeek: trends.demosCompleted[trends.demosCompleted.length - 1] || 0,
    demosUnqualifiedWeek: weekTotals.demosUnqualified[weekTotals.demosUnqualified.length - 1] || 0,
    showUpRatePct: trends.showRate[trends.showRate.length - 1],
    closeRatePct: trends.closeRate[trends.closeRate.length - 1],
    trialSignupsWeek: trends.trialsStarted[trends.trialsStarted.length - 1] || 0,
    organicLeadsWeek: trends.organicLeads[trends.organicLeads.length - 1] || 0,
    paidLeadsWeek: trends.paidLeads[trends.paidLeads.length - 1] || 0,
    websiteVisitorsWeek: trends.websiteVisitors[trends.websiteVisitors.length - 1] || 0,
    optInRatePctWeek: trends.optInRate[trends.optInRate.length - 1],
    totalAdSpendWeek: trends.totalAdSpend[trends.totalAdSpend.length - 1] || 0,
    costPerLeadWeek: trends.costPerLead[trends.costPerLead.length - 1],
    prsMergedWeek: weekTotals.prsMerged[weekTotals.prsMerged.length - 1] || 0,
    prsDeployedWeek: weekTotals.prsDeployed[weekTotals.prsDeployed.length - 1] || 0,
    newBugsWeek: weekTotals.newBugs[weekTotals.newBugs.length - 1] || 0,
  }

  // ---- THIS MONTH rollups ----
  // Sum across the last 4 weeks as a rough "this month" proxy (most months span 4-5 weeks).
  // For new MRR we need to dig into the AE deals data.
  const last4 = (arr) => arr.slice(-4).reduce((s, v) => s + (Number(v) || 0), 0)
  const allDeals = new Map()
  for (const card of todayCards) {
    if (profileById[card.user_id]?.role_type !== 'account_executive') continue
    for (const d of (card.data?.deals || [])) {
      if (d.id) allDeals.set(d.id, d)
    }
  }
  // Also scan last 4 weeks of deals
  const last4WeekKeys = weekKeys.slice(-4)
  for (const card of scorecards) {
    if (!last4WeekKeys.includes(card.week_key)) continue
    if (profileById[card.user_id]?.role_type !== 'account_executive') continue
    for (const d of (card.data?.deals || [])) {
      if (d.id) allDeals.set(d.id, d)
    }
  }
  const wonDeals = [...allDeals.values()].filter(d => d.stage === 'Won')
  const newMrrClosedMonth = wonDeals.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const avgDealSize = wonDeals.length
    ? Math.round(newMrrClosedMonth / wonDeals.length)
    : null

  const thisMonth = {
    demosBookedMonth: last4(weekTotals.demosBooked),
    demosCompletedMonth: last4(weekTotals.demosCompleted),
    trialSignupsMonth: last4(weekTotals.trialSignups),
    newMrrClosedMonth,
    avgDealSize,
    totalAdSpendMonth: last4(weekTotals.totalAdSpend),
    cancellationsThisMonth: cancellations.filter(c => {
      if (!c.cancelled_at) return false
      const cancelDate = new Date(c.cancelled_at)
      const now = new Date()
      return cancelDate.getMonth() === now.getMonth() &&
             cancelDate.getFullYear() === now.getFullYear()
    }).length,
  }

  // ---- MONTHLY snapshot (mostly awaiting external systems) ----
  const monthly = {
    totalMRR: null,
    totalCustomers: null,
    newCustomersMo: wonDeals.length,
    expansionMRRMo: null,
    contractionMRRMo: null,
    churnedMRRMo: null,
    startingMRRMo: null,
    salesMarketingCostMo: null,
    csTeamCostMo: null,
    infraCostMo: null,
  }

  // ---- Awaiting map: which metric keys lack a real data source ----
  // Components in Odyssey check this to render an "Awaiting" badge.
  const awaiting = {
    // Stripe-dependent
    totalMRR: 'Stripe',
    totalCustomers: 'Stripe',
    arpu: 'Stripe',
    newMRR: 'Stripe',
    mrrCurrent: 'Stripe',
    cashCollectedToday: 'Stripe',
    positiveCashToday: 'Stripe',
    CAC: 'Stripe + Ads',
    cac: 'Stripe + Ads',
    cacPayback: 'Stripe + Ads',
    // ProfitWell
    ltvCac: 'ProfitWell',
    grossMargin: 'ProfitWell',
    netRevRetention: 'ProfitWell',
    NRR: 'ProfitWell',
    churnRate: 'ProfitWell',
    // Amplitude / product analytics
    userAdoption: 'Amplitude',
    trialToPaid: 'Amplitude',
    activationRate: 'Amplitude',
    trialActivationsToday: 'Amplitude',
    // CRM / HubSpot
    partnerOppsToday: 'HubSpot',
    partnerCallsToday: 'HubSpot',
    partnerPipelineAdded: 'HubSpot',
    partnerPipeline: 'HubSpot',
    // CS daily granularity (data exists weekly, not daily)
    onTimeActivationsToday: 'Daily logging',
    lateActivationsToday: 'Daily logging',
    implementationsToday: 'Daily logging',
    churnEventsToday: 'Daily logging',
    churnMRRToday: 'Daily logging',
    ticketsResolvedToday: 'Daily logging',
    prsDeployedToday: 'Daily logging',
    newBugsToday: 'Daily logging',
    // Derived from missing sources
    costPerDemo: 'Stripe + Ads',
    timeToValue: 'CSM activation tracking',
    implementations: 'CS logging history',
    ticketsResolved: 'CS logging history',
    onTimeActivation: 'CS logging history',
  }

  return { today, thisWeek, thisMonth, trends, monthly, awaiting }
}

// =============================================================================
//  Helpers
// =============================================================================

// Sum a particular daily field across an array of scorecards (sums over all days).
function sumDaily(cards, field) {
  return cards.reduce((sum, card) => {
    const daily = card.data?.daily || []
    return sum + daily.reduce((s, day) => s + (Number(day?.[field]) || 0), 0)
  }, 0)
}

// Sum a particular daily field at a specific day index across an array of scorecards.
function sumDailyAtDay(cards, dayIdx, field) {
  return cards.reduce((sum, card) => {
    const day = (card.data?.daily || [])[dayIdx]
    return sum + (Number(day?.[field]) || 0)
  }, 0)
}
