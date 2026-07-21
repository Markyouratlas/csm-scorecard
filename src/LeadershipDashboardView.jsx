import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Crown, Clock, Activity,
  Zap, ChevronRight, AlertCircle, RefreshCw,
  Info, Sparkles, Eye, Gem, Lock,
} from 'lucide-react'
import AtlasLogo from './AtlasLogo'
import HeaderNav from './HeaderNav'
import SettingsModal from './SettingsModal'
import AtlasOdysseyPrototype from './AtlasOdysseyPrototype'
import InvestorView from './InvestorView'
import OdysseyView from './OdysseyView'
import ProfitwellAllMetrics from './ProfitwellAllMetrics'
import { accessTier } from './teams'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'
import { useExecutiveMetrics } from './hooks/useExecutiveMetrics.js'
import FunnelBreakdownModal from './FunnelBreakdownModal.jsx'
import { getWeekKey } from './dateUtils'
import { useMetaAds } from './hooks/useMetaAds.js'
import { useMetaDaily } from './hooks/useMetaDaily.js'
import { Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ComposedChart, BarChart } from 'recharts'

// Atlas brand
const BRAND = '#6639A6'
const BRAND_BRIGHT = '#8B5CD0'
const BRAND_DEEP = '#4A2980'
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'
// Investor ("Odyssey Gold") view accent.
const GOLD = '#B8860B'

// =============================================================================
//  Leadership Dashboard — Phase D-2 (Atlas Odyssey visual language)
//
//  This view is the visual upgrade requested by the CEO. It renders the same
//  data as before via useExecutiveMetrics, but with the Atlas Odyssey
//  prototype's design language: Instrument Serif numerals, custom SVG gauges,
//  brand-purple sparklines, and Liquid Glass tooltips that explain each
//  calculation.
//
//  Wiring rules (unchanged from Phase D-1):
//    - Real values from useExecutiveMetrics → render the metric.
//    - awaiting:true metrics → render the "Awaiting <provider>" placeholder.
//    - null/undefined live metrics → render the "No data yet" empty state with
//      a hint about what needs to happen for data to flow.
// =============================================================================

export default function LeadershipDashboardView({
  profile, onSignOut, onSwitchToManager, onSwitchToManagerTeam, onSwitchToSelf,
  onSwitchToFeatureRequests, onSwitchToFulfillment, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide,
  onSwitchToCommissions,
  onProfileUpdated,
}) {
  const [showSettings, setShowSettings] = useState(false)
  // Three modes: 'odyssey' (real prototype-shaped data with editable targets, default),
  // 'live' (the upgraded live dashboard), and 'prototype' (sample data demo).
  // Per the design, mode NEVER persists — every fresh page load starts on Odyssey.
  const [mode, setMode] = useState('odyssey')
  const tier = accessTier(profile)
  const canSeeManagerView = tier === 'executive' || tier === 'team_lead'
  const headerRef = useGlassInteraction()
  const { metrics, loading, error, meta, refresh } = useExecutiveMetrics()

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #FAFAF7 0%, #EDE7F5 100%)' }}>
      <DashboardStyles />
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
            {/* Odyssey ↔ Live data ↔ Prototype mode picker.
                Defaults to Odyssey on every page load (never persists). */}
            <div
              className="hidden md:flex items-center p-1 rounded-lg border ml-2"
              style={{ background: 'rgba(255,255,255,0.6)', borderColor: 'rgba(102,57,166,0.20)' }}
              role="tablist"
              aria-label="Dashboard mode"
            >
              <button
                onClick={() => setMode('investor')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: mode === 'investor' ? GOLD : 'transparent',
                  color: mode === 'investor' ? 'white' : '#8A6D1B',
                  boxShadow: mode === 'investor' ? '0 1px 2px rgba(184,134,11,0.30)' : 'none',
                }}
                role="tab"
                aria-selected={mode === 'investor'}
                title="Investor view — Odyssey Gold"
              >
                <Gem className="w-3 h-3" /> Odyssey
              </button>
              <button
                onClick={() => setMode('access')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: mode === 'access' ? '#5B21B6' : 'transparent',
                  color: mode === 'access' ? 'white' : '#56506A',
                  boxShadow: mode === 'access' ? '0 1px 2px rgba(91,33,182,0.30)' : 'none',
                }}
                role="tab"
                aria-selected={mode === 'access'}
                title="Access — curate exactly which tiles investors can see"
              >
                <Lock className="w-3 h-3" /> Access
              </button>
              <button
                onClick={() => setMode('odyssey')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: mode === 'odyssey' ? BRAND : 'transparent',
                  color: mode === 'odyssey' ? 'white' : '#56506A',
                  boxShadow: mode === 'odyssey' ? '0 1px 2px rgba(102,57,166,0.25)' : 'none',
                }}
                role="tab"
                aria-selected={mode === 'odyssey'}
              >
                <Sparkles className="w-3 h-3" /> Odyssey
              </button>
              <button
                onClick={() => setMode('live')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: mode === 'live' ? BRAND : 'transparent',
                  color: mode === 'live' ? 'white' : '#56506A',
                  boxShadow: mode === 'live' ? '0 1px 2px rgba(102,57,166,0.25)' : 'none',
                }}
                role="tab"
                aria-selected={mode === 'live'}
              >
                <Activity className="w-3 h-3" /> Live data
              </button>
              <button
                onClick={() => setMode('prototype')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: mode === 'prototype' ? BRAND : 'transparent',
                  color: mode === 'prototype' ? 'white' : '#56506A',
                  boxShadow: mode === 'prototype' ? '0 1px 2px rgba(102,57,166,0.25)' : 'none',
                }}
                role="tab"
                aria-selected={mode === 'prototype'}
              >
                <Eye className="w-3 h-3" /> Prototype
              </button>
            </div>
          </div>
          <HeaderNav
            currentPage="leadership"
            onSwitchToLeadership={null}
            onSwitchToIntegrations={onSwitchToIntegrations}
            onSwitchToFeatureRequests={onSwitchToFeatureRequests}
            onSwitchToFulfillment={onSwitchToFulfillment}
            onSwitchToCancellations={onSwitchToCancellations}
            onSwitchToCommissions={onSwitchToCommissions}
            onSwitchToApiGuide={onSwitchToApiGuide}
            onSwitchToManager={canSeeManagerView ? onSwitchToManager : null}
            onSwitchToSelf={onSwitchToSelf}
            onOpenSettings={() => setShowSettings(true)}
            onSignOut={onSignOut}
          />
        </div>
      </header>

      {/* Investor view — exact Atlas Odyssey prototype, banner-free (no sample-data strip). */}
      {mode === 'investor' && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 pb-10">
          <InvestorView />
        </div>
      )}

      {/* Access — exec-only mirror of the Investor view with per-tile/section/tab
          checkboxes. Checked = visible to investors; unchecked = hidden. */}
      {mode === 'access' && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 pb-10">
          <div className="mt-4 mb-2 px-3 py-2 rounded-lg border text-[12px] leading-snug"
               style={{ borderColor: 'rgba(91,33,182,0.3)', background: 'rgba(91,33,182,0.04)', color: '#5B21B6' }}>
            <strong>Access control.</strong> This is exactly what investors see. Check a tile, section, or tab to make it visible to investors; uncheck to hide it. Everything starts hidden until you turn it on.
          </div>
          <InvestorView mode="access" />
        </div>
      )}

      {mode === 'odyssey' && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 pb-10">
          <OdysseyView onSwitchToManagerTeam={onSwitchToManagerTeam} profile={profile} />
        </div>
      )}

      {mode === 'live' && (
        <div className="max-w-7xl mx-auto px-6 py-10 fade-up">
          <DashboardBody
            profile={profile}
            metrics={metrics}
            loading={loading}
            error={error}
            meta={meta}
            refresh={refresh}
            onSwitchToApiGuide={onSwitchToApiGuide}
          />
        </div>
      )}

      {mode === 'prototype' && (
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 pb-10">
          <PrototypeBanner />
          <AtlasOdysseyPrototype />
        </div>
      )}

      {showSettings && (
        <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={onProfileUpdated} />
      )}
    </div>
  )
}

// =============================================================================
//  PrototypeBanner — a persistent header inside Prototype mode that makes it
//  unambiguous this is the design preview, not live data.
// =============================================================================

function PrototypeBanner() {
  return (
    <div
      className="mt-6 mb-4 p-4 rounded-xl flex items-start gap-3"
      style={{ background: 'rgba(102,57,166,0.08)', border: '1px solid rgba(102,57,166,0.25)' }}
    >
      <Eye className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />
      <div className="flex-1 min-w-0">
        <div className="display-font text-base text-stone-900 font-medium leading-tight">
          Prototype demo — sample data
        </div>
        <div className="text-[12.5px] text-stone-600 mt-0.5 leading-snug">
          You're viewing the design preview of Atlas Odyssey. Numbers below are illustrative.
          Switch to <span className="font-semibold">Live data</span> in the header for current team metrics.
        </div>
      </div>
    </div>
  )
}

// =============================================================================
//  Body — hero + sections
// =============================================================================

function DashboardBody({ profile, metrics, loading, error, meta, refresh, onSwitchToApiGuide }) {
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

  // The hero shows Total MRR as the master gauge of company performance.
  // Until Stripe is wired, we show the new-MRR-closed-this-month from AE
  // deals as a partial signal — flagged as such.
  const newMrrClosedMonth = metrics?.revenue?.newMrrClosedMonth
  const [salesDrill, setSalesDrill] = useState(null) // per-rep Sales funnel breakdown ('booked' | 'showup')
  const [metaPreset, setMetaPreset] = useState('last_7d')
  const [metaPausedOpen, setMetaPausedOpen] = useState(false)
  const [metaExpandedId, setMetaExpandedId] = useState(null)
  const [metaTrendDays, setMetaTrendDays] = useState(30)
  const metaAds = useMetaAds(metaPreset)
  const metaDaily = useMetaDaily(metaTrendDays)

  return (
    <div className="space-y-10">
      {/* HERO — the big number, Instrument Serif treatment */}
      <ExecutiveHero
        profile={profile}
        newMrrClosedMonth={newMrrClosedMonth}
        loading={loading}
        meta={meta}
        refresh={refresh}
      />

      {/* CUSTOMER SUCCESS — wired */}
      <SectionHeading
        eyebrow="Customer Success"
        title="Activation & Retention"
        color="#0F766E"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <GaugeCard
          label="On-Time Activation"
          value={metrics?.cs?.onTimeActivationPct}
          unit="%"
          target={90}
          color="#0F766E"
          loading={loading}
          calc="Implementations done in ≤2 business days, as a % of all completed activations this month."
        />
        <MetricCard
          label="Avg TTFV"
          value={metrics?.cs?.avgTtfvDays}
          unit=" days"
          color="#0F766E"
          loading={loading}

          calc="Average days from signup to first value across all customers tracked by CSMs this week."
        />
        <MetricCard
          label="Implementations"
          value={metrics?.cs?.completedImplementations}
          color="#0F766E"
          loading={loading}
          calc="Count of Implementation Specialist projects marked 'done' this month."
        />
        <MetricCard
          label="Tickets Resolved"
          value={metrics?.cs?.ticketsResolvedWeek}
          color="#0F766E"
          loading={loading}
          calc="Sum of Implementation + Support tickets/items completed this week."
        />
        <MetricCard
          label="Cancellations"
          value={metrics?.cs?.cancellationsThisMonth}
          color="#0F766E"
          loading={loading}

          calc="Customer cancellation events logged this month."
        />
        <MetricCard
          label="MRR Lost"
          value={metrics?.cs?.mrrLostThisMonth}
          prefix="$"
          color="#0F766E"
          loading={loading}

          calc="Total monthly revenue lost from cancellations this month."
        />
      </div>

      {/* SALES — wired */}
      <SectionHeading
        eyebrow="Sales"
        title="Pipeline & Closes"
        color="#F59E0B"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Demos Booked"
          value={metrics?.sales?.demosBookedWeek}
          color="#F59E0B"
          loading={loading}
          calc="Total demos booked by Account Executives this week. Click to see the per-rep breakdown."
          onClick={() => setSalesDrill('booked')}
        />
        <GaugeCard
          label="Show-Up Rate"
          value={metrics?.sales?.showUpRatePct}
          unit="%"
          target={75}
          color="#F59E0B"
          loading={loading}
          calc="Demos completed ÷ demos booked, as a percentage. Higher is better. Click to see the per-rep breakdown."
          onClick={() => setSalesDrill('showup')}
        />
        <GaugeCard
          label="Close Rate"
          value={metrics?.sales?.closeRatePct}
          unit="%"
          target={30}
          color="#F59E0B"
          loading={loading}
          calc="Won deals ÷ (won + lost) this month, as a percentage."
        />
        <MetricCard
          label="Avg Deal Size"
          value={metrics?.sales?.avgDealSize}
          prefix="$"
          color="#F59E0B"
          loading={loading}
          calc="Average closed-won deal value across all AEs this month."
        />
        <MetricCard
          label="New MRR Closed"
          value={metrics?.sales?.newMrrClosedMonth}
          prefix="$"
          color="#F59E0B"
          loading={loading}
          calc="Total recurring revenue signed across won deals this month."
        />
      </div>
      {salesDrill && (
        <FunnelBreakdownModal weekKey={getWeekKey()} metric={salesDrill} onClose={() => setSalesDrill(null)} />
      )}

      {/* MARKETING — wired */}
      <SectionHeading
        eyebrow="Marketing"
        title="Acquisition Funnel"
        color="#3B82F6"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Ad Spend"
          value={metrics?.marketing?.totalAdSpend}
          prefix="$"
          color="#3B82F6"
          loading={loading}
          source="Scorecard"
          calc="Total ad spend logged this week across Growth + Ad Strategist roles (manual entry)."
        />
        <MetricCard
          label="Visitors"
          value={metrics?.marketing?.websiteVisitors}
          color="#3B82F6"
          loading={loading}
          calc="Total website visitors logged this week (Growth + Ad Strategist)."
        />
        <MetricCard
          label="Organic Leads"
          value={metrics?.marketing?.organicLeads}
          color="#3B82F6"
          loading={loading}
          calc="Leads attributed to organic sources, logged by Growth this week."
        />
        <MetricCard
          label="Paid Leads"
          value={metrics?.marketing?.paidAdLeads}
          color="#3B82F6"
          loading={loading}
          calc="Leads attributed to paid ads, this week."
        />
        <GaugeCard
          label="Opt-In Rate"
          value={metrics?.marketing?.optInRatePct}
          unit="%"
          target={3}
          color="#3B82F6"
          loading={loading}
          calc="Opt-ins ÷ visitors this week, as a percentage."
        />
        <MetricCard
          label="Cost / Lead"
          value={metrics?.marketing?.costPerLead}
          prefix="$"
          color="#3B82F6"
          loading={loading}

          calc="Ad spend ÷ paid leads, this week."
        />
        <MetricCard
          label="Ad Spend"
          value={metaAds.summary?.totalSpend}
          prefix="$"
          color="#1877F2"
          loading={metaAds.loading}
          source="Meta"
          calc="Live ad spend from Meta across all campaigns for the selected period."
        />
        <MetricCard
          label="Paid Leads"
          value={metaAds.summary?.totalLeads}
          color="#1877F2"
          loading={metaAds.loading}
          source="Meta"
          calc="Meta 'lead' events summed across all campaigns for the selected period."
        />
        <MetricCard
          label="Registrations"
          value={metaAds.summary?.totalRegistrations}
          color="#1877F2"
          loading={metaAds.loading}
          source="Meta"
          calc="Meta 'complete_registration' events (form completions) summed across all campaigns."
        />
        <MetricCard
          label="Cost / Registration"
          value={metaAds.summary?.totalRegistrations ? Math.round((metaAds.summary.totalSpend / metaAds.summary.totalRegistrations) * 100) / 100 : null}
          prefix="$"
          color="#1877F2"
          loading={metaAds.loading}
          source="Meta"
          calc="Meta ad spend ÷ registrations for the selected period."
        />
      </div>

      {/* UNIT ECONOMICS — mostly awaiting external integrations */}
      <SectionHeading
        eyebrow="Unit Economics"
        title="The numbers under the hood"
        color={BRAND}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <AwaitingCard label="Total MRR" awaiting="Stripe" color={BRAND} calc="Total recurring revenue from all paid subscriptions." />
        <AwaitingCard label="Customers" awaiting="Stripe" color={BRAND} calc="Count of active paying customers." />
        <AwaitingCard label="ARPU" awaiting="Stripe" color={BRAND} calc="Total MRR ÷ active customers." />
        <AwaitingCard label="NRR" awaiting="ProfitWell" color={BRAND} calc="Net Revenue Retention: (Starting + Expansion − Churn − Contraction) ÷ Starting." />
        <AwaitingCard label="CAC" awaiting="Stripe + Ads" color={BRAND} calc="Total S&M spend ÷ new customers acquired in the same period." />
        <AwaitingCard label="LTV : CAC" awaiting="ProfitWell" color={BRAND} calc="Lifetime value ÷ Customer Acquisition Cost. Target ≥ 3:1." />
      </div>

      {/* META ADS — live from Graph API */}
      <SectionHeading
        eyebrow="Paid Ads · Meta"
        title="Campaign Performance"
        color="#1877F2"
      />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {['today', 'last_7d', 'last_30d', 'last_90d'].map(preset => (
          <button
            key={preset}
            onClick={() => setMetaPreset(preset)}
            className="px-3 py-1 text-xs font-semibold rounded-full transition-all"
            style={{
              background: metaPreset === preset ? '#1877F2' : 'rgba(24,119,242,0.08)',
              color: metaPreset === preset ? 'white' : '#1877F2',
              border: '1px solid rgba(24,119,242,0.25)',
            }}
          >
            {preset === 'today' ? 'Today' : preset === 'last_7d' ? '7 days' : preset === 'last_30d' ? '30 days' : '90 days'}
          </button>
        ))}
        {metaAds.summary?.fetchedAt && (
          <span className="mono-font text-[10px] text-stone-400 uppercase tracking-widest ml-2">
            as of {metaAds.summary.fetchedAt}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Spend" value={metaAds.summary?.totalSpend} prefix="$" color="#1877F2" loading={metaAds.loading} calc="Total ad spend across all campaigns for the selected period." />
        <MetricCard label="Impressions" value={metaAds.summary?.totalImpressions} color="#1877F2" loading={metaAds.loading} calc="Total times your ads were shown." />
        <MetricCard label="Clicks" value={metaAds.summary?.totalClicks} color="#1877F2" loading={metaAds.loading} calc="Total inline link clicks across all campaigns." />
        <MetricCard label="Reach" value={metaAds.summary?.totalReach} color="#1877F2" loading={metaAds.loading} calc="Unique accounts that saw your ads at least once." />
        <MetricCard label="Avg CPM" value={metaAds.summary?.avgCpm} prefix="$" color="#1877F2" loading={metaAds.loading} calc="Average cost per 1,000 impressions across active campaigns." />
        <MetricCard label="Avg CTR" value={metaAds.summary?.avgCtr} unit="%" color="#1877F2" loading={metaAds.loading} calc="Average click-through rate across campaigns." />
      </div>
      <div className="grid grid-cols-1 gap-3 mt-3">
        <div className="dashboard-card p-0 overflow-hidden" style={{ minHeight: 'auto' }}>
          <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500">
              Campaigns · {metaAds.summary?.totalCampaignCount ?? '—'} total · {metaAds.summary?.activeCampaignCount ?? '—'} active
            </div>
          </div>
          {metaAds.loading ? (
            <div className="px-5 py-8 text-center text-stone-400 text-sm">Loading…</div>
          ) : metaAds.rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-stone-400 text-sm">No data for this period</div>
          ) : (
            <div>
              {/* LIVE campaigns — always shown */}
              <div className="divide-y divide-stone-50">
                {metaAds.rows.filter(r => r.status === 'ACTIVE').map(row => (
                  <MetaCampaignRow
                    key={row.campaign_id}
                    row={row}
                    expanded={metaExpandedId === row.campaign_id}
                    onToggle={() => setMetaExpandedId(id => id === row.campaign_id ? null : row.campaign_id)}
                  />
                ))}
                {metaAds.rows.filter(r => r.status === 'ACTIVE').length === 0 && (
                  <div className="px-5 py-6 text-center text-stone-400 text-sm">No live campaigns this period</div>
                )}
              </div>

              {/* PAUSED campaigns — collapsed behind a chevron */}
              {metaAds.rows.filter(r => r.status !== 'ACTIVE').length > 0 && (
                <div className="border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setMetaPausedOpen(o => !o)}
                    className="w-full px-5 py-3 flex items-center gap-1.5 hover:bg-stone-50 transition-colors"
                  >
                    <ChevronRight
                      className="w-4 h-4 text-stone-400 transition-transform shrink-0"
                      style={{ transform: metaPausedOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    />
                    <span className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-400">
                      {metaAds.rows.filter(r => r.status !== 'ACTIVE').length} paused campaigns
                    </span>
                  </button>
                  {metaPausedOpen && (
                    <div className="divide-y divide-stone-50 border-t border-stone-50">
                      {metaAds.rows.filter(r => r.status !== 'ACTIVE').map(row => (
                        <MetaCampaignRow
                          key={row.campaign_id}
                          row={row}
                          expanded={metaExpandedId === row.campaign_id}
                          onToggle={() => setMetaExpandedId(id => id === row.campaign_id ? null : row.campaign_id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* META DAILY TRENDS */}
      <div className="grid grid-cols-1 gap-3 mt-3">
        <div className="dashboard-card" style={{ minHeight: 'auto' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500">
              Daily Trend · Spend & Clicks
            </div>
            <div className="flex items-center gap-1.5">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setMetaTrendDays(d)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all"
                  style={{
                    background: metaTrendDays === d ? '#1877F2' : 'rgba(24,119,242,0.08)',
                    color: metaTrendDays === d ? 'white' : '#1877F2',
                    border: '1px solid rgba(24,119,242,0.25)',
                  }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {metaDaily.loading ? (
            <div className="h-[280px] flex items-center justify-center text-stone-400 text-sm">Loading…</div>
          ) : metaDaily.series.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-stone-400 text-sm">No daily data yet</div>
          ) : (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metaDaily.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9c96a8' }} tickFormatter={(v) => `$${v}`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9c96a8' }} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} formatter={(value, name) => name === 'spend' ? [`$${value}`, 'Spend'] : [value, 'Link Clicks']} />
                  <Area yAxisId="left" type="monotone" dataKey="spend" stroke="#1877F2" fill="rgba(24,119,242,0.12)" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#10B981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="dashboard-card" style={{ minHeight: 'auto' }}>
          <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-4">
            Daily Spend
          </div>
          {metaDaily.loading ? (
            <div className="h-[220px] flex items-center justify-center text-stone-400 text-sm">Loading…</div>
          ) : metaDaily.series.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-stone-400 text-sm">No daily data yet</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metaDaily.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#9c96a8' }} tickFormatter={(v) => `$${v}`} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} formatter={(v) => [`$${v}`, 'Spend']} />
                  <Bar dataKey="spend" fill="#1877F2" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <ProfitwellAllMetrics />

      {/* PRODUCT + GROWTH side-by-side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <SectionHeading
            eyebrow="Product & Engineering"
            title="Velocity & Quality"
            color="#7C3AED"
          />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="PRs Merged"
              value={metrics?.product?.prsMergedWeek}
              color="#7C3AED"
              loading={loading}
              calc="Pull requests merged by Engineers this week."
            />
            <MetricCard
              label="PRs Deployed"
              value={metrics?.product?.prsDeployedWeek}
              color="#7C3AED"
              loading={loading}
              calc="Pull requests shipped to production by Engineers this week."
            />
            <MetricCard
              label="New Bugs"
              value={metrics?.product?.newBugsWeek}
              color="#7C3AED"
              loading={loading}

              calc="Net new bugs reported across the Engineering team this week."
            />
            <MetricCard
              label="Velocity"
              value={metrics?.product?.velocityBullets}
              color="#7C3AED"
              loading={loading}
              calc="Theme bullets shipped (rough throughput proxy) — sum across all engineers this week."
            />
            <AwaitingCard label="GitHub PRs (live)" awaiting="GitHub" color="#7C3AED" calc="Real-time pull request stream from the GitHub API. Wires up once API keys are added." />
            <AwaitingCard label="Sentry Errors" awaiting="Sentry" color="#7C3AED" calc="Production error rate from Sentry. Wires up once API keys are added." />
          </div>
        </div>

        <div>
          <SectionHeading
            eyebrow="Growth & Channel"
            title="Trials & Activation"
            color="#EC4899"
          />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Closes"
              value={metrics?.growth?.closesWeek}
              color="#EC4899"
              loading={loading}
              calc="Total closes recorded this week across AE + Growth scorecards."
            />
            <AwaitingCard label="Trial → Paid" awaiting="Amplitude" color="#EC4899" calc="Conversion rate from trial signup to paid customer." />
            <AwaitingCard label="User Activation" awaiting="Amplitude" color="#EC4899" calc="% of new users hitting the activation milestone." />
            <AwaitingCard label="Partner Pipeline" awaiting="HubSpot" color="#EC4899" calc="Total partner-sourced pipeline value, from HubSpot deals." />
          </div>
        </div>
      </div>

      {/* API Setup nudge */}
      {onSwitchToApiGuide && (
        <section className="rounded-xl p-5 flex items-start gap-3"
          style={{ background: BRAND_SOFT, border: `1px solid ${BRAND}33` }}>
          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />
          <div className="flex-1">
            <div className="display-font text-lg text-stone-900 font-medium mb-1">
              More metrics light up as you connect tools.
            </div>
            <div className="text-sm text-stone-600 mb-3">
              Stripe unlocks MRR, customers, ARPU and CAC. ProfitWell adds LTV:CAC and NRR.
              GitHub + Sentry power live engineering metrics.
            </div>
            <button onClick={onSwitchToApiGuide}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors hover:opacity-90 rounded-lg"
              style={{ background: BRAND, color: 'white' }}>
              <Zap className="w-3.5 h-3.5" /> Go to API Setup
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

// =============================================================================
//  Hero — the executive view's headline number
// =============================================================================

// =============================================================================
//  MetaCampaignRow — one campaign row, click name to expand full detail inline
// =============================================================================
function MetaCampaignRow({ row, expanded, onToggle }) {
  const isLive = row.status === 'ACTIVE'
  // Pull lead/conversion counts out of the actions array if present
  const actions = Array.isArray(row.actions) ? row.actions : []
  const actionRows = actions
    .map(a => ({ label: prettyActionType(a.action_type), value: Number(a.value) || 0 }))
    .filter(a => a.value > 0)

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between gap-4 hover:bg-stone-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            className="w-3.5 h-3.5 text-stone-300 transition-transform flex-shrink-0"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold mono-font uppercase tracking-wider flex-shrink-0"
            style={{
              background: isLive ? 'rgba(16,185,129,0.12)' : 'rgba(26,15,46,0.06)',
              color: isLive ? '#047857' : '#6F6884',
            }}
          >
            {isLive ? 'Live' : 'Paused'}
          </span>
          <span className="text-sm text-stone-800 font-medium truncate">{row.campaign_name}</span>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0 mono-font text-[11px] text-stone-600">
          <span>${(row.spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span>{(row.impressions || 0).toLocaleString()} impr</span>
          <span>{(row.ctr || 0).toFixed(2)}% CTR</span>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-4 pt-1 bg-stone-50/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mt-2">
            <MetaDetailStat label="Spend" value={row.spend != null ? `$${row.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'} />
            <MetaDetailStat label="Impressions" value={row.impressions != null ? row.impressions.toLocaleString() : '—'} />
            <MetaDetailStat label="Reach" value={row.reach != null ? row.reach.toLocaleString() : '—'} />
            <MetaDetailStat label="Link Clicks" value={row.inline_link_clicks != null ? row.inline_link_clicks.toLocaleString() : '—'} />
            <MetaDetailStat label="CPM" value={row.cpm != null ? `$${row.cpm.toFixed(2)}` : '—'} />
            <MetaDetailStat label="CTR" value={row.ctr != null ? `${row.ctr.toFixed(2)}%` : '—'} />
            <MetaDetailStat label="Link CTR" value={row.inline_link_click_ctr != null ? `${row.inline_link_click_ctr.toFixed(2)}%` : '—'} />
            <MetaDetailStat label="Campaign ID" value={row.campaign_id} mono />
          </div>
          {actionRows.length > 0 && (
            <div className="mt-4">
              <div className="mono-font text-[9.5px] uppercase tracking-[0.16em] font-semibold text-stone-400 mb-2">Conversions & Actions</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                {actionRows.map(a => (
                  <MetaDetailStat key={a.label} label={a.label} value={a.value.toLocaleString()} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaDetailStat({ label, value, mono }) {
  return (
    <div>
      <div className="mono-font text-[9px] uppercase tracking-[0.14em] text-stone-400 mb-0.5">{label}</div>
      <div className={`text-sm text-stone-800 ${mono ? 'mono-font text-[11px]' : 'font-medium'}`}>{value}</div>
    </div>
  )
}

function prettyActionType(type) {
  if (!type) return 'Action'
  return String(type)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function ExecutiveHero({ profile, newMrrClosedMonth, loading, meta, refresh }) {
  return (
    <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-8 relative overflow-hidden glass-materialize">
      <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.14), transparent 70%)' }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mono-font text-[11px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: BRAND }}>
          <Crown className="w-3 h-3" /> Atlas Odyssey · Executive Dashboard
        </div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1.05] text-stone-900 max-w-3xl">
          The full picture, <em className="font-light" style={{ color: BRAND }}>at a glance.</em>
        </h1>
        <p className="text-stone-600 leading-relaxed max-w-2xl mt-4">
          Welcome, {profile.name.split(' ')[0]}. Live metrics from the team's scorecards roll up below.
          External-system metrics (MRR, ad-platform spend, product analytics) light up as you connect API keys.
        </p>

        {/* Big number row — new MRR closed this month, the most meaningful
            live signal until Stripe is wired. */}
        <div className="mt-8 flex flex-wrap items-end gap-8">
          <div>
            <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500 mb-2">
              New MRR Closed · This month
            </div>
            <div className="display-font font-medium leading-none num-tabular" style={{ color: BRAND, fontSize: 'clamp(48px, 10vw, 92px)' }}>
              {loading ? (
                <span className="text-stone-300">—</span>
              ) : newMrrClosedMonth ? (
                <>
                  <span style={{ color: 'rgba(102,57,166,0.55)' }}>$</span>
                  {formatNumber(newMrrClosedMonth)}
                </>
              ) : (
                <span className="text-stone-300 text-3xl">No deals closed yet</span>
              )}
            </div>
            <div className="text-xs text-stone-500 mt-3 max-w-md">
              Partial signal until Stripe is connected — once it is, this becomes Total MRR.
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <RefreshButton loading={loading} onClick={refresh} />
            {meta && (
              <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500">
                Refreshed {meta.fetchedAt.toLocaleTimeString()} · {meta.memberCount} members
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// =============================================================================
//  Section heading — eyebrow + title with color-coded category line
// =============================================================================

function SectionHeading({ eyebrow, title, color }) {
  return (
    <div className="flex items-end justify-between mb-2 flex-wrap gap-3">
      <div>
        <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color }}>
          {eyebrow}
        </div>
        <h2 className="display-font text-3xl font-medium text-stone-900 leading-tight">{title}</h2>
      </div>
    </div>
  )
}

// =============================================================================
//  MetricCard — number + (optional) sparkline + tooltip
// =============================================================================

function MetricCard({ label, value, prefix = '', unit = '', color = BRAND, loading, calc, source, onClick }) {
  const isReady = !loading && value !== null && value !== undefined
  const formatted = isReady ? formatNumber(value) : null

  return (
    <div className={`dashboard-card relative ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow group' : ''}`}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {})}>
      <div className="flex items-center gap-1.5 mb-3">
        <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500">{label}</div>
        <InfoTooltip content={calc} />
        {source && (
          <span className="ml-auto mono-font text-[8.5px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded" style={{ color: '#1877F2', background: 'rgba(24,119,242,0.10)' }}>
            {source}
          </span>
        )}
      </div>

      <div className="display-font font-medium leading-none num-tabular" style={{ fontSize: 'clamp(28px, 4vw, 40px)', color }}>
        {loading && <span className="text-stone-300">—</span>}
        {!loading && isReady && (
          <>
            {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
            {formatted}
            {unit && <span style={{ opacity: 0.55, fontSize: '0.65em' }}>{unit}</span>}
          </>
        )}
        {!loading && !isReady && (
          <span className="text-stone-300 text-base font-normal">No data yet</span>
        )}
      </div>
    </div>
  )
}

// =============================================================================
//  GaugeCard — semicircular SVG gauge for % metrics with a target
// =============================================================================

function GaugeCard({ label, value, unit = '%', target, color, loading, calc, onClick }) {
  const isReady = !loading && value !== null && value !== undefined

  // Geometry — semicircle arc from -180° to 0°
  const size = 160
  const cx = size / 2
  const cy = size * 0.62
  const r = size * 0.42
  const strokeWidth = 12

  const pct = isReady ? Math.min(100, Math.max(0, Number(value))) : 0
  const sweep = (pct / 100) * 180
  const endAngle = -180 + sweep
  const endX = cx + r * Math.cos(toRad(endAngle))
  const endY = cy + r * Math.sin(toRad(endAngle))
  const startX = cx + r * Math.cos(toRad(-180))
  const startY = cy + r * Math.sin(toRad(-180))
  const largeArc = sweep > 180 ? 1 : 0

  // Target tick angle
  const targetAngle = target != null ? -180 + (Math.min(100, target) / 100) * 180 : null
  const targetX = targetAngle != null ? cx + r * Math.cos(toRad(targetAngle)) : null
  const targetY = targetAngle != null ? cy + r * Math.sin(toRad(targetAngle)) : null

  // Color logic: green if at/over target, amber if 80-99% of target, red below
  const arcColor = !isReady
    ? '#E5E5E5'
    : target == null
      ? color
      : pct >= target
        ? '#10B981'
        : pct >= target * 0.8
          ? '#F59E0B'
          : '#EF4444'

  return (
    <div className={`dashboard-card relative ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow group' : ''}`}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {})}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500">{label}</div>
        <InfoTooltip content={calc} />
      </div>

      <div className="flex flex-col items-center -mt-1">
        <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} className="overflow-visible">
          {/* Background track */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${cx + r * Math.cos(toRad(0))} ${cy + r * Math.sin(toRad(0))}`}
            fill="none"
            stroke="rgba(26,15,46,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active arc */}
          {isReady && pct > 0 && (
            <path
              d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}
          {/* Target tick */}
          {targetX != null && (
            <line
              x1={cx + (r - strokeWidth) * Math.cos(toRad(targetAngle))}
              y1={cy + (r - strokeWidth) * Math.sin(toRad(targetAngle))}
              x2={cx + (r + strokeWidth * 0.4) * Math.cos(toRad(targetAngle))}
              y2={cy + (r + strokeWidth * 0.4) * Math.sin(toRad(targetAngle))}
              stroke="rgba(26,15,46,0.45)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          {/* Center value */}
          <text x={cx} y={cy - 6} textAnchor="middle" className="display-font num-tabular"
            style={{ fontSize: '34px', fill: isReady ? color : '#D6D3D1', fontWeight: 500 }}>
            {isReady ? `${Math.round(pct)}${unit}` : '—'}
          </text>
        </svg>
        {target != null ? (
          <div className="mono-font text-[10px] text-stone-500 mt-1">target {target}{unit}</div>
        ) : (
          <div className="mono-font text-[10px] text-stone-400 mt-1">no target set</div>
        )}
        {!isReady && !loading && (
          <div className="text-[11px] text-stone-400 mt-1">No data yet</div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
//  AwaitingCard — placeholder for metrics that need external API keys
// =============================================================================

function AwaitingCard({ label, awaiting, color, calc }) {
  return (
    <div className="dashboard-card dashboard-card-awaiting relative">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="mono-font text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500">{label}</div>
        <InfoTooltip content={calc} />
      </div>
      <div className="flex flex-col items-start gap-2 mt-2">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold mono-font uppercase tracking-widest px-2 py-1 rounded"
          style={{
            color,
            background: `${color}10`,
            border: `1px solid ${color}33`,
          }}
        >
          <Clock className="w-3 h-3" /> Awaiting {awaiting}
        </span>
        <div className="text-[11px] text-stone-500 leading-snug">
          Connects on API Setup
        </div>
      </div>
    </div>
  )
}

// =============================================================================
//  InfoTooltip — Liquid Glass material, portaled to escape stacking context
// =============================================================================

function InfoTooltip({ content }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const closeTimeoutRef = useRef(null)

  const measure = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: r.top + window.scrollY,
      left: r.left + r.width / 2 + window.scrollX,
    })
  }

  useEffect(() => {
    if (open) {
      measure()
      setMounted(true)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setVisible(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 360)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = () => measure()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  if (!content) return null

  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 200)
  }

  const tooltipNode = mounted ? (
    <span
      role="tooltip"
      className={`atlas-tooltip ${visible ? 'is-visible' : ''}`}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        marginTop: '-10px',
        width: '280px',
        zIndex: 9999,
      }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <span className="block px-4 pt-3 pb-3">
        <span className="block text-[9.5px] uppercase tracking-[0.18em] mono-font font-semibold mb-1.5" style={{ color: BRAND }}>
          Calculation
        </span>
        <span className="block text-[12.5px] font-normal leading-[1.5] text-stone-900">
          {content}
        </span>
      </span>
      <span
        className="absolute top-full left-1/2 w-3 h-3"
        style={{
          transform: 'translateX(-50%) translateY(-50%) rotate(45deg)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.86), rgba(255,255,255,0.72))',
          borderRight: '0.5px solid rgba(255,255,255,0.85)',
          borderBottom: '0.5px solid rgba(255,255,255,0.85)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          boxShadow: '2px 2px 6px -2px rgba(102,57,166,0.20)',
        }}
      />
    </span>
  ) : null

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cancelClose(); setOpen(o => !o) }}
        onFocus={() => { cancelClose(); setOpen(true) }}
        onBlur={scheduleClose}
        className="cursor-help outline-none rounded-full"
        aria-label={`Calculation: ${content}`}
      >
        <Info className="w-3 h-3 transition-colors" style={{ color: open ? BRAND : '#A8A29E' }} />
      </button>
      {tooltipNode && typeof document !== 'undefined' && createPortal(tooltipNode, document.body)}
    </span>
  )
}

// =============================================================================
//  RefreshButton
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
//  Dashboard-scoped styles. Kept inline so this view is portable.
//  All Liquid Glass tokens come from the global :root in App.jsx — we just
//  reference them.
// =============================================================================

function DashboardStyles() {
  return (
    <style>{`
      .dashboard-card {
        background: white;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px 16px;
        min-height: 170px;
        display: flex;
        flex-direction: column;
        position: relative;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.85) inset,
          0 1px 2px rgba(26,15,46,0.04),
          0 4px 12px -6px rgba(102,57,166,0.10);
        transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms;
      }
      .dashboard-card:hover {
        transform: translateY(-1px);
        box-shadow:
          0 1px 0 rgba(255,255,255,0.92) inset,
          0 2px 4px rgba(26,15,46,0.06),
          0 8px 22px -8px rgba(102,57,166,0.18);
      }
      .dashboard-card-awaiting {
        background: rgba(255,255,255,0.6);
      }

      /* Liquid Glass tooltip — portaled, escapes parent stacking. */
      .atlas-tooltip {
        background: linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.72) 100%);
        backdrop-filter: blur(40px) saturate(180%) brightness(1.04);
        -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.04);
        border: 0.5px solid rgba(255,255,255,0.85);
        border-radius: 16px;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.95) inset,
          0 -0.5px 0 rgba(26,15,46,0.05) inset,
          0 0 0 0.5px rgba(26,15,46,0.04),
          0 24px 56px -16px rgba(102,57,166,0.40),
          0 6px 18px rgba(26,15,46,0.10);
        transform: translateX(-50%) translateY(calc(-100% + 6px)) scale(0.94);
        opacity: 0;
        transform-origin: 50% 100%;
        transition:
          opacity 220ms cubic-bezier(.16,1,.3,1),
          transform 340ms cubic-bezier(.16,1.2,.3,1);
        will-change: transform, opacity;
        pointer-events: none;
      }
      .atlas-tooltip.is-visible {
        transform: translateX(-50%) translateY(-100%) scale(1);
        opacity: 1;
        pointer-events: auto;
      }
      .atlas-tooltip::before {
        content: '';
        position: absolute;
        top: 0;
        left: 16%;
        right: 16%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,1) 50%, transparent);
        border-radius: inherit;
        pointer-events: none;
      }
      .atlas-tooltip::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(255,255,255,0.35), transparent 65%);
        border-radius: inherit;
        pointer-events: none;
        mix-blend-mode: screen;
        opacity: 0.55;
      }

      /* Accessibility — disable lensy effects when user prefers reduced motion. */
      @media (prefers-reduced-motion: reduce) {
        .dashboard-card, .atlas-tooltip { transition: none; }
        .dashboard-card:hover { transform: none; }
      }
      @media (prefers-reduced-transparency: reduce) {
        .atlas-tooltip {
          background: rgba(255,255,255,0.98);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
      }
      @media (prefers-contrast: more) {
        .dashboard-card { border: 2px solid var(--text); }
        .atlas-tooltip { background: #FFFFFF; border: 2px solid var(--text); }
      }
    `}</style>
  )
}

// =============================================================================
//  Helpers
// =============================================================================

function toRad(deg) { return (deg * Math.PI) / 180 }

function formatNumber(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + 'K'
  }
  if (Number.isInteger(num)) return num.toLocaleString()
  return num.toLocaleString(undefined, { maximumFractionDigits: 1 })
}
