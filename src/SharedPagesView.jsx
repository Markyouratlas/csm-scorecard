import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Lightbulb, Plug, Loader2, Plus, Trash2, Search, Download, ChevronDown, ChevronRight,
  ChevronUp, ArrowUpDown, LogOut, LayoutDashboard, Settings as SettingsIcon, ArrowLeft,
  ExternalLink, UserCircle2, Star, AlertCircle, Crown, Zap, UserMinus, DollarSign,
  Send, Check
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { supabase } from './supabase'
import AtlasLogo from './AtlasLogo'
import SettingsModal from './SettingsModal'
import { accessTier } from './teams'
import { CANCELLATION_CATEGORIES, cancellationCategoryLabel } from './constants'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

// =============================================================================
//  Constants — kept local to this file since they're only used here
// =============================================================================

const FR_STATUSES = [
  { key: 'submitted',     label: 'Submitted',    color: '#A8A29E', textColor: '#57534E', bg: '#F5F5F4' },
  { key: 'under_review',  label: 'Under Review', color: '#3B82F6', textColor: '#1E40AF', bg: '#DBEAFE' },
  { key: 'planned',       label: 'Planned',      color: '#7C3AED', textColor: '#6D28D9', bg: '#EDE9FE' },
  { key: 'shipped',       label: 'Shipped',      color: '#10B981', textColor: '#047857', bg: '#D1FAE5' },
  { key: 'declined',      label: 'Declined',     color: '#EF4444', textColor: '#B91C1C', bg: '#FEE2E2' },
]
const frStatusMeta = (k) => FR_STATUSES.find(s => s.key === k) || FR_STATUSES[0]

const INT_TYPES = [
  { key: 'crm',             label: 'CRM' },
  { key: 'payments',        label: 'Payments' },
  { key: 'email',           label: 'Email' },
  { key: 'marketing',       label: 'Marketing' },
  { key: 'analytics',       label: 'Analytics' },
  { key: 'telephony',       label: 'Telephony' },
  { key: 'support',         label: 'Support' },
  { key: 'data_warehouse',  label: 'Data Warehouse' },
  { key: 'custom',          label: 'Custom' },
  { key: 'other',           label: 'Other' },
]
const intTypeLabel = (k) => INT_TYPES.find(t => t.key === k)?.label || 'Other'

const INT_STATUSES = [
  { key: 'live',         label: 'Live',         color: '#10B981', textColor: '#047857' },
  { key: 'in_progress',  label: 'In Progress',  color: '#F59E0B', textColor: '#A16207' },
  { key: 'paused',       label: 'Paused',       color: '#A8A29E', textColor: '#57534E' },
  { key: 'sunset',       label: 'Sunset',       color: '#EF4444', textColor: '#B91C1C' },
]
const intStatusMeta = (k) => INT_STATUSES.find(s => s.key === k) || INT_STATUSES[1]

const AUTH_METHODS = [
  { key: '',           label: '—' },
  { key: 'oauth',      label: 'OAuth' },
  { key: 'api_key',    label: 'API Key' },
  { key: 'saml',       label: 'SAML' },
  { key: 'webhook',    label: 'Webhook' },
  { key: 'basic_auth', label: 'Basic Auth' },
  { key: 'other',      label: 'Other' },
]

const REUSABLE_OPTIONS = [
  { key: 'yes',     label: 'Yes',     textColor: '#047857' },
  { key: 'no',      label: 'No',      textColor: '#B91C1C' },
  { key: 'partial', label: 'Partial', textColor: '#A16207' },
  { key: 'unknown', label: 'Unknown', textColor: '#57534E' },
]

// =============================================================================
//  Top-level component — picks which shared page to show + header
// =============================================================================

export default function SharedPagesView({
  profile, page, onSignOut, onSwitchToManager, onSwitchToSelf,
  onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations,
  onSwitchToApiGuide, onSwitchToLeadership, onSwitchToCommissions, onProfileUpdated,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const tier = accessTier(profile)
  const canSeeManagerView = tier === 'executive' || tier === 'team_lead'
  const canSeeLeadership = tier === 'executive'
  const canSeeCancellations = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
  const headerRef = useGlassInteraction()

  const pageTitle = page === 'feature_requests' ? 'Feature Requests'
    : page === 'integrations' ? 'Integrations'
    : page === 'cancellations' ? 'Cancellations'
    : 'Shared'

  const pageSubtitle = page === 'cancellations' ? 'CS team + leadership' : 'Shared · all teams'

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={32} />
            <div className="border-l border-stone-300 pl-4">
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">
                {pageTitle}
              </div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                {pageSubtitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <HeaderButton
              active={page === 'feature_requests'}
              onClick={onSwitchToFeatureRequests}
              icon={Lightbulb}
              label="Feature Requests"
            />
            <HeaderButton
              active={page === 'integrations'}
              onClick={onSwitchToIntegrations}
              icon={Plug}
              label="Integrations"
            />
            {canSeeCancellations && onSwitchToCancellations && (
              <HeaderButton
                active={page === 'cancellations'}
                onClick={onSwitchToCancellations}
                icon={UserMinus}
                label="Cancellations"
              />
            )}
            {onSwitchToCommissions && (
              <HeaderButton
                active={false}
                onClick={onSwitchToCommissions}
                icon={DollarSign}
                label="Commissions"
              />
            )}
            <div className="hidden md:block h-6 w-px bg-stone-200 mx-1" />
            {canSeeLeadership && onSwitchToLeadership && (
              <button onClick={onSwitchToLeadership} className="hidden md:flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm hover:opacity-80"
                style={{ background: 'rgba(102, 57, 166, 0.08)', color: '#6639A6' }} title="Leadership Dashboard">
                <Crown className="w-4 h-4" /> <span className="hidden lg:inline">Leadership</span>
              </button>
            )}
            {onSwitchToApiGuide && (
              <button onClick={onSwitchToApiGuide} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="API Setup">
                <Zap className="w-4 h-4" /> <span className="hidden lg:inline">API Setup</span>
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
        {page === 'feature_requests' && <FeatureRequestsPage profile={profile} />}
        {page === 'integrations' && <IntegrationsPage profile={profile} />}
        {page === 'cancellations' && <CancellationsPage profile={profile} />}
      </div>

      {showSettings && (
        <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={onProfileUpdated} />
      )}
    </div>
  )
}

function HeaderButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm ${active ? 'text-white' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'}`}
      style={active ? { background: 'rgba(102, 57, 166, 0.85)' } : undefined}
    >
      <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// =============================================================================
//  Feature Requests Page
// =============================================================================

function FeatureRequestsPage({ profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('request_date')   // 'request_date' | 'logged_by_name' | 'customer_name' | 'feature_request' | 'status'
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)

  // Draft/Submit state. Edits accumulate locally per row in `drafts` and only
  // get persisted to the database when the user clicks Submit.
  //   drafts[rowId]       = { field: value, ... }   patches not yet saved
  //   submitting          = Set<rowId>              currently being saved
  //   recentlySubmitted   = Set<rowId>              just saved (for green-flash UI)
  //   freshlyAdded        = Set<rowId>              brand-new row, Submit lights up immediately
  const [drafts, setDrafts] = useState({})
  const [submitting, setSubmitting] = useState(() => new Set())
  const [recentlySubmitted, setRecentlySubmitted] = useState(() => new Set())
  const [freshlyAdded, setFreshlyAdded] = useState(() => new Set())

  const tier = accessTier(profile)
  const isManager = tier === 'executive' || tier === 'team_lead'
  const isExec = tier === 'executive'

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('feature_requests')
      .select('*')
      .order('request_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) console.error('Load feature_requests error', error)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Add a new row. Inserts an empty placeholder into the database (so we have
  // an id), then marks the row as freshly-added so the Submit button is hot
  // immediately. The user fills fields locally and clicks Submit to persist.
  const addItem = async () => {
    setAdding(true)
    const { data, error } = await supabase.from('feature_requests').insert({
      request_date: new Date().toISOString().slice(0, 10),
      logged_by_id: profile.id,
      logged_by_name: profile.name || '',
      customer_name: '',
      customer_email: '',
      feature_request: '',
      source_link: '',
      status: 'submitted',
      description: '',
    }).select().single()
    setAdding(false)
    if (error) { console.error(error); alert('Could not add request: ' + error.message); return }
    setItems(prev => [data, ...prev])
    setExpandedId(data.id)
    // Mark as freshly added so the Submit button glows even without edits.
    setFreshlyAdded(prev => { const n = new Set(prev); n.add(data.id); return n })
  }

  // Stage an edit — updates the local view only, does NOT persist.
  // Tracks the cumulative pending patch in `drafts[id]` so Submit knows what to send.
  const stageEdit = (id, patch) => {
    setItems(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  // Submit pending changes for a row. Fires confetti on success.
  const submitItem = async (id) => {
    const patch = drafts[id]
    const isFresh = freshlyAdded.has(id)
    // Nothing to do if there are no pending changes and the row isn't fresh.
    if (!patch && !isFresh) return
    setSubmitting(prev => { const n = new Set(prev); n.add(id); return n })
    // For a freshly-added row with no actual edits yet, "submitting" still
    // serves as the user committing to the empty placeholder. We don't need
    // to send any patch — just clear the fresh flag.
    if (patch) {
      const { error } = await supabase.from('feature_requests').update(patch).eq('id', id)
      if (error) {
        console.error(error)
        alert('Could not save: ' + error.message)
        setSubmitting(prev => { const n = new Set(prev); n.delete(id); return n })
        return
      }
    }
    // Clear all the local "needs saving" state for this row.
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    setFreshlyAdded(prev => { const n = new Set(prev); n.delete(id); return n })
    setSubmitting(prev => { const n = new Set(prev); n.delete(id); return n })
    setRecentlySubmitted(prev => { const n = new Set(prev); n.add(id); return n })
    // Auto-clear the "just-saved" flash after a moment.
    setTimeout(() => {
      setRecentlySubmitted(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 1200)
    // Celebrate.
    fireConfetti()
  }

  // Status changes (executive-only field) save instantly — they're the exec's
  // workflow tool, not "user-published content edits", so they bypass Submit.
  const updateStatusInline = async (id, newStatus) => {
    setItems(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
    const { error } = await supabase.from('feature_requests').update({ status: newStatus }).eq('id', id)
    if (error) { console.error(error); alert('Status save failed: ' + error.message); load() }
  }

  const removeItem = async (id) => {
    if (!confirm('Delete this feature request?')) return
    const { error } = await supabase.from('feature_requests').delete().eq('id', id)
    if (error) { console.error(error); alert('Could not delete: ' + error.message); return }
    setItems(prev => prev.filter(r => r.id !== id))
    if (expandedId === id) setExpandedId(null)
    // Clean up all the per-row state if the row is gone.
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    setFreshlyAdded(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const counts = FR_STATUSES.reduce((acc, s) => ({
    ...acc, [s.key]: items.filter(r => r.status === s.key).length,
  }), {})

  // Apply filters + search + sort
  const filtered = useMemo(() => {
    let out = items
    if (statusFilter !== 'all') out = out.filter(r => r.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r =>
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.customer_email || '').toLowerCase().includes(q) ||
        (r.feature_request || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.logged_by_name || '').toLowerCase().includes(q) ||
        (r.source_link || '').toLowerCase().includes(q)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      const av = a[sortBy] ?? ''
      const bv = b[sortBy] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return out
  }, [items, search, statusFilter, sortBy, sortDir])

  const onSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const exportCsv = () => {
    const headers = ['Date', 'Logged By', 'Customer Name', 'Email', 'Feature Request', 'Source/Link', 'Status', 'Description']
    const rows = filtered.map(r => [
      r.request_date || '',
      r.logged_by_name || '',
      r.customer_name || '',
      r.customer_email || '',
      r.feature_request || '',
      r.source_link || '',
      frStatusMeta(r.status).label,
      r.description || '',
    ])
    downloadCsv('feature-requests', headers, rows)
  }

  return (
    <div className="space-y-6">
      {/* Inject the Submit button glow keyframe once. Idempotent — duplicate
          style tags with identical content are harmless. */}
      <style>{`
        @keyframes atlasSubmitGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5), 0 6px 16px -4px rgba(102, 57, 166, 0.35);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(139, 92, 246, 0), 0 10px 22px -4px rgba(102, 57, 166, 0.5);
          }
        }
        .atlas-submit-glow {
          animation: atlasSubmitGlow 1.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .atlas-submit-glow { animation: none; }
        }
      `}</style>
      <div>
        <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">
          Shared · feature requests log
        </div>
        <h1 className="display-font text-4xl md:text-5xl font-medium text-stone-900 mt-1">
          What customers <em className="display-font-i font-normal" style={{ color: '#7C3AED' }}>are asking for</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-2xl">
          A shared log of what customers want next. Anyone in the company can add or edit; only the original logger or a leader can delete.
        </p>
      </div>

      {/* Status summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {FR_STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
            className={`text-left border bg-white p-4 relative overflow-hidden transition-all ${statusFilter === s.key ? 'border-stone-900 shadow-sm' : 'border-stone-200 hover:border-stone-400'}`}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }} />
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{s.label}</div>
            <div className="display-font text-3xl font-medium text-stone-900 num-tabular">{counts[s.key]}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-stone-400 mr-2 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, email, request, description..."
            className="w-full py-1.5 text-sm bg-transparent border-b border-transparent focus:border-stone-900 transition-colors"
          />
        </div>
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} className="text-xs text-stone-600 hover:text-stone-900 underline">
            Clear status filter
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 text-sm text-stone-700 hover:text-stone-900 transition-colors px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
          <Download className="w-4 h-4" /> Export CSV
        </button>
        <button
          onClick={addItem}
          disabled={adding}
          className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add request
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
        ) : items.length === 0 ? (
          <div className="m-6 border-2 border-dashed border-stone-300 p-10 text-center">
            <Lightbulb className="w-7 h-7 text-stone-400 mx-auto mb-3" />
            <div className="display-font text-xl font-medium text-stone-700 mb-1">No feature requests yet</div>
            <p className="text-sm text-stone-500 mb-4">Be the first to log a customer's feature request.</p>
            <button onClick={addItem} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first request
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="display-font text-base font-medium text-stone-700 mb-1">No matches</div>
            <p className="text-sm text-stone-500">Try a different search or clear your filters.</p>
            <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="mt-3 text-xs text-stone-600 hover:text-stone-900 underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1280px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="w-7"></th>
                  <SortableTh label="Date"            col="request_date"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[130px]" />
                  <SortableTh label="Logged By"       col="logged_by_name"   sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <SortableTh label="Customer"        col="customer_name"    sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="min-w-[160px]" />
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[200px]">Email</th>
                  <SortableTh label="Feature Request" col="feature_request"  sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="min-w-[220px]" />
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Source</th>
                  <SortableTh label="Status"          col="status"           sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isFresh = freshlyAdded.has(r.id)
                  const isDirty = !!drafts[r.id] || isFresh
                  return (
                    <FeatureRequestRow
                      key={r.id}
                      item={r}
                      expanded={expandedId === r.id}
                      onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      onStageEdit={(patch) => stageEdit(r.id, patch)}
                      onSubmit={() => submitItem(r.id)}
                      onStatusChange={(s) => updateStatusInline(r.id, s)}
                      onRemove={() => removeItem(r.id)}
                      canDelete={r.logged_by_id === profile.id || isManager}
                      isDirty={isDirty}
                      isFresh={isFresh}
                      isSubmitting={submitting.has(r.id)}
                      justSubmitted={recentlySubmitted.has(r.id)}
                      canEditStatus={isExec}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500">
        {filtered.length === items.length
          ? `${items.length} ${items.length === 1 ? 'request' : 'requests'} total`
          : `Showing ${filtered.length} of ${items.length}`}
      </p>
    </div>
  )
}

function FeatureRequestRow({
  item: r, expanded, onToggleExpand, onStageEdit, onSubmit,
  onStatusChange, onRemove, canDelete,
  isDirty, isFresh, isSubmitting, justSubmitted, canEditStatus,
}) {
  const stop = (e) => e.stopPropagation()
  const meta = frStatusMeta(r.status)

  // Submit button visual state — drives both the button itself + the helper text.
  const submitState = isSubmitting ? 'loading' : justSubmitted ? 'success' : isDirty ? 'dirty' : 'clean'

  // Status display:
  //   - Fresh (just-added) rows show "Draft" — they haven't been submitted yet
  //     even though the DB row exists with status='submitted' as a placeholder.
  //   - Executives see an editable dropdown (their workflow tool).
  //   - Everyone else sees the actual database status as a colored badge.
  const renderStatus = () => {
    if (isFresh) {
      return (
        <span
          className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border border-dashed"
          style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' }}
          title="Press Submit to send this feature request"
        >
          Draft
        </span>
      )
    }
    if (canEditStatus) {
      return (
        <select value={r.status} onChange={(e) => onStatusChange(e.target.value)}
          className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white"
          style={{ color: meta.textColor, fontWeight: 500 }}>
          {FR_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      )
    }
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full"
        style={{ background: meta.bg, color: meta.textColor }}
        title="Status is updated by leadership as the request is reviewed"
      >
        {meta.label}
      </span>
    )
  }

  return (
    <>
      <tr className={`border-b border-stone-100 cursor-pointer transition-colors ${expanded ? 'bg-stone-50' : 'hover:bg-stone-50/50'}`}
          onClick={onToggleExpand}>
        <td className="py-2 pl-3 pr-1 text-stone-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="date" value={r.request_date || ''} onChange={(e) => onStageEdit({ request_date: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          {/* Logged By is read-only — auto-set on creation, can't be reassigned. */}
          <div className="w-full py-1.5 px-2 text-sm text-stone-700 truncate" title={r.logged_by_name || ''}>
            {r.logged_by_name || <span className="text-stone-400 italic">unknown</span>}
          </div>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input value={r.customer_name || ''} onChange={(e) => onStageEdit({ customer_name: e.target.value })}
            placeholder="Customer"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="email" value={r.customer_email || ''} onChange={(e) => onStageEdit({ customer_email: e.target.value })}
            placeholder="email@example.com"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input value={r.feature_request || ''} onChange={(e) => onStageEdit({ feature_request: e.target.value })}
            placeholder="Short feature title"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          {r.source_link ? (
            <a href={ensureUrl(r.source_link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-700 hover:text-stone-900 underline truncate text-xs">
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[80px]">link</span>
            </a>
          ) : (
            <span className="text-stone-300 text-xs italic">none</span>
          )}
        </td>
        <td className="py-2 px-3" onClick={stop}>
          {renderStatus()}
        </td>
        <td className="py-2 px-3 text-right" onClick={stop}>
          {canDelete ? (
            <button onClick={onRemove} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-7 h-7" title="Only the original logger or a leader can delete" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-stone-50/60">
          <td></td>
          <td colSpan={8} className="py-5 pr-8 pl-1">
            <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-6 pr-7 ml-3 mr-2 space-y-4 overflow-visible">
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Source / Link</label>
                <input
                  value={r.source_link || ''}
                  onChange={(e) => onStageEdit({ source_link: e.target.value })}
                  placeholder="https://... (link to ticket, email thread, Slack message, etc.)"
                  className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Description / use case</label>
                <ExpandingTextarea value={r.description || ''} onChange={(v) => onStageEdit({ description: v })}
                  placeholder="What's the customer trying to do? Why does this matter to them? Any context the product team should have."
                  minRows={3} />
              </div>

              {/* Action row — Delete (left) + Submit (right). Delete is
                  prominently placed inside the expanded view so execs and
                  the original logger always have an obvious affordance to
                  remove the entry. The small trash icon in the table row
                  stays as a quick-action shortcut. */}
              <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {canDelete && (
                    <button
                      onClick={onRemove}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <div className="text-xs">
                    {submitState === 'dirty' && (
                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        You have unsaved changes
                      </span>
                    )}
                    {submitState === 'success' && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                        <Check className="w-3.5 h-3.5" /> Submitted
                      </span>
                    )}
                    {submitState === 'clean' && (
                      <span className="text-stone-400 italic">All changes saved</span>
                    )}
                  </div>
                </div>
                <SubmitButton state={submitState} onClick={onSubmit} />
              </div>

              {!canDelete && (
                <div className="text-xs text-stone-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Only {r.logged_by_name || 'the original logger'} or a leader can delete this entry.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Submit button with four visual states. Clean = greyed/disabled, dirty =
// glowing purple call-to-action, loading = spinner, success = green flash.
function SubmitButton({ state, onClick }) {
  const baseClass = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 select-none'
  if (state === 'loading') {
    return (
      <button disabled className={`${baseClass} bg-stone-300 text-white cursor-not-allowed`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
      </button>
    )
  }
  if (state === 'success') {
    return (
      <button disabled className={`${baseClass} text-white cursor-default`} style={{ background: '#10B981' }}>
        <Check className="w-4 h-4" /> Saved
      </button>
    )
  }
  if (state === 'dirty') {
    // The illuminated state — purple gradient + a soft glowing ring that
    // gently breathes in/out. The keyframe is injected once via the
    // SubmitGlowStyles component below; no external CSS file needed.
    return (
      <button
        onClick={onClick}
        className={`${baseClass} text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] atlas-submit-glow`}
        style={{ background: 'linear-gradient(135deg, #6639A6 0%, #8B5CF6 100%)' }}
      >
        <Send className="w-4 h-4" /> Submit
      </button>
    )
  }
  // Clean / nothing to save
  return (
    <button disabled className={`${baseClass} bg-stone-100 text-stone-400 cursor-not-allowed`}>
      <Send className="w-4 h-4" /> Submit
    </button>
  )
}

// Celebration: simultaneous bursts from the bottom corners of the viewport,
// then a center burst slightly delayed. Atlas purple + complementary palette.
function fireConfetti() {
  if (typeof window === 'undefined') return
  try {
    const colors = ['#6639A6', '#8B5CF6', '#F59E0B', '#10B981', '#FFFFFF']
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 70,
      origin: { x: 0.15, y: 0.85 },
      colors,
      scalar: 0.9,
    })
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 70,
      origin: { x: 0.85, y: 0.85 },
      colors,
      scalar: 0.9,
    })
    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 100,
        origin: { x: 0.5, y: 0.7 },
        colors,
        scalar: 0.8,
        startVelocity: 25,
      })
    }, 150)
  } catch (e) {
    // canvas-confetti needs a real DOM; silently skip in unusual environments.
    console.warn('Confetti unavailable', e)
  }
}

// =============================================================================
//  Integrations Page
// =============================================================================

function IntegrationsPage({ profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_completed')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)

  const tier = accessTier(profile)
  const isManager = tier === 'executive' || tier === 'team_lead'

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .order('date_completed', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) console.error('Load integrations error', error)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addItem = async () => {
    setAdding(true)
    const { data, error } = await supabase.from('integrations').insert({
      integration_name: '',
      integration_type: 'other',
      customer_name: '',
      status: 'in_progress',
      date_completed: null,
      built_by_id: profile.id,
      built_by_name: profile.name || '',
      auth_method: '',
      api_docs_link: '',
      internal_notes_link: '',
      time_to_build: '',
      gotchas_lessons: '',
      reusable: 'partial',
    }).select().single()
    setAdding(false)
    if (error) { console.error(error); alert('Could not add integration: ' + error.message); return }
    setItems(prev => [data, ...prev])
    setExpandedId(data.id)
  }

  const updateItem = async (id, patch) => {
    setItems(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('integrations').update(patch).eq('id', id)
    if (error) { console.error(error); load() }
  }

  const removeItem = async (id) => {
    if (!confirm('Remove this integration record?')) return
    const { error } = await supabase.from('integrations').delete().eq('id', id)
    if (error) { console.error(error); alert('Could not delete: ' + error.message); return }
    setItems(prev => prev.filter(r => r.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const counts = INT_STATUSES.reduce((acc, s) => ({
    ...acc, [s.key]: items.filter(r => r.status === s.key).length,
  }), {})

  const filtered = useMemo(() => {
    let out = items
    if (typeFilter !== 'all') out = out.filter(r => r.integration_type === typeFilter)
    if (statusFilter !== 'all') out = out.filter(r => r.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r =>
        (r.integration_name || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.built_by_name || '').toLowerCase().includes(q) ||
        (r.gotchas_lessons || '').toLowerCase().includes(q) ||
        (r.api_docs_link || '').toLowerCase().includes(q) ||
        (r.internal_notes_link || '').toLowerCase().includes(q)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      const av = a[sortBy] ?? ''
      const bv = b[sortBy] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return out
  }, [items, search, typeFilter, statusFilter, sortBy, sortDir])

  const onSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const exportCsv = () => {
    const headers = [
      'Integration Name', 'Type', 'Customer', 'Status', 'Date Completed',
      'Built By', 'Auth Method', 'API Docs', 'Internal Notes', 'Time to Build',
      'Reusable', 'Gotchas / Lessons',
    ]
    const rows = filtered.map(r => [
      r.integration_name || '',
      intTypeLabel(r.integration_type),
      r.customer_name || '',
      intStatusMeta(r.status).label,
      r.date_completed || '',
      r.built_by_name || '',
      AUTH_METHODS.find(m => m.key === r.auth_method)?.label || '',
      r.api_docs_link || '',
      r.internal_notes_link || '',
      r.time_to_build || '',
      REUSABLE_OPTIONS.find(o => o.key === r.reusable)?.label || '',
      r.gotchas_lessons || '',
    ])
    downloadCsv('integrations', headers, rows)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">
          Engineering · integrations library
        </div>
        <h1 className="display-font text-4xl md:text-5xl font-medium text-stone-900 mt-1">
          Every integration <em className="display-font-i font-normal" style={{ color: '#0F766E' }}>we've shipped</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-2xl">
          A shared library to reference before starting a new one — and add to when you finish. Future-you (and future-them) will thank you.
        </p>
      </div>

      {/* Status summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {INT_STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
            className={`text-left border bg-white p-4 relative overflow-hidden transition-all ${statusFilter === s.key ? 'border-stone-900 shadow-sm' : 'border-stone-200 hover:border-stone-400'}`}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }} />
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{s.label}</div>
            <div className="display-font text-3xl font-medium text-stone-900 num-tabular">{counts[s.key]}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-stone-400 mr-2 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, customer, lessons learned..."
            className="w-full py-1.5 text-sm bg-transparent border-b border-transparent focus:border-stone-900 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Type:</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors bg-white">
            <option value="all">All types</option>
            {INT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        {(statusFilter !== 'all' || typeFilter !== 'all') && (
          <button onClick={() => { setStatusFilter('all'); setTypeFilter('all') }} className="text-xs text-stone-600 hover:text-stone-900 underline">
            Clear filters
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 text-sm text-stone-700 hover:text-stone-900 transition-colors px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
          <Download className="w-4 h-4" /> Export CSV
        </button>
        <button
          onClick={addItem}
          disabled={adding}
          className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add integration
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
        ) : items.length === 0 ? (
          <div className="m-6 border-2 border-dashed border-stone-300 p-10 text-center">
            <Plug className="w-7 h-7 text-stone-400 mx-auto mb-3" />
            <div className="display-font text-xl font-medium text-stone-700 mb-1">No integrations recorded yet</div>
            <p className="text-sm text-stone-500 mb-4">Start your library — every integration you log here saves the next person time.</p>
            <button onClick={addItem} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first integration
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="display-font text-base font-medium text-stone-700 mb-1">No matches</div>
            <p className="text-sm text-stone-500">Try a different search or clear your filters.</p>
            <button onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all') }} className="mt-3 text-xs text-stone-600 hover:text-stone-900 underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1400px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="w-7"></th>
                  <SortableTh label="Name"      col="integration_name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="min-w-[180px]" />
                  <SortableTh label="Type"      col="integration_type" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <SortableTh label="Customer"  col="customer_name"    sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="min-w-[160px]" />
                  <SortableTh label="Status"    col="status"           sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <SortableTh label="Completed" col="date_completed"   sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <SortableTh label="Built By"  col="built_by_name"    sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[120px]">Reusable</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">Links</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <IntegrationRow
                    key={r.id}
                    item={r}
                    expanded={expandedId === r.id}
                    onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    onUpdate={(patch) => updateItem(r.id, patch)}
                    onRemove={() => removeItem(r.id)}
                    canDelete={r.built_by_id === profile.id || isManager}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500">
        {filtered.length === items.length
          ? `${items.length} ${items.length === 1 ? 'integration' : 'integrations'} total`
          : `Showing ${filtered.length} of ${items.length}`}
      </p>
    </div>
  )
}

function IntegrationRow({ item: r, expanded, onToggleExpand, onUpdate, onRemove, canDelete }) {
  const stop = (e) => e.stopPropagation()
  const statusMeta = intStatusMeta(r.status)
  const reusableMeta = REUSABLE_OPTIONS.find(o => o.key === r.reusable) || REUSABLE_OPTIONS[2]
  return (
    <>
      <tr className={`border-b border-stone-100 cursor-pointer transition-colors ${expanded ? 'bg-stone-50' : 'hover:bg-stone-50/50'}`}
          onClick={onToggleExpand}>
        <td className="py-2 pl-3 pr-1 text-stone-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input value={r.integration_name || ''} onChange={(e) => onUpdate({ integration_name: e.target.value })}
            placeholder="e.g. Salesforce, HubSpot, Stripe"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm font-medium" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <select value={r.integration_type || 'other'} onChange={(e) => onUpdate({ integration_type: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
            {INT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input value={r.customer_name || ''} onChange={(e) => onUpdate({ customer_name: e.target.value })}
            placeholder="Customer"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <select value={r.status} onChange={(e) => onUpdate({ status: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white"
            style={{ color: statusMeta.textColor, fontWeight: 500 }}>
            {INT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="date" value={r.date_completed || ''} onChange={(e) => onUpdate({ date_completed: e.target.value || null })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input value={r.built_by_name || ''} onChange={(e) => onUpdate({ built_by_name: e.target.value })}
            placeholder="Built by"
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <select value={r.reusable || 'partial'} onChange={(e) => onUpdate({ reusable: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white"
            style={{ color: reusableMeta.textColor, fontWeight: 500 }}>
            {REUSABLE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <div className="flex items-center gap-2">
            {r.api_docs_link ? (
              <a href={ensureUrl(r.api_docs_link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-700 hover:text-stone-900 underline text-xs" title="API docs">
                <ExternalLink className="w-3 h-3" /> API
              </a>
            ) : <span className="text-stone-300 text-xs">API</span>}
            <span className="text-stone-300">·</span>
            {r.internal_notes_link ? (
              <a href={ensureUrl(r.internal_notes_link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-700 hover:text-stone-900 underline text-xs" title="Internal notes">
                <ExternalLink className="w-3 h-3" /> Notes
              </a>
            ) : <span className="text-stone-300 text-xs">Notes</span>}
          </div>
        </td>
        <td className="py-2 px-3 text-right" onClick={stop}>
          {canDelete ? (
            <button onClick={onRemove} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-7 h-7" title="Only the original creator or a leader can delete" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-stone-50/60">
          <td></td>
          <td colSpan={9} className="py-5 pr-6">
            <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 ml-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Auth method</label>
                  <select value={r.auth_method || ''} onChange={(e) => onUpdate({ auth_method: e.target.value })}
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm bg-white">
                    {AUTH_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Time to build</label>
                  <input value={r.time_to_build || ''} onChange={(e) => onUpdate({ time_to_build: e.target.value })}
                    placeholder='e.g. "2 days", "3 weeks"'
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">API docs link</label>
                  <input value={r.api_docs_link || ''} onChange={(e) => onUpdate({ api_docs_link: e.target.value })}
                    placeholder="https://docs.stripe.com/..."
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
                </div>
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Internal notes link</label>
                  <input value={r.internal_notes_link || ''} onChange={(e) => onUpdate({ internal_notes_link: e.target.value })}
                    placeholder="Notion / Slack / GitHub URL"
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
                </div>
              </div>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5">Gotchas / lessons learned</label>
                <ExpandingTextarea value={r.gotchas_lessons || ''} onChange={(v) => onUpdate({ gotchas_lessons: v })}
                  placeholder="What surprised us? What would we do differently? What should the next person know? (this is the most valuable field)"
                  minRows={4} />
              </div>
              {!canDelete && (
                <div className="text-xs text-stone-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Only {r.built_by_name || 'the original creator'} or a leader can delete this entry.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// =============================================================================
//  Cancellations Page — global table for CS team + executives
//
//  Modeled after FeatureRequestsPage. Key differences:
//    - csm_id is the "attributed CSM" (who owned the customer) — a dropdown.
//    - logged_by_id is the person entering the row (auto-set to current user).
//    - Adds: cancel reason category, MRR lost, plan type, cancelled date.
//  Permissions enforced by RLS (see supabase-batch5-migration.sql):
//    - Any customer_success team member can read/insert/update/delete.
//    - Any executive can read/insert/update/delete.
//    - Other teams have zero access.
// =============================================================================

function CancellationsPage({ profile }) {
  const [items, setItems] = useState([])
  const [csms, setCsms] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [sortBy, setSortBy] = useState('cancelled_date')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)

  // Load both cancellations and the CSM roster (for the attribution dropdown).
  const load = useCallback(async () => {
    setLoading(true)
    const [cancRes, csmRes] = await Promise.all([
      supabase.from('cancellations')
        .select('*')
        .order('cancelled_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles')
        .select('id, name, team, role_type')
        .in('team', ['customer_success', 'forward_deployed'])
        .is('archived_at', null)
        .order('team', { ascending: true })
        .order('name', { ascending: true }),
    ])
    if (cancRes.error) console.error('Load cancellations error', cancRes.error)
    if (csmRes.error) console.error('Load CSMs error', csmRes.error)
    setItems(cancRes.data || [])
    setCsms(csmRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Build a quick id→name lookup for the table display
  const csmName = useCallback((id) => {
    const found = csms.find(c => c.id === id)
    return found ? found.name : '—'
  }, [csms])

  const addItem = async () => {
    setAdding(true)
    // Default attribution: the current user if they're a CSM; otherwise the
    // first CSM in the roster. The user can change it in the row.
    const defaultCsmId = csms.find(c => c.id === profile.id)?.id || csms[0]?.id || profile.id
    const { data, error } = await supabase.from('cancellations').insert({
      csm_id: defaultCsmId,
      logged_by_id: profile.id,
      customer_name: '',
      customer_email: '',
      plan_type: '',
      monthly_amount: null,
      reason_category: 'other',
      reason_detail: '',
      cancelled_date: new Date().toISOString().slice(0, 10),
    }).select().single()
    setAdding(false)
    if (error) {
      console.error(error)
      alert('Could not add cancellation: ' + error.message)
      return
    }
    setItems(prev => [data, ...prev])
    setExpandedId(data.id)
  }

  const updateItem = async (id, patch) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    const { error } = await supabase.from('cancellations').update(patch).eq('id', id)
    if (error) { console.error(error); alert('Save failed: ' + error.message); load() }
  }

  const removeItem = async (id) => {
    if (!confirm('Delete this cancellation record?')) return
    const prev = items
    setItems(prev.filter(i => i.id !== id))
    if (expandedId === id) setExpandedId(null)
    const { error } = await supabase.from('cancellations').delete().eq('id', id)
    if (error) { console.error(error); alert('Delete failed: ' + error.message); setItems(prev) }
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let result = items
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        (i.customer_name || '').toLowerCase().includes(q)
        || (i.customer_email || '').toLowerCase().includes(q)
        || (i.reason_detail || '').toLowerCase().includes(q)
        || (csmName(i.csm_id) || '').toLowerCase().includes(q)
      )
    }
    if (reasonFilter !== 'all') {
      result = result.filter(i => i.reason_category === reasonFilter)
    }
    const sorted = [...result].sort((a, b) => {
      const av = sortBy === 'csm' ? csmName(a.csm_id) : (a[sortBy] ?? '')
      const bv = sortBy === 'csm' ? csmName(b.csm_id) : (b[sortBy] ?? '')
      // Numeric sort for monthly_amount
      if (sortBy === 'monthly_amount') {
        return ((Number(av) || 0) - (Number(bv) || 0)) * (sortDir === 'asc' ? 1 : -1)
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [items, search, reasonFilter, sortBy, sortDir, csmName])

  const onSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'cancelled_date' || col === 'monthly_amount' ? 'desc' : 'asc') }
  }

  // Summary tiles — month-over-month rollup at the top of the page
  const monthStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [])
  const thisMonth = useMemo(
    () => items.filter(c => c.cancelled_date && new Date(c.cancelled_date + 'T00:00:00') >= monthStart),
    [items, monthStart],
  )
  const mrrLostThisMonth = thisMonth.reduce((s, c) => s + (Number(c.monthly_amount) || 0), 0)
  const topReason = useMemo(() => {
    if (!items.length) return null
    const counts = items.reduce((acc, c) => {
      acc[c.reason_category || 'other'] = (acc[c.reason_category || 'other'] || 0) + 1
      return acc
    }, {})
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? { key: top[0], count: top[1] } : null
  }, [items])

  const exportCsv = () => {
    const headers = ['cancelled_date', 'attributed_csm', 'customer_name', 'customer_email', 'plan_type', 'monthly_amount', 'reason_category', 'reason_detail']
    const rows = filtered.map(i => [
      i.cancelled_date || '',
      csmName(i.csm_id),
      i.customer_name || '',
      i.customer_email || '',
      i.plan_type || '',
      i.monthly_amount ?? '',
      cancellationCategoryLabel(i.reason_category),
      i.reason_detail || '',
    ])
    downloadCsv('atlas-cancellations', headers, rows)
  }

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div>
        <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">
          Customer Success · cancellations log
        </div>
        <h1 className="display-font text-4xl md:text-5xl font-medium text-stone-900 mt-1">
          Where customers are <em className="display-font-i font-normal" style={{ color: '#B91C1C' }}>leaving</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-2xl">
          Every cancellation across the team — who, why, and how much MRR walked out the door.
          Any CS team member or executive can add entries; everyone sees the same list.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryTile
          label="Cancellations (month)"
          value={thisMonth.length}
          sublabel={`${items.length} all-time`}
          color="#B91C1C"
          icon={UserMinus}
        />
        <SummaryTile
          label="MRR Lost (month)"
          value={`$${mrrLostThisMonth.toLocaleString()}`}
          sublabel="Sum of monthly recurring"
          color="#A16207"
          icon={DollarSign}
        />
        <SummaryTile
          label="Top reason"
          value={topReason ? cancellationCategoryLabel(topReason.key) : '—'}
          sublabel={topReason ? `${topReason.count} of ${items.length}` : 'No data yet'}
          color="#7C3AED"
          icon={Star}
        />
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, CSM, or reason…"
            className="flex-1 text-sm py-1.5 px-2 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Reason</span>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="text-sm py-1.5 px-2 border border-stone-300 rounded bg-white"
          >
            <option value="all">All</option>
            {CANCELLATION_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={!filtered.length}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-stone-300 hover:border-stone-900 transition-colors rounded disabled:opacity-50"
          title="Download as CSV"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button
          onClick={addItem}
          disabled={adding}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 text-white transition-colors rounded hover:opacity-90"
          style={{ background: '#B91C1C' }}
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Log cancellation
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-stone-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <UserMinus className="w-8 h-8 text-stone-300 mx-auto mb-3" />
            <div className="display-font text-lg font-medium text-stone-700">No cancellations to show</div>
            <div className="text-sm text-stone-500 mt-1">
              {items.length === 0
                ? 'Click "Log cancellation" above to add the first one.'
                : 'No matches for the current filters. Try clearing search.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="w-8"></th>
                  <SortableTh label="Date" col="cancelled_date" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[110px]" />
                  <SortableTh label="Attributed CSM" col="csm" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[150px]" />
                  <SortableTh label="Customer" col="customer_name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Plan" col="plan_type" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[120px]" />
                  <SortableTh label="MRR" col="monthly_amount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[100px]" />
                  <SortableTh label="Reason" col="reason_category" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[170px]" />
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <CancellationRow
                    key={c.id}
                    item={c}
                    csms={csms}
                    csmName={csmName}
                    expanded={expandedId === c.id}
                    onToggleExpand={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                    onUpdate={(patch) => updateItem(c.id, patch)}
                    onRemove={() => removeItem(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CancellationRow({ item: c, csms, csmName, expanded, onToggleExpand, onUpdate, onRemove }) {
  const reasonMeta = CANCELLATION_CATEGORIES.find(r => r.key === c.reason_category) || CANCELLATION_CATEGORIES[5]
  return (
    <>
      <tr className="border-b border-stone-100 hover:bg-stone-50/50 transition-colors">
        <td className="py-2.5 px-2 align-top">
          <button onClick={onToggleExpand} className="text-stone-500 hover:text-stone-900 transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="py-2.5 px-3 align-top">
          <input
            type="date"
            value={c.cancelled_date || ''}
            onChange={(e) => onUpdate({ cancelled_date: e.target.value })}
            className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent w-[110px]"
          />
        </td>
        <td className="py-2.5 px-3 align-top">
          <select
            value={c.csm_id || ''}
            onChange={(e) => onUpdate({ csm_id: e.target.value })}
            className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent max-w-[140px] truncate"
          >
            {csms.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </td>
        <td className="py-2.5 px-3 align-top">
          <input
            value={c.customer_name || ''}
            onChange={(e) => onUpdate({ customer_name: e.target.value })}
            placeholder="Customer name"
            className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent w-full"
          />
        </td>
        <td className="py-2.5 px-3 align-top">
          <input
            value={c.plan_type || ''}
            onChange={(e) => onUpdate({ plan_type: e.target.value })}
            placeholder="Plan"
            className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent w-full"
          />
        </td>
        <td className="py-2.5 px-3 align-top">
          <div className="flex items-center gap-1">
            <span className="text-stone-400 text-xs">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={c.monthly_amount ?? ''}
              onChange={(e) => onUpdate({ monthly_amount: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0"
              className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent w-full num-tabular"
            />
          </div>
        </td>
        <td className="py-2.5 px-3 align-top">
          <select
            value={c.reason_category || 'other'}
            onChange={(e) => onUpdate({ reason_category: e.target.value })}
            className="text-sm py-1 px-1 border-b border-transparent focus:border-stone-300 transition-colors bg-transparent w-full"
          >
            {CANCELLATION_CATEGORIES.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </td>
        <td className="py-2.5 px-2 align-top text-right">
          <button onClick={onRemove} className="text-stone-400 hover:text-red-700 transition-colors" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-stone-100 bg-stone-50/30">
          <td></td>
          <td colSpan={7} className="py-4 px-3">
            <div className="space-y-3 max-w-3xl">
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                  Customer email
                </div>
                <input
                  value={c.customer_email || ''}
                  onChange={(e) => onUpdate({ customer_email: e.target.value })}
                  placeholder="customer@example.com"
                  className="text-sm py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors w-full max-w-md rounded"
                />
              </div>
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                  What happened?
                </div>
                <ExpandingTextarea
                  value={c.reason_detail || ''}
                  onChange={(v) => onUpdate({ reason_detail: v })}
                  placeholder="Context that didn't fit in the category — pricing pressure, missing feature requested, who they switched to, etc."
                  minRows={3}
                  maxRows={20}
                />
              </div>
              <div className="text-[11px] text-stone-500 mono-font">
                Attributed to {csmName(c.csm_id)} · reason: {reasonMeta.label}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Small tile used in the cancellation page header
function SummaryTile({ label, value, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 leading-tight">{label}</div>
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
      </div>
      <div className="display-font text-3xl font-medium text-stone-900 leading-none mt-3 num-tabular">{value}</div>
      <div className="text-[11px] text-stone-500 mt-2">{sublabel}</div>
    </div>
  )
}

// =============================================================================
//  Shared utilities
// =============================================================================

function SortableTh({ label, col, sortBy, sortDir, onSort, width = '' }) {
  const active = sortBy === col
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown
  return (
    <th className={`text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest font-medium ${width} ${active ? 'text-stone-900' : 'text-stone-600'}`}>
      <button
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 transition-colors hover:text-stone-900"
        title={`Sort by ${label}`}>
        {label}
        <Icon className={`w-3 h-3 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  )
}

function ExpandingTextarea({ value, onChange, placeholder, minRows = 2, maxRows = 20 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22
    const max = maxRows * lineHeight + 24
    const next = Math.min(el.scrollHeight, max)
    el.style.height = next + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full py-2.5 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed resize-none overflow-hidden"
      style={{ minHeight: minRows * 22 + 24 }}
    />
  )
}

// Make a URL clickable even if the user pasted something without scheme
function ensureUrl(s) {
  if (!s) return '#'
  const trimmed = s.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return 'https://' + trimmed
  return trimmed
}

// CSV download helper
function downloadCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}
