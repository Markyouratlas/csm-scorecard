import React, { useState } from 'react'
import {
  LogOut, LayoutDashboard, Settings as SettingsIcon, UserCircle2,
  Lightbulb, Plug, Crown, Sparkles, Clock, Calendar, TrendingUp,
  DollarSign, Users, Target, Activity, BarChart3, Megaphone, Briefcase,
  Headphones, Code, Globe, Zap, ChevronRight
} from 'lucide-react'
import AtlasLogo from './AtlasLogo'
import SettingsModal from './SettingsModal'
import { accessTier } from './teams'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

// Atlas brand
const BRAND = '#6639A6'
const BRAND_BRIGHT = '#8B5CD0'
const BRAND_DEEP = '#4A2980'
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'

// =============================================================================
//  Leadership Dashboard — Phase A placeholder
//
//  This is the shell for what will become the Atlas Odyssey Executive Dashboard.
//  Phase A: shows the structure, hero, and "coming soon" tiles for each metric
//           group. Proves access control + nav routing work.
//  Phase C: will replace the placeholder tiles with real data, wired to Stripe,
//           ProfitWell, GA4, etc. (or showing "[demo data]" when no API connected)
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
        <LeadershipDashboardContent profile={profile} onSwitchToApiGuide={onSwitchToApiGuide} />
      </div>

      {showSettings && (
        <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={onProfileUpdated} />
      )}
    </div>
  )
}

function LeadershipDashboardContent({ profile, onSwitchToApiGuide }) {
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
            Welcome, {profile.name.split(' ')[0]}. Atlas Odyssey is your single source of truth — every metric that matters,
            rolled up daily from the team's scorecards and external systems like Stripe, ProfitWell, and your ad platforms.
          </p>
        </div>
      </section>

      {/* Coming-soon notice */}
      <section className="border-l-4 bg-violet-50/40 p-5 flex items-start gap-4 flex-wrap" style={{ borderLeftColor: BRAND }}>
        <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center" style={{ background: BRAND, color: 'white' }}>
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[260px]">
          <div className="display-font text-lg font-medium text-stone-900 mb-1">Phase A — foundation deployed</div>
          <p className="text-sm text-stone-700 leading-relaxed">
            You're seeing the shell of the dashboard. Real metrics flow in once we wire up the source APIs.
            The next deploy phase brings the full visual styling. Phase C wires up the data — start gathering API keys now to compress the timeline.
          </p>
          {onSwitchToApiGuide && (
            <button onClick={onSwitchToApiGuide}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 rounded"
              style={{ background: BRAND }}>
              <Zap className="w-3.5 h-3.5" /> View API Setup Guide
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* Metric group placeholders — these are the buckets the real dashboard will fill */}
      <section>
        <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">Coming in Phase C</div>
            <h2 className="display-font text-3xl font-medium text-stone-900 mt-1">Six metric groups</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {METRIC_GROUPS.map((group, i) => (
            <MetricGroupPlaceholder key={group.id} group={group} animationDelay={`${i * 60}ms`} />
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">What ships next</div>
        <p className="text-sm text-stone-600 mb-5">
          The Atlas Odyssey rollout is staged so you can demo at every checkpoint. Each phase is fully testable.
        </p>
        <div className="space-y-3">
          {ROADMAP.map((phase, i) => (
            <div key={phase.id} className="flex items-start gap-4 p-3 border border-stone-200 hover:border-stone-300 transition-colors">
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

function MetricGroupPlaceholder({ group, animationDelay }) {
  const Icon = group.icon
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 relative overflow-hidden fade-up hover:border-stone-300 transition-colors" style={{ animationDelay }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: group.color }} />
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${group.color}14`, border: `1px solid ${group.color}33` }}>
          <Icon className="w-5 h-5" style={{ color: group.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mono-font text-[10px] uppercase tracking-widest font-semibold" style={{ color: group.color }}>{group.category}</div>
          <div className="display-font text-xl font-medium text-stone-900 leading-tight mt-0.5">{group.title}</div>
        </div>
      </div>
      <p className="text-sm text-stone-600 leading-snug mb-3">{group.description}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {group.metrics.map(m => (
          <span key={m} className="text-[10px] mono-font px-1.5 py-0.5 rounded text-stone-500 bg-stone-100">
            {m}
          </span>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-400 mono-font flex items-center gap-1.5">
        <Clock className="w-3 h-3" /> Awaiting data — Phase C
      </div>
    </div>
  )
}

// =============================================================================
//  Static configuration
// =============================================================================

const METRIC_GROUPS = [
  {
    id: 'revenue',
    category: 'Finance',
    title: 'Revenue & Customers',
    icon: DollarSign,
    color: '#10B981',
    description: 'MRR, customer count, ARPU, and the unit economics that determine company health.',
    metrics: ['Total MRR', 'Customers', 'ARPU', 'Gross Margin', 'CAC', 'LTV : CAC', 'CAC Payback', 'NRR'],
  },
  {
    id: 'sales',
    category: 'Sales',
    title: 'Pipeline & Closes',
    icon: Briefcase,
    color: '#F59E0B',
    description: 'Demos booked, show rate, close rate, and new MRR — the leading indicators of growth.',
    metrics: ['Demos Booked', 'Show-Up Rate', 'Close Rate', 'Avg Deal Size', 'New MRR Closed'],
  },
  {
    id: 'marketing',
    category: 'Marketing',
    title: 'Acquisition Funnel',
    icon: Megaphone,
    color: '#3B82F6',
    description: 'Ad spend, traffic, leads, and the cost of getting each conversation started.',
    metrics: ['Total Ad Spend', 'Website Visitors', 'Organic Leads', 'Paid Ad Leads', 'Opt-In Rate', 'Cost / Lead'],
  },
  {
    id: 'cs',
    category: 'Customer Success',
    title: 'Activation & Retention',
    icon: TrendingUp,
    color: '#0F766E',
    description: 'How fast customers reach value, how reliably they stay, and where the churn is leaking.',
    metrics: ['On-Time Activation', 'Time-to-First-Value', 'Implementations', 'Churn Rate', 'Tickets Resolved'],
  },
  {
    id: 'product',
    category: 'Product & Engineering',
    title: 'Velocity & Quality',
    icon: Code,
    color: '#7C3AED',
    description: 'PRs deployed, new bugs surfaced, and the engineering throughput that powers everything.',
    metrics: ['PRs Deployed', 'New Bugs Reported', 'Engineering Velocity'],
  },
  {
    id: 'growth',
    category: 'Growth & Channel',
    title: 'Trials & Partnerships',
    icon: Activity,
    color: '#EC4899',
    description: 'Top-of-funnel signal — trial starts, conversions to paid, and partnership-attributed deals.',
    metrics: ['Trials Started', 'Trial → Paid', 'User Activation Rate', 'Partner Pipeline'],
  },
]

const ROADMAP = [
  { id: 'a', title: 'Foundation + API Guide', description: 'This page + the API Integration Guide. Sets up access control and gives the engineering team a roadmap.', status: 'shipping' },
  { id: 'b', title: 'Visual restyle (Atlas Odyssey palette)', description: "Apply purple accent + Instrument Serif typography across the entire app for visual consistency.", status: 'pending' },
  { id: 'c', title: 'Live executive dashboard', description: 'Wire up real metrics — pulled from existing scorecard data + API integrations as keys are connected.', status: 'pending' },
  { id: 'd', title: 'API integrations (rolling)', description: 'Stripe first, then ProfitWell, then ad platforms, then product analytics. Connect one at a time as keys arrive.', status: 'pending' },
]
