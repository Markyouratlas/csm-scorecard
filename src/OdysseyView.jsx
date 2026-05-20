import React, { useState, useMemo } from 'react'
import {
  Sparkles, TrendingUp, HeartHandshake, Megaphone, Rocket, Code,
  Info, Clock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Activity, AlertCircle, RefreshCw, ExternalLink,
} from 'lucide-react'
import { useOdysseyMetrics } from './hooks/useOdysseyMetrics.js'
import { TEAMS } from './teams.js'

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

export default function OdysseyView({ onSwitchToScorecard }) {
  const [view, setView] = useState('executive')
  const data = useOdysseyMetrics()

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
        {view === 'executive' && <ExecutiveView data={data} />}
        {view === 'weekly'    && <WeeklyView data={data} />}
        {view === 'daily'     && <DailyView data={data} />}
        {view === 'log'       && <QuickLogView onSwitchToScorecard={onSwitchToScorecard} />}
        {view === 'tracking'  && <TrackingGuide />}
      </main>
      {data.meta && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 pb-6 flex items-center justify-between flex-wrap gap-2 mono-text">
          <div className="text-[11px] text-stone-500 uppercase tracking-widest">
            Refreshed {data.meta.fetchedAt.toLocaleTimeString()} · {data.meta.memberCount} members
          </div>
          <button onClick={data.refresh}
            disabled={data.loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md hover:bg-stone-100 disabled:opacity-50"
            style={{ color: BRAND }}>
            <RefreshCw className={`w-3 h-3 ${data.loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
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

function ExecutiveView({ data }) {
  return (
    <div className="space-y-10 fade-in">
      <SectionHeader
        deptKey="exec"
        eyebrow="Annual Target"
        title="Atlas Goals"
        description="Where the company is heading this year."
      />

      {/* Annual targets — mostly Stripe-dependent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HeroAnnualCard
          label="Total MRR"
          target={300000}
          prefix="$"
          awaiting={data.awaiting?.totalMRR}
        />
        <HeroAnnualCard
          label="Total Customers"
          target={600}
          awaiting={data.awaiting?.totalCustomers}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberBlock
          label="LTV : CAC"
          value={null}
          suffix=":1"
          awaiting={data.awaiting?.ltvCac}
        />
        <NumberBlock
          label="Gross Margin"
          value={null}
          suffix="%"
          awaiting={data.awaiting?.grossMargin}
        />
        <NumberBlock
          label="Net Rev Retention"
          value={null}
          suffix="%"
          awaiting={data.awaiting?.netRevRetention}
        />
      </div>

      <SectionHeader
        deptKey="exec"
        eyebrow="Strategic Initiatives"
        title="Where the executive team is leaning in"
        description="The bets we're making this quarter, and how they're tracking."
      />
      <StrategicInitiatives data={data} />

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
        <MetricCard label="ARPU"           awaiting={data.awaiting?.arpu} />
        <MetricCard label="Gross Margin"   awaiting={data.awaiting?.grossMargin} />
        <MetricCard label="Cost / Service" awaiting={data.awaiting?.grossMargin} />
        <MetricCard label="CAC"            awaiting={data.awaiting?.cac} />
        <MetricCard label="CAC Payback"    awaiting={data.awaiting?.cacPayback} />
        <MetricCard label="LTV : CAC"      awaiting={data.awaiting?.ltvCac} />
      </div>
    </div>
  )
}

// =============================================================================
//  Weekly view — the actual rollups of what was logged this week
// =============================================================================

function WeeklyView({ data }) {
  const w = data.thisWeek || {}
  const t = data.trends || {}

  return (
    <div className="space-y-10 fade-in">
      <SectionHeader
        deptKey="marketing"
        eyebrow="Marketing Scorecard"
        title="Top of funnel & efficiency"
        description="Did our paid + organic engine produce qualified pipeline this week, and at what cost?"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <GaugeCard
          label="Opt-In Rate"
          value={w.optInRatePctWeek}
          target={3}
          suffix="%"
          color={DEPTS.marketing.color}
          trend={t.optInRate}
        />
        <NumberBlock
          label="Cost / Lead"
          value={w.costPerLeadWeek}
          prefix="$"
          color={DEPTS.marketing.color}
          trend={t.costPerLead}
          invertDelta
        />
        <NumberBlock
          label="Website Visitors"
          value={w.websiteVisitorsWeek}
          color={DEPTS.marketing.color}
          trend={t.websiteVisitors}
        />
        <NumberBlock
          label="Total Ad Spend"
          value={w.totalAdSpendWeek}
          prefix="$"
          color={DEPTS.marketing.color}
          trend={t.totalAdSpend}
          invertDelta
        />
        <NumberBlock
          label="Organic Leads"
          value={w.organicLeadsWeek}
          color={DEPTS.marketing.color}
          trend={t.organicLeads}
        />
        <NumberBlock
          label="Paid Ad Leads"
          value={w.paidLeadsWeek}
          color={DEPTS.marketing.color}
          trend={t.paidLeads}
        />
        <MetricCard label="CAC" awaiting={data.awaiting?.cac} />
        <MetricCard label="Cost / Booked Demo" awaiting={data.awaiting?.costPerDemo} />
      </div>

      <SectionHeader
        deptKey="sales"
        eyebrow="Sales Scorecard"
        title="Pipeline → revenue"
        description="Leading indicators that turn into closed business: demos, show rates, and new MRR."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          label="Demos Booked"
          value={w.demosBookedWeek}
          color={DEPTS.sales.color}
          trend={t.demosBooked}
        />
        <GaugeCard
          label="Show-Up Rate"
          value={w.showUpRatePct}
          target={75}
          suffix="%"
          color={DEPTS.sales.color}
          trend={t.showRate}
        />
        <GaugeCard
          label="Close Rate"
          value={w.closeRatePct}
          target={30}
          suffix="%"
          color={DEPTS.sales.color}
          trend={t.closeRate}
        />
        <NumberBlock
          label="Closes"
          value={w.trialSignupsWeek}
          color={DEPTS.sales.color}
          trend={t.trialsStarted}
        />
        <NumberBlock
          label="New MRR Closed"
          value={data.thisMonth?.newMrrClosedMonth}
          prefix="$"
          color={DEPTS.sales.color}
          hint="month-to-date"
        />
        <NumberBlock
          label="Avg Deal Size"
          value={data.thisMonth?.avgDealSize}
          prefix="$"
          color={DEPTS.sales.color}
          hint="from won deals"
        />
        <MetricCard label="Total MRR" awaiting={data.awaiting?.totalMRR} />
        <MetricCard label="ARPU" awaiting={data.awaiting?.arpu} />
      </div>

      <SectionHeader
        deptKey="cs"
        eyebrow="Customer Success"
        title="Retain, activate, support"
        description="Churn, NRR, and the on-time activation bar that keeps customers live within the 14-day mark."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard label="On-Time Activation" awaiting={data.awaiting?.onTimeActivation} />
        <MetricCard label="Churn Rate" awaiting={data.awaiting?.churnRate} />
        <MetricCard label="Net Rev Retention" awaiting={data.awaiting?.NRR} />
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
          label="PRs Deployed"
          value={w.prsDeployedWeek}
          color={DEPTS.product.color}
          trend={t.prsDeployed}
        />
        <NumberBlock
          label="New Bugs Reported"
          value={w.newBugsWeek}
          color={DEPTS.product.color}
          trend={t.newBugs}
          invertDelta
        />
        <MetricCard label="User Adoption Rate" awaiting={data.awaiting?.userAdoption} />
      </div>

      <SectionHeader
        deptKey="growth"
        eyebrow="Growth & Ops"
        title="Self-serve activation engine"
        description="Trials in, paid out — and the activation loop in the middle that decides everything."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <NumberBlock
          label="Trials Started"
          value={w.trialSignupsWeek}
          color={DEPTS.growth.color}
          trend={t.trialsStarted}
        />
        <MetricCard label="Trial → Paid" awaiting={data.awaiting?.trialToPaid} />
        <MetricCard label="User Activation Rate" awaiting={data.awaiting?.activationRate} />
      </div>
    </div>
  )
}

// =============================================================================
//  Daily view — today's daily entries
// =============================================================================

function DailyView({ data }) {
  const td = data.today || {}
  const now = new Date()
  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-10 fade-in">
      <div className="card p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.12), transparent 70%)' }} />
        <div className="relative">
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
      </div>

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
      </div>

      <SectionHeader
        deptKey="marketing"
        eyebrow="Paid · Today"
        title="Ad performance"
        description="Spend efficiency and demo flow from paid channels today."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DailyTile label="Ad Spend" value={td.adSpendToday} prefix="$" color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="Cost / Click" value={td.cpcToday} prefix="$" color={DEPTS.marketing.color} hint="today" awaiting={td.cpcToday == null && 'Click tracking'} />
        <DailyTile label="Paid Leads" value={td.paidLeadsToday} color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="Organic Leads" value={td.organicLeadsToday} color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="Website Visitors" value={td.websiteVisitorsToday} color={DEPTS.marketing.color} hint="today" />
        <DailyTile label="MRR Closed" value={null} prefix="$" color={DEPTS.marketing.color} awaiting={data.awaiting?.newMRR} />
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
    </div>
  )
}

function DailyTile({ label, value, prefix = '', suffix = '', color = BRAND, hint, awaiting }) {
  const isMissing = awaiting || value == null
  return (
    <div className="card p-4 flex flex-col" style={{ minHeight: 110 }}>
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
    </div>
  )
}

// =============================================================================
//  Quick Log — directory of role scorecards
// =============================================================================

function QuickLogView({ onSwitchToScorecard }) {
  // Flatten teams.js into a per-role list with team context
  const roles = useMemo(() => {
    return TEAMS
      .filter(t => !t.isLeadership)
      .flatMap(team => team.roles.map(role => ({
        team,
        role,
      })))
  }, [])

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
            Log today's numbers. <em className="font-light italic" style={{ color: BRAND }}>Live everywhere.</em>
          </h1>
          <div className="text-sm text-stone-600 mt-3 leading-relaxed max-w-2xl">
            Each role enters the small handful of numbers they're responsible for in their own
            scorecard. Saved entries flow immediately into the Daily Pulse view, and weekly
            snapshots feed the calculated metrics on the Executive view.
          </div>
        </div>
      </div>

      <SectionHeader
        eyebrow="By Role"
        title="Open a scorecard"
        description="Click any role to jump into that team's scorecard."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {roles.map(({ team, role }) => (
          <RoleLauncherCard key={`${team.key}-${role.key}`}
            team={team}
            role={role}
            onClick={onSwitchToScorecard} />
        ))}
      </div>
    </div>
  )
}

function RoleLauncherCard({ team, role, onClick }) {
  return (
    <button
      onClick={() => onClick?.(team.key, role.key)}
      className="card p-4 text-left hover:border-stone-400 transition-all group relative"
      style={{ minHeight: 80 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1"
            style={{ color: team.color }}>
            {team.label}
          </div>
          <div className="display-text text-lg font-medium leading-tight text-stone-900">
            {role.label}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
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
                'Tickets resolved', 'Implementations completed', 'TTFV per customer (CSM)']
    },
    {
      title: 'Cancellations log',
      provider: 'Supabase · cancellations table',
      status: 'connected',
      metrics: ['Cancellations this month', 'MRR lost from churn']
    },
    {
      title: 'Stripe',
      provider: 'Awaiting API key',
      status: 'awaiting',
      metrics: ['Total MRR', 'Active customers', 'ARPU', 'New MRR per day', 'Expansion / contraction MRR',
                'Cash collected per day']
    },
    {
      title: 'ProfitWell / Stripe analytics',
      provider: 'Awaiting API key',
      status: 'awaiting',
      metrics: ['Net Revenue Retention (NRR)', 'LTV : CAC ratio', 'CAC payback months', 'Cohort churn']
    },
    {
      title: 'Amplitude (or product analytics)',
      provider: 'Awaiting setup',
      status: 'awaiting',
      metrics: ['Trial → Paid conversion %', 'User activation rate', 'User adoption rate', 'Daily activation events']
    },
    {
      title: 'HubSpot / CRM',
      provider: 'Awaiting integration',
      status: 'awaiting',
      metrics: ['Partner pipeline value', 'Partner-sourced opportunities', 'Partner-driven calls']
    },
    {
      title: 'OKR system',
      provider: 'No source chosen yet',
      status: 'awaiting',
      metrics: ['Quarterly OKR progress', 'OKR ownership', 'OKR cadence updates']
    },
  ]

  return (
    <div className="space-y-8 fade-in">
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
          <div key={src.title} className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="display-text text-lg font-medium text-stone-900 leading-tight">{src.title}</div>
                <div className="mono-text text-[10.5px] uppercase tracking-widest text-stone-500 mt-1">
                  {src.provider}
                </div>
              </div>
              {src.status === 'connected' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded mono-text uppercase tracking-widest"
                  style={{ color: '#15803D', background: 'rgba(22,163,74,0.08)' }}>
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
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
//  Strategic Initiatives — derived from real data
// =============================================================================

function StrategicInitiatives({ data }) {
  const w = data.thisWeek || {}
  const initiatives = [
    {
      name: 'Paid Acquisition',
      metric: 'Cost / Lead',
      value: w.costPerLeadWeek != null ? `$${w.costPerLeadWeek}` : null,
      deptKey: 'marketing',
      info: 'Total ad spend ÷ paid leads this week.',
    },
    {
      name: 'Sales Velocity',
      metric: 'Close Rate',
      value: w.closeRatePct != null ? `${w.closeRatePct}%` : null,
      deptKey: 'sales',
      info: 'Closes ÷ demos completed this week.',
    },
    {
      name: 'Engineering Output',
      metric: 'PRs Deployed',
      value: w.prsDeployedWeek != null ? `${w.prsDeployedWeek}` : null,
      deptKey: 'product',
      info: 'Pull requests deployed to production this week by all engineers.',
    },
    {
      name: 'Activation Loop',
      metric: 'Closes',
      value: w.trialSignupsWeek != null ? `${w.trialSignupsWeek}` : null,
      deptKey: 'growth',
      info: 'Total Closes / Trial Signups this week across AE + Growth.',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {initiatives.map(init => {
        const dept = DEPTS[init.deptKey]
        return (
          <div key={init.name} className="card p-5 relative">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold"
                style={{ color: dept.color }}>
                {dept.name}
              </div>
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

function MetricCard({ label, value, prefix = '', suffix = '', color = BRAND, trend, awaiting, invertDelta }) {
  if (awaiting) {
    return (
      <div className="card p-4 flex flex-col" style={{ minHeight: 170 }}>
        <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
          {label}
        </div>
        <div className="flex-1 flex items-center">
          <AwaitingBadge provider={awaiting} />
        </div>
      </div>
    )
  }
  const change = trend && trend.length >= 2 ? deltaPct(trend) : 0
  const positive = invertDelta ? change < 0 : change > 0
  return (
    <div className="card p-4 flex flex-col" style={{ minHeight: 170 }}>
      <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="display-text font-medium leading-none num-tabular" style={{ color, fontSize: '32px' }}>
          {value != null ? (
            <>
              {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
              {fmtNum(value)}
              {suffix && <span style={{ opacity: 0.55, fontSize: '0.6em' }}>{suffix}</span>}
            </>
          ) : (
            <span className="text-stone-300 text-base font-normal">No data yet</span>
          )}
        </div>
        {trend && Math.abs(change) > 0.05 && <DeltaPill change={change} positive={positive} />}
      </div>
      {trend && trend.some(v => v > 0) && (
        <div className="mt-auto pt-3 -mx-1">
          <Sparkline data={trend} color={color} />
        </div>
      )}
    </div>
  )
}

function NumberBlock({ label, value, prefix = '', suffix = '', color = BRAND, trend, awaiting, invertDelta, hint }) {
  return (
    <MetricCard label={label} value={value} prefix={prefix} suffix={suffix}
      color={color} trend={trend} awaiting={awaiting} invertDelta={invertDelta} />
  )
}

function GaugeCard({ label, value, target, suffix = '%', color = BRAND, trend, awaiting }) {
  if (awaiting) {
    return (
      <div className="card p-4 flex flex-col" style={{ minHeight: 170 }}>
        <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
          {label}
        </div>
        <div className="flex-1 flex items-center">
          <AwaitingBadge provider={awaiting} />
        </div>
      </div>
    )
  }
  if (value == null) {
    return (
      <div className="card p-4 flex flex-col" style={{ minHeight: 170 }}>
        <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
          {label}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-stone-300 text-sm">No data yet</span>
        </div>
        {target != null && (
          <div className="mono-text text-[10px] text-stone-400 text-center mt-1">target {target}{suffix}</div>
        )}
      </div>
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
    <div className="card p-4 flex flex-col items-center" style={{ minHeight: 170 }}>
      <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-1 self-start">
        {label}
      </div>
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
    </div>
  )
}

function HeroAnnualCard({ label, value, target, prefix = '', awaiting }) {
  if (awaiting) {
    return (
      <div className="card p-6 relative overflow-hidden" style={{ minHeight: 220 }}>
        <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: BRAND }}>
          Annual Target · Atlas Goals
        </div>
        <div className="display-text text-3xl text-stone-300 font-medium mb-2">
          {prefix}{fmtNum(target)}
        </div>
        <div className="mb-4">
          <AwaitingBadge provider={awaiting} />
        </div>
        <div className="text-[12px] text-stone-500 mt-2">
          Target: {prefix}{fmtNum(target)} {label.toLowerCase()}
        </div>
      </div>
    )
  }

  const pct = target ? Math.min(100, (Number(value) / target) * 100) : 0
  return (
    <div className="card p-6 relative overflow-hidden" style={{ minHeight: 220 }}>
      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: BRAND }}>
        Annual Target · Atlas Goals
      </div>
      <div className="display-text font-medium num-tabular leading-none mb-3" style={{ color: BRAND, fontSize: 'clamp(48px, 8vw, 72px)' }}>
        {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
        {fmtNum(value)}
      </div>
      <div className="text-sm text-stone-500 mb-3">of {prefix}{fmtNum(target)} {label.toLowerCase()}</div>
      <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BRAND }} />
      </div>
      <div className="flex justify-between text-[11px] mono-text text-stone-500">
        <span>{pct.toFixed(1)}% to goal</span>
        <span>{(100 - pct).toFixed(1)}% remaining</span>
      </div>
    </div>
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
