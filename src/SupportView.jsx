import React, { useState, useMemo } from 'react'
import { Loader2, Headphones, AlertTriangle, Smile, Award, Clock, Star, Plus, Trash2, FileText, Calendar } from 'lucide-react'
import { useScorecard } from './useScorecard'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_SUPPORT_WEEK, newId } from './roleConstants'
import { sumDays, avgDays, avgArray } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, {
  NorthStarTile, SectionTabs, PageHeader
} from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

const ESCALATION_STATUSES = [
  { key: 'open',     label: 'Open',     color: '#B91C1C' },
  { key: 'pending',  label: 'Pending',  color: '#A16207' },
  { key: 'resolved', label: 'Resolved', color: '#0F766E' },
]

export default function SupportView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey }) {
  const weekKey = useMemo(() => propWeekKey || getWeekKey(), [propWeekKey])
  const monthKey = useMemo(() => getMonthKey(), [])
  const { weekData, loading, saving, savedAt, update } = useScorecard(profile.id, weekKey, BLANK_SUPPORT_WEEK)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('tickets')

  if (loading || !weekData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>
  }

  const workDayIdxs = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS

  const workDays = workDayIdxs.map(i => weekData.daily[i])
  const totalClosed = workDays.reduce((s, d) => s + (Number(d.ticketsClosed) || 0), 0)
  const avgResponse = avgDays(workDays, 'firstResponseHours', 'ticketsReceived')

  const csatScores = workDayIdxs.map(i => weekData.csat.daily[i]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)))
  const avgCsat = csatScores.length ? csatScores.reduce((s, v) => s + Number(v), 0) / csatScores.length : null

  const sections = [
    { id: 'tickets',     label: 'Daily Tickets',  icon: Headphones },
    { id: 'escalations', label: 'Escalations',    icon: AlertTriangle },
    { id: 'csat',        label: 'CSAT Tracking',  icon: Smile },
    { id: 'monthly',     label: 'Monthly View',   icon: Calendar },
    { id: 'notes',       label: 'Notes',          icon: FileText },
  ]

  return (
    <ScorecardShell profile={profile} weekKey={weekKey} saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Customer Support Associate · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#0F766E"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile label="Tickets Closed" value={totalClosed} sublabel="North star metric" color="#0F766E" icon={Award} />
        <NorthStarTile
          label="Avg Response Time"
          value={avgResponse !== null ? avgResponse.toFixed(1) : '—'}
          unit={avgResponse !== null ? 'hrs' : ''}
          sublabel={avgResponse !== null ? (avgResponse <= 4 ? '✓ Fast (≤4h target)' : '↑ Above 4h target') : 'Awaiting data'}
          color="#1C1917"
          icon={Clock}
        />
        <NorthStarTile
          label="Avg CSAT"
          value={avgCsat !== null ? avgCsat.toFixed(2) : '—'}
          unit={avgCsat !== null ? '/ 5' : ''}
          sublabel={avgCsat !== null ? (avgCsat >= 4.5 ? '✓ Excellent' : avgCsat >= 4 ? '✓ On target' : '↓ Below 4.0 target') : 'Awaiting data'}
          color="#7C3AED"
          icon={Star}
        />
      </div>

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'tickets' && <TicketsSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} />}
        {section === 'escalations' && <EscalationsSection weekData={weekData} update={update} />}
        {section === 'csat' && <CsatSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} />}
        {section === 'monthly' && <SupportMonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'notes' && <NotesSection weekData={weekData} update={update} />}
      </div>
    </ScorecardShell>
  )
}

function TicketsSection({ weekData, update, workDayIdxs, weekKey }) {
  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday); d.setDate(monday.getDate() + (dayIdx - 1)); return d
  }

  const fields = [
    { key: 'ticketsReceived',     label: 'Received' },
    { key: 'ticketsClosed',       label: 'Closed' },
    { key: 'firstResponseHours',  label: 'Avg Response (hrs)', isFloat: true },
    { key: 'backlogEod',          label: 'Backlog (EOD)' },
  ]

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Daily ticket flow</div>
      <p className="text-sm text-stone-600 mb-6">Log tickets received, closed, your average response time, and the EOD backlog.</p>
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
            {fields.map(f => (
              <th key={f.key} className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">{f.label}</th>
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
                    <input
                      type="number" min="0" step={f.isFloat ? '0.1' : '1'}
                      value={day[f.key] || ''} onChange={(e) => setCell(dayIdx, f.key, e.target.value)}
                      className="w-20 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                  </td>
                ))}
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Weekly Total</td>
            {fields.map(f => {
              if (f.key === 'firstResponseHours') {
                const avg = avgDays(workDayIdxs.map(i => weekData.daily[i]), f.key, 'ticketsReceived')
                return <td key={f.key} className="py-3 px-2 text-center num-tabular font-bold">{avg !== null ? avg.toFixed(1) : '—'}</td>
              }
              const total = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di][f.key]) || 0), 0)
              return <td key={f.key} className="py-3 px-2 text-center num-tabular font-bold">{total}</td>
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function EscalationsSection({ weekData, update }) {
  const escalations = weekData.escalations || []
  const addEsc = () => update(d => ({
    ...d,
    escalations: [...(d.escalations || []), { id: newId('esc'), customer: '', issue: '', escalatedTo: '', status: 'open' }],
  }))
  const updateEsc = (id, patch) => update(d => ({
    ...d,
    escalations: d.escalations.map(e => e.id === id ? { ...e, ...patch } : e),
  }))
  const removeEsc = (id) => update(d => ({ ...d, escalations: d.escalations.filter(e => e.id !== id) }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Escalations this week</div>
          <p className="text-sm text-stone-600 mt-1">Tickets that needed to go beyond standard support.</p>
        </div>
        <button onClick={addEsc} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add escalation
        </button>
      </div>

      {escalations.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No escalations</div>
          <p className="text-sm text-stone-500">Track any tickets that needed to go up the chain.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Issue</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Escalated to</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[140px]">Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {escalations.map(e => (
                <tr key={e.id} className="border-b border-stone-100">
                  <td className="py-2 px-3">
                    <input value={e.customer} onChange={(ev) => updateEsc(e.id, { customer: ev.target.value })}
                      placeholder="Customer"
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                  </td>
                  <td className="py-2 px-3">
                    <input value={e.issue} onChange={(ev) => updateEsc(e.id, { issue: ev.target.value })}
                      placeholder="Brief description"
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                  </td>
                  <td className="py-2 px-3">
                    <input value={e.escalatedTo} onChange={(ev) => updateEsc(e.id, { escalatedTo: ev.target.value })}
                      placeholder="Engineering, manager..."
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                  </td>
                  <td className="py-2 px-3">
                    <select value={e.status} onChange={(ev) => updateEsc(e.id, { status: ev.target.value })}
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                      {ESCALATION_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => removeEsc(e.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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
  )
}

function CsatSection({ weekData, update, workDayIdxs }) {
  const setDaily = (dayIdx, key, value) => update(d => ({
    ...d,
    csat: { ...d.csat, [key]: d.csat[key].map((v, i) => i === dayIdx ? value : v) },
  }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">CSAT tracking</div>
      <p className="text-sm text-stone-600 mb-6">Daily average CSAT score (1-5) and number of survey responses.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Avg score (1–5)</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium"># responses</th>
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => (
              <tr key={dayIdx} className="border-b border-stone-100">
                <td className="py-2 pr-3 font-medium text-stone-800">{DAY_NAMES[dayIdx]}</td>
                <td className="py-2 px-2 text-center">
                  <input
                    type="number" step="0.1" min="0" max="5"
                    value={weekData.csat.daily[dayIdx] ?? ''}
                    onChange={(e) => setDaily(dayIdx, 'daily', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm"
                  />
                </td>
                <td className="py-2 px-2 text-center">
                  <input
                    type="number" min="0"
                    value={weekData.csat.responses[dayIdx] || ''}
                    onChange={(e) => setDaily(dayIdx, 'responses', Number(e.target.value) || 0)}
                    className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NotesSection({ weekData, update }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Notes for the week</div>
      <p className="text-sm text-stone-600 mb-4">Recurring issues, FAQ updates needed, customer themes.</p>
      <textarea rows={10} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
        placeholder="What patterns did you see? What docs need updating? What kept tripping customers up?"
        className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
    </div>
  )
}

function SupportMonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-700" /></div>

  let totalClosed = 0, totalReceived = 0
  let respSum = 0, daysWithResp = 0
  let csatSum = 0, daysWithCsat = 0
  let totalEscalations = 0
  for (const w of weeks) {
    const data = w.data || {}
    for (const d of (data.daily || [])) {
      totalClosed += Number(d.ticketsClosed) || 0
      totalReceived += Number(d.ticketsReceived) || 0
      const r = Number(d.firstResponseHours) || 0
      const recv = Number(d.ticketsReceived) || 0
      if (recv > 0 && r > 0) { respSum += r; daysWithResp += 1 }
    }
    for (const v of (data.csat?.daily || [])) {
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number(v) > 0) {
        csatSum += Number(v); daysWithCsat += 1
      }
    }
    totalEscalations += (data.escalations || []).length
  }
  const avgResp = daysWithResp > 0 ? respSum / daysWithResp : null
  const avgCsat = daysWithCsat > 0 ? csatSum / daysWithCsat : null
  const taskCompletion = totalReceived > 0 ? (totalClosed / totalReceived) * 100 : null

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
      <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
      <MtdLegend />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MtdCard label="Tickets Closed"        value={totalClosed}     target={targets.tickets_closed} />
        <MtdCard label="Avg Response Time"     value={avgResp}         target={targets.avg_response_hours} help="Hours, lower is better" />
        <MtdCard label="Avg CSAT"              value={avgCsat}         target={targets.csat_score} help="1–5 score" />
        <MtdCard label="Task Completion Rate"  value={taskCompletion}  target={targets.task_completion_pct} unit="pct" help="Closed / Received" />
        <MtdCard label="Escalations"           value={totalEscalations} target={null} help="Lower is better" />
        <MtdCard label="Tickets Received"      value={totalReceived}   target={null} />
      </div>
    </div>
  )
}
