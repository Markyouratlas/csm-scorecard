import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Target, Briefcase, FileText, Award, Users, TrendingUp, Plus, Trash2, DollarSign, Calendar, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { supabase } from './supabase'
import { useScorecard } from './useScorecard'
import RocketLoader from './RocketLoader'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_AE_WEEK, AE_DEAL_STAGES, newId } from './roleConstants'
import { sumDays, showUpRate, closeRate, fmtPct } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, {
  NorthStarTile, SectionTabs, PageHeader, MoneyField
} from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'
import CommissionsTab from './CommissionsTab'

export default function AeView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const {
    weekData, loading, saving, savedAt, update,
    weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    submittedAt, isLocked, submit, unsubmit, submitting,
  } = useScorecard(profile.id, propWeekKey, BLANK_AE_WEEK, ['deals'])
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('funnel')

  if (loading || !weekData) {
    return <RocketLoader className="min-h-screen" />
  }

  const workDayIdxs = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS

  const totalBooked = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].demosBooked) || 0), 0)
  const totalCompleted = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].demosCompleted) || 0), 0)
  const totalSignups = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].trialSignups) || 0), 0)
  const showUp = showUpRate(totalCompleted, totalBooked)
  const close = closeRate(totalSignups, totalCompleted)

  const sections = [
    { id: 'funnel',     label: 'Daily Funnel',   icon: Target },
    { id: 'pipeline',   label: 'Pipeline',       icon: Briefcase },
    { id: 'monthly',    label: 'Monthly View',   icon: Calendar },
    { id: 'commission', label: 'My Commission',  icon: DollarSign },
    { id: 'notes',      label: 'Notes',          icon: FileText },
  ]

  return (
    <ScorecardShell
      profile={profile} weekKey={weekKey} setWeekKey={setWeekKey}
      isExecDrillIn={isExecDrillIn} isViewingCurrentWeek={isViewingCurrentWeek} currentWeekKey={currentWeekKey}
      submittedAt={submittedAt} isLocked={isLocked} submit={submit} unsubmit={unsubmit} submitting={submitting}
      saving={saving} savedAt={savedAt}
      onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Account Executive · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#1E40AF"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile label="Demos Completed" value={totalCompleted} sublabel="North star metric" color="#1E40AF" icon={Award} />
        <NorthStarTile
          label="Show-Up Rate"
          value={showUp !== null ? `${(showUp * 100).toFixed(1)}%` : '—'}
          sublabel={showUp !== null ? (showUp >= 0.75 ? '✓ At/above 75% target' : '↓ Below 75% target') : 'Awaiting data'}
          color="#1C1917"
          icon={Users}
        />
        <NorthStarTile
          label="Close Rate"
          value={close !== null ? `${(close * 100).toFixed(1)}%` : '—'}
          sublabel={close !== null ? (close >= 0.30 ? '✓ At/above 30% target' : '↓ Below 30% target') : 'Awaiting data'}
          color="#0F766E"
          icon={TrendingUp}
        />
      </div>

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'funnel' && <FunnelSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} />}
        {section === 'pipeline' && <PipelineSection weekData={weekData} update={update} profile={profile} />}
        {section === 'monthly' && <AeMonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'commission' && <CommissionsTab profile={profile} />}
        {section === 'notes' && <NotesSection weekData={weekData} update={update} />}
      </div>
    </ScorecardShell>
  )
}

function AeMonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><RocketLoader className="min-h-[160px]" label="Loading…" /></div>

  // Aggregate daily entries
  const totals = weeks.reduce((acc, w) => {
    const daily = w.data?.daily || []
    for (const d of daily) {
      acc.demosBooked += Number(d.demosBooked) || 0
      acc.demosCompleted += Number(d.demosCompleted) || 0
      acc.trialSignups += Number(d.trialSignups) || 0
    }
    return acc
  }, { demosBooked: 0, demosCompleted: 0, trialSignups: 0 })

  // Aggregate deals (from latest week's view since deals carry forward)
  // Use the most recent week's deals since they represent the current pipeline state
  const latestDeals = weeks.length > 0 ? (weeks[weeks.length - 1].data?.deals || []) : []
  const wonThisMonth = latestDeals.filter(d => d.stage === 'Won')
  const newMrr = wonThisMonth.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const totalDealValue = wonThisMonth.reduce((s, d) => s + (Number(d.value) || 0) + ((Number(d.mrr) || 0) * 12), 0)
  const avgDealSize = wonThisMonth.length > 0 ? totalDealValue / wonThisMonth.length : null

  const showUp = totals.demosBooked > 0 ? (totals.demosCompleted / totals.demosBooked) * 100 : null
  const close = totals.demosCompleted > 0 ? (totals.trialSignups / totals.demosCompleted) * 100 : null

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
      <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
      <MtdLegend />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MtdCard label="Demos Completed" value={totals.demosCompleted} target={targets.demos_completed} />
        <MtdCard label="Show-Up Rate" value={showUp} target={targets.show_up_rate} unit="pct" />
        <MtdCard label="Close Rate" value={close} target={targets.close_rate} unit="pct" />
        <MtdCard label="Average Deal Size" value={avgDealSize} target={targets.avg_deal_size} unit="money" help={`From ${wonThisMonth.length} won deal${wonThisMonth.length === 1 ? '' : 's'}`} />
        <MtdCard label="New MRR Closed" value={newMrr} target={targets.new_mrr} unit="money" />
        <MtdCard label="Demos Booked" value={totals.demosBooked} target={null} />
      </div>
    </div>
  )
}

function FunnelSection({ weekData, update, workDayIdxs, weekKey }) {
  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday); d.setDate(monday.getDate() + (dayIdx - 1)); return d
  }

  const totals = workDayIdxs.reduce((acc, di) => {
    const day = weekData.daily[di]
    return {
      demosBooked: acc.demosBooked + (Number(day.demosBooked) || 0),
      demosCompleted: acc.demosCompleted + (Number(day.demosCompleted) || 0),
      trialSignups: acc.trialSignups + (Number(day.trialSignups) || 0),
    }
  }, { demosBooked: 0, demosCompleted: 0, trialSignups: 0 })

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Daily funnel</div>
      <p className="text-sm text-stone-600 mb-6">Track your daily demo and trial conversion. Targets: <strong>75%</strong> show-up, <strong>30%</strong> close.</p>
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Demos Booked</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Demos Completed</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Closes</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Show-Up</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Close</th>
          </tr>
        </thead>
        <tbody>
          {workDayIdxs.map(dayIdx => {
            const day = weekData.daily[dayIdx]
            const date = dateFor(dayIdx)
            const dayShowUp = showUpRate(day.demosCompleted, day.demosBooked)
            const dayClose = closeRate(day.trialSignups, day.demosCompleted)
            return (
              <tr key={dayIdx} className="border-b border-stone-100">
                <td className="py-2 px-3">
                  <div className="font-medium text-stone-800">{DAY_NAMES[dayIdx]}</div>
                  <div className="text-[10px] text-stone-500 mono-font">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.demosBooked || ''} onChange={(e) => setCell(dayIdx, 'demosBooked', e.target.value)}
                    className="w-16 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.demosCompleted || ''} onChange={(e) => setCell(dayIdx, 'demosCompleted', e.target.value)}
                    className="w-16 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.trialSignups || ''} onChange={(e) => setCell(dayIdx, 'trialSignups', e.target.value)}
                    className="w-16 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <DerivedCell value={dayShowUp} target={0.75} comparator="gte" format="pct" />
                <DerivedCell value={dayClose} target={0.30} comparator="gte" format="pct" />
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Weekly Total</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.demosBooked}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.demosCompleted}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.trialSignups}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color: '#F59E0B' }}>
              {fmtPct(showUpRate(totals.demosCompleted, totals.demosBooked))}
            </td>
            <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color: '#F59E0B' }}>
              {fmtPct(closeRate(totals.trialSignups, totals.demosCompleted))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DerivedCell({ value, target, comparator, format }) {
  let isGood = null
  if (value !== null && value !== undefined && !isNaN(value) && target !== undefined) {
    isGood = comparator === 'gte' ? value >= target : value <= target
  }
  const display = value === null || value === undefined ? '—'
    : format === 'pct' ? `${(value * 100).toFixed(1)}%`
    : format === 'money' ? `$${value.toFixed(2)}`
    : value.toFixed(1)
  return (
    <td className={`py-2 px-2 text-center num-tabular text-sm ${isGood === true ? 'text-emerald-700 font-semibold' : isGood === false ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>
      {display}
    </td>
  )
}

function PipelineSection({ weekData, update, profile }) {
  const deals = weekData.deals || []
  const addDeal = () => update(d => ({
    ...d,
    deals: [...(d.deals || []), { id: newId('d'), company: '', stage: 'Discovery', value: 0, mrr: 0, nextStep: '' }],
  }))
  const updateDeal = (id, patch) => update(d => ({
    ...d, deals: d.deals.map(deal => deal.id === id ? { ...deal, ...patch } : deal),
  }))
  const removeDeal = (id) => update(d => ({ ...d, deals: d.deals.filter(deal => deal.id !== id) }))

  // Total deal value = one-time value + MRR × 12 (annualized contract value)
  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0) + ((Number(d.mrr) || 0) * 12), 0)
  const wonDeals = deals.filter(d => d.stage === 'Won')
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0) + ((Number(d.mrr) || 0) * 12), 0)
  const wonMrr = wonDeals.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const avgDealSize = wonDeals.length > 0 ? wonValue / wonDeals.length : null

  return (
    <div className="space-y-6">
      {/* Pipeline summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total pipeline (ACV)</div>
          <div className="display-font text-2xl font-medium text-stone-900 num-tabular">${totalValue.toLocaleString()}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Won (ACV)</div>
          <div className="display-font text-2xl font-medium text-emerald-700 num-tabular">${wonValue.toLocaleString()}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">New MRR</div>
          <div className="display-font text-2xl font-medium text-emerald-700 num-tabular">${wonMrr.toLocaleString()}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Avg Deal Size</div>
          <div className="display-font text-2xl font-medium text-stone-900 num-tabular">{avgDealSize !== null ? `$${Math.round(avgDealSize).toLocaleString()}` : '—'}</div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Active deals</div>
            <p className="text-sm text-stone-600 mt-1">All your in-flight opportunities. Enter MRR for recurring + one-time value for setup fees or upfront contracts.</p>
          </div>
          <button onClick={addDeal} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Add deal
          </button>
        </div>

        {deals.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No deals tracked yet</div>
            <p className="text-sm text-stone-500 mb-4">Start tracking your active opportunities.</p>
            <button onClick={addDeal} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first deal
            </button>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Company</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[120px]">Stage</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">MRR ($)</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">One-time ($)</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Next step</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.id} className={`border-b border-stone-100 ${deal.stage === 'Won' ? 'bg-emerald-50/40' : deal.stage === 'Lost' ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-3">
                      <input value={deal.company} onChange={(e) => updateDeal(deal.id, { company: e.target.value })}
                        placeholder="Company name"
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                    </td>
                    <td className="py-2 px-3">
                      <select value={deal.stage} onChange={(e) => updateDeal(deal.id, { stage: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                        {AE_DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="any" value={deal.mrr || ''} onChange={(e) => updateDeal(deal.id, { mrr: Number(e.target.value) || 0 })}
                        placeholder="0" className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="any" value={deal.value || ''} onChange={(e) => updateDeal(deal.id, { value: Number(e.target.value) || 0 })}
                        placeholder="0" className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
                    </td>
                    <td className="py-2 px-3">
                      <input value={deal.nextStep || ''} onChange={(e) => updateDeal(deal.id, { nextStep: e.target.value })}
                        placeholder="Next action..."
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => removeDeal(deal.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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

      <ChannelPartnerDeals profile={profile} />
    </div>
  )
}

// Status badge styling for portal-sourced deals.
const CHANNEL_STATUS = {
  pending:     { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700' },
  qualified:   { label: 'Qualified',      cls: 'bg-emerald-100 text-emerald-700' },
  declined:    { label: 'Declined',       cls: 'bg-red-100 text-red-700' },
  demo_booked: { label: 'Demo Booked',    cls: 'bg-violet-100 text-violet-700' },
}

function ChannelStatusBadge({ status }) {
  const s = CHANNEL_STATUS[status] || { label: status || '—', cls: 'bg-stone-100 text-stone-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function FlagDot({ flag }) {
  if (flag !== 'green' && flag !== 'red') return null
  return <span className={`inline-block w-2 h-2 rounded-full ${flag === 'green' ? 'bg-emerald-500' : 'bg-red-500'}`} title={flag === 'green' ? 'Great fit' : 'Needs review'} />
}

const parseValue = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

const fmtChannelDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  return isNaN(date) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const DEAL_PORTAL_URL = 'https://deals.youratlas.com'

function ChannelPartnerDeals({ profile }) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const enabled = !!profile?.channel_partner_enabled

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    const { data } = await supabase.from('channel_deals').select('*').order('portal_created_at', { ascending: false })
    setDeals(data || [])
    setLoading(false)
  }, [enabled])

  useEffect(() => { load() }, [load])

  // Only for channel-partner-enabled reps, and only once there's something to show.
  if (!enabled) return null
  if (loading || deals.length === 0) return null

  const qualified = deals.filter(d => d.status === 'qualified')
  const pending = deals.filter(d => d.status === 'pending')
  const qualifiedValues = qualified.map(d => parseValue(d.avg_value)).filter(n => n > 0)
  const avgValue = qualifiedValues.length ? qualifiedValues.reduce((a, b) => a + b, 0) / qualifiedValues.length : null

  return (
    <div className="space-y-6">
      {/* Channel summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total Channel Deals</div>
          <div className="display-font text-2xl font-medium text-stone-900 num-tabular">{deals.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Qualified</div>
          <div className="display-font text-2xl font-medium text-emerald-700 num-tabular">{qualified.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Pending Review</div>
          <div className="display-font text-2xl font-medium text-amber-600 num-tabular">{pending.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Avg Value (Qualified)</div>
          <div className="display-font text-2xl font-medium text-stone-900 num-tabular">{avgValue !== null ? `$${Math.round(avgValue).toLocaleString()}` : '—'}</div>
        </div>
      </div>

      {/* Channel deals table */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Channel Partner Deals</div>
            <p className="text-sm text-stone-600 mt-1">Deals registered through the Atlas Channel Partner Portal</p>
          </div>
          <a href={DEAL_PORTAL_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-stone-300 hover:border-stone-900 hover:bg-stone-100 transition-colors text-sm font-medium text-stone-700">
            Open Deal Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Business</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Partner</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">TSD</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Volume</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Value</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Status</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => {
                const expanded = expandedId === deal.id
                return (
                  <React.Fragment key={deal.id}>
                    <tr onClick={() => setExpandedId(expanded ? null : deal.id)} className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-300 shrink-0" />}
                          <div>
                            <div className="font-medium text-stone-800">{deal.business_name}</div>
                            {deal.contact_name && <div className="text-[11px] text-stone-500">{deal.contact_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-stone-700">{deal.partner_company || '—'}</td>
                      <td className="py-2.5 px-3 text-stone-700">{deal.tsd_name || '—'}</td>
                      <td className="py-2.5 px-3 text-stone-700"><span className="inline-flex items-center gap-1.5">{deal.call_volume || '—'} <FlagDot flag={deal.call_volume_flag} /></span></td>
                      <td className="py-2.5 px-3 text-stone-700"><span className="inline-flex items-center gap-1.5">{deal.avg_value || '—'} <FlagDot flag={deal.avg_value_flag} /></span></td>
                      <td className="py-2.5 px-3"><ChannelStatusBadge status={deal.status} /></td>
                      <td className="py-2.5 px-3 text-stone-500 num-tabular">{fmtChannelDate(deal.portal_created_at)}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-stone-100 bg-stone-50/60">
                        <td colSpan={7} className="py-4 px-3">
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 pl-5">
                            <ChannelDetail label="Contact Email" value={deal.contact_email} />
                            <ChannelDetail label="Contact Phone" value={deal.contact_phone} />
                            <ChannelDetail label="CRM" value={deal.crm} />
                            <ChannelDetail label="Pain Point" value={deal.pain_point} wide />
                            <ChannelDetail label="Admin Notes" value={deal.notes} wide />
                          </div>
                          <div className="pl-5 mt-3">
                            <a href={DEAL_PORTAL_URL} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900 hover:underline">
                              Manage in Portal <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ChannelDetail({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-0.5">{label}</div>
      <div className="text-sm text-stone-700 whitespace-pre-wrap break-words">{value || <span className="text-stone-400">—</span>}</div>
    </div>
  )
}

function NotesSection({ weekData, update }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Notes for the week</div>
      <p className="text-sm text-stone-600 mb-4">Wins, deal blockers, objections you're seeing.</p>
      <textarea rows={10} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
        placeholder="What deals progressed? What's stuck? What objections keep coming up?"
        className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
    </div>
  )
}
