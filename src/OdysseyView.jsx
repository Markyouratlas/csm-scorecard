import React, { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Sparkles, TrendingUp, HeartHandshake, Megaphone, Rocket, Code,
  Info, Clock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Activity, AlertCircle, RefreshCw, ExternalLink, Edit3,
} from 'lucide-react'
import { useOdysseyMetrics } from './hooks/useOdysseyMetrics.js'
import { closeableHeld } from './aeFunnel.js'
import { useAtlasTargets, formatMetricValue } from './hooks/useAtlasTargets.js'
import { TEAMS, accessTier } from './teams.js'
import TargetEditModal from './TargetEditModal.jsx'
import RevenueBreakdownCard from './RevenueBreakdownCard.jsx'
import { useRevenueBreakdown } from './hooks/useRevenueBreakdown'
import { useMrrHistory } from './hooks/useMrrHistory.js'
import { useWeeklyMrr } from './hooks/useWeeklyMrr.js'
import { useMetaAds } from './hooks/useMetaAds.js'
import { useCalBookings } from './hooks/useCalBookings.js'
import { getWeekKey } from './dateUtils.js'
import BreakdownModal from './BreakdownModal.jsx'
import SourceInspectorModal from './SourceInspectorModal.jsx'
import RocketLoader from './RocketLoader.jsx'
import { useManualDemosByRep } from './hooks/useManualDemosByRep.js'
import { useCalBookingsByRep } from './hooks/useCalBookingsByRep.js'
import MrrHistoryModal from './MrrHistoryModal.jsx'
import WeeklyMrrModal from './WeeklyMrrModal.jsx'
import DailyUpdateModal from './DailyUpdateModal.jsx'
import WeeklyUpdateModal from './WeeklyUpdateModal.jsx'

// =============================================================================
//  OdysseyView — the prototype layout with REAL data
//
//  Five tabs: Executive · Atlas Odyssey (weekly) · Daily Pulse · Quick Log · Tracking Guide
//
//  Every metric is either:
//    a) wired to real data via useOdysseyMetrics()
//    b) marked "Awaiting <Provider>" using the awaiting map from the hook
//
//  Sparklines render real 8-week history for metrics we have data on, and a
//  faded "no data" placeholder where the data source doesn't exist yet.
// =============================================================================

const BRAND = '#6639A6'

const DEPTS = {
  marketing: { name: 'Marketing',             color: '#DC2649', icon: Megaphone },
  sales:     { name: 'Sales',                 color: '#15803D', icon: TrendingUp },
  cs:        { name: 'Customer Success',      color: '#1D4ED8', icon: HeartHandshake },
  product:   { name: 'Product & Engineering', color: '#7C3AED', icon: Code },
  growth:    { name: 'Growth & Ops',          color: '#B45309', icon: Rocket },
  exec:      { name: 'Executive',             color: '#6639A6', icon: Sparkles },
}

export default function OdysseyView({ onSwitchToManagerTeam, profile }) {
  const [view, setView] = useState('executive')
  const [modalMetric, setModalMetric] = useState(null) // { metricKey, monthKey, initialActual }
  const data = useOdysseyMetrics()
  const targets = useAtlasTargets()
  const tier = accessTier(profile)
  const canEdit = tier === 'executive'

  function openTargetModal(metricKey, initialActual, liveActual) {
    setModalMetric({ metricKey, initialActual, liveActual })
  }

  function closeTargetModal() {
    setModalMetric(null)
  }

  if (data.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3 mt-6">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-900">
          <div className="font-semibold mb-0.5">Couldn't load Odyssey metrics</div>
          <div className="text-red-800">{String(data.error?.message || data.error)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="atlas-odyssey-real">
      <OdysseyStyles />
      <ProtoTabs view={view} setView={setView} />
      <main className="relative max-w-[1400px] mx-auto px-2 sm:px-4 py-6 lg:py-10">
        {view === 'executive' && <ExecutiveView data={data} targets={targets} canEdit={canEdit} openModal={openTargetModal} />}
        {view === 'weekly'    && <WeeklyView data={data} targets={targets} canEdit={canEdit} openModal={openTargetModal} userId={profile?.id} />}
        {view === 'daily'     && <DailyView data={data} targets={targets} canEdit={canEdit} openModal={openTargetModal} userId={profile?.id} />}
        {view === 'log'       && <QuickLogView onSwitchToManagerTeam={onSwitchToManagerTeam} />}
        {view === 'tracking'  && <TrackingGuide />}
      </main>
      {data.meta && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 pb-6 flex items-center justify-between flex-wrap gap-2 mono-text">
          <div className="text-[11px] text-stone-500 uppercase tracking-widest">
            Refreshed {data.meta.fetchedAt.toLocaleTimeString()} · {data.meta.memberCount} members
            {targets.loading && <span className="ml-2">· loading targets…</span>}
          </div>
          <div className="group relative">
            <button onClick={data.refresh}
              disabled={data.loading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md hover:bg-stone-100 disabled:opacity-50"
              style={{ color: BRAND }}>
              <RefreshCw className={`w-3 h-3 ${data.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full right-0 mb-2 w-[240px] rounded-lg bg-stone-900 text-white text-[11px] leading-snug p-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150 z-20 normal-case tracking-normal"
            >
              Reloads the dashboard from the database. Does not pull new data from Stripe — use the Data Sync tab for that.
            </div>
          </div>
        </div>
      )}
      {modalMetric && (
        <TargetEditModal
          metricKey={modalMetric.metricKey}
          initialActual={modalMetric.initialActual}
          liveActual={modalMetric.liveActual}
          targetsHook={targets}
          canEdit={canEdit}
          userId={profile?.id}
          onClose={closeTargetModal}
        />
      )}
    </div>
  )
}

// =============================================================================
//  Tab Nav
// =============================================================================

function ProtoTabs({ view, setView }) {
  const tabs = [
    { id: 'executive', label: 'Executive',      sub: 'ANNUAL + QUARTERLY' },
    { id: 'weekly',    label: 'Atlas Odyssey',  sub: 'WEEKLY SCORECARD' },
    { id: 'daily',     label: 'Daily Pulse',    sub: 'TODAY' },
    { id: 'log',       label: 'Quick Log',      sub: "ENTER TODAY'S DATA" },
    { id: 'tracking',  label: 'Tracking Guide', sub: 'WHAT EACH ROLE LOGS' },
  ]
  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4 pt-6">
      <div className="flex items-end gap-8 overflow-x-auto pb-1 border-b border-stone-300">
        {tabs.map((t) => {
          const active = view === t.id
          return (
            <button key={t.id} onClick={() => setView(t.id)}
              className="relative pb-3 text-left shrink-0 transition-colors"
              style={{ color: active ? '#0F0825' : '#6F6884' }}>
              <div className="display-text font-semibold text-[15px] leading-tight">{t.label}</div>
              <div className="mono-text text-[10px] uppercase tracking-[0.18em] mt-1 text-stone-500">
                {t.sub}
              </div>
              {active && (
                <div className="absolute -bottom-px left-0 right-0 h-[2px] rounded-t"
                  style={{ background: BRAND, boxShadow: '0 0 12px rgba(102,57,166,0.5)' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
//  Executive view — annual targets + quarterly OKRs + strategic initiatives
// =============================================================================

function ExecutiveView({ data, targets, canEdit, openModal }) {
  // Pull actuals from atlas_targets (manual backfill) — falling back to live Supabase computed
  const mrrLatest = targets.getLatestActual('total-mrr')
  const customersLatest = targets.getLatestActual('total-customers')
  const arpuLatest = targets.getLatestActual('arpu')
  const nrr = targets.getLatestActual('net-rev-retention')
  const churn = targets.getLatestActual('churn-pct')

  // LIVE Stripe-derived hero actuals (read-only). MRR = net committed recurring across
  // all current subs; customers = distinct customers with a committed sub (manual recurring
  // entries count by name); ARPU = MRR / customers.
  const rev = useRevenueBreakdown()
  const liveMrr = rev.totals?.committedContracted || null
  const liveCustomers = liveMrr == null ? null
    : new Set(rev.allSubRecords.filter(r => r.inMrr).map(r => r.stripeCustomerId || r.name)).size
  const liveArpu = (liveMrr != null && liveCustomers) ? liveMrr / liveCustomers : null

  // Single source of truth for each live-backed stat. Precedence:
  //   1. a CURRENT-MONTH manual override (source='manual') — wins, so a user edit sticks
  //   2. the live Stripe value
  //   3. the most recent stored actual
  // NOTE: hero ARPU and the standalone Unit-Economics ARPU tile BOTH read `arpuStat`
  // (same object), so editing ARPU in either place updates both — they cannot diverge.
  const resolveStat = (metricKey, liveValue) => {
    const cur = targets.getMonthValue(metricKey, targets.currentMonthKey)
    if (cur?.actual != null && cur.source === 'manual') {
      return { value: cur.actual, status: 'edited', source: 'manual', asOfMonth: null }
    }
    if (liveValue != null) {
      return { value: liveValue, status: 'live', source: 'stripe', asOfMonth: null }
    }
    const latest = targets.getLatestActual(metricKey)
    return { value: latest?.actual ?? null, status: latest?.actual != null ? 'asof' : 'none', source: latest?.source ?? null, asOfMonth: latest?.monthKey ?? null }
  }
  const mrrStat = resolveStat('total-mrr', liveMrr)
  const customersStat = resolveStat('total-customers', liveCustomers)
  const arpuStat = resolveStat('arpu', liveArpu)

  // Stored monthly MRR snapshots + the live current month layered on top (live wins).
  const hist = useMrrHistory()
  const [historyOpen, setHistoryOpen] = useState(false)
  const seriesMap = new Map(hist.rows.map(r => [r.month_key, r.mrr]))
  if (liveMrr != null) seriesMap.set(targets.currentMonthKey, liveMrr)
  const mrrHistorySeries = [...seriesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mk, mrr]) => ({ month: shortMonthLabel(mk), mrr }))

  // For the hero: "annual target" = December of the CURRENT year if available,
  // else December of the year the latest actual lives in, else just take whatever
  // the most-distant target we have is. This gives the most motivating "X of Y" framing.
  const currentYear = new Date().getFullYear()
  const mrrAnnualTarget = targets.getAnnualTarget('total-mrr', currentYear)
                       ?? targets.getAnnualTarget('total-mrr', currentYear + 1)
  const customersAnnualTarget = targets.getAnnualTarget('total-customers', currentYear)
                             ?? targets.getAnnualTarget('total-customers', currentYear + 1)

  // Build monthly MRR trajectory: only months where we have an actual value
  const mrrHistory = targets.getMonthHistory('total-mrr')
  const mrrSeries = mrrHistory
    .filter(h => h.actual != null)
    .map(h => ({
      month: shortMonthLabel(h.monthKey),
      monthKey: h.monthKey,
      mrr: h.actual,
      target: h.target,
    }))

  // Weekly MRR trajectory for the hero — shared with the Investor view via
  // useWeeklyMrr's ['weekly-mrr'] cache. It interpolates between the monthly
  // actuals (which the exec edits right here), so a manual change reshapes the
  // weekly line in BOTH the Odyssey and Investor views.
  const weeklyMrr = useWeeklyMrr({
    monthlyAnchors: mrrSeries.map(h => ({ monthKey: h.monthKey, mrr: h.mrr })),
    liveMrr,
    weeks: 8,
  })
  const weeklyMrrSeries = weeklyMrr.series.map(s => ({ month: s.label, mrr: s.mrr }))

  return (
    <div className="space-y-10 fade-in">
      <SectionHeader
        deptKey="exec"
        eyebrow="Annual Target"
        title="Atlas Goals"
        description="Where the company is heading this year. Click any metric to edit its target."
      />

      {/* MRR Hero — prototype-style unified card */}
      <MrrHeroCard
        value={mrrStat.value}
        target={mrrAnnualTarget}
        asOfMonth={mrrStat.asOfMonth}
        status={mrrStat.status}
        loading={rev.loading}
        series={weeklyMrrSeries}
        onEditHistory={canEdit ? () => setHistoryOpen(true) : null}
        customers={customersStat.value}
        customersEdited={customersStat.status === 'edited'}
        customersTarget={customersAnnualTarget}
        arpu={arpuStat.value}
        arpuEdited={arpuStat.status === 'edited'}
        onClickMrr={() => openModal('total-mrr', mrrStat.value, liveMrr)}
        onClickCustomers={() => openModal('total-customers', customersStat.value, liveCustomers)}
        onClickArpu={() => openModal('arpu', arpuStat.value, liveArpu)}
        canEdit={canEdit}
      />

      {/* Annual metrics that depend on ProfitWell */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberBlock metricKey="ltv-cac" label="LTV : CAC" value={null} suffix=":1" awaiting="Attribution" openModal={openModal} />
        <NumberBlock metricKey="gross-margin" label="Gross Margin" value={null} suffix="%" awaiting="Finance" openModal={openModal} />
        <NumberBlock metricKey="net-rev-retention" label="Net Rev Retention" value={nrr?.actual} format="percent" awaiting={nrr?.actual == null ? 'ProfitWell' : undefined} source={nrr?.source} openModal={openModal} />
      </div>

      <SectionHeader
        deptKey="exec"
        eyebrow="Strategic Initiatives"
        title="Where the executive team is leaning in"
        description="The bets we're making this quarter, and how they're tracking."
      />
      <StrategicInitiatives data={data} targets={targets} openModal={openModal} />

      <SectionHeader
        deptKey="exec"
        eyebrow="Quarterly OKRs"
        title="How the quarter is shaping up"
        description="Awaiting an OKR tracking system — for now this view is structural."
      />
      <div className="card p-6 text-center text-stone-500 text-sm">
        <Clock className="w-5 h-5 mx-auto mb-2 text-stone-400" />
        <div className="font-semibold mb-1">Awaiting OKR system</div>
        <div className="text-xs">
          Quarterly OKR progress will appear here once Atlas adopts a system to track them
          (Asana goals, an OKR tool, or a Supabase table).
        </div>
      </div>

      <SectionHeader
        deptKey="exec"
        eyebrow="Unit Economics"
        title="The numbers under the hood"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard metricKey="arpu" label="ARPU" value={arpuStat.value} prefix="$" format="currency" source={arpuStat.source} liveValue={liveArpu} openModal={openModal} />
        <MetricCard metricKey="gross-margin" label="Gross Margin" awaiting="Finance" openModal={openModal} />
        <MetricCard metricKey="cac" label="CAC" awaiting="Attribution" openModal={openModal} />
        <MetricCard metricKey="cac-payback" label="CAC Payback" awaiting="Attribution" openModal={openModal} />
        <MetricCard metricKey="ltv-cac" label="LTV : CAC" awaiting="Attribution" openModal={openModal} />
        <MetricCard metricKey="churn-pct" label="Churn %" value={churn?.actual} format="percent" source={churn?.source} openModal={openModal} />
      </div>

      <RevenueBreakdownCard />

      <WeeklyMrrModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        series={weeklyMrr.series}
        onSaveWeek={weeklyMrr.saveWeek}
      />
    </div>
  )
}

// =============================================================================
//  Weekly view — the actual rollups of what was logged this week
// =============================================================================

// Lazy wrappers: the by-rep hooks only fetch when the wrapper is mounted (i.e.
// when the user opens the breakdown), avoiding eager queries on every render.
function DemosBreakdownModal({ weekKey, onClose }) {
  const { rows, total, loading } = useManualDemosByRep(weekKey)
  return (
    <BreakdownModal
      title="Demos Booked · This Week"
      subtitle="Manually logged by AEs"
      rows={rows}
      total={total}
      loading={loading}
      onClose={onClose}
    />
  )
}

function CalBreakdownModal({ weekKey, filter = 'all', dateField = 'created', onClose }) {
  const { rows, total, loading } = useCalBookingsByRep({ weekKey, filter, dateField })
  const noun = dateField === 'scheduled' ? 'Scheduled' : 'Booked'
  const titleByFilter = {
    all: `Total ${noun} Meetings · This Week`,
    paid: `Paid ${noun} Meetings · This Week`,
    organic: `Organic ${noun} Meetings · This Week`,
  }
  const schedSub = dateField === 'scheduled' ? 'on calendar this week' : 'booked this week'
  const subtitleByFilter = {
    all: `All meetings ${schedSub} (by host)`,
    paid: `Ad-driven meetings ${schedSub} (by host)`,
    organic: `Organic meetings ${schedSub} (by host)`,
  }
  return (
    <BreakdownModal
      title={titleByFilter[filter] || titleByFilter.all}
      subtitle={subtitleByFilter[filter] || subtitleByFilter.all}
      rows={rows}
      total={total}
      loading={loading}
      showSplit={filter === 'all'}
      splitMode={filter === 'all' ? 'show' : 'hide'}
      onClose={onClose}
    />
  )
}

function WeeklyView({ data, targets, canEdit, openModal, userId }) {
  const w = data.thisWeek || {}
  const t = data.trends || {}
  const [weeklyUpdateOpen, setWeeklyUpdateOpen] = useState(false)

  // Cal.com booked calls for THIS scorecard week (Monday→now, Toronto), so they
  // reconcile against the manually-logged "Demos Booked" beside them.
  const weekKey = getWeekKey()
  const cal = useCalBookings({ weekKey })                              // booked this week (created_at_cal, Mon→now)
  const calSched = useCalBookings({ weekKey, dateField: 'scheduled' }) // scheduled this week (start_time, Mon–Sun)
  // Which per-rep breakdown is open. Format: 'manual' | 'cal:<filter>:<dateField>'
  // e.g. 'cal:all:created', 'cal:paid:scheduled'
  const [breakdownOpen, setBreakdownOpen] = useState(null)
  const meta7d = useMetaAds('last_7d')
  const metaSpend = meta7d.summary?.totalSpend ?? null
  const metaLeads = meta7d.summary?.totalLeads ?? null
  // Meta wins; fall back to the scorecard-derived weekly values when Meta is null.
  const adSpendValue = metaSpend ?? w.totalAdSpendWeek
  const adSpendSource = metaSpend != null ? 'meta' : null
  const paidLeadsValue = metaLeads ?? w.paidLeadsWeek
  const paidLeadsSource = metaLeads != null ? 'meta' : null
  const costPerLeadValue = (metaSpend != null && metaLeads) ? Math.round((metaSpend / metaLeads) * 100) / 100 : w.costPerLeadWeek
  const costPerLeadSource = (metaSpend != null && metaLeads) ? 'meta' : null

  // LIVE Stripe-derived ARPU (mirrors how ExecutiveView derives it).
  const rev = useRevenueBreakdown()
  const liveMrr = rev.totals?.committedContracted || null
  const liveCustomers = liveMrr == null ? null
    : new Set(rev.allSubRecords.filter(r => r.inMrr).map(r => r.stripeCustomerId || r.name)).size
  const liveArpu = (liveMrr != null && liveCustomers) ? liveMrr / liveCustomers : null
  const nrrW = targets.getLatestActual('net-rev-retention')
  const churnW = targets.getLatestActual('churn-pct')
  // Same precedence as the Executive arpuStat (manual override → live → stored). This reads the
  // SAME atlas_targets row, so the weekly ARPU matches the hero/Unit-Economics ARPU; it refreshes
  // on tab switch rather than the same render tick.
  const arpuCur = targets.getMonthValue('arpu', targets.currentMonthKey)
  const arpuManual = arpuCur?.actual != null && arpuCur.source === 'manual'
  const arpuValue = arpuManual ? arpuCur.actual : (liveArpu ?? targets.getLatestActual('arpu')?.actual)
  const arpuSource = arpuManual ? 'manual' : (liveArpu != null ? 'stripe' : targets.getLatestActual('arpu')?.source)

  return (
    <div className="space-y-10 fade-in">
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setWeeklyUpdateOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border transition-colors hover:bg-stone-50"
            style={{ borderColor: 'rgba(102,57,166,0.3)', color: BRAND }}
            title="Enter the investors' Weekly Update (snapshot, narrative, rocks, asks) and copy the Slack post"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit weekly update
          </button>
        </div>
      )}
      {weeklyUpdateOpen && (
        <WeeklyUpdateModal open={weeklyUpdateOpen} onClose={() => setWeeklyUpdateOpen(false)} userId={userId} />
      )}
      <SectionHeader
        deptKey="marketing"
        eyebrow="Marketing Scorecard"
        title="Top of funnel & efficiency"
        description="Did our paid + organic engine produce qualified pipeline this week, and at what cost?"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <GaugeCard
          metricKey="opt-in-rate"
          label="Opt-In Rate"
          value={w.optInRatePctWeek}
          target={3}
          suffix="%"
          color={DEPTS.marketing.color}
          trend={t.optInRate}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="cost-per-lead"
          label="Cost / Lead"
          value={costPerLeadValue}
          prefix="$"
          color={DEPTS.marketing.color}
          trend={t.costPerLead}
          invertDelta
          source={costPerLeadSource}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="website-visitors"
          label="Website Visitors"
          value={w.websiteVisitorsWeek}
          color={DEPTS.marketing.color}
          trend={t.websiteVisitors}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="total-ad-spend"
          label="Total Ad Spend"
          value={adSpendValue}
          prefix="$"
          color={DEPTS.marketing.color}
          trend={t.totalAdSpend}
          invertDelta
          source={adSpendSource}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="organic-leads"
          label="Organic Leads"
          value={w.organicLeadsWeek}
          color={DEPTS.marketing.color}
          trend={t.organicLeads}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="paid-leads"
          label="Paid Ad Leads"
          value={paidLeadsValue}
          color={DEPTS.marketing.color}
          trend={t.paidLeads}
          source={paidLeadsSource}
          openModal={openModal}
        />
        <MetricCard metricKey="cac" label="CAC" awaiting="Attribution" openModal={openModal} />
        <MetricCard label="Cost / Booked Demo" awaiting={data.awaiting?.costPerDemo} />
      </div>

      <SectionHeader
        deptKey="sales"
        eyebrow="Sales Scorecard"
        title="Pipeline → revenue"
        description="Leading indicators that turn into closed business: demos, show rates, and new MRR."
      />
      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mb-2 mt-1">Manual &amp; Revenue</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          metricKey="sales-calls-booked"
          label="Demos Booked"
          value={w.demosBookedWeek}
          color={DEPTS.sales.color}
          trend={t.demosBooked}
          openModal={openModal}
          hint="manually logged"
          onBreakdownClick={() => setBreakdownOpen('manual')}
        />
        <GaugeCard
          metricKey="show-rate"
          label="Show-Up Rate"
          value={w.showUpRatePct}
          target={75}
          suffix="%"
          color={DEPTS.sales.color}
          trend={t.showRate}
          openModal={openModal}
          tooltip={`Demos Completed ÷ Demos Booked = ${w.demosCompletedWeek} ÷ ${w.demosBookedWeek} this week. Booked = every meeting on the calendar except Rescheduled; Completed = anyone who showed (incl. Unqualified). Target 75%.`}
        />
        <GaugeCard
          metricKey="close-rate"
          label="Close Rate"
          value={w.closeRatePct}
          target={30}
          suffix="%"
          color={DEPTS.sales.color}
          trend={t.closeRate}
          openModal={openModal}
          tooltip={`Closes ÷ closeable demos held = ${w.trialSignupsWeek} ÷ ${closeableHeld(w.demosCompletedWeek, w.demosUnqualifiedWeek)} this week. Closeable backs out ${w.demosUnqualifiedWeek} Unqualified from Demos Completed (${w.demosCompletedWeek}), so non-fits don't drag the rate down. Target 30%.`}
        />
        <NumberBlock
          metricKey="net-new-sales"
          label="Closes"
          value={w.trialSignupsWeek}
          color={DEPTS.sales.color}
          trend={t.trialsStarted}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="net-new-mrr"
          label="New MRR Closed"
          value={data.thisMonth?.newMrrClosedMonth}
          prefix="$"
          color={DEPTS.sales.color}
          hint="month-to-date"
          openModal={openModal}
        />
        <NumberBlock
          label="Avg Deal Size"
          value={data.thisMonth?.avgDealSize}
          prefix="$"
          color={DEPTS.sales.color}
          hint="from won deals"
        />
        <MetricCard
          metricKey="total-mrr"
          label="Total MRR"
          value={targets.getLatestActual('total-mrr')?.actual}
          prefix="$"
          format="currency"
          openModal={openModal}
        />
        <MetricCard
          metricKey="arpu"
          label="ARPU"
          value={arpuValue}
          prefix="$"
          format="currency"
          source={arpuSource}
          liveValue={liveArpu}
          openModal={openModal}
        />
      </div>

      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mb-2 mt-5">Scheduled for This Week · Cal.com</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          label="Total Scheduled for This Week"
          value={calSched.loading ? null : calSched.bookedCalls}
          color={DEPTS.sales.color}
          hint="on calendar this week · via Cal.com"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:all:scheduled')}
        />
        <NumberBlock
          label="Paid Scheduled for This Week"
          value={calSched.loading ? null : calSched.paidCount}
          color={DEPTS.sales.color}
          hint="on calendar this week · ad-driven"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:paid:scheduled')}
        />
        <NumberBlock
          label="Organic Scheduled for This Week"
          value={calSched.loading ? null : calSched.organicCount}
          color={DEPTS.sales.color}
          hint="on calendar this week · organic"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:organic:scheduled')}
        />
      </div>

      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mb-2 mt-5">Booked This Week · Cal.com</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          label="Total Booked Meetings"
          value={cal.loading ? null : cal.bookedCalls}
          color={DEPTS.sales.color}
          hint="booked this week · via Cal.com"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:all:created')}
        />
        <NumberBlock
          label="Paid Booked Meetings"
          value={cal.loading ? null : cal.paidCount}
          color={DEPTS.sales.color}
          hint="booked this week · ad-driven"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:paid:created')}
        />
        <NumberBlock
          label="Organic Booked Meetings"
          value={cal.loading ? null : cal.organicCount}
          color={DEPTS.sales.color}
          hint="booked this week · organic"
          source="cal"
          onBreakdownClick={() => setBreakdownOpen('cal:organic:created')}
        />
      </div>

      <SectionHeader
        deptKey="cs"
        eyebrow="Customer Success"
        title="Retain, activate, support"
        description="Churn, NRR, and the on-time activation bar that keeps customers live within the 14-day mark."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard metricKey="on-time-activation" label="On-Time Activation" awaiting={data.awaiting?.onTimeActivation} openModal={openModal} />
        <MetricCard metricKey="churn-pct" label="Churn Rate"
          value={targets.getLatestActual('churn-pct')?.actual}
          format="percent"
          source={churnW?.source}
          openModal={openModal} />
        <MetricCard metricKey="net-rev-retention" label="Net Rev Retention"
          value={nrrW?.actual}
          format="percent"
          awaiting={nrrW?.actual == null ? 'ProfitWell' : undefined}
          source={nrrW?.source}
          openModal={openModal} />
        <MetricCard label="Implementations" awaiting={data.awaiting?.implementations} />
        <MetricCard label="Tickets Resolved" awaiting={data.awaiting?.ticketsResolved} />
        <MetricCard label="Time-To-First-Value" awaiting={data.awaiting?.timeToValue} />
      </div>

      <SectionHeader
        deptKey="product"
        eyebrow="Product & Engineering"
        title="Velocity vs quality"
        description="Ship more, break less — and watch how users actually adopt what we build."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          metricKey="prs-deployed"
          label="PRs Deployed"
          value={w.prsDeployedWeek}
          color={DEPTS.product.color}
          trend={t.prsDeployed}
          openModal={openModal}
        />
        <NumberBlock
          metricKey="new-bugs"
          label="New Bugs Reported"
          value={w.newBugsWeek}
          color={DEPTS.product.color}
          trend={t.newBugs}
          invertDelta
          openModal={openModal}
        />
        <MetricCard metricKey="activation-rate" label="User Adoption Rate" awaiting={data.awaiting?.userAdoption} openModal={openModal} />
      </div>

      <SectionHeader
        deptKey="growth"
        eyebrow="Growth & Ops"
        title="Self-serve activation engine"
        description="Trials in, paid out — and the activation loop in the middle that decides everything."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          metricKey="trials-started"
          label="Trials Started"
          value={w.trialSignupsWeek}
          color={DEPTS.growth.color}
          trend={t.trialsStarted}
          openModal={openModal}
        />
        <MetricCard metricKey="trial-to-paid" label="Trial → Paid" awaiting={data.awaiting?.trialToPaid} openModal={openModal} />
        <MetricCard metricKey="activation-rate" label="User Activation Rate" awaiting={data.awaiting?.activationRate} openModal={openModal} />
      </div>

      {breakdownOpen === 'manual' && (
        <DemosBreakdownModal weekKey={weekKey} onClose={() => setBreakdownOpen(null)} />
      )}
      {breakdownOpen?.startsWith('cal:') && (
        <CalBreakdownModal
          weekKey={weekKey}
          filter={breakdownOpen.split(':')[1]}
          dateField={breakdownOpen.split(':')[2] || 'created'}
          onClose={() => setBreakdownOpen(null)}
        />
      )}
    </div>
  )
}

// =============================================================================
//  Daily view — today's daily entries
// =============================================================================

// Today-windowed Cal breakdown (per host, with meeting drill-down). Mirrors the
// Weekly CalBreakdownModal but uses a days:0 (today, Toronto) window.
function DailyCalBreakdownModal({ filter = 'all', onClose }) {
  const { rows, total, loading } = useCalBookingsByRep({ days: 0, filter })
  const titleByFilter = {
    all: 'Total Booked Meetings · Today',
    paid: 'Paid Booked Meetings · Today',
    organic: 'Organic Booked Meetings · Today',
  }
  const subtitleByFilter = {
    all: 'All meetings booked today (by host)',
    paid: 'Ad-driven meetings booked today (by host)',
    organic: 'Organic meetings booked today (by host)',
  }
  return (
    <BreakdownModal
      title={titleByFilter[filter] || titleByFilter.all}
      subtitle={subtitleByFilter[filter] || subtitleByFilter.all}
      rows={rows}
      total={total}
      loading={loading}
      showSplit={filter === 'all'}
      splitMode={filter === 'all' ? 'show' : 'hide'}
      onClose={onClose}
    />
  )
}

function DailyView({ data, targets, canEdit, openModal, userId }) {
  const td = data.today || {}
  const [dailyUpdateOpen, setDailyUpdateOpen] = useState(false)
  const metaToday = useMetaAds('today')
  const metaSpendToday = metaToday.summary?.totalSpend ?? null
  const metaLeadsToday = metaToday.summary?.totalLeads ?? null
  const metaClicksToday = metaToday.summary?.totalClicks ?? null
  const cpcTodayValue = (metaSpendToday != null && metaClicksToday)
    ? Math.round((metaSpendToday / metaClicksToday) * 100) / 100
    : td.cpcToday
  const cpcTodaySource = (metaSpendToday != null && metaClicksToday) ? 'meta' : null
  const adSpendTodayValue = metaSpendToday ?? td.adSpendToday
  const adSpendTodaySource = metaSpendToday != null ? 'meta' : null
  const paidLeadsTodayValue = metaLeadsToday ?? td.paidLeadsToday
  const paidLeadsTodaySource = metaLeadsToday != null ? 'meta' : null
  // Cal.com booked meetings TODAY (Toronto midnight → now).
  const calToday = useCalBookings({ days: 0 })
  // Cost per booked meeting today = today's Meta spend ÷ today's PAID (ad-driven) bookings.
  const costPerMeetingToday = (metaSpendToday != null && !calToday.loading && calToday.paidCount > 0)
    ? Math.round((metaSpendToday / calToday.paidCount) * 100) / 100
    : null
  // Which today Cal breakdown is open: null | 'all' | 'paid' | 'organic'
  const [dailyBreakdown, setDailyBreakdown] = useState(null)
  const now = new Date()
  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-10 fade-in">
      <div className="card p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.12), transparent 70%)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
              <Activity className="w-3 h-3" /> Live · Today's pulse
            </div>
            <h1 className="display-text text-3xl md:text-4xl font-medium leading-tight text-stone-900">
              {dayLabel}
            </h1>
            <div className="text-sm text-stone-600 mt-2">
              What's been logged across the team so far today. Pulled from the daily rows of each
              person's weekly scorecard.
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => setDailyUpdateOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border transition-colors hover:bg-stone-50"
              style={{ borderColor: 'rgba(102,57,166,0.3)', color: BRAND }}
              title="Enter the investor daily update + weekly targets, and copy the Slack post"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit daily update
            </button>
          )}
        </div>
      </div>
      {dailyUpdateOpen && (
        <DailyUpdateModal open={dailyUpdateOpen} onClose={() => setDailyUpdateOpen(false)} userId={userId} />
      )}

      <SectionHeader
        deptKey="sales"
        eyebrow="Sales · Today"
        title="Daily sales pulse"
        description="The shape of today's pipeline activity."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DailyTile label="Demos Booked" value={td.demosBookedToday} color={DEPTS.sales.color} hint="today" />
        <DailyTile label="Calls Held" value={td.callsHeldToday} color={DEPTS.sales.color} hint="today" />
        <DailyTile label="No-Shows" value={td.noShowsToday} color={DEPTS.sales.color} hint="today" />
        <DailyTile label="Show Rate" value={td.showRateToday} suffix="%" color={DEPTS.sales.color} hint="vs 80% goal" />
        <DailyTile label="Closes" value={td.customersClosedToday} color={DEPTS.sales.color} hint="today" />
        <DailyTile label="Close Rate" value={td.closeRateToday} suffix="%" color={DEPTS.sales.color} hint="vs 25% goal" />
        <DailyTile label="Booked Meetings" value={calToday.loading ? null : calToday.bookedCalls} color={DEPTS.sales.color} hint="today" source="cal" onBreakdownClick={() => setDailyBreakdown('all')} />
        <DailyTile label="Paid Booked" value={calToday.loading ? null : calToday.paidCount} color={DEPTS.sales.color} hint="today · ad-driven" source="cal" onBreakdownClick={() => setDailyBreakdown('paid')} />
        <DailyTile label="Organic Booked" value={calToday.loading ? null : calToday.organicCount} color={DEPTS.sales.color} hint="today · organic" source="cal" onBreakdownClick={() => setDailyBreakdown('organic')} />
      </div>

      <SectionHeader
        deptKey="marketing"
        eyebrow="Paid · Today"
        title="Ad performance"
        description="Spend efficiency and demo flow from paid channels today."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DailyTile label="Ad Spend" value={adSpendTodayValue} prefix="$" color={DEPTS.marketing.color} hint="today" source={adSpendTodaySource} />
        <DailyTile label="Cost / Click" value={cpcTodayValue} prefix="$" color={DEPTS.marketing.color} hint="today" source={cpcTodaySource} awaiting={cpcTodayValue == null && 'Click tracking'} />
        <DailyTile label="Paid Leads" value={paidLeadsTodayValue} color={DEPTS.marketing.color} hint="today" source={paidLeadsTodaySource} />
        <DailyTile label="Organic Leads" value={td.organicLeadsToday} color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="Website Visitors" value={td.websiteVisitorsToday} color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="MRR Closed" value={null} prefix="$" color={DEPTS.marketing.color} awaiting={data.awaiting?.newMRR} />
        <DailyTile label="Cost / Booked Meeting" value={costPerMeetingToday} prefix="$" color={DEPTS.marketing.color} hint="today · ad-driven" source={costPerMeetingToday != null ? 'cal' : null} awaiting={costPerMeetingToday == null && 'Today\'s bookings'} />
        <DailyTile label="Paid Booked" value={calToday.loading ? null : calToday.paidCount} color={DEPTS.marketing.color} hint="today · ad-driven" source="cal" onBreakdownClick={() => setDailyBreakdown('paid')} />
      </div>

      <SectionHeader
        deptKey="cs"
        eyebrow="CS · Today"
        title="Activation & support"
        description="Customer success activity today — most metrics need daily granularity to populate."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DailyTile label="On-Time Activations" awaiting={data.awaiting?.onTimeActivationsToday} />
        <DailyTile label="Late Activations" awaiting={data.awaiting?.lateActivationsToday} />
        <DailyTile label="Implementations Done" awaiting={data.awaiting?.implementationsToday} />
        <DailyTile label="Churn Events" awaiting={data.awaiting?.churnEventsToday} />
        <DailyTile label="Churn MRR" awaiting={data.awaiting?.churnMRRToday} prefix="$" />
        <DailyTile label="Tickets Resolved" awaiting={data.awaiting?.ticketsResolvedToday} />
      </div>

      <SectionHeader
        deptKey="growth"
        eyebrow="Channel · Today"
        title="Partnerships"
        description="Partner-led opportunities, calls, and pipeline added today."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3">
        <DailyTile label="Opportunities Registered" awaiting={data.awaiting?.partnerOppsToday} />
        <DailyTile label="Partner Calls" awaiting={data.awaiting?.partnerCallsToday} />
        <DailyTile label="Pipeline Value" awaiting={data.awaiting?.partnerPipeline} prefix="$" />
      </div>

      {dailyBreakdown && (
        <DailyCalBreakdownModal filter={dailyBreakdown} onClose={() => setDailyBreakdown(null)} />
      )}
    </div>
  )
}

function DailyTile({ label, value, prefix = '', suffix = '', color = BRAND, hint, awaiting, source, onBreakdownClick }) {
  const isMissing = awaiting || value == null
  const breakdownable = !!onBreakdownClick
  const handleKeyDown = (e) => {
    if (breakdownable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onBreakdownClick() }
  }
  const wrapperProps = breakdownable
    ? {
        className: 'card p-4 flex flex-col text-left w-full cursor-pointer hover:shadow-md hover:border-stone-400 transition-all',
        style: { minHeight: 110 },
        role: 'button',
        tabIndex: 0,
        onClick: onBreakdownClick,
        onKeyDown: handleKeyDown,
      }
    : { className: 'card p-4 flex flex-col', style: { minHeight: 110 } }
  return (
    <div {...wrapperProps}>
      <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-2">
        {label}
      </div>
      {isMissing ? (
        <AwaitingBadge provider={awaiting} />
      ) : (
        <div className="display-text font-medium leading-none num-tabular" style={{ color, fontSize: '32px' }}>
          {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
          {fmtNum(value)}
          {suffix && <span style={{ opacity: 0.55, fontSize: '0.6em' }}>{suffix}</span>}
        </div>
      )}
      {hint && !isMissing && (
        <div className="mono-text text-[10px] text-stone-400 mt-2 uppercase tracking-widest">{hint}</div>
      )}
      {source && !isMissing && (
        <div className="mono-text text-[9px] text-stone-400 mt-1 uppercase tracking-[0.14em]">via {sourceLabel(source)}</div>
      )}
    </div>
  )
}

// =============================================================================
//  Quick Log — directory of department dashboards
// =============================================================================

function QuickLogView({ onSwitchToManagerTeam }) {
  // One card per non-leadership department; clicking opens that team's Manager view.
  const departments = useMemo(() => TEAMS.filter(t => !t.isLeadership), [])

  return (
    <div className="space-y-8 fade-in">
      <div className="card p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.12), transparent 70%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
            <Sparkles className="w-3 h-3" /> Quick Log
          </div>
          <h1 className="display-text text-3xl md:text-4xl font-medium leading-tight text-stone-900">
            Jump into any team's <em className="font-light italic" style={{ color: BRAND }}>dashboard.</em>
          </h1>
          <div className="text-sm text-stone-600 mt-3 leading-relaxed max-w-2xl">
            Open a department's manager dashboard to review the team's weekly scorecards,
            drill into any member, and see how their numbers feed the Daily Pulse and
            Executive views.
          </div>
        </div>
      </div>

      <SectionHeader
        eyebrow="By Department"
        title="Open a team dashboard"
        description="Click a department to open its manager dashboard."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {departments.map(team => (
          <DepartmentLauncherCard key={team.key}
            team={team}
            onClick={onSwitchToManagerTeam} />
        ))}
      </div>
    </div>
  )
}

function DepartmentLauncherCard({ team, onClick }) {
  const roleNames = (team.roles || []).map(r => r.label).join(' · ')
  return (
    <button
      onClick={() => onClick?.(team.key)}
      className="card p-5 text-left hover:border-stone-400 transition-all group relative"
      style={{ minHeight: 92 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1"
            style={{ color: team.color }}>
            Department
          </div>
          <div className="display-text text-xl font-medium leading-tight text-stone-900">
            {team.label}
          </div>
          {roleNames && (
            <div className="text-[12px] text-stone-500 mt-1.5 truncate">{roleNames}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 text-stone-400 group-hover:text-stone-700 transition-colors">
          <span className="mono-text text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  )
}

// =============================================================================
//  Tracking Guide — what each role logs (static documentation)
// =============================================================================

function TrackingGuide() {
  const sources = [
    {
      title: 'Atlas Scorecards (live)',
      provider: 'Supabase · weekly_scorecards table',
      status: 'connected',
      metrics: ['Demos booked + held', 'Closes (was trials)', 'PRs merged + deployed', 'New bugs reported',
                'Ad spend (Growth + Ad Strategist)', 'Website visitors', 'Organic + paid leads', 'Opt-ins',
                'Tickets resolved', 'Implementations completed', 'TTFV per customer (CSM)'],
      inspect: {
        mode: 'sample-row',
        tables: [
          { table: 'weekly_scorecards', label: 'Weekly scorecard', order: 'updated_at' },
        ],
      },
    },
    {
      title: 'Cancellations log',
      provider: 'Supabase · cancellations table',
      status: 'connected',
      metrics: ['Cancellations this month', 'MRR lost from churn'],
      inspect: {
        mode: 'sample-row',
        tables: [
          { table: 'cancellations', label: 'Cancellation', order: 'created_at' },
        ],
      },
    },
    {
      title: 'Cal.com (live)',
      provider: 'Supabase · cal_bookings + cal_event_type_config',
      status: 'connected',
      metrics: [
        'Booked meetings — by when booked (this week / today)',
        'Scheduled meetings — by calendar date (Mon–Sun)',
        'Paid vs organic split (ad-driven event types)',
        'Cost per booked meeting (with Meta spend)',
        'Per-rep / per-host breakdown with customer drill-down',
      ],
      inspect: {
        mode: 'sample-row',
        tables: [
          { table: 'cal_bookings', label: 'Bookings', order: 'synced_at' },
        ],
      },
    },
    {
      title: 'Meta Ads (live)',
      provider: 'Supabase · meta_ads_metrics + meta_ad_sets_daily',
      status: 'connected',
      metrics: [
        'Spend, impressions, reach, CPM, CTR, link clicks',
        'Lead + complete-registration conversions (actions)',
        'By campaign, by ad set, and daily time-series',
        'Windows: today / 7d / 30d / 90d / QTD / YTD / trailing 365',
        'Cost per booked meeting (paired with Cal.com)',
      ],
      inspect: {
        mode: 'sample-row',
        tables: [
          { table: 'meta_ads_metrics', label: 'Campaign metrics', order: 'fetch_date' },
          { table: 'meta_ad_sets_daily', label: 'Ad sets (daily)', order: 'synced_at' },
        ],
      },
    },
    {
      title: 'Stripe (live)',
      provider: 'Supabase · commission_customers + oneoff_payments',
      status: 'connected',
      metrics: [
        'Peak + contracted MRR per customer',
        'Monthly MRR + cash collected (trailing 13 months)',
        'Per-subscription status, product, renewal, discount, pause',
        'One-off charges + refunds',
      ],
      inspect: {
        mode: 'sample-row',
        tables: [
          { table: 'commission_customers', label: 'Customers', order: 'last_synced_at' },
          { table: 'oneoff_payments', label: 'One-off payments', order: 'last_synced_at' },
        ],
      },
    },
    {
      title: 'ProfitWell (live)',
      provider: 'Supabase · profitwell_metrics',
      status: 'connected',
      metrics: [
        'MRR + active customers (monthly)',
        'Churn + retention rates',
        'ARPU, LTV, SaaS quick ratio',
        'Full monthly metric catalog (every trend ProfitWell exposes)',
      ],
      inspect: {
        mode: 'metric-catalog',
      },
    },
    {
      title: 'Amplitude (or product analytics)',
      provider: 'Awaiting setup',
      status: 'awaiting',
      metrics: ['Trial → Paid conversion %', 'User activation rate', 'User adoption rate', 'Daily activation events']
    },
    {
      title: 'GHL + Attio (CRM)',
      provider: 'Awaiting integration',
      status: 'awaiting',
      metrics: ['Partner pipeline value', 'Partner-sourced opportunities', 'Partner-driven calls', 'Contacts + deal stages']
    },
    {
      title: 'OKR system',
      provider: 'No source chosen yet',
      status: 'awaiting',
      metrics: ['Quarterly OKR progress', 'OKR ownership', 'OKR cadence updates']
    },
  ]

  // Which source's data-inspector popout is open (the source object, or null).
  const [inspecting, setInspecting] = useState(null)

  return (
    <div className="space-y-8 fade-in">
      <style>{`
        .live-badge {
          animation: liveBadgeGlow 2.8s ease-in-out infinite;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          /* Domed glass: bright hotspot off-center, falling to a deeper green edge */
          background: radial-gradient(circle at 35% 30%, #86efac 0%, #22c55e 45%, #15803d 100%);
          /* Inset highlight = glass reflection; outer ring = seated in a bezel */
          box-shadow:
            inset 0 0.5px 1px rgba(255,255,255,0.9),
            inset 0 -1px 1.5px rgba(0,0,0,0.25),
            0 0 0 0.5px rgba(21,128,61,0.4);
          animation: liveDotPulse 2.8s ease-in-out infinite;
        }
        @keyframes liveDotPulse {
          0%, 100% {
            box-shadow:
              inset 0 0.5px 1px rgba(255,255,255,0.9),
              inset 0 -1px 1.5px rgba(0,0,0,0.25),
              0 0 0 0.5px rgba(21,128,61,0.4),
              0 0 3px 0.5px rgba(34,197,94,0.5);
          }
          50% {
            box-shadow:
              inset 0 0.5px 1px rgba(255,255,255,0.9),
              inset 0 -1px 1.5px rgba(0,0,0,0.25),
              0 0 0 0.5px rgba(21,128,61,0.4),
              0 0 7px 2px rgba(34,197,94,0.85);
          }
        }
        @keyframes liveBadgeGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.0); }
          50% { box-shadow: 0 0 8px 0 rgba(34,197,94,0.25); }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-badge, .live-dot { animation: none; }
        }
      `}</style>
      <div className="card p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.12), transparent 70%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
            <Info className="w-3 h-3" /> The 5-minute promise
          </div>
          <h1 className="display-text text-3xl md:text-4xl font-medium leading-tight text-stone-900">
            Less data entry. <em className="font-light italic" style={{ color: BRAND }}>More signal.</em>
          </h1>
          <div className="text-sm text-stone-600 mt-3 leading-relaxed max-w-2xl">
            Every weekly, monthly, quarterly, and annual KPI on this scorecard rolls up from a small
            set of daily inputs. Below: what's live, what each source provides, and what's pending.
          </div>
        </div>
      </div>

      <SectionHeader
        eyebrow="Sources of Truth"
        title="Where each metric is pulled from"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sources.map(src => (
          <div
            key={src.title}
            className={`card p-5 ${src.inspect ? 'text-left w-full cursor-pointer hover:shadow-md hover:border-stone-400 transition-all group' : ''}`}
            {...(src.inspect ? {
              role: 'button',
              tabIndex: 0,
              onClick: () => setInspecting(src),
              onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInspecting(src) } },
            } : {})}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="display-text text-lg font-medium text-stone-900 leading-tight">{src.title}</div>
                <div className="mono-text text-[10.5px] uppercase tracking-widest text-stone-500 mt-1">
                  {src.provider}
                </div>
              </div>
              {src.status === 'connected' ? (
                <span className="live-badge inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded mono-text uppercase tracking-widest"
                  style={{ color: '#15803D', background: 'rgba(22,163,74,0.08)' }}>
                  <span className="live-dot" />
                  Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded mono-text uppercase tracking-widest"
                  style={{ color: BRAND, background: 'rgba(102,57,166,0.08)' }}>
                  <Clock className="w-3 h-3" /> Awaiting
                </span>
              )}
            </div>
            <ul className="text-[12.5px] text-stone-600 space-y-1 mt-3 pl-3">
              {src.metrics.map(m => (
                <li key={m} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-stone-400 mt-2 flex-shrink-0" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
            {src.inspect && (
              <div className="mono-text text-[10px] uppercase tracking-widest text-stone-400 group-hover:text-stone-700 transition-colors mt-3">
                Inspect data →
              </div>
            )}
          </div>
        ))}
      </div>

      {inspecting && (
        <SourceInspectorModal source={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  )
}

// =============================================================================
//  Strategic Initiatives — derived from real data
// =============================================================================

// The 2×2 window matrix for cost-per-booked-meeting. Calendar pairs Cal's
// calendar period (qtd/ytd) with Meta's calendar preset (this_quarter/this_year);
// Trailing pairs Cal's rolling days (90/365) with Meta's rolling preset
// (last_90d/trailing_365). Never cross calendar and trailing.
function CostPerMeetingCard() {
  const [horizon, setHorizon] = useState('quarterly') // 'quarterly' | 'annual'
  const [basis, setBasis] = useState('calendar')      // 'calendar' | 'trailing'

  // Derive the matching Meta preset + Cal window args from the toggles.
  const metaPreset =
    horizon === 'quarterly'
      ? (basis === 'calendar' ? 'this_quarter' : 'last_90d')
      : (basis === 'calendar' ? 'this_year' : 'trailing_365')
  const calArg =
    horizon === 'quarterly'
      ? (basis === 'calendar' ? { period: 'qtd' } : { days: 90 })
      : (basis === 'calendar' ? { period: 'ytd' } : { days: 365 })

  const meta = useMetaAds(metaPreset)
  const cal = useCalBookings(calArg)

  const spend = meta.summary?.totalSpend ?? null
  const paidMeetings = cal.loading ? null : cal.paidCount
  // Cost per booked meeting = spend ÷ PAID (ad-driven) bookings only. Never total.
  const costPerMeeting = (spend != null && paidMeetings && paidMeetings > 0)
    ? Math.round((spend / paidMeetings) * 100) / 100
    : null

  const dept = DEPTS.marketing
  // Compute the actual month range covered, in Toronto time, so the window is
  // unambiguous (which quarter / which year).
  const tzParts = (d) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', year: 'numeric', month: 'short',
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {})
  const now = new Date()
  const nowP = tzParts(now)
  let rangeStart, rangeEnd
  if (basis === 'calendar') {
    const yNum = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', year: 'numeric' }).format(now))
    const mNum = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'numeric' }).format(now))
    if (horizon === 'quarterly') {
      const qStartMonth = Math.floor((mNum - 1) / 3) * 3 // 0,3,6,9
      rangeStart = tzParts(new Date(Date.UTC(yNum, qStartMonth, 15)))
    } else {
      rangeStart = tzParts(new Date(Date.UTC(yNum, 0, 15)))
    }
    rangeEnd = nowP
  } else {
    const back = new Date(now)
    back.setDate(back.getDate() - (horizon === 'quarterly' ? 90 : 365))
    rangeStart = tzParts(back)
    rangeEnd = nowP
  }
  // "Apr–Jun 2026" if same year; "Jun 2025–Jun 2026" if spanning years.
  const monthRange = rangeStart.year === rangeEnd.year
    ? `${rangeStart.month}–${rangeEnd.month} ${rangeEnd.year}`
    : `${rangeStart.month} ${rangeStart.year}–${rangeEnd.month} ${rangeEnd.year}`
  const baseLabel =
    horizon === 'quarterly'
      ? (basis === 'calendar' ? 'this quarter' : 'last 90 days')
      : (basis === 'calendar' ? 'this year' : 'last 365 days')
  const windowText = `${baseLabel} · ${monthRange}`

  const Toggle = ({ options, value, onChange }) => (
    <div className="inline-flex rounded-md overflow-hidden border border-stone-200">
      {options.map(opt => (
        <button
          key={opt.val}
          type="button"
          onClick={() => onChange(opt.val)}
          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            value === opt.val ? 'text-white' : 'text-stone-500 hover:text-stone-700 bg-white'
          }`}
          style={value === opt.val ? { background: dept.color } : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="card p-5 relative">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: dept.color }}>
          {dept.name}
        </div>
        <div className="group relative">
          <Info className="w-3.5 h-3.5 text-stone-300 hover:text-stone-500 cursor-help transition-colors" />
          <div role="tooltip" className="pointer-events-none absolute bottom-full right-0 mb-2 w-[240px] rounded-lg bg-stone-900 text-white text-[11px] leading-snug p-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150 z-20 normal-case tracking-normal font-normal">
            Meta ad spend ÷ ad-driven booked meetings (Cal.com), {windowText}. Calendar = period-to-date; trailing = rolling window. Organic bookings are excluded.
          </div>
        </div>
      </div>
      <div className="display-text text-lg font-medium text-stone-900 mb-2">Cost / Booked Meeting</div>

      {/* Inline toggles */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <Toggle
          options={[{ val: 'quarterly', label: 'Qtr' }, { val: 'annual', label: 'Year' }]}
          value={horizon} onChange={setHorizon}
        />
        <Toggle
          options={[{ val: 'calendar', label: 'Cal' }, { val: 'trailing', label: 'Trail' }]}
          value={basis} onChange={setBasis}
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="mono-text text-[10px] uppercase tracking-widest text-stone-500">
            {windowText}
          </div>
          <div className="display-text font-medium leading-none num-tabular mt-1" style={{ color: dept.color, fontSize: '32px' }}>
            {costPerMeeting != null
              ? `$${costPerMeeting.toLocaleString()}`
              : <span className="text-stone-300 text-lg">No data yet</span>}
          </div>
          {paidMeetings != null && (
            <div className="mono-text text-[9px] uppercase tracking-widest text-stone-400 mt-1">
              {paidMeetings} ad-driven meetings
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StrategicInitiatives({ data, targets, openModal }) {
  const w = data.thisWeek || {}
  const metaSI = useMetaAds('last_7d')
  const siSpend = metaSI.summary?.totalSpend ?? null
  const siLeads = metaSI.summary?.totalLeads ?? null
  const siCostPerLead = (siSpend != null && siLeads)
    ? Math.round((siSpend / siLeads) * 100) / 100
    : w.costPerLeadWeek
  const initiatives = [
    {
      name: 'Paid Acquisition',
      metric: 'Cost / Lead',
      value: siCostPerLead != null ? `$${siCostPerLead.toLocaleString()}` : null,
      deptKey: 'marketing',
      info: 'Meta ad spend ÷ Meta "lead" events, last 7 days. Source: Meta Ads API. Note: counts Meta\'s strict lead event (not form registrations).',
    },
    {
      name: 'Sales Velocity',
      metric: 'Close Rate',
      value: w.closeRatePct != null ? `${w.closeRatePct}%` : null,
      deptKey: 'sales',
      info: 'Won deals ÷ (won + lost) this month. Source: AE weekly scorecards.',
    },
    {
      name: 'Engineering Output',
      metric: 'PRs Deployed',
      value: w.prsDeployedWeek != null ? `${w.prsDeployedWeek}` : null,
      deptKey: 'product',
      info: 'Pull requests deployed to production this week, summed across all engineers. Source: Engineer weekly scorecards.',
    },
    {
      name: 'Activation Loop',
      metric: 'Closes',
      value: w.trialSignupsWeek != null ? `${w.trialSignupsWeek}` : null,
      deptKey: 'growth',
      info: 'Total closes this week across AE + Growth. Source: weekly scorecards.',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {initiatives.map(init => {
        const dept = DEPTS[init.deptKey]
        return (
          <div key={init.name} className="card p-5 relative">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold"
                style={{ color: dept.color }}>
                {dept.name}
              </div>
              {init.info && (
                <div className="group relative">
                  <Info className="w-3.5 h-3.5 text-stone-300 hover:text-stone-500 cursor-help transition-colors" />
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 mb-2 w-[240px] rounded-lg bg-stone-900 text-white text-[11px] leading-snug p-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150 z-20 normal-case tracking-normal font-normal"
                  >
                    {init.info}
                  </div>
                </div>
              )}
            </div>
            <div className="display-text text-lg font-medium text-stone-900 mb-2">{init.name}</div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="mono-text text-[10px] uppercase tracking-widest text-stone-500">
                  {init.metric}
                </div>
                <div className="display-text font-medium leading-none num-tabular mt-1"
                  style={{ color: dept.color, fontSize: '32px' }}>
                  {init.value ?? <span className="text-stone-300 text-lg">No data yet</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <CostPerMeetingCard />
    </div>
  )
}

// =============================================================================
//  Atomic components
// =============================================================================

function SectionHeader({ deptKey, eyebrow, title, description }) {
  const dept = deptKey ? DEPTS[deptKey] : null
  const color = dept?.color || BRAND
  return (
    <div className="flex items-start gap-3 mb-2">
      {dept?.icon && (
        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
          style={{ background: `${color}14` }}>
          <dept.icon className="w-4 h-4" style={{ color }} />
        </div>
      )}
      <div>
        <div className="mono-text text-[10.5px] uppercase tracking-[0.18em] font-semibold mb-0.5"
          style={{ color }}>
          {eyebrow}
        </div>
        <h2 className="display-text text-2xl md:text-3xl font-medium text-stone-900 leading-tight">{title}</h2>
        {description && (
          <div className="text-sm text-stone-500 mt-1 max-w-2xl">{description}</div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, prefix = '', suffix = '', color = BRAND, trend, awaiting, invertDelta, metricKey, openModal, format, source, hint, liveValue, onBreakdownClick }) {
  const editable = metricKey && openModal
  const breakdownable = !!onBreakdownClick
  // Body click prefers breakdown when provided; otherwise falls back to target-edit.
  const bodyClickable = breakdownable || editable
  const handleBodyClick = () => {
    if (breakdownable) onBreakdownClick()
    else if (editable) openModal(metricKey, value, liveValue)
  }
  const handleKeyDown = (e) => {
    if (bodyClickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleBodyClick() }
  }
  // When breakdownable, the outer must be a <div> (so we can nest a real
  // target-edit <button> inside without button-in-button). Otherwise keep the
  // existing <button>/<div> behavior exactly.
  const Wrapper = breakdownable ? 'div' : (editable ? 'button' : 'div')
  const baseClickableCls = 'card p-4 flex flex-col text-left w-full hover:shadow-md hover:border-stone-400 transition-all relative group'
  const baseStaticCls = 'card p-4 flex flex-col relative'
  const wrapperProps = breakdownable
    ? { onClick: handleBodyClick, role: 'button', tabIndex: 0, onKeyDown: handleKeyDown, className: baseClickableCls, style: { minHeight: 170 } }
    : editable
      ? { onClick: handleBodyClick, type: 'button', className: baseClickableCls, style: { minHeight: 170 } }
      : { className: baseStaticCls, style: { minHeight: 170 } }

  if (awaiting) {
    return (
      <Wrapper {...wrapperProps}>
        {breakdownable && editable && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); openModal(metricKey, value, liveValue) }}
            className="absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center hover:bg-stone-100 text-stone-300 hover:text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="Edit target" aria-label="Edit target">
            <Edit3 className="w-3 h-3" />
          </button>
        )}
        {editable && !breakdownable && (
          <Edit3 className="absolute top-3 right-3 w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
          {label}
        </div>
        <div className="flex-1 flex items-center">
          <AwaitingBadge provider={awaiting} />
        </div>
      </Wrapper>
    )
  }
  const change = trend && trend.length >= 2 ? deltaPct(trend) : 0
  const positive = invertDelta ? change < 0 : change > 0
  const displayValue = format && value != null
    ? formatMetricValue(value, format)
    : value != null ? `${prefix}${fmtNum(value)}${suffix}` : null
  return (
    <Wrapper {...wrapperProps}>
      {breakdownable && editable && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); openModal(metricKey, value, liveValue) }}
          className="absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center hover:bg-stone-100 text-stone-300 hover:text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Edit target" aria-label="Edit target">
          <Edit3 className="w-3 h-3" />
        </button>
      )}
      {editable && !breakdownable && (
        <Edit3 className="absolute top-3 right-3 w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="display-text font-medium leading-none num-tabular" style={{ color, fontSize: '32px' }}>
          {value != null ? (
            format ? (
              displayValue
            ) : (
              <>
                {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
                {fmtNum(value)}
                {suffix && <span style={{ opacity: 0.55, fontSize: '0.6em' }}>{suffix}</span>}
              </>
            )
          ) : (
            <span className="text-stone-300 text-base font-normal">No data yet</span>
          )}
        </div>
        {trend && Math.abs(change) > 0.05 && <DeltaPill change={change} positive={positive} />}
      </div>
      {source && value != null && (
        <div className="mono-text text-[9px] uppercase tracking-[0.14em] text-stone-400 mt-2">via {sourceLabel(source)}</div>
      )}
      {hint && (
        <div className="text-[10px] text-stone-400 mt-1">{hint}</div>
      )}
      {trend && trend.some(v => v > 0) && (
        <div className="mt-auto pt-3 -mx-1">
          <Sparkline data={trend} color={color} />
        </div>
      )}
    </Wrapper>
  )
}

function NumberBlock({ label, value, prefix = '', suffix = '', color = BRAND, trend, awaiting, invertDelta, hint, metricKey, openModal, format, source, onBreakdownClick }) {
  return (
    <MetricCard label={label} value={value} prefix={prefix} suffix={suffix}
      color={color} trend={trend} awaiting={awaiting} invertDelta={invertDelta}
      metricKey={metricKey} openModal={openModal} format={format} source={source}
      hint={hint} onBreakdownClick={onBreakdownClick} />
  )
}

// Gauge label with an optional hover tooltip explaining the calculation. Uses a
// scoped `group/tip` so it triggers on the info icon only, not the whole card.
function GaugeLabel({ label, tooltip, mb = 'mb-1' }) {
  return (
    <div className={`mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 ${mb} self-start flex items-center gap-1.5`}>
      <span>{label}</span>
      {tooltip && (
        <span className="group/tip relative inline-flex shrink-0">
          <Info className="w-3 h-3 text-stone-300 hover:text-stone-500 cursor-help transition-colors" />
          <span role="tooltip" className="pointer-events-none absolute top-full left-0 mt-2 w-[240px] rounded-lg bg-stone-900 text-white text-[11px] leading-snug p-2.5 shadow-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-opacity duration-150 z-30 normal-case tracking-normal font-normal">
            {tooltip}
          </span>
        </span>
      )}
    </div>
  )
}

function GaugeCard({ label, value, target, suffix = '%', color = BRAND, trend, awaiting, metricKey, openModal, tooltip }) {
  const clickable = metricKey && openModal
  const handleClick = () => clickable && openModal(metricKey, value)
  const Wrapper = clickable ? 'button' : 'div'
  const wrapperBaseClass = 'card p-4 flex flex-col items-center relative'
  const wrapperProps = clickable
    ? { onClick: handleClick, type: 'button', className: `${wrapperBaseClass} text-left w-full hover:shadow-md hover:border-stone-400 transition-all group`, style: { minHeight: 170 } }
    : { className: wrapperBaseClass, style: { minHeight: 170 } }

  if (awaiting) {
    return (
      <Wrapper {...wrapperProps}>
        {clickable && <Edit3 className="absolute top-3 right-3 w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
        <GaugeLabel label={label} tooltip={tooltip} mb="mb-3" />
        <div className="flex-1 flex items-center self-start">
          <AwaitingBadge provider={awaiting} />
        </div>
      </Wrapper>
    )
  }
  if (value == null) {
    return (
      <Wrapper {...wrapperProps}>
        {clickable && <Edit3 className="absolute top-3 right-3 w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
        <GaugeLabel label={label} tooltip={tooltip} mb="mb-3" />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-stone-300 text-sm">No data yet</span>
        </div>
        {target != null && (
          <div className="mono-text text-[10px] text-stone-400 text-center mt-1">target {target}{suffix}</div>
        )}
      </Wrapper>
    )
  }

  const size = 140
  const cx = size / 2, cy = size * 0.62, r = size * 0.42, sw = 12
  const pct = Math.min(100, Math.max(0, Number(value)))
  const sweep = (pct / 100) * 180
  const toRad = d => (d * Math.PI) / 180
  const endAngle = -180 + sweep
  const sx = cx + r * Math.cos(toRad(-180))
  const sy = cy + r * Math.sin(toRad(-180))
  const ex = cx + r * Math.cos(toRad(endAngle))
  const ey = cy + r * Math.sin(toRad(endAngle))
  const arcColor = target == null ? color
    : pct >= target ? '#10B981'
    : pct >= target * 0.8 ? '#F59E0B'
    : '#EF4444'

  return (
    <Wrapper {...wrapperProps}>
      {clickable && <Edit3 className="absolute top-3 right-3 w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
      <GaugeLabel label={label} tooltip={tooltip} mb="mb-1" />
      <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} className="overflow-visible">
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(toRad(0))} ${cy + r * Math.sin(toRad(0))}`}
          fill="none" stroke="rgba(26,15,46,0.06)" strokeWidth={sw} strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
            fill="none" stroke={arcColor} strokeWidth={sw} strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="display-text num-tabular"
          style={{ fontSize: '30px', fill: color, fontWeight: 500 }}>
          {Math.round(pct)}{suffix}
        </text>
      </svg>
      {target != null && (
        <div className="mono-text text-[10px] text-stone-500 mt-1">target {target}{suffix}</div>
      )}
    </Wrapper>
  )
}

function HeroAnnualCard({ metricKey, label, value, target, prefix = '', awaiting, format, asOfMonth, openModal, canEdit }) {
  const clickable = metricKey && openModal
  const handleClick = () => clickable && openModal(metricKey, value)
  const Wrapper = clickable ? 'button' : 'div'
  const baseClass = 'card p-6 relative overflow-hidden'
  const wrapperProps = clickable
    ? { onClick: handleClick, type: 'button', className: `${baseClass} text-left w-full hover:shadow-md hover:border-stone-400 transition-all group`, style: { minHeight: 220 } }
    : { className: baseClass, style: { minHeight: 220 } }

  const fmtTarget = (n) => format ? formatMetricValue(n, format) : `${prefix}${fmtNum(n)}`
  const fmtValue = (n) => format ? formatMetricValue(n, format) : `${prefix}${fmtNum(n)}`

  if (awaiting) {
    return (
      <Wrapper {...wrapperProps}>
        {clickable && <Edit3 className="absolute top-4 right-4 w-3.5 h-3.5 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
        <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: BRAND }}>
          Annual Target · {label}
        </div>
        <div className="display-text text-3xl text-stone-300 font-medium mb-2">
          {target != null ? fmtTarget(target) : 'Set a target'}
        </div>
        <div className="mb-4">
          <AwaitingBadge provider={awaiting} />
        </div>
        {target != null && (
          <div className="text-[12px] text-stone-500 mt-2">
            Target: {fmtTarget(target)} {label.toLowerCase()}
          </div>
        )}
        {canEdit && <div className="text-[11px] text-stone-400 mt-3 mono-text">Click to edit target</div>}
      </Wrapper>
    )
  }

  // No value yet (but no awaiting either) — show empty state
  if (value == null && target == null) {
    return (
      <Wrapper {...wrapperProps}>
        {clickable && <Edit3 className="absolute top-4 right-4 w-3.5 h-3.5 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
        <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: BRAND }}>
          Annual Target · {label}
        </div>
        <div className="display-text text-3xl text-stone-300 font-medium mb-2">No target set</div>
        {canEdit && <div className="text-[12px] text-stone-500">Click to set a target</div>}
      </Wrapper>
    )
  }

  const pct = target ? Math.min(100, (Number(value || 0) / target) * 100) : 0
  return (
    <Wrapper {...wrapperProps}>
      {clickable && <Edit3 className="absolute top-4 right-4 w-3.5 h-3.5 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: BRAND }}>
        Annual Target · {label}
      </div>
      <div className="display-text font-medium num-tabular leading-none mb-3" style={{ color: BRAND, fontSize: 'clamp(40px, 7vw, 64px)' }}>
        {value != null ? fmtValue(value) : <span className="text-stone-300">—</span>}
      </div>
      <div className="text-sm text-stone-500 mb-3">
        {target != null ? <>of {fmtTarget(target)} {label.toLowerCase()}</> : <>no target set</>}
        {asOfMonth && <span className="mono-text text-[10.5px] ml-2 text-stone-400">· as of {formatShortMonth(asOfMonth)}</span>}
      </div>
      {target != null && (
        <>
          <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BRAND }} />
          </div>
          <div className="flex justify-between text-[11px] mono-text text-stone-500">
            <span>{pct.toFixed(1)}% to goal</span>
            <span>{(100 - pct).toFixed(1)}% remaining</span>
          </div>
        </>
      )}
    </Wrapper>
  )
}

function formatShortMonth(monthKey) {
  if (!monthKey) return ''
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function shortMonthLabel(monthKey) {
  if (!monthKey) return ''
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short' })
}

// =============================================================================
//  MrrHeroCard — the big unified hero matching the prototype's design.
//  Left: current MRR + progress bar + 3 inline stats (Customers, ARPU, target).
//  Right: monthly MRR trajectory area chart from atlas_targets history.
//  The whole card is clickable to open the MRR target modal. Sub-stats have
//  their own click handlers that open their respective metric modals.
// =============================================================================

function MrrHeroCard({ value, target, asOfMonth, series, customers, customersEdited, customersTarget, arpu, arpuEdited,
                      onClickMrr, onClickCustomers, onClickArpu, canEdit, status, loading, onEditHistory }) {
  const pct = target && value ? Math.min(100, (value / target) * 100) : 0
  const hasMrr = value != null
  const hasTarget = target != null
  const hasChart = series && series.length >= 2
  // While Stripe is loading, suppress stale stored values (they'd flash to live).
  // Manual overrides ('edited') and the target don't depend on Stripe → show instantly.
  const mrrLoading = loading && status !== 'edited'
  const customersLoading = loading && !customersEdited
  const arpuLoading = loading && !arpuEdited

  // Cold load (live revenue not resolved yet, no manual override): show the branded
  // rocket inside the hero shell for the WHOLE load window — never the gray skeleton,
  // and never a stored value that would then jump to the live number. On revisits the
  // data is cached, so loading is false and the full hero renders instantly.
  if (mrrLoading) {
    return (
      <div className="mrr-hero-card relative overflow-hidden rounded-2xl border border-stone-200"
        style={{
          background: 'linear-gradient(135deg, #FAFAF7 0%, #FAF5FF 100%)',
          boxShadow: '0 1px 2px rgba(26,15,46,0.04)',
        }}>
        <div className="absolute -top-32 -right-24 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.18), transparent 70%)' }} />
        <RocketLoader className="min-h-[300px]" label="Loading revenue…" />
      </div>
    )
  }

  return (
    <div className="mrr-hero-card relative overflow-hidden rounded-2xl border border-stone-200 transition-shadow"
      style={{
        background: 'linear-gradient(135deg, #FAFAF7 0%, #FAF5FF 100%)',
        boxShadow: '0 1px 2px rgba(26,15,46,0.04)',
      }}>
      {/* Decorative purple radial */}
      <div className="absolute -top-32 -right-24 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.18), transparent 70%)' }} />

      <div className="relative grid lg:grid-cols-12 gap-6 lg:gap-8 p-6 lg:p-10 items-center">
        {/* LEFT — number, progress, sub-stats */}
        <div className="lg:col-span-5">
          <button
            type="button"
            onClick={onClickMrr}
            className="text-left w-full group"
            disabled={!onClickMrr}
          >
            <div className="flex items-center gap-2 mono-text text-[10.5px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: BRAND }}>
              <Sparkles className="w-3 h-3" /> Annual Target — Total MRR
              {canEdit && <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </div>
            {mrrLoading ? (
              <div className="animate-pulse rounded-xl bg-stone-200/70"
                style={{ width: 'clamp(200px, 30vw, 360px)', height: 'clamp(56px, 9vw, 96px)' }} />
            ) : hasMrr ? (
              <div className="display-text font-medium leading-[0.9] tracking-tight num-tabular"
                style={{ color: BRAND, fontSize: 'clamp(56px, 9vw, 96px)' }}>
                {formatMetricValue(value, 'currency')}
              </div>
            ) : (
              <div className="display-text font-medium text-stone-300" style={{ fontSize: 'clamp(48px, 8vw, 80px)' }}>
                No data
              </div>
            )}
            <div className="display-text italic text-xl md:text-2xl mt-2 text-stone-500">
              {hasTarget ? <>of {formatMetricValue(target, 'currency')} MRR</> : 'no target set'}
              {mrrLoading
                ? <span className="mono-text not-italic text-[10.5px] ml-2 text-stone-400 uppercase tracking-widest">· loading</span>
                : status === 'edited'
                ? <span className="mono-text not-italic text-[10.5px] ml-2 uppercase tracking-widest" style={{ color: '#B45309' }}>· edited</span>
                : status === 'live'
                ? <span className="mono-text not-italic text-[10.5px] ml-2 text-stone-400 uppercase tracking-widest">· live</span>
                : asOfMonth && <span className="mono-text not-italic text-[10.5px] ml-2 text-stone-400 uppercase tracking-widest">· as of {formatShortMonth(asOfMonth)}</span>}
            </div>
            {hasTarget && !mrrLoading && (
              <div className="mt-5 max-w-md">
                <div className="flex items-center justify-between mono-text text-[11px] mb-2 text-stone-500">
                  <span>{pct.toFixed(1)}% to goal</span>
                  <span>{(100 - pct).toFixed(1)}% remaining</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(102,57,166,0.12)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ background: 'linear-gradient(90deg, #6639A6, #9B6EE0)', width: `${pct}%` }} />
                </div>
              </div>
            )}
          </button>

          {/* Sub-stats: Customers, ARPU, Target */}
          <div className="grid grid-cols-3 gap-4 mt-7 pt-6 border-t border-stone-200/60">
            <HeroSubStat
              label="Customers"
              value={customers != null ? Math.round(customers).toLocaleString() : null}
              target={customersEdited ? 'manually set' : (customersTarget != null ? `target ${Math.round(customersTarget).toLocaleString()}` : 'no target')}
              onClick={onClickCustomers}
              canEdit={canEdit}
              loading={customersLoading}
            />
            <HeroSubStat
              label="ARPU"
              value={arpu != null ? formatMetricValue(arpu, 'currency') : null}
              target={arpuEdited ? 'manually set' : (arpu != null ? 'per customer / mo' : 'awaiting Stripe')}
              onClick={onClickArpu}
              canEdit={canEdit}
              loading={arpuLoading}
            />
            <HeroSubStat
              label="MRR Target"
              value={hasTarget ? formatMetricValue(target, 'currency') : null}
              target={hasTarget ? 'end of year goal' : 'set target →'}
              onClick={onClickMrr}
              canEdit={canEdit}
            />
          </div>
        </div>

        {/* RIGHT — monthly MRR trajectory chart */}
        <div className="lg:col-span-7">
          <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold mb-3 text-stone-500 flex items-center justify-between gap-3">
            <span>MRR Trajectory · last {series?.length || 0} weeks</span>
            <div className="flex items-center gap-3">
              {hasChart && (
                <span className="text-stone-400 normal-case tracking-normal text-[11px] italic">
                  {series[0].month} → {series[series.length - 1].month}
                </span>
              )}
              {onEditHistory && (
                <button
                  type="button"
                  onClick={onEditHistory}
                  className="normal-case tracking-normal text-[11px] font-semibold hover:underline"
                  style={{ color: BRAND }}
                >
                  Edit history
                </button>
              )}
            </div>
          </div>
          {hasChart ? (
            <div className="h-56 lg:h-64">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="odyMrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(26,15,46,0.1)" vertical={false} />
                  <XAxis dataKey="month" stroke="#56506A" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#56506A" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `$${v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : (v / 1000).toFixed(0) + 'K'}`} />
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid rgba(26,15,46,0.16)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      boxShadow: '0 4px 16px rgba(26,15,46,0.08)',
                    }}
                    labelFormatter={(label) => label}
                    formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'mrr' ? 'Actual' : 'Target']}
                  />
                  <Area type="monotone" dataKey="mrr" stroke={BRAND} strokeWidth={2.4} fill="url(#odyMrrGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 lg:h-64 rounded-xl border border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 text-sm">
              <Clock className="w-6 h-6 mb-2" />
              <div className="font-semibold">Not enough monthly history yet</div>
              <div className="text-[11px] mt-1">Need at least 2 months of MRR actuals</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HeroSubStat({ label, value, target, onClick, canEdit, loading }) {
  const clickable = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`text-left rounded-lg -mx-1 px-1 py-1 transition-colors ${clickable ? 'hover:bg-purple-50/60 cursor-pointer group' : 'cursor-default'}`}
    >
      <div className="mono-text text-[10px] uppercase tracking-[0.14em] font-semibold text-stone-500 flex items-center gap-1">
        {label}
        {clickable && canEdit && <Edit3 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <div className="display-text text-2xl font-medium mt-1 num-tabular text-stone-900 leading-tight">
        {loading
          ? <span className="inline-block animate-pulse rounded-md bg-stone-200/70 align-middle" style={{ width: 64, height: 22 }} />
          : (value ?? <span className="text-stone-300 text-base font-normal">—</span>)}
      </div>
      <div className="mono-text text-[10.5px] text-stone-400 mt-0.5">{target}</div>
    </button>
  )
}

function AwaitingBadge({ provider }) {
  if (!provider) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold mono-text uppercase tracking-widest px-2 py-1 rounded"
      style={{ color: BRAND, background: 'rgba(102,57,166,0.08)', border: '1px solid rgba(102,57,166,0.22)' }}>
      <Clock className="w-3 h-3" />
      Awaiting {provider}
    </span>
  )
}

function Sparkline({ data, color, height = 36 }) {
  if (!data || data.length < 2) return null
  const validData = data.filter(d => d != null && !isNaN(d))
  if (validData.length < 2) return null
  const max = Math.max(...validData)
  const min = Math.min(...validData)
  const range = max - min || 1
  const w = 100
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} opacity="0.85"
        strokeLinecap="round" strokeLinejoin="round" />
      <polyline fill={color} fillOpacity="0.08" stroke="none"
        points={`0,${height} ${points} ${w},${height}`} />
    </svg>
  )
}

function DeltaPill({ change, positive }) {
  if (!change || Math.abs(change) < 0.05) return null
  return (
    <div className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
      style={{
        background: positive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
        color: positive ? '#15803D' : '#DC2626',
      }}>
      {positive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {Math.abs(change).toFixed(0)}%
    </div>
  )
}

// =============================================================================
//  Helpers
// =============================================================================

function deltaPct(arr) {
  if (!arr || arr.length < 2) return 0
  const last = arr[arr.length - 1]
  const prev = arr[arr.length - 2]
  if (!prev) return 0
  return ((last - prev) / prev) * 100
}

function fmtNum(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + 'K'
  }
  if (Number.isInteger(num)) return num.toLocaleString()
  return num.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function sourceLabel(code) {
  if (!code) return null
  if (code === 'profitwell') return 'ProfitWell'
  if (code === 'stripe') return 'Stripe'
  if (code === 'meta') return 'Meta'
  if (code === 'cal') return 'Cal.com'
  if (code === 'manual' || code === 'manual_backfill') return 'Manual'
  return code
}

// =============================================================================
//  Styles (scoped to .atlas-odyssey-real)
// =============================================================================

function OdysseyStyles() {
  return (
    <style>{`
      .atlas-odyssey-real {
        font-family: 'Manrope', sans-serif;
      }
      .atlas-odyssey-real .display-text {
        font-family: 'Instrument Serif', serif;
        font-weight: 400;
        letter-spacing: -0.01em;
        font-feature-settings: 'tnum';
      }
      .atlas-odyssey-real .mono-text {
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: 'tnum';
      }
      .atlas-odyssey-real .num-tabular {
        font-variant-numeric: tabular-nums;
      }
      .atlas-odyssey-real .card {
        background: white;
        border: 1px solid rgba(26,15,46,0.16);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(26,15,46,0.04), 0 1px 0 rgba(255,255,255,0.9) inset;
        transition: box-shadow 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease, transform 220ms cubic-bezier(.2,.8,.2,1);
      }
      .atlas-odyssey-real .card:hover {
        box-shadow:
          0 2px 4px rgba(26,15,46,0.06),
          0 12px 32px -8px rgba(26,15,46,0.14),
          0 1px 0 rgba(255,255,255,0.9) inset;
        border-color: rgba(26,15,46,0.22);
        transform: translateY(-1px);
      }
      .atlas-odyssey-real .fade-in {
        animation: odysseyFadeIn 320ms cubic-bezier(.16,1,.3,1);
      }
      @keyframes odysseyFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  )
}
