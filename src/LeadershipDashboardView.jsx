import React, { useState } from 'react'
import {
  LogOut, LayoutDashboard, Settings as SettingsIcon, UserCircle2,
  Lightbulb, Plug, Crown, Sparkles, Clock, TrendingUp,
  DollarSign, Activity, Megaphone, Briefcase,
  Code, Zap, ChevronRight, CheckCircle2, RefreshCw, AlertCircle,
} from 'lucide-react'
import AtlasLogo from './AtlasLogo'
import SettingsModal from './SettingsModal'
import { accessTier } from './teams'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'
import { useExecutiveMetrics } from './hooks/useExecutiveMetrics.js'

// Atlas brand
const BRAND = '#6639A6'
const BRAND_BRIGHT = '#8B5CD0'
const BRAND_DEEP = '#4A2980'
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'

// =============================================================================
//  Leadership Dashboard — Phase D-1 (real data from existing scorecards)
//
//  Wires the dashboard to the team's existing scorecard data via
//  useExecutiveMetrics. Metrics that require external APIs (Stripe, ProfitWell,
//  GA4, etc.) render as "Awaiting <provider>" placeholders.
// =============================================================================

export default function LeadershipDashboardView({
  profile, onSignOut, onSwitchToManager, onSwitchToSelf,
  onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToApiGuide,
  onProfileUpdated,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const tier = accessTier(profile)
  const canSeeManagerView = tier === 'executive' || tier === 'team_lead'
  const headerRef = useGlassInteraction()
  const { metrics, loading, error, meta, refresh } = useExecutiveMetrics()

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #FAFAF7 0%, #EDE7F5 100%)' }}>
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={32} />
            <div className="border-l border-stone-300 pl-4">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4" style={{ color: BRAND }} />
                <div className="display-font text-lg font-medium text-stone-900 leading-tight">Leadership</div>
              </div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                Executive dashboard · Atlas Odyssey
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onSwitchToApiGuide && (
              <button onClick={onSwitchToApiGuide} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="API Integrations">
                <Zap className="w-4 h-4" /> <span className="hidden lg:inline">API Setup</span>
              </button>
            )}
            {onSwitchToFeatureRequests && (
              <button onClick={onSwitchToFeatureRequests} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Feature Requests">
                <Lightbulb className="w-4 h-4" /> <span className="hidden lg:inline">Feature Requests</span>
              </button>
            )}
            {onSwitchToIntegrations && (
              <button onClick={onSwitchToIntegrations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Integrations">
                <Plug className="w-4 h-4" /> <span className="hidden lg:inline">Integrations</span>
              </button>
            )}
            {onSwitchToSelf && (
              <button onClick={onSwitchToSelf} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <UserCircle2 className="w-4 h-4" /> My scorecard
              </button>
            )}
            {canSeeManagerView && onSwitchToManager && (
              <button onClick={onSwitchToManager} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <LayoutDashboard className="w-4 h-4" /> Manager view
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 fade-up">
        <LeadershipDashboardContent
          profile={profile}
          onSwitchToApiGuide={onSwitchToApiGuide}
          metrics={metrics}
          loading={loading}
          error={error}
          meta={meta}
          refresh={refresh}
        />
      </div>

      {showSettings && (
        <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={onProfileUpdated} />
      )}
    </div>
  )
}

function LeadershipDashboardContent({ profile, onSwitchToApiGuide, metrics, loading, error, meta, refresh }) {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.14), transparent 70%)' }}
        />
        <div className="relative">
          <div className="mono-font text-[11px] uppercase tracking-[0.18em] font-semibold mb-3 flex items-center gap-2" style={{ color: BRAND }}>
            <Crown className="w-3 h-3" /> Atlas Odyssey · Executive Dashboard
          </div>
          <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1.05] text-stone-900 max-w-3xl">
            The full picture, <em className="font-light" style={{ color: BRAND }}>at a glance.</em>
          </h1>
          <p className="text-stone-600 leading-relaxed max-w-2xl mt-4">
            Welcome, {profile.name.split(' ')[0]}. Live metrics from the team's scorecards roll up below — refreshed every page load.
            External-system metrics (MRR, ad-platform spend, product analytics) light up as you connect API keys.
          </p>
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            <RefreshButton loading={loading} onClick={refresh} />
            {meta && (
              <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500">
                Last refresh · {meta.fetchedAt.toLocaleTimeString()} · {meta.memberCount} team members
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top-line live metrics — the hero KPIs */}
      <LiveKpiBand metrics={metrics} loading={loading} error={error} />

      {/* Six metric groups — each with real values where wired, "Awaiting" otherwise */}
      <section>
        <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">By function</div>
            <h2 className="display-font text-3xl font-medium text-stone-900 mt-1">The six metric groups</h2>
          </div>
          {onSwitchToApiGuide && (
            <button onClick={onSwitchToApiGuide}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors hover:opacity-90 rounded-lg"
              style={{ background: BRAND_SOFT, color: BRAND, border: `1px solid ${BRAND}33` }}>
              <Zap className="w-3.5 h-3.5" /> API Setup
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {METRIC_GROUPS.map((group, i) => (
            <MetricGroupCard
              key={group.id}
              group={group}
              metrics={metrics}
              loading={loading}
              animationDelay={`${i * 60}ms`}
            />
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">What ships next</div>
        <p className="text-sm text-stone-600 mb-5">
          Each phase is fully demoable on its own.
        </p>
        <div className="space-y-3">
          {ROADMAP.map((phase, i) => (
            <div key={phase.id} className="flex items-start gap-4 p-3 border border-stone-200 hover:border-stone-300 transition-colors rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center mono-font text-xs font-bold"
                style={{
                  background: phase.status === 'shipping' ? BRAND : phase.status === 'done' ? '#10B981' : 'rgba(0,0,0,0.05)',
                  color: phase.status === 'pending' ? '#A8A29E' : 'white',
                }}>
                {String.fromCharCode(65 + i)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="display-font text-base font-medium text-stone-900">{phase.title}</div>
                  <span className="mono-font text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-semibold"
                    style={{
                      background: phase.status === 'shipping' ? BRAND_SOFT : phase.status === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(168,162,158,0.15)',
                      color: phase.status === 'shipping' ? BRAND : phase.status === 'done' ? '#047857' : '#57534E',
                    }}>
                    {phase.status === 'shipping' ? 'Shipping now' : phase.status === 'done' ? 'Done' : 'Up next'}
                  </span>
                </div>
                <p className="text-sm text-stone-600 mt-0.5">{phase.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
//  Top-line live KPI band — the most important live numbers, hero-sized
// =============================================================================

function LiveKpiBand({ metrics, loading, error }) {
  if (error) {
    return (
      <section className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-900">
          <div className="font-semibold mb-0.5">Couldn't load metrics</div>
          <div className="text-red-800">{String(error.message || error)}</div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500 mb-3">
        Live · this week
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <BigKpi
          label="Avg Time-to-First-Value"
          value={metrics?.cs?.avgTtfvDays}
          unit="days"
          loading={loading}
          source="From CSM scorecards"
          color="#0F766E"
          icon={Clock}
        />
        <BigKpi
          label="Implementations Complete"
          value={metrics?.cs?.completedImplementations}
          unit=""
          loading={loading}
          source="This month · all teams"
          color={BRAND}
          icon={CheckCircle2}
        />
        <BigKpi
          label="On-Time Activation"
          value={metrics?.cs?.onTimeActivationPct}
          unit="%"
          loading={loading}
          source="2-business-day SLA hit rate"
          color="#10B981"
          icon={TrendingUp}
        />
        <BigKpi
          label="New MRR Closed"
          value={metrics?.sales?.newMrrClosedMonth}
          unit="$"
          unitPosition="prefix"
          loading={loading}
          source="AE deals · this month"
          color="#F59E0B"
          icon={DollarSign}
        />
      </div>
    </section>
  )
}

function BigKpi({ label, value, unit, unitPosition = 'suffix', loading, source, color, icon: Icon }) {
  const isReady = !loading && value !== null && value !== undefined
  const formatted = isReady ? formatNumber(value) : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 leading-tight">{label}</div>
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
      </div>
      <div className="display-font text-4xl font-medium text-stone-900 leading-none mt-3 num-tabular">
        {loading
          ? <span className="text-stone-300">—</span>
          : isReady
            ? <>
                {unitPosition === 'prefix' && <span className="text-stone-500">{unit}</span>}
                {formatted}
                {unitPosition === 'suffix' && unit && <span className="text-stone-500 text-2xl ml-1">{unit}</span>}
              </>
            : <span className="text-stone-300 text-2xl">No data yet</span>
        }
      </div>
      <div className="text-[11px] text-stone-500 mt-3">{source}</div>
    </div>
  )
}

// =============================================================================
//  Metric group card — six of these, one per function
// =============================================================================

function MetricGroupCard({ group, metrics, loading, animationDelay }) {
  const Icon = group.icon
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 relative overflow-hidden fade-up" style={{ animationDelay }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: group.color }} />
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${group.color}14`, border: `1px solid ${group.color}33` }}>
          <Icon className="w-5 h-5" style={{ color: group.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mono-font text-[10px] uppercase tracking-widest font-semibold" style={{ color: group.color }}>{group.category}</div>
          <div className="display-font text-xl font-medium text-stone-900 leading-tight mt-0.5">{group.title}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {group.metrics.map(m => (
          <MetricRow key={m.label} spec={m} metrics={metrics} loading={loading} groupColor={group.color} />
        ))}
      </div>
    </div>
  )
}

// One row of metric label + value. Three states: loading, live, awaiting-API.
function MetricRow({ spec, metrics, loading, groupColor }) {
  const isAwaiting = !!spec.awaiting
  const value = isAwaiting ? null : readPath(metrics, spec.path)
  const isLive = !isAwaiting && !loading && value !== null && value !== undefined

  return (
    <div className="flex flex-col gap-0.5 py-2">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 leading-tight">
        {spec.label}
      </div>
      <div className="display-font text-2xl font-medium text-stone-900 leading-none num-tabular">
        {loading && !isAwaiting && <span className="text-stone-300">—</span>}
        {!loading && isLive && (
          <>
            {spec.unitPosition === 'prefix' && spec.unit && <span className="text-stone-500 text-base">{spec.unit}</span>}
            {formatNumber(value)}
            {spec.unitPosition !== 'prefix' && spec.unit && <span className="text-stone-500 text-base ml-1">{spec.unit}</span>}
          </>
        )}
        {!loading && !isAwaiting && !isLive && (
          <span className="text-stone-300 text-base font-normal">No data</span>
        )}
        {isAwaiting && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold mono-font uppercase tracking-widest px-2 py-1 rounded"
            style={{
              color: groupColor,
              background: `${groupColor}10`,
              border: `1px solid ${groupColor}33`,
            }}
          >
            <Clock className="w-3 h-3" /> Awaiting {spec.awaiting}
          </span>
        )}
      </div>
    </div>
  )
}

// =============================================================================
//  Refresh button — manual reload of executive metrics
// =============================================================================

function RefreshButton({ loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-90 rounded-lg disabled:opacity-60"
      style={{ background: BRAND, color: 'white' }}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Refreshing' : 'Refresh now'}
    </button>
  )
}

// =============================================================================
//  Helpers
// =============================================================================

function readPath(obj, path) {
  if (!obj || !path) return null
  return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj)
}

function formatNumber(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  if (Number.isInteger(num)) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// =============================================================================
//  Static configuration — six metric groups, what they show
// =============================================================================

const METRIC_GROUPS = [
  {
    id: 'cs',
    category: 'Customer Success',
    title: 'Activation & Retention',
    icon: TrendingUp,
    color: '#0F766E',
    metrics: [
      { label: 'On-Time Activation',     path: 'cs.onTimeActivationPct',     unit: '%' },
      { label: 'Avg TTFV',               path: 'cs.avgTtfvDays',             unit: 'days' },
      { label: 'Implementations',        path: 'cs.completedImplementations', unit: '' },
      { label: 'Tickets Resolved (wk)',  path: 'cs.ticketsResolvedWeek',     unit: '' },
      { label: 'Cancellations (mo)',     path: 'cs.cancellationsThisMonth',  unit: '' },
      { label: 'MRR Lost (mo)',          path: 'cs.mrrLostThisMonth', unit: '$', unitPosition: 'prefix' },
    ],
  },
  {
    id: 'sales',
    category: 'Sales',
    title: 'Pipeline & Closes',
    icon: Briefcase,
    color: '#F59E0B',
    metrics: [
      { label: 'Demos Booked (wk)',  path: 'sales.demosBookedWeek',    unit: '' },
      { label: 'Show-Up Rate',       path: 'sales.showUpRatePct',      unit: '%' },
      { label: 'Close Rate (mo)',    path: 'sales.closeRatePct',       unit: '%' },
      { label: 'Avg Deal Size',      path: 'sales.avgDealSize',        unit: '$', unitPosition: 'prefix' },
      { label: 'New MRR (mo)',       path: 'sales.newMrrClosedMonth',  unit: '$', unitPosition: 'prefix' },
    ],
  },
  {
    id: 'marketing',
    category: 'Marketing',
    title: 'Acquisition Funnel',
    icon: Megaphone,
    color: '#3B82F6',
    metrics: [
      { label: 'Total Ad Spend (wk)', path: 'marketing.totalAdSpend', unit: '$', unitPosition: 'prefix' },
      { label: 'Website Visitors',    path: 'marketing.websiteVisitors', unit: '' },
      { label: 'Organic Leads',       path: 'marketing.organicLeads', unit: '' },
      { label: 'Paid Ad Leads',       path: 'marketing.paidAdLeads', unit: '' },
      { label: 'Opt-In Rate',         path: 'marketing.optInRatePct', unit: '%' },
      { label: 'Cost / Lead',         path: 'marketing.costPerLead', unit: '$', unitPosition: 'prefix' },
    ],
  },
  {
    id: 'revenue',
    category: 'Finance',
    title: 'Revenue & Customers',
    icon: DollarSign,
    color: '#10B981',
    metrics: [
      { label: 'Total MRR',     awaiting: 'Stripe' },
      { label: 'Customers',     awaiting: 'Stripe' },
      { label: 'ARPU',          awaiting: 'Stripe' },
      { label: 'NRR',           awaiting: 'ProfitWell' },
      { label: 'CAC',           awaiting: 'Stripe + Ads' },
      { label: 'LTV : CAC',     awaiting: 'ProfitWell' },
    ],
  },
  {
    id: 'product',
    category: 'Product & Engineering',
    title: 'Velocity & Quality',
    icon: Code,
    color: '#7C3AED',
    metrics: [
      { label: 'PRs Deployed (wk)',     path: 'product.prsDeployedWeek',  unit: '' },
      { label: 'New Bugs (wk)',         path: 'product.newBugsWeek',      unit: '' },
      { label: 'Velocity (bullets)',    path: 'product.velocityBullets',  unit: '' },
      { label: 'GitHub PRs (live)',     awaiting: 'GitHub' },
      { label: 'Sentry Errors',         awaiting: 'Sentry' },
    ],
  },
  {
    id: 'growth',
    category: 'Growth & Channel',
    title: 'Trials & Activation',
    icon: Activity,
    color: '#EC4899',
    metrics: [
      { label: 'Trials Started (wk)',   path: 'growth.trialsStartedWeek', unit: '' },
      { label: 'Trial → Paid',          awaiting: 'Amplitude' },
      { label: 'User Activation',       awaiting: 'Amplitude' },
      { label: 'Partner Pipeline',      awaiting: 'HubSpot' },
    ],
  },
]

const ROADMAP = [
  { id: 'a', title: 'Foundation + API Guide', description: 'This page + the API Integration Guide. Sets up access control and gives the engineering team a roadmap.', status: 'done' },
  { id: 'b', title: 'Visual restyle (Atlas Odyssey palette)', description: 'Brand purple, Instrument Serif typography, soft off-white canvas across the entire app.', status: 'done' },
  { id: 'c', title: 'Liquid Glass navigation', description: 'Apple-style Liquid Glass treatment on headers, tabs, and modals. Doctrine-pure.', status: 'done' },
  { id: 'd', title: 'Live executive dashboard (this page)', description: 'Real metrics flowing in from the team\'s scorecards. About half the dashboard wired; external-API metrics light up next.', status: 'shipping' },
  { id: 'e', title: 'API integrations (rolling)', description: 'Stripe first (highest-leverage), then ProfitWell, then ad platforms, then product analytics. Connected one at a time as keys arrive.', status: 'pending' },
]
