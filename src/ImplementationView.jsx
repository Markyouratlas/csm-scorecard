import React, { useState, useMemo } from 'react'
import {
  Loader2, Ticket, FolderKanban, FileText, Award, Activity, Layers, Plus, Trash2,
  Calendar, ChevronDown, ChevronRight, ChevronUp, ArrowUpDown, MessageSquare, Send, Zap, Star
} from 'lucide-react'
import { useScorecard } from './useScorecard'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel, businessDaysBetween, formatNoteTimestamp } from './dateUtils'
import { BLANK_IMPLEMENTATION_WEEK, newId } from './roleConstants'
import { sumDays } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, {
  NorthStarTile, NumberField, SectionTabs, PageHeader
} from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

const PROJECT_STATUSES = [
  { key: 'in_progress', label: 'In Progress', color: '#0F766E' },
  { key: 'stuck',       label: 'Stuck',       color: '#B91C1C' },
  { key: 'on_hold',     label: 'On Hold',     color: '#A16207' },
  { key: 'done',        label: 'Done',        color: '#1C1917' },
]
const STATUS_ORDER = PROJECT_STATUSES.reduce((acc, s, i) => ({ ...acc, [s.key]: i }), {})

// Tier options. Order matters for the sort comparator.
const TIER_OPTIONS = ['Standard', 'Enterprise', 'Channel Partners', 'Identic']
const TIER_ORDER = TIER_OPTIONS.reduce((acc, t, i) => ({ ...acc, [t]: i }), {})

// Legacy calendar-day SLA (used as fallback when a project predates the
// new "info received" field). The new primary SLA is 2 business days from
// infoReceivedDate → activatedDate, regardless of tier.
const TIER_SLA_DAYS = {
  Standard: 14,
  Enterprise: 30,
  'Channel Partners': 7,   // priority
  Identic: 14,
}

// New primary SLA: ≤ 2 business days from "all info received" → "activated"
const SLA_BUSINESS_DAYS = 2

// Atlas brand purple — used to flag Channel Partners
const CHANNEL_PARTNER_COLOR = '#6639a6'

// Read notes history from a project, gracefully migrating legacy `notes` strings.
// Returns array of { id, ts, text, author? }, newest first.
function readNotesHistory(project) {
  if (Array.isArray(project.notesHistory) && project.notesHistory.length > 0) {
    return [...project.notesHistory].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  }
  if (project.notes && typeof project.notes === 'string' && project.notes.trim()) {
    return [{ id: 'legacy', ts: '', text: project.notes.trim() }]
  }
  return []
}

export default function ImplementationView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey }) {
  const weekKey = useMemo(() => propWeekKey || getWeekKey(), [propWeekKey])
  const monthKey = useMemo(() => getMonthKey(), [])
  const { weekData, loading, saving, savedAt, update } = useScorecard(profile.id, weekKey, BLANK_IMPLEMENTATION_WEEK)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('tickets')

  if (loading || !weekData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>
  }

  const workDayIdxs = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS

  const totalCompleted = sumDays(weekData.daily, 'completed')
  const totalNew = sumDays(weekData.daily, 'newTickets')
  const totalResolved = sumDays(weekData.daily, 'resolvedNoNotification') + totalCompleted
  const resolutionRate = totalNew > 0 ? Math.round((totalResolved / totalNew) * 100) : null
  const lastWorkDay = workDayIdxs[workDayIdxs.length - 1]
  const eodPending = weekData.daily[lastWorkDay]?.pending || 0

  const sections = [
    { id: 'tickets',  label: 'Daily Tickets', icon: Ticket },
    { id: 'projects', label: 'Projects',      icon: FolderKanban },
    { id: 'monthly',  label: 'Monthly View',  icon: Calendar },
    { id: 'notes',    label: 'Notes',         icon: FileText },
  ]

  return (
    <ScorecardShell profile={profile} weekKey={weekKey} saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Implementation Specialist · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#0F766E"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      {/* North star tiles */}
      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile label="Tickets Completed" value={totalCompleted} sublabel="North star metric" color="#0F766E" icon={Award} />
        <NorthStarTile
          label="Resolution Rate"
          value={resolutionRate !== null ? resolutionRate : '—'}
          unit={resolutionRate !== null ? '%' : ''}
          sublabel={resolutionRate !== null ? `${totalResolved} resolved / ${totalNew} new` : 'Awaiting data'}
          color="#1C1917"
          icon={Activity}
        />
        <NorthStarTile
          label="Pending Backlog (EOD)"
          value={eodPending}
          sublabel="Tickets still owed at end of week"
          color="#A16207"
          icon={Layers}
        />
      </div>

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'tickets' && <TicketsSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} />}
        {section === 'projects' && <ProjectsSection weekData={weekData} update={update} profile={profile} />}
        {section === 'monthly' && <ImplMonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'notes' && <NotesSection weekData={weekData} update={update} />}
      </div>
    </ScorecardShell>
  )
}

// ============================================================================
//  Tickets Section
// ============================================================================

function TicketsSection({ weekData, update, workDayIdxs, weekKey }) {
  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + (dayIdx - 1))
    return d
  }

  const fields = [
    { key: 'sodTickets',             label: 'SOD Tickets' },
    { key: 'newTickets',             label: 'New Tickets' },
    { key: 'eodTickets',             label: 'EOD Tickets' },
    { key: 'pending',                label: 'Pending' },
    { key: 'waitingCustomer',        label: 'Waiting on Customer' },
    { key: 'resolvedNoNotification', label: 'Resolved (no notif)' },
    { key: 'cancellations',          label: 'Cancellations' },
    { key: 'completed',              label: 'Completed' },
  ]

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Daily ticket flow</div>
      <p className="text-sm text-stone-600 mb-6">Log your ticket counts each day. Weekly totals at the bottom update automatically.</p>
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
            {fields.map(f => (
              <th key={f.key} className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workDayIdxs.map(dayIdx => {
            const day = weekData.daily[dayIdx]
            const date = dateFor(dayIdx)
            return (
              <tr key={dayIdx} className="border-b border-stone-100">
                <td className="py-2 px-3">
                  <div className="font-medium text-stone-800">{DAY_NAMES[dayIdx]}</div>
                  <div className="text-[10px] text-stone-500 mono-font">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </td>
                {fields.map(f => (
                  <td key={f.key} className="py-2 px-2 text-center">
                    <input type="number" min="0" value={day[f.key] || ''} onChange={(e) => setCell(dayIdx, f.key, e.target.value)}
                      className="w-14 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                  </td>
                ))}
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Weekly Total</td>
            {fields.map(f => {
              const total = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di][f.key]) || 0), 0)
              return <td key={f.key} className="py-3 px-2 text-center num-tabular font-bold">{total}</td>
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
//  Projects Section
// ============================================================================

// Compute SLA + on-time status. Two SLAs are evaluated:
//   1. PRIMARY: ≤ 2 business days from infoReceivedDate → activatedDate
//   2. LEGACY: tier-based calendar days from startDate → activatedDate
// Use whichever the project has data for; PRIMARY wins when both apply.
function enrichProject(p) {
  const tier = p.tier || 'Standard'
  const slaDays = TIER_SLA_DAYS[tier] ?? 14

  // Legacy tier SLA (calendar days)
  let legacyTargetDate = null
  let legacyOnTime = null
  if (p.startDate) {
    const start = new Date(p.startDate + 'T00:00:00')
    if (!isNaN(start.getTime())) {
      legacyTargetDate = new Date(start)
      legacyTargetDate.setDate(start.getDate() + slaDays)
      if (p.activatedDate) {
        const act = new Date(p.activatedDate + 'T00:00:00')
        if (!isNaN(act.getTime())) legacyOnTime = act <= legacyTargetDate
      }
    }
  }

  // New primary SLA: business days from info received → activated
  const businessDaysToActivation = (p.infoReceivedDate && p.activatedDate)
    ? businessDaysBetween(p.infoReceivedDate, p.activatedDate)
    : null
  const newSlaOnTime = businessDaysToActivation === null
    ? null
    : businessDaysToActivation <= SLA_BUSINESS_DAYS

  const onTime = newSlaOnTime !== null ? newSlaOnTime : legacyOnTime

  return {
    ...p,
    tier,
    slaDays,
    legacyTargetDate,
    legacyOnTime,
    businessDaysToActivation,
    newSlaOnTime,
    onTime,
  }
}

function ProjectsSection({ weekData, update, profile }) {
  const today = new Date().toISOString().slice(0, 10)
  const [sortBy, setSortBy] = useState(null)        // 'tier' | 'status' | 'start' | 'activated' | null
  const [sortDir, setSortDir] = useState('asc')     // 'asc' | 'desc'
  const [expandedId, setExpandedId] = useState(null)

  const addProject = () => {
    const newProject = {
      id: newId('p'),
      customer: '',
      status: 'in_progress',
      tier: 'Standard',
      startDate: today,
      infoReceivedDate: '',
      activatedDate: '',
      notesHistory: [],
    }
    update(d => ({ ...d, projects: [...(d.projects || []), newProject] }))
  }
  const updateProject = (id, patch) => update(d => ({
    ...d, projects: d.projects.map(p => p.id === id ? { ...p, ...patch } : p),
  }))
  const removeProject = (id) => {
    update(d => ({ ...d, projects: d.projects.filter(p => p.id !== id) }))
    if (expandedId === id) setExpandedId(null)
  }
  const appendNote = (id, text) => {
    if (!text || !text.trim()) return
    const entry = {
      id: newId('n'),
      ts: new Date().toISOString(),
      text: text.trim(),
      author: profile?.name || '',
    }
    update(d => ({
      ...d,
      projects: d.projects.map(p => {
        if (p.id !== id) return p
        const existingHistory = Array.isArray(p.notesHistory) ? p.notesHistory : []
        // First time we touch a project that has only legacy `notes`, migrate it forward
        const legacyMigration = (existingHistory.length === 0 && p.notes && typeof p.notes === 'string' && p.notes.trim())
          ? [{ id: newId('n'), ts: '', text: p.notes.trim(), author: '' }]
          : []
        const next = [...existingHistory, ...legacyMigration, entry]
        const { notes: _legacyNotes, ...rest } = p
        return { ...rest, notesHistory: next }
      }),
    }))
  }
  const removeNote = (projectId, noteId) => {
    update(d => ({
      ...d,
      projects: d.projects.map(p => {
        if (p.id !== projectId) return p
        const history = Array.isArray(p.notesHistory) ? p.notesHistory : []
        return { ...p, notesHistory: history.filter(n => n.id !== noteId) }
      }),
    }))
  }

  const projects = weekData.projects || []
  const enrichedProjects = projects.map(enrichProject)

  // SLA aggregates — primary 2-day SLA
  const tracked = enrichedProjects.filter(p => p.newSlaOnTime !== null)
  const trackedOnTime = tracked.filter(p => p.newSlaOnTime === true).length
  const newSlaRate = tracked.length > 0 ? Math.round((trackedOnTime / tracked.length) * 100) : null

  // Legacy SLA aggregate (only when no info-received date yet)
  const legacyOnly = enrichedProjects.filter(p => p.newSlaOnTime === null && p.legacyOnTime !== null)
  const legacyOnTimeCount = legacyOnly.filter(p => p.legacyOnTime === true).length

  const counts = PROJECT_STATUSES.reduce((acc, s) => ({
    ...acc, [s.key]: projects.filter(p => p.status === s.key).length
  }), {})

  // Sorting
  const sorted = useMemo(() => {
    if (!sortBy) return enrichedProjects
    const dir = sortDir === 'asc' ? 1 : -1
    const cmp = (a, b) => {
      let av, bv
      switch (sortBy) {
        case 'tier':
          av = TIER_ORDER[a.tier] ?? 99; bv = TIER_ORDER[b.tier] ?? 99; break
        case 'status':
          av = STATUS_ORDER[a.status] ?? 99; bv = STATUS_ORDER[b.status] ?? 99; break
        case 'start':
          av = a.startDate || ''; bv = b.startDate || ''; break
        case 'activated':
          av = a.activatedDate || ''; bv = b.activatedDate || ''; break
        default:
          return 0
      }
      const aEmpty = av === '' || av === undefined || av === null
      const bEmpty = bv === '' || bv === undefined || bv === null
      if (aEmpty && !bEmpty) return 1
      if (!aEmpty && bEmpty) return -1
      if (aEmpty && bEmpty) return 0
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    }
    return [...enrichedProjects].sort(cmp)
  }, [enrichedProjects, sortBy, sortDir])

  const onSort = (col) => {
    if (sortBy === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortBy(null); setSortDir('asc') }
    } else {
      setSortBy(col); setSortDir('asc')
    }
  }

  return (
    <div className="space-y-6">
      {/* Status summary tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PROJECT_STATUSES.map(s => (
          <div key={s.key} className="border border-stone-200 bg-white p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }} />
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{s.label}</div>
            <div className="display-font text-3xl font-medium text-stone-900 num-tabular">{counts[s.key]}</div>
          </div>
        ))}
      </div>

      {/* Primary 2-business-day SLA summary */}
      <div className="border border-stone-200 bg-white p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: '#7C3AED' }} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 bg-violet-50 rounded">
              <Zap className="w-5 h-5 text-violet-700" />
            </div>
            <div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Implementation SLA · 2 business days</div>
              {newSlaRate !== null ? (
                <div className={`display-font text-3xl font-medium num-tabular ${newSlaRate >= 80 ? 'text-emerald-700' : newSlaRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                  {newSlaRate}% <span className="text-base text-stone-400 font-normal">({trackedOnTime} of {tracked.length})</span>
                </div>
              ) : (
                <div className="display-font text-2xl font-medium text-stone-400 num-tabular">
                  Awaiting first activation
                </div>
              )}
              <div className="text-xs text-stone-500 mt-1">
                {tracked.length > 0
                  ? `Goal: ≤ ${SLA_BUSINESS_DAYS} business days from "info received" → "activated".`
                  : 'No projects yet have both an info-received date and an activated date.'}
              </div>
            </div>
          </div>
          {legacyOnly.length > 0 && (
            <div className="text-xs text-stone-500 max-w-[260px] sm:text-right">
              <span className="font-medium text-stone-700">{legacyOnTimeCount} of {legacyOnly.length}</span> additional project{legacyOnly.length === 1 ? '' : 's'} on the legacy tier-based SLA (no info-received date yet).
            </div>
          )}
        </div>
      </div>

      {/* Projects table */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Active implementations</div>
            <p className="text-sm text-stone-600 mt-1">Click any row to expand notes history. Click column headers to sort.</p>
          </div>
          <button onClick={addProject} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Add project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No implementations tracked yet</div>
            <p className="text-sm text-stone-500 mb-4">Add the customers you're currently implementing.</p>
            <button onClick={addProject} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first project
            </button>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm min-w-[1280px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="w-7"></th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium min-w-[220px]">Customer</th>
                  <SortableTh label="Tier"      col="tier"      sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[150px]" />
                  <SortableTh label="Status"    col="status"    sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[140px]" />
                  <SortableTh label="Start"     col="start"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[150px]" />
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[150px]">Info Received</th>
                  <SortableTh label="Activated" col="activated" sortBy={sortBy} sortDir={sortDir} onSort={onSort} width="w-[150px]" />
                  <th className="text-center py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[120px]">On Time?</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[200px]">Notes</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    expanded={expandedId === p.id}
                    onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    onUpdate={(patch) => updateProject(p.id, patch)}
                    onRemove={() => removeProject(p.id)}
                    onAppendNote={(text) => appendNote(p.id, text)}
                    onRemoveNote={(noteId) => removeNote(p.id, noteId)}
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

function SortableTh({ label, col, sortBy, sortDir, onSort, width = '' }) {
  const active = sortBy === col
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown
  return (
    <th className={`text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium ${width}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-stone-900' : 'text-stone-600 hover:text-stone-900'}`}
        title={`Sort by ${label}`}>
        {label}
        <Icon className={`w-3 h-3 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  )
}

function ProjectRow({ project: p, expanded, onToggleExpand, onUpdate, onRemove, onAppendNote, onRemoveNote }) {
  const stop = (e) => e.stopPropagation()
  const isCp = p.tier === 'Channel Partners'
  const noteHistory = readNotesHistory(p)
  const noteCount = noteHistory.length
  const latestNote = noteHistory[0]

  return (
    <>
      <tr className={`border-b border-stone-100 cursor-pointer transition-colors ${expanded ? 'bg-stone-50' : 'hover:bg-stone-50/50'}`}
          onClick={onToggleExpand}>
        <td className="py-2 pl-3 pr-1 text-stone-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <div className="flex items-center gap-1.5">
            {isCp && <Star className="w-3.5 h-3.5 flex-shrink-0" style={{ color: CHANNEL_PARTNER_COLOR, fill: CHANNEL_PARTNER_COLOR }} />}
            <input value={p.customer} onChange={(e) => onUpdate({ customer: e.target.value })}
              placeholder="Customer name"
              className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
          </div>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <select value={p.tier || 'Standard'} onChange={(e) => onUpdate({ tier: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
            {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <select value={p.status} onChange={(e) => onUpdate({ status: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
            {PROJECT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="date" value={p.startDate || ''} onChange={(e) => onUpdate({ startDate: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="date" value={p.infoReceivedDate || ''} onChange={(e) => onUpdate({ infoReceivedDate: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
        </td>
        <td className="py-2 px-3" onClick={stop}>
          <input type="date" value={p.activatedDate || ''} onChange={(e) => onUpdate({ activatedDate: e.target.value })}
            className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
        </td>
        <td className="py-2 px-3 text-center">
          <OnTimeCell project={p} />
        </td>
        <td className="py-2 px-3">
          {noteCount === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-stone-400">
              <MessageSquare className="w-3.5 h-3.5" /> No notes yet
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-600" title={latestNote?.text}>
              <MessageSquare className="w-3.5 h-3.5 text-stone-500" />
              <span className="font-medium text-stone-900">{noteCount}</span>
              <span className="truncate max-w-[110px]">· {latestNote?.text}</span>
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-right" onClick={stop}>
          <button onClick={onRemove} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-stone-50/60">
          <td></td>
          <td colSpan={9} className="py-5 pr-6">
            <NotesDrawer
              project={p}
              notes={noteHistory}
              onAppendNote={onAppendNote}
              onRemoveNote={onRemoveNote}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function OnTimeCell({ project: p }) {
  // Primary: 2-business-day SLA
  if (p.newSlaOnTime !== null) {
    const days = p.businessDaysToActivation
    const onTime = p.newSlaOnTime
    let cls, label
    if (days <= 1) { cls = 'bg-emerald-50 text-emerald-700'; label = `✓ ${days}d` }
    else if (days === 2) { cls = 'bg-amber-50 text-amber-700'; label = `${days}d` }
    else { cls = 'bg-red-50 text-red-700'; label = `↑ ${days}d` }
    return (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
        <span className="text-[9px] text-stone-400 mono-font uppercase tracking-widest">
          {onTime ? '2-day SLA' : 'over 2-day SLA'}
        </span>
      </div>
    )
  }
  // Fallback: legacy tier SLA
  if (p.activatedDate && p.legacyOnTime !== null) {
    return p.legacyOnTime ? (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold">✓ On time</span>
        <span className="text-[9px] text-stone-400 mono-font uppercase tracking-widest">tier SLA</span>
      </div>
    ) : (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs font-semibold">↑ Late</span>
        <span className="text-[9px] text-stone-400 mono-font uppercase tracking-widest">tier SLA</span>
      </div>
    )
  }
  // Not yet activated — show legacy target date if known
  if (p.startDate && p.legacyTargetDate) {
    return (
      <span className="text-xs text-stone-400">
        SLA: {p.legacyTargetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
    )
  }
  return <span className="text-xs text-stone-400">—</span>
}

function NotesDrawer({ project, notes, onAppendNote, onRemoveNote }) {
  const [draft, setDraft] = useState('')
  const send = () => {
    if (!draft.trim()) return
    onAppendNote(draft)
    setDraft('')
  }
  const onKey = (e) => {
    // Cmd/Ctrl+Enter sends. Plain Enter inserts newline.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() }
  }

  return (
    <div className="bg-white border border-stone-200 p-5 ml-3">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-stone-500" />
        <div className="display-font text-base font-medium text-stone-900">
          Notes for {project.customer || 'this project'}
        </div>
        <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500 ml-1">
          {notes.length} {notes.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Add new note */}
      <div className="mb-4">
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add a note... (Cmd/Ctrl+Enter to save)"
          className="w-full py-2.5 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed"
        />
        <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
          <div className="text-[11px] text-stone-500">
            Notes are timestamped and appended to the history.
          </div>
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" /> Add note
          </button>
        </div>
      </div>

      {/* History */}
      {notes.length === 0 ? (
        <div className="border border-dashed border-stone-300 py-6 text-center text-sm text-stone-500">
          No notes yet — add the first one above.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-2">
          {notes.map((n, i) => (
            <div key={n.id} className="border border-stone-200 bg-stone-50/60 px-3 py-2.5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                  {i === 0 && (
                    <span className="mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-stone-900 text-stone-50 rounded flex-shrink-0">Latest</span>
                  )}
                  <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500 flex-shrink-0">
                    {n.ts ? formatNoteTimestamp(n.ts) : 'Migrated entry'}
                  </span>
                  {n.author && (
                    <span className="text-[11px] text-stone-500 truncate">· {n.author}</span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveNote(n.id)}
                  className="p-0.5 text-stone-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Delete this note">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-sm text-stone-800 mt-1.5 whitespace-pre-wrap leading-relaxed">{n.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ImplMonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-700" /></div>

  // MTD ticket aggregates
  let totalCompleted = 0, totalNew = 0
  for (const w of weeks) for (const d of (w.data?.daily || [])) {
    totalCompleted += Number(d.completed) || 0
    totalNew += Number(d.newTickets) || 0
  }

  // Latest projects snapshot (carried forward in scorecards)
  const latestProjects = weeks.length > 0 ? (weeks[weeks.length - 1].data?.projects || []) : []
  const enriched = latestProjects.map(enrichProject)

  // Primary 2-day SLA rate
  const tracked = enriched.filter(p => p.newSlaOnTime !== null)
  const newSlaRate = tracked.length > 0
    ? (tracked.filter(p => p.newSlaOnTime === true).length / tracked.length) * 100
    : null

  // Legacy tier-based rates
  const standardActivated = enriched.filter(p => p.tier !== 'Enterprise' && p.activatedDate)
  const enterpriseActivated = enriched.filter(p => p.tier === 'Enterprise' && p.activatedDate)
  const standardOnTimeRate = standardActivated.length > 0
    ? (standardActivated.filter(p => p.legacyOnTime !== false).length / standardActivated.length) * 100
    : null
  const enterpriseOnTimeRate = enterpriseActivated.length > 0
    ? (enterpriseActivated.filter(p => p.legacyOnTime !== false).length / enterpriseActivated.length) * 100
    : null

  const channelPartnerProjects = enriched.filter(p => p.tier === 'Channel Partners')

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
      <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
      <MtdLegend />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MtdCard label="Tickets Completed"           value={totalCompleted}      target={targets.tickets_completed} />
        <MtdCard label="2-Day SLA Hit Rate"          value={newSlaRate}          target={targets.two_day_sla_pct} unit="pct" help={`${tracked.length} project${tracked.length === 1 ? '' : 's'} with info-received → activated tracked`} />
        <MtdCard label="Channel Partners"            value={channelPartnerProjects.length} target={null} help="Active channel partner implementations" />
        <MtdCard label="On-Time Activation (Std)"    value={standardOnTimeRate}  target={targets.standard_activation_pct} unit="pct" help={`${standardActivated.length} customer${standardActivated.length === 1 ? '' : 's'}, legacy 14-day SLA`} />
        <MtdCard label="On-Time Activation (Ent)"    value={enterpriseOnTimeRate} target={targets.enterprise_activation_pct} unit="pct" help={`${enterpriseActivated.length} customer${enterpriseActivated.length === 1 ? '' : 's'}, legacy 30-day SLA`} />
        <MtdCard label="New Tickets" value={totalNew} target={null} />
        <MtdCard label="Active Implementations" value={(latestProjects || []).filter(p => p.status === 'in_progress').length} target={null} />
        <MtdCard label="Stuck" value={(latestProjects || []).filter(p => p.status === 'stuck').length} target={null} help="Lower is better" />
      </div>
    </div>
  )
}

// ============================================================================
//  Notes Section
// ============================================================================

function NotesSection({ weekData, update }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Notes for the week</div>
      <p className="text-sm text-stone-600 mb-4">Wins, blockers, anything to flag.</p>
      <textarea rows={10} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
        placeholder="What went well? What got stuck? What do you need help with?"
        className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
    </div>
  )
}
