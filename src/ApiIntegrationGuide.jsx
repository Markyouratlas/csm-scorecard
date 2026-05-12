import React, { useState, useMemo } from 'react'
import {
  LogOut, LayoutDashboard, Settings as SettingsIcon, UserCircle2,
  Lightbulb, Plug, Crown, ChevronRight, ChevronDown, Search, Check, Clock,
  AlertCircle, Megaphone, Briefcase, HeartHandshake, Code, Headphones,
  TrendingUp, Activity, FileSpreadsheet, Sparkles, Calendar, Target,
  CreditCard, BarChart3, Globe, Database, Mail, Phone, GitPullRequest,
  Zap, ShieldCheck, Lock, Server, ExternalLink, Copy, UserMinus
} from 'lucide-react'
import AtlasLogo from './AtlasLogo'
import SettingsModal from './SettingsModal'
import { accessTier } from './teams'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

// =============================================================================
//  Atlas Brand
// =============================================================================
const BRAND = '#6639A6'
const BRAND_BRIGHT = '#8B5CD0'
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'

// =============================================================================
//  API Provider Catalog
//  This is the single source of truth for every external API the Atlas
//  Odyssey dashboard will eventually pull from. Each provider has:
//    - friendly name
//    - what data it supplies
//    - where to get the API key (link)
//    - which scorecard metrics it powers
//    - priority (1 = wire first, 5 = wire last)
//    - status (not_started | gathering_keys | wired)
// =============================================================================

const API_PROVIDERS = [
  {
    id: 'stripe',
    name: 'Stripe',
    icon: CreditCard,
    color: '#635BFF',
    priority: 1,
    category: 'Finance',
    description: 'Primary source of truth for revenue, customer counts, and cash collected.',
    keys_needed: [
      { name: 'STRIPE_SECRET_KEY', purpose: 'Read-only API key from Stripe Dashboard → Developers → API Keys' },
      { name: 'STRIPE_WEBHOOK_SECRET', purpose: '(optional) For real-time updates on subscription changes' },
    ],
    fields_supplied: [
      'Total MRR',
      'Total Customers',
      'New customers per month',
      'Expansion MRR (upgrades)',
      'Contraction MRR (downgrades)',
      'Cash collected (today, MTD)',
    ],
    scorecard_metrics: ['Total MRR', 'Customers', 'ARPU', 'Gross Margin', 'NRR', 'Cash Collected', 'Positive Cash'],
    docs_url: 'https://docs.stripe.com/api',
    setup_url: 'https://dashboard.stripe.com/apikeys',
    estimated_setup: '15 minutes',
    notes: 'Single highest-leverage integration — wire this first. Powers ~60% of executive dashboard.',
  },
  {
    id: 'profitwell',
    name: 'ProfitWell (Paddle)',
    icon: TrendingUp,
    color: '#0070F3',
    priority: 1,
    category: 'Finance',
    description: 'Definitive source for churn rate calculation and cohort retention.',
    keys_needed: [
      { name: 'PROFITWELL_API_TOKEN', purpose: 'Get from ProfitWell Dashboard → Settings → API' },
    ],
    fields_supplied: [
      'Monthly churn rate',
      'Starting MRR (per month)',
      'Churned MRR',
      'Cohort retention curves',
    ],
    scorecard_metrics: ['Churn Rate', 'NRR', 'LTV : CAC', 'CAC Payback'],
    docs_url: 'https://www2.profitwell.com/app/api',
    setup_url: 'https://www2.profitwell.com/app/api_keys',
    estimated_setup: '10 minutes',
    notes: 'Connects to Stripe automatically once both are set up. Free for ProfitWell Retain customers.',
  },
  {
    id: 'meta_ads',
    name: 'Meta Ads (Facebook/Instagram)',
    icon: Megaphone,
    color: '#1877F2',
    priority: 2,
    category: 'Marketing',
    description: 'Paid advertising spend, clicks, conversions from Meta platforms.',
    keys_needed: [
      { name: 'META_AD_ACCOUNT_ID', purpose: 'Found in Meta Business Manager → Ad Accounts' },
      { name: 'META_ACCESS_TOKEN', purpose: 'System User token from Meta Business Manager → Settings → System Users' },
    ],
    fields_supplied: [
      'Daily ad spend (Meta)',
      'Cost per click (Meta)',
      'Impressions, reach',
      'Conversions tracked via Pixel',
    ],
    scorecard_metrics: ['Ad Spend', 'Total Ad Spend', 'Cost per Click', 'Cost / Lead', 'Cost / Booked Demo', 'CAC'],
    docs_url: 'https://developers.facebook.com/docs/marketing-apis',
    setup_url: 'https://business.facebook.com/settings/system-users',
    estimated_setup: '30-45 minutes',
    notes: 'System User token is more reliable than personal tokens (does not expire). Requires Business Manager setup.',
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    icon: Megaphone,
    color: '#4285F4',
    priority: 2,
    category: 'Marketing',
    description: 'Search and display ad spend, clicks, conversions.',
    keys_needed: [
      { name: 'GOOGLE_ADS_DEVELOPER_TOKEN', purpose: 'Apply at Google Ads API Center' },
      { name: 'GOOGLE_ADS_CLIENT_ID', purpose: 'OAuth client ID from Google Cloud Console' },
      { name: 'GOOGLE_ADS_CLIENT_SECRET', purpose: 'OAuth client secret from Google Cloud Console' },
      { name: 'GOOGLE_ADS_REFRESH_TOKEN', purpose: 'OAuth refresh token (one-time setup)' },
      { name: 'GOOGLE_ADS_CUSTOMER_ID', purpose: 'Your Google Ads account ID' },
    ],
    fields_supplied: [
      'Daily ad spend (Google)',
      'Cost per click (Google)',
      'Search impression share',
      'Conversions tracked via gtag',
    ],
    scorecard_metrics: ['Ad Spend', 'Total Ad Spend', 'Cost per Click', 'Cost / Lead', 'CAC'],
    docs_url: 'https://developers.google.com/google-ads/api/docs/start',
    setup_url: 'https://ads.google.com/aw/apicenter',
    estimated_setup: '1-2 hours',
    notes: 'Most complex setup of any integration — developer token approval can take 24-48 hours. Start this early.',
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    icon: BarChart3,
    color: '#E37400',
    priority: 2,
    category: 'Marketing',
    description: 'Website traffic, opt-ins, organic vs paid attribution.',
    keys_needed: [
      { name: 'GA4_PROPERTY_ID', purpose: 'Found in GA4 Admin → Property Settings' },
      { name: 'GA4_SERVICE_ACCOUNT_JSON', purpose: 'Create service account in Google Cloud, share GA4 access with its email' },
    ],
    fields_supplied: [
      'Daily website visitors',
      'Bounce rate, session duration',
      'UTM source/medium attribution (organic vs paid)',
      'Conversion events (form submissions)',
    ],
    scorecard_metrics: ['Website Visitors', 'Organic Leads', 'Paid Ad Leads', 'Opt-In Rate'],
    docs_url: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    setup_url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
    estimated_setup: '20-30 minutes',
    notes: 'Service account approach is simpler than OAuth. Requires Google Cloud project.',
  },
  {
    id: 'amplitude',
    name: 'Amplitude',
    icon: Activity,
    color: '#1F61C7',
    priority: 3,
    category: 'Product',
    description: 'Product analytics — trials, activations, user adoption.',
    keys_needed: [
      { name: 'AMPLITUDE_API_KEY', purpose: 'From Amplitude project Settings → Projects → API Key' },
      { name: 'AMPLITUDE_SECRET_KEY', purpose: 'From the same screen — required for export API' },
    ],
    fields_supplied: [
      'Trials started (daily, weekly)',
      'Trial → paid conversion rate',
      'Activation events triggered',
      'Active users (DAU/WAU/MAU)',
    ],
    scorecard_metrics: ['Trials Started', 'Trial → Paid', 'User Activation Rate', 'User Adoption Rate', 'Active users'],
    docs_url: 'https://www.docs.developers.amplitude.com/analytics/apis/dashboard-rest-api/',
    setup_url: 'https://app.amplitude.com/analytics/settings/projects',
    estimated_setup: '15 minutes',
    notes: 'If using PostHog instead of Amplitude, the integration is similar — different endpoints. Tell us which you use.',
  },
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    icon: Briefcase,
    color: '#FF7A59',
    priority: 3,
    category: 'Sales',
    description: 'Deal pipeline, stage moves, automation. Source of truth for pipeline value.',
    keys_needed: [
      { name: 'HUBSPOT_PRIVATE_APP_TOKEN', purpose: 'Settings → Integrations → Private Apps → Create' },
    ],
    fields_supplied: [
      'Open deals by stage',
      'Deal stage moves',
      'Pipeline value',
      'Deals closed-won/lost',
      'Average deal size',
    ],
    scorecard_metrics: ['Pipeline Value', 'New MRR Closed', 'Avg Deal Size', 'Close Rate', 'Demos Booked'],
    docs_url: 'https://developers.hubspot.com/docs/api/overview',
    setup_url: 'https://app.hubspot.com/private-apps',
    estimated_setup: '20 minutes',
    notes: 'If using Close.com or Pipedrive instead, replace this. Tell us which CRM and we\'ll swap the integration.',
    alternatives: ['Close.com', 'Pipedrive', 'Salesforce'],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: GitPullRequest,
    color: '#0F172A',
    priority: 4,
    category: 'Engineering',
    description: 'Pull requests, deployments, engineering velocity.',
    keys_needed: [
      { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', purpose: 'GitHub → Settings → Developer settings → Personal access tokens (fine-grained)' },
      { name: 'GITHUB_ORG', purpose: 'Your GitHub organization name (e.g. Markyouratlas)' },
    ],
    fields_supplied: [
      'PRs submitted (daily)',
      'PRs merged to main',
      'PRs deployed via CI',
      'Commits per repo',
    ],
    scorecard_metrics: ['PRs Deployed', 'Engineering velocity'],
    docs_url: 'https://docs.github.com/en/rest',
    setup_url: 'https://github.com/settings/tokens',
    estimated_setup: '10 minutes',
    notes: 'Use a fine-grained token scoped to read repos + actions only. Powers engineering metrics.',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    icon: AlertCircle,
    color: '#362D59',
    priority: 4,
    category: 'Engineering',
    description: 'Error monitoring — new bugs reported, bug counts.',
    keys_needed: [
      { name: 'SENTRY_AUTH_TOKEN', purpose: 'Sentry → Settings → Auth Tokens → Create New Token' },
      { name: 'SENTRY_ORG_SLUG', purpose: 'Your Sentry organization slug (in URL: sentry.io/organizations/<slug>)' },
    ],
    fields_supplied: [
      'New issues per day',
      'Issues resolved',
      'Error rate / project',
      'Affected user counts',
    ],
    scorecard_metrics: ['New Bugs Reported', 'Bug-flag-rate to engineering'],
    docs_url: 'https://docs.sentry.io/api/',
    setup_url: 'https://sentry.io/settings/auth-tokens/',
    estimated_setup: '10 minutes',
    notes: 'Token needs project:read and event:read scopes.',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    icon: Headphones,
    color: '#1F8DED',
    priority: 4,
    category: 'Customer Success',
    description: 'Support tickets opened, resolved, response times.',
    keys_needed: [
      { name: 'INTERCOM_ACCESS_TOKEN', purpose: 'Intercom → Settings → Developers → Apps → Create / Edit' },
    ],
    fields_supplied: [
      'Tickets opened (daily)',
      'Tickets resolved',
      'First response time',
      'CSAT scores',
    ],
    scorecard_metrics: ['Tickets Resolved'],
    docs_url: 'https://developers.intercom.com/intercom-api-reference/',
    setup_url: 'https://app.intercom.com/a/apps/_/developer-hub',
    estimated_setup: '10 minutes',
    notes: 'If using Zendesk or HelpScout instead, similar setup with different endpoint.',
    alternatives: ['Zendesk', 'HelpScout', 'Front'],
  },
]

const CATEGORIES = ['Finance', 'Marketing', 'Sales', 'Customer Success', 'Product', 'Engineering']

const PRIORITY_LABELS = {
  1: { label: 'Wire first', color: '#10B981' },
  2: { label: 'Wire second', color: '#3B82F6' },
  3: { label: 'Wire third', color: '#7C3AED' },
  4: { label: 'Wire when ready', color: '#A8A29E' },
  5: { label: 'Future', color: '#A8A29E' },
}

// =============================================================================
//  Main component
// =============================================================================

export default function ApiIntegrationGuide({
  profile, onSignOut, onSwitchToManager, onSwitchToSelf,
  onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToLeadership,
  onProfileUpdated,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const tier = accessTier(profile)
  const canSeeManagerView = tier === 'executive' || tier === 'team_lead'
  const canSeeLeadership = tier === 'executive'
  const headerRef = useGlassInteraction()

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={32} />
            <div className="border-l border-stone-300 pl-4">
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">API Integrations</div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                Setup guide · all integrations
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canSeeLeadership && onSwitchToLeadership && (
              <button onClick={onSwitchToLeadership} className="hidden md:flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm hover:opacity-80"
                style={{ background: BRAND_SOFT, color: BRAND }} title="Leadership Dashboard">
                <Crown className="w-4 h-4" /> <span className="hidden lg:inline">Leadership</span>
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
            {onSwitchToCancellations && (
              <button onClick={onSwitchToCancellations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Cancellations">
                <UserMinus className="w-4 h-4" /> <span className="hidden lg:inline">Cancellations</span>
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
        <ApiIntegrationGuideContent />
      </div>

      {showSettings && (
        <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={onProfileUpdated} />
      )}
    </div>
  )
}

// =============================================================================
//  Content (also exported so the Leadership Dashboard can embed a summary)
// =============================================================================

export function ApiIntegrationGuideContent() {
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const filtered = useMemo(() => {
    let out = API_PROVIDERS
    if (categoryFilter !== 'all') out = out.filter(p => p.category === categoryFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.scorecard_metrics.some(m => m.toLowerCase().includes(q)) ||
        p.fields_supplied.some(f => f.toLowerCase().includes(q))
      )
    }
    return [...out].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  }, [search, categoryFilter])

  const totalKeys = API_PROVIDERS.reduce((s, p) => s + p.keys_needed.length, 0)
  const totalSetupTime = '4-6 hours'  // rough estimate from individual times

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-8 relative overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.12), transparent 70%)' }}
        />
        <div className="relative">
          <div className="mono-font text-[11px] uppercase tracking-[0.18em] font-semibold mb-3 flex items-center gap-2" style={{ color: BRAND }}>
            <Zap className="w-3 h-3" /> Atlas Odyssey · Integration Roadmap
          </div>
          <h1 className="display-font text-4xl md:text-5xl font-medium leading-[1.05] text-stone-900 max-w-3xl">
            Every API key you need, <em className="font-light" style={{ color: BRAND }}>in one place.</em>
          </h1>
          <p className="text-stone-600 leading-relaxed max-w-2xl mt-4">
            Atlas Odyssey is the new executive dashboard. To pull live data, we need to connect to the systems your team already uses.
            This page is the master checklist — work through it in priority order and the dashboard fills itself in.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mt-6 max-w-2xl">
            <SummaryStat label="Integrations" value={API_PROVIDERS.length} />
            <SummaryStat label="API keys total" value={totalKeys} />
            <SummaryStat label="Total setup time" value={totalSetupTime} />
          </div>
        </div>
      </section>

      {/* How to add keys — the security explainer */}
      <HowToAddKeysSection />

      {/* Priority order callout */}
      <section className="border-l-4 bg-violet-50/40 p-5" style={{ borderLeftColor: BRAND }}>
        <div className="display-font text-lg font-medium text-stone-900 mb-1">Recommended order</div>
        <p className="text-sm text-stone-700 leading-relaxed">
          Start with <span className="font-semibold">Stripe + ProfitWell</span>. Together they unlock ~60% of the executive dashboard
          (revenue, customers, ARPU, gross margin, NRR, churn rate, LTV:CAC, CAC payback). Marketing integrations come next
          for ad-spend visibility, then the rest in any order.
        </p>
      </section>

      {/* Toolbar */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-stone-400 mr-2 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations or scorecard metrics..."
            className="w-full py-1.5 text-sm bg-transparent border-b border-transparent focus:border-stone-900 transition-colors focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Filter:</span>
          <button onClick={() => setCategoryFilter('all')}
            className={`text-xs px-2.5 py-1 transition-colors ${categoryFilter === 'all' ? 'bg-stone-900 text-stone-50' : 'border border-stone-200 text-stone-600 hover:border-stone-900'}`}>
            All ({API_PROVIDERS.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = API_PROVIDERS.filter(p => p.category === cat).length
            if (count === 0) return null
            return (
              <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`text-xs px-2.5 py-1 transition-colors ${categoryFilter === cat ? 'bg-stone-900 text-stone-50' : 'border border-stone-200 text-stone-600 hover:border-stone-900'}`}>
                {cat} ({count})
              </button>
            )
          })}
        </div>
      </section>

      {/* Provider cards */}
      <section className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-stone-300 p-12 text-center text-stone-500">
            No integrations match your filter.
          </div>
        ) : (
          filtered.map((provider, idx) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              expanded={expandedId === provider.id}
              onToggle={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
              animationDelay={`${idx * 30}ms`}
            />
          ))
        )}
      </section>

      {/* Legend / footer */}
      <section className="bg-white border border-stone-200 rounded-xl shadow-sm p-5">
        <div className="display-font text-base font-medium text-stone-900 mb-3">Legend</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {Object.entries(PRIORITY_LABELS).map(([key, meta]) => Number(key) <= 4 && (
            <div key={key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
              <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">P{key} —</span>
              <span className="text-stone-700">{meta.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="border border-stone-200 bg-stone-50/60 p-3">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className="display-font text-2xl font-medium text-stone-900 num-tabular">{value}</div>
    </div>
  )
}

function ProviderCard({ provider: p, expanded, onToggle, animationDelay }) {
  const Icon = p.icon
  const priorityMeta = PRIORITY_LABELS[p.priority]

  // Phase A: every provider is "Awaiting key" since no integrations are wired yet.
  // In Phase D, this becomes dynamic — read from a server-side check that pings
  // the actual API to confirm the env var is set and valid.
  const status = 'awaiting'
  const statusMeta = STATUS_META[status]

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm transition-shadow hover:shadow-sm fade-up overflow-hidden" style={{ animationDelay }}>
      <button onClick={onToggle} className="w-full text-left p-5 flex items-start justify-between gap-4 focus:outline-none focus:bg-stone-50 transition-colors">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="h-11 w-11 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${p.color}14`, border: `1px solid ${p.color}33` }}>
            <Icon className="w-5 h-5" style={{ color: p.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-font text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: priorityMeta.color }}>
                P{p.priority}
              </span>
              <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{p.category}</span>
              <span className="text-stone-300">·</span>
              <span className="mono-font text-[10px] text-stone-500 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {p.estimated_setup}
              </span>
              <span className="text-stone-300">·</span>
              <span className="inline-flex items-center gap-1 mono-font text-[10px] uppercase tracking-widest font-semibold"
                style={{ color: statusMeta.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta.color }} />
                {statusMeta.label}
              </span>
            </div>
            <div className="display-font text-2xl font-medium text-stone-900 mt-0.5">{p.name}</div>
            <p className="text-sm text-stone-600 mt-1">{p.description}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {p.scorecard_metrics.slice(0, 4).map(m => (
                <span key={m} className="text-[10px] mono-font px-2 py-0.5 rounded" style={{ background: BRAND_SOFT, color: BRAND }}>
                  {m}
                </span>
              ))}
              {p.scorecard_metrics.length > 4 && (
                <span className="text-[10px] mono-font text-stone-500">+{p.scorecard_metrics.length - 4} more</span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-5 h-5 text-stone-400 flex-shrink-0 mt-2" /> : <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0 mt-2" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-stone-200 pt-5 space-y-5 fade-up">
          {/* Keys needed — now with copyable variable names */}
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> API keys to gather
            </div>
            <div className="space-y-2">
              {p.keys_needed.map(k => (
                <div key={k.name} className="border border-stone-200 bg-stone-50/40 px-3 py-2.5 rounded-lg">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-xs font-semibold text-stone-900 break-all">{k.name}</code>
                        <CopyButton text={k.name} />
                      </div>
                      <div className="text-xs text-stone-600 mt-0.5">{k.purpose}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Where to paste the keys — provider-specific reminder */}
            <div className="mt-3 p-3 rounded text-xs flex items-start gap-2" style={{ background: 'rgba(102,57,166,0.05)', border: `1px solid ${BRAND}33` }}>
              <Server className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />
              <div className="text-stone-700">
                <span className="font-semibold" style={{ color: BRAND }}>Add these to Vercel</span>, not here. See the
                <span className="font-semibold"> "How to add your keys"</span> section above for the step-by-step.
                Once added, this card flips to <span className="font-semibold" style={{ color: '#10B981' }}>Connected</span> on the next deploy.
              </div>
            </div>
          </div>

          {/* Fields supplied */}
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3 h-3" /> Data this provides
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {p.fields_supplied.map(f => (
                <div key={f} className="text-sm text-stone-700 inline-flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Scorecard metrics powered */}
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2 flex items-center gap-1.5">
              <Target className="w-3 h-3" /> Scorecard metrics this powers
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {p.scorecard_metrics.map(m => (
                <span key={m} className="text-xs px-2 py-1 rounded" style={{ background: BRAND_SOFT, color: BRAND }}>
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Notes */}
          {p.notes && (
            <div className="bg-amber-50/60 border border-amber-200 px-3 py-2.5 text-sm text-stone-800">
              <span className="mono-font text-[10px] uppercase tracking-widest text-amber-700 mr-1.5">Note:</span>
              {p.notes}
            </div>
          )}

          {/* Alternatives */}
          {p.alternatives && p.alternatives.length > 0 && (
            <div className="text-xs text-stone-500">
              <span className="font-semibold">Don't use {p.name}?</span> Tell us — we support {p.alternatives.join(', ')} as drop-in replacements.
            </div>
          )}

          {/* Action links */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-stone-100">
            <a href={p.setup_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 rounded"
              style={{ background: BRAND }}>
              <Sparkles className="w-3.5 h-3.5" /> Get keys from {p.name}
              <ExternalLink className="w-3 h-3" />
            </a>
            <a href={p.docs_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-700 hover:text-stone-900 transition-colors border border-stone-200 hover:border-stone-900 rounded">
              <FileSpreadsheet className="w-3.5 h-3.5" /> API docs
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
//  Status metadata — Phase A shows "Awaiting key" for everything.
//  In Phase D, we'll add a server-side check that flips this to "Connected"
//  when the env var is set and the API responds healthily.
// =============================================================================

const STATUS_META = {
  awaiting:  { label: 'Awaiting key', color: '#A8A29E' },
  testing:   { label: 'Testing',      color: '#F59E0B' },
  connected: { label: 'Connected',    color: '#10B981' },
  error:     { label: 'Error',        color: '#EF4444' },
}

// =============================================================================
//  How to add keys — the security explainer + Vercel walkthrough
// =============================================================================

function HowToAddKeysSection() {
  const [expanded, setExpanded] = useState(false)
  return (
    <section className="bg-white border-2 p-6" style={{ borderColor: BRAND }}>
      <div className="flex items-start gap-3 mb-1">
        <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center" style={{ background: BRAND, color: 'white' }}>
          <Lock className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="mono-font text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
            How to add your keys
          </div>
          <div className="display-font text-2xl font-medium text-stone-900 leading-tight">
            You won't paste keys here. <em className="font-light">Here's why — and where they go.</em>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        {/* Why not here */}
        <div className="border border-stone-200 p-4 bg-stone-50/40">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <div className="font-semibold text-stone-900 text-sm">Why not in this app</div>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed">
            API keys (especially Stripe, ProfitWell, ad platforms) are <span className="font-semibold">production credentials</span> — anyone who has them
            can charge cards, refund payments, see customer data, or run up your ad spend. That means they
            can never live in the browser, even briefly. They have to live somewhere your <span className="font-semibold">server</span> can read them
            but the browser can't see them.
          </p>
        </div>

        {/* Where they go */}
        <div className="border border-stone-200 p-4" style={{ background: 'rgba(102,57,166,0.04)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4" style={{ color: BRAND }} />
            <div className="font-semibold text-stone-900 text-sm">Where they actually go: Vercel</div>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed">
            Atlas Scorecard is hosted on Vercel. Vercel has a built-in <span className="font-semibold">Environment Variables</span> feature
            for exactly this — a secure, encrypted vault that only your deployed code can read.
            You add each key once in the Vercel dashboard, and the integrations pick them up automatically.
          </p>
        </div>
      </div>

      {/* Walkthrough — collapsible to reduce visual noise */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
        style={{ color: BRAND }}>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Step-by-step: how to add a key in Vercel
      </button>

      {expanded && (
        <div className="mt-4 fade-up">
          <ol className="space-y-3">
            {VERCEL_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mono-font"
                  style={{ background: BRAND }}>
                  {i + 1}
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="text-sm text-stone-800 leading-relaxed">{step.text}</div>
                  {step.detail && (
                    <div className="text-xs text-stone-500 mt-1">{step.detail}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 p-4 rounded text-sm" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-stone-800 leading-relaxed">
                <span className="font-semibold">Use the EXACT variable names</span> shown on each provider card below.
                If you name a Stripe key <code className="text-xs font-mono bg-white px-1 py-0.5 rounded">STRIPE_KEY</code> instead of <code className="text-xs font-mono bg-white px-1 py-0.5 rounded">STRIPE_SECRET_KEY</code>,
                the integration won't find it and the dashboard will show "Awaiting key" forever. Click the
                <Copy className="w-3 h-3 inline mx-0.5" /> icon next to each variable name on the cards below to copy it.
              </div>
            </div>
          </div>

          <div className="mt-3 p-4 rounded text-sm" style={{ background: 'rgba(102,57,166,0.06)', border: `1px solid ${BRAND}33` }}>
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />
              <div className="text-stone-800 leading-relaxed">
                <span className="font-semibold">Heads up — not enough by itself yet.</span> Adding keys to Vercel is step 1.
                Step 2 (Phase D) is server-side code that <em>reads</em> those keys and calls the actual APIs. We'll build
                that in the next phase using Supabase Edge Functions. Adding keys early is fine — they'll just sit safely
                until the integration code is wired up.
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// Vercel walkthrough — kept here as data so it's easy to update
const VERCEL_STEPS = [
  {
    text: 'Go to vercel.com and sign in. Open the csm-scorecard project.',
    detail: 'Direct link: https://vercel.com/dashboard',
  },
  {
    text: 'Click Settings (top of project page) → Environment Variables (left sidebar).',
    detail: 'You\'ll see a "Create new" form and a list of any existing variables.',
  },
  {
    text: 'In the "Key" field, paste the EXACT variable name from the provider card below (e.g. STRIPE_SECRET_KEY).',
    detail: 'Use the copy button next to each variable name to avoid typos.',
  },
  {
    text: 'In the "Value" field, paste the actual key you got from the provider.',
    detail: 'For Stripe, it\'s the live secret key starting with "sk_live_" or test key "sk_test_".',
  },
  {
    text: 'Leave the environment checkboxes (Production, Preview, Development) all checked unless you have a reason not to.',
    detail: 'For early development you typically want the same key everywhere. You can split later if needed.',
  },
  {
    text: 'Click "Save".',
    detail: 'The variable is now encrypted and stored. Vercel will redact the value when displaying it back to you.',
  },
  {
    text: 'Trigger a redeploy: go to Deployments tab → click the "..." menu on the latest deploy → Redeploy.',
    detail: 'Environment variables only take effect after a new deploy. The redeploy takes 1-2 minutes.',
  },
]

// Lightweight copy-to-clipboard button
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const onCopy = (e) => {
    e.stopPropagation()
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }).catch(() => {})
    }
  }
  return (
    <button onClick={onCopy} title="Copy variable name"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] mono-font transition-colors hover:bg-stone-100"
      style={{ color: copied ? '#10B981' : '#6B7280' }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
