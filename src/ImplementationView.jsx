import React, { useState, useMemo } from 'react'
import { Loader2, Ticket, FolderKanban, FileText, Award, Activity, Layers, Plus, Trash2, Calendar } from 'lucide-react'
import { useScorecard } from './useScorecard'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
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

export default function ImplementationView({ profile, onSignOut, onSwitchToManager, onProfileUpdated, weekKey: propWeekKey }) {
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
    <ScorecardShell profile={profile} weekKey={weekKey} saving={saving} savedAt={savedAt}
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
        {section === 'projects' && <ProjectsSection weekData={weekData} update={update} />}
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

  // Get the date for each work day this week
  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday)
    // Monday is dayIdx=1; weekKey is the Monday of this week.
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
            <th className="text-left py-2 pr-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
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
                <td className="py-2 pr-3">
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
            <td className="py-3 pr-3 mono-font text-[10px] uppercase tracking-widest font-medium">Weekly Total</td>
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

function ProjectsSection({ weekData, update }) {
  const today = new Date().toISOString().slice(0, 10)
  const addProject = () => update(d => ({
    ...d,
    projects: [...(d.projects || []), {
      id: newId('p'), customer: '', status: 'in_progress',
      tier: 'Standard', startDate: today, activatedDate: '', notes: ''
    }],
  }))
  const updateProject = (id, patch) => update(d => ({
    ...d, projects: d.projects.map(p => p.id === id ? { ...p, ...patch } : p),
  }))
  const removeProject = (id) => update(d => ({ ...d, projects: d.projects.filter(p => p.id !== id) }))

  const projects = weekData.projects || []

  // Calculate SLA + on-time status for each project
  const enrichedProjects = projects.map(p => {
    const slaDays = p.tier === 'Enterprise' ? 30 : 14
    let slaTargetDate = null
    let onTime = null
    if (p.startDate) {
      const start = new Date(p.startDate)
      slaTargetDate = new Date(start); slaTargetDate.setDate(start.getDate() + slaDays)
      if (p.activatedDate) {
        onTime = new Date(p.activatedDate) <= slaTargetDate
      }
    }
    return { ...p, slaTargetDate, onTime, slaDays }
  })

  // SLA stats
  const activated = enrichedProjects.filter(p => p.activatedDate)
  const onTimeCount = activated.filter(p => p.onTime === true).length
  const onTimeRate = activated.length > 0 ? Math.round((onTimeCount / activated.length) * 100) : null

  const counts = PROJECT_STATUSES.reduce((acc, s) => ({ ...acc, [s.key]: projects.filter(p => p.status === s.key).length }), {})

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

      {/* On-time activation summary */}
      {activated.length > 0 && (
        <div className="border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">On-Time Activation Rate (this week)</div>
              <div className={`display-font text-3xl font-medium num-tabular ${onTimeRate >= 70 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {onTimeRate}% <span className="text-base text-stone-400 font-normal">({onTimeCount} of {activated.length})</span>
              </div>
            </div>
            <div className="text-xs text-stone-500">
              Target: <strong>≥70%</strong> · Standard SLA: 14 days · Enterprise SLA: 30 days
            </div>
          </div>
        </div>
      )}

      {/* Projects table */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Active implementations</div>
            <p className="text-sm text-stone-600 mt-1">Each customer's tier determines the SLA. On-time = activated by SLA target date.</p>
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
            <table className="w-full text-sm min-w-[1020px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Tier</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[140px]">Status</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[140px]">Start</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[140px]">Activated</th>
                  <th className="text-center py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">On Time?</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Notes</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {enrichedProjects.map(p => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="py-2 px-3">
                      <input value={p.customer} onChange={(e) => updateProject(p.id, { customer: e.target.value })}
                        placeholder="Customer name"
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                    </td>
                    <td className="py-2 px-3">
                      <select value={p.tier || 'Standard'} onChange={(e) => updateProject(p.id, { tier: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                        <option value="Standard">Standard</option>
                        <option value="Enterprise">Enterprise</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select value={p.status} onChange={(e) => updateProject(p.id, { status: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                        {PROJECT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input type="date" value={p.startDate || ''} onChange={(e) => updateProject(p.id, { startDate: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="date" value={p.activatedDate || ''} onChange={(e) => updateProject(p.id, { activatedDate: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                    </td>
                    <td className="py-2 px-3 text-center">
                      {p.activatedDate ? (
                        p.onTime ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold">✓ On time</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs font-semibold">↑ Late</span>
                        )
                      ) : p.startDate ? (
                        <span className="text-xs text-stone-400">SLA: {p.slaTargetDate ? p.slaTargetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <input value={p.notes || ''} onChange={(e) => updateProject(p.id, { notes: e.target.value })}
                        placeholder="Blockers..."
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => removeProject(p.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

  // SLA aggregates from latest week's projects (since they carry forward)
  const latestProjects = weeks.length > 0 ? (weeks[weeks.length - 1].data?.projects || []) : []
  const standardActivated = latestProjects.filter(p => p.tier !== 'Enterprise' && p.activatedDate)
  const enterpriseActivated = latestProjects.filter(p => p.tier === 'Enterprise' && p.activatedDate)

  const standardOnTimeRate = standardActivated.length > 0
    ? (standardActivated.filter(p => p.onTime !== false).length / standardActivated.length) * 100
    : null
  const enterpriseOnTimeRate = enterpriseActivated.length > 0
    ? (enterpriseActivated.filter(p => p.onTime !== false).length / enterpriseActivated.length) * 100
    : null

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
      <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
      <MtdLegend />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MtdCard label="Tickets Completed"           value={totalCompleted}      target={targets.tickets_completed} />
        <MtdCard label="On-Time Activation (Std)"    value={standardOnTimeRate}  target={targets.standard_activation_pct} unit="pct" help={`${standardActivated.length} customer${standardActivated.length === 1 ? '' : 's'}, 14-day SLA`} />
        <MtdCard label="On-Time Activation (Ent)"    value={enterpriseOnTimeRate} target={targets.enterprise_activation_pct} unit="pct" help={`${enterpriseActivated.length} customer${enterpriseActivated.length === 1 ? '' : 's'}, 30-day SLA`} />
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
