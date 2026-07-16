import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { Target, Briefcase, FileText, Award, Users, TrendingUp, Plus, Trash2, DollarSign, Calendar, ChevronRight, ChevronDown, ExternalLink, RefreshCw, Phone, Mail, MessageSquare, MessageCircle, Play, Loader2, Search, X, Handshake } from 'lucide-react'
import AeFunnelDrilldownModal from './AeFunnelDrilldownModal'
import { supabase } from './supabase'
import { useScorecard } from './useScorecard'
import { useAeDeals } from './hooks/useAeDeals'
import RocketLoader from './RocketLoader'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { formatWeekLabel } from './dateUtils'
import { isWonChannelDeal, isLostChannelDeal, isOpenChannelDeal, openPartnerPipeline } from './channelDeals'
import { BLANK_AE_WEEK, AE_DEAL_STAGES, AE_MEETING_STATUSES, AE_ATTENDED_STATUSES, AE_CLOSEABLE_STATUSES, AE_CLOSED_STATUSES, newId } from './roleConstants'
import { useQuery } from '@tanstack/react-query'
import { deriveFunnelWeek, funnelMatches, closeableHeld, weekKeyOfMeeting } from './aeFunnel'
import CombinedDialsCard from './CombinedDialsCard'
import { useDialer } from './DialerContext'
import { sumDays, showUpRate, closeRate, fmtPct, safeDiv } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, {
  NorthStarTile, SectionTabs, PageHeader, MoneyField, WeekNavigator
} from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'
import CommissionsTab from './CommissionsTab'

export default function AeView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey, setWeekKey: propSetWeekKey }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const {
    weekData, loading, saving, savedAt, update,
    weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    submittedAt, isLocked, submit, unsubmit, submitting,
  } = useScorecard(profile.id, propWeekKey, BLANK_AE_WEEK, ['deals'])
  // Week setter: hook owns it in self-view; in an exec drill-in the hook's setter
  // is a no-op and ScorecardViewer passes the real one down as propSetWeekKey.
  const effectiveSetWeekKey = isExecDrillIn ? propSetWeekKey : setWeekKey
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('funnel')
  const aeDeals = useAeDeals(profile.id)

  // The Meetings tracker is the single source of truth for the AE funnel. Derive
  // demosBooked/demosCompleted/trialSignups from this week's meetings and keep
  // weekly_scorecards in sync, so the funnel above + every downstream Odyssey /
  // investor metric (all read weekly_scorecards) update the moment a status
  // changes. Persistence rides the normal autosave, so it only writes the AE's
  // OWN editable week; ae-meetings-sync is the authoritative server-side writer
  // for other AEs and locked/past weeks. Guarded on aeDeals.loading so we never
  // momentarily zero the funnel before the meetings arrive. Runs on an exec
  // drill-in too — managers/execs can read (and edit) all ae_deals per RLS, so
  // an exec who changes a meeting sees the funnel update live. Persistence still
  // rides the gated autosave; the server sync stays authoritative.
  useEffect(() => {
    if (loading || !weekData || aeDeals.loading) return
    const derived = deriveFunnelWeek(aeDeals.deals, weekKey)
    if (funnelMatches(weekData.daily, derived)) return
    update(prev => ({
      ...prev,
      daily: prev.daily.map((day, i) => ({
        ...day,
        demosBooked: derived[i].demosBooked,
        demosCompleted: derived[i].demosCompleted,
        demosUnqualified: derived[i].demosUnqualified,
        trialSignups: derived[i].trialSignups,
        intros: derived[i].intros,
      })),
    }))
  }, [aeDeals.deals, aeDeals.loading, weekKey, loading, weekData, update])

  if (loading || !weekData) {
    return <RocketLoader className="min-h-screen" />
  }

  const workDayIdxs = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS

  const totalBooked = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].demosBooked) || 0), 0)
  const totalCompleted = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].demosCompleted) || 0), 0)
  const totalUnqualified = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].demosUnqualified) || 0), 0)
  const totalSignups = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].trialSignups) || 0), 0)
  const totalIntros = workDayIdxs.reduce((s, di) => s + (Number(weekData.daily[di].intros) || 0), 0)
  const showUp = showUpRate(totalCompleted, totalBooked)
  // Close rate excludes unqualified demos from the denominator (showed, not a fit).
  const close = closeRate(totalSignups, closeableHeld(totalCompleted, totalUnqualified))
  // Channel-partner intro tracking — gated to flagged profiles (e.g. Heather).
  const tracksIntros = !!profile.tracks_channel_intros

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
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated} hideWeekNav>
      <PageHeader
        kicker={`Account Executive · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#1E40AF"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      <div className={`grid ${tracksIntros ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-12 fade-up`} style={{ animationDelay: '80ms' }}>
        <NorthStarTile
          label="Demos Completed"
          value={totalCompleted}
          sublabel="North star metric"
          color="#1E40AF"
          icon={Award}
          tooltip={`Prospects who showed up this week (${totalCompleted}). Counts every meeting except Scheduled, No-show, and Rescheduled — Unqualified is included here (they still attended). Auto-counted from your Meetings below.`}
        />
        <NorthStarTile
          label="Show-Up Rate"
          value={showUp !== null ? `${(showUp * 100).toFixed(1)}%` : '—'}
          sublabel={showUp !== null ? (showUp >= 0.75 ? '✓ At/above 75% target' : '↓ Below 75% target') : 'Awaiting data'}
          color="#1C1917"
          icon={Users}
          tooltip={`Demos Completed ÷ Demos Booked = ${totalCompleted} ÷ ${totalBooked}. Booked = every meeting on the calendar this week except Rescheduled. Target 75%.`}
        />
        <NorthStarTile
          label="Close Rate"
          value={close !== null ? `${(close * 100).toFixed(1)}%` : '—'}
          sublabel={close !== null ? (close >= 0.30 ? '✓ At/above 30% target' : '↓ Below 30% target') : 'Awaiting data'}
          color="#0F766E"
          icon={TrendingUp}
          tooltip={`Closes ÷ closeable demos held = ${totalSignups} ÷ ${closeableHeld(totalCompleted, totalUnqualified)}. Closeable backs out the ${totalUnqualified} Unqualified demo${totalUnqualified === 1 ? '' : 's'} from Demos Completed (${totalCompleted}), so non-fits don't drag your close rate down. Target 30%.`}
        />
        {tracksIntros && (
          <NorthStarTile
            label="Intro Meetings"
            value={totalIntros}
            sublabel="Channel-partner intros this week"
            color="#6639A6"
            icon={Handshake}
            tooltip={`Intro meetings with wholesalers / channel partners this week (${totalIntros}). Set a meeting's status to “Intro” to count it here. Intros are kept out of Demos Booked/Completed and your Show-Up & Close rates.`}
          />
        )}
      </div>

      <WeekNavigator weekKey={weekKey} setWeekKey={effectiveSetWeekKey} currentWeekKey={currentWeekKey} isViewingCurrentWeek={isViewingCurrentWeek} />

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'funnel' && (
          <div className="space-y-6">
            <CombinedDialsCard userId={profile.id} weekKey={weekKey} />
            <FunnelSection weekData={weekData} workDayIdxs={workDayIdxs} weekKey={weekKey} profile={profile} canEdit={true} aeDeals={aeDeals} />
          </div>
        )}
        {section === 'pipeline' && <PipelineSection weekData={weekData} update={update} profile={profile} canEdit={true} />}
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
      acc.demosUnqualified += Number(d.demosUnqualified) || 0
      acc.trialSignups += Number(d.trialSignups) || 0
      acc.intros += Number(d.intros) || 0
    }
    return acc
  }, { demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0, intros: 0 })

  // Aggregate deals (from latest week's view since deals carry forward)
  // Use the most recent week's deals since they represent the current pipeline state
  const latestDeals = weeks.length > 0 ? (weeks[weeks.length - 1].data?.deals || []) : []
  const wonThisMonth = latestDeals.filter(d => d.stage === 'Won')
  const newMrr = wonThisMonth.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const totalDealValue = wonThisMonth.reduce((s, d) => s + (Number(d.value) || 0) + ((Number(d.mrr) || 0) * 12), 0)
  const avgDealSize = wonThisMonth.length > 0 ? totalDealValue / wonThisMonth.length : null

  const closeableHeld = totals.demosCompleted - totals.demosUnqualified
  const showUp = totals.demosBooked > 0 ? (totals.demosCompleted / totals.demosBooked) * 100 : null
  const close = closeableHeld > 0 ? (totals.trialSignups / closeableHeld) * 100 : null

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
        {profile?.tracks_channel_intros && <MtdCard label="Intro Meetings" value={totals.intros} target={null} help="Channel-partner intros this month" />}
      </div>
    </div>
  )
}

function FunnelSection({ weekData, workDayIdxs, weekKey, profile, canEdit, aeDeals }) {
  // The funnel is now derived from the Meetings tracker (see the effect in AeView),
  // so these cells are read-only — change a meeting's outcome to change the numbers.
  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday); d.setDate(monday.getDate() + (dayIdx - 1)); return d
  }

  const tracksIntros = !!profile?.tracks_channel_intros
  // Drill-down: click a Daily-funnel count to see the deals behind it.
  const [drill, setDrill] = useState(null)
  const openDrill = (metricKey, dayIdx, label) => setDrill({ metricKey, dayIdx, label })
  const drillDeals = aeDeals?.deals || []
  const totals = workDayIdxs.reduce((acc, di) => {
    const day = weekData.daily[di]
    return {
      demosBooked: acc.demosBooked + (Number(day.demosBooked) || 0),
      demosCompleted: acc.demosCompleted + (Number(day.demosCompleted) || 0),
      demosUnqualified: acc.demosUnqualified + (Number(day.demosUnqualified) || 0),
      trialSignups: acc.trialSignups + (Number(day.trialSignups) || 0),
      intros: acc.intros + (Number(day.intros) || 0),
    }
  }, { demosBooked: 0, demosCompleted: 0, demosUnqualified: 0, trialSignups: 0, intros: 0 })

  return (
    <div className="space-y-6">
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Daily funnel</div>
      <p className="text-sm text-stone-600 mb-6">Auto-filled from your <strong>Meetings</strong> below — booked, completed &amp; closes update as you set each meeting's outcome. Targets: <strong>75%</strong> show-up, <strong>30%</strong> close.</p>
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Demos Booked</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Demos Completed</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Closes</th>
            {tracksIntros && <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest font-medium" style={{ color: '#6639A6' }}>Intros</th>}
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Show-Up</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Close</th>
          </tr>
        </thead>
        <tbody>
          {workDayIdxs.map(dayIdx => {
            const day = weekData.daily[dayIdx]
            const date = dateFor(dayIdx)
            const dayShowUp = showUpRate(day.demosCompleted, day.demosBooked)
            const dayClose = closeRate(day.trialSignups, closeableHeld(day.demosCompleted, day.demosUnqualified))
            return (
              <tr key={dayIdx} className="border-b border-stone-100">
                <td className="py-2 px-3">
                  <div className="font-medium text-stone-800">{DAY_NAMES[dayIdx]}</div>
                  <div className="text-[10px] text-stone-500 mono-font">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </td>
                <td className="py-2 px-2 text-center num-tabular text-sm text-stone-800"><DrillNum value={day.demosBooked} onClick={() => openDrill('booked', dayIdx, DAY_NAMES[dayIdx])} /></td>
                <td className="py-2 px-2 text-center num-tabular text-sm text-stone-800"><DrillNum value={day.demosCompleted} onClick={() => openDrill('completed', dayIdx, DAY_NAMES[dayIdx])} /></td>
                <td className="py-2 px-2 text-center num-tabular text-sm text-stone-800"><DrillNum value={day.trialSignups} onClick={() => openDrill('closes', dayIdx, DAY_NAMES[dayIdx])} /></td>
                {tracksIntros && <td className="py-2 px-2 text-center num-tabular text-sm" style={{ color: '#6639A6' }}><DrillNum value={day.intros} onClick={() => openDrill('intros', dayIdx, DAY_NAMES[dayIdx])} /></td>}
                <DerivedCell value={dayShowUp} target={0.75} comparator="gte" format="pct" />
                <DerivedCell value={dayClose} target={0.30} comparator="gte" format="pct" />
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Weekly Total</td>
            <td className="py-3 px-2 text-center num-tabular font-bold"><DrillNum value={totals.demosBooked} onClick={() => openDrill('booked', null, 'This week')} dark /></td>
            <td className="py-3 px-2 text-center num-tabular font-bold"><DrillNum value={totals.demosCompleted} onClick={() => openDrill('completed', null, 'This week')} dark /></td>
            <td className="py-3 px-2 text-center num-tabular font-bold"><DrillNum value={totals.trialSignups} onClick={() => openDrill('closes', null, 'This week')} dark /></td>
            {tracksIntros && <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color: '#C4B5FD' }}><DrillNum value={totals.intros} onClick={() => openDrill('intros', null, 'This week')} dark /></td>}
            <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color: '#F59E0B' }}>
              {fmtPct(showUpRate(totals.demosCompleted, totals.demosBooked))}
            </td>
            <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color: '#F59E0B' }}>
              {fmtPct(closeRate(totals.trialSignups, closeableHeld(totals.demosCompleted, totals.demosUnqualified)))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <MeetingsTable profile={profile} weekKey={weekKey} canEdit={canEdit} aeDeals={aeDeals} />
    {drill && (
      <AeFunnelDrilldownModal
        drill={drill}
        deals={drillDeals}
        weekKey={weekKey}
        workDayIdxs={workDayIdxs}
        onClose={() => setDrill(null)}
      />
    )}
    </div>
  )
}

// A funnel count that opens the drill-down modal when > 0 (plain number otherwise).
function DrillNum({ value, onClick, dark }) {
  const n = Number(value) || 0
  if (!n) return <>{n}</>
  return (
    // pointerEvents:auto keeps the drill-down clickable on locked/submitted past
    // weeks, where the shell dims the body with pointer-events:none.
    <button type="button" onClick={onClick} style={{ pointerEvents: 'auto' }}
      className={`underline decoration-dotted underline-offset-2 cursor-pointer transition-colors ${dark ? 'decoration-white/40 hover:decoration-white/90' : 'decoration-stone-300 hover:decoration-stone-600'}`}>
      {n}
    </button>
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

// Insert a commission_pending_deals row when a meeting is marked Closed Won, so
// the sale shows up on the AE's commission tracker. The unique (ae_id, email,
// closed_date) index makes re-marking idempotent (23505 is treated as "already there").
async function recordCommissionDeal(profile, deal) {
  const email = (deal.payment_email || deal.customer_email || '').trim().toLowerCase()
  if (!email) return { skipped: 'no email' }
  // Commission close date = the actual close/cash date, falling back to the meeting date.
  const closedSrc = deal.closed_at || deal.meeting_at
  const closed = (closedSrc ? new Date(closedSrc) : new Date()).toISOString().slice(0, 10)
  const { error } = await supabase.from('commission_pending_deals').insert({
    ae_id: profile.id,
    ae_name: profile.name || 'AE',
    customer_name: deal.customer_name || email,
    customer_email: email,
    mrr_amount: Number(deal.mrr) || 0,
    upfront_amount: Number(deal.one_time) || 0,
    closed_date: closed,
    notes: 'Auto-added from the AE meeting tracker.',
    status: 'submitted',
  })
  if (error && error.code !== '23505') throw error // ignore duplicate
  return { ok: true }
}

// ===== Per-meeting tracker (ae_deals) — sits under the Daily Funnel =====
function MeetingsTable({ profile, weekKey, canEdit, aeDeals }) {
  // Shares the single useAeDeals instance lifted to AeView (avoids a double fetch
  // and keeps the funnel-deriving effect and this table on the same data).
  const { deals, importCalMeetings, save, addManual, remove, matchStripe } = aeDeals
  const tracksIntros = !!profile?.tracks_channel_intros
  const partners = tracksIntros
    ? [...new Set(deals.filter(d => d.status === 'Intro').map(d => (d.customer_name || '').trim()).filter(Boolean))].sort()
    : []
  const [importing, setImporting] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [err, setErr] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [statusFilter, setStatusFilter] = useState(null) // click a chip to show only that status
  const [search, setSearch] = useState('')

  // Cross-week prospect search — name / phone / email over ALL deals, not just this
  // week (the meetings table is week-scoped, so this is the only way to jump to an
  // older deal, e.g. to read its Atlas Blue pre-meeting thread).
  const searchQ = search.trim().toLowerCase()
  const searchDigits = search.replace(/\D/g, '')
  const searchResults = useMemo(() => {
    if (!searchQ) return []
    return deals.filter(d => {
      const name = (d.customer_name || '').toLowerCase()
      const email = (d.customer_email || '').toLowerCase()
      const phone = (d.customer_phone || '').replace(/\D/g, '')
      return name.includes(searchQ) || email.includes(searchQ) || (searchDigits.length >= 3 && phone.includes(searchDigits))
    }).sort((a, b) => new Date(b.meeting_at || 0) - new Date(a.meeting_at || 0)).slice(0, 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, searchQ, searchDigits])

  // Which prospects have an Atlas Blue iMessage conversation (last-10 phone set) —
  // drives the iMessage badge on the row. RLS scopes to the viewer's sessions.
  const { data: atlasTails } = useQuery({
    queryKey: ['atlas-contact-tails'],
    queryFn: async () => {
      const { data, error } = await supabase.from('atlas_sessions').select('contact_phone')
      if (error) { console.warn('atlas tails:', error.message); return new Set() }
      return new Set((data || []).map(r => (r.contact_phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean))
    },
  })

  // Filtering shrinks the list and the page height, which makes the browser snap
  // the scroll position up (looks like a reload-to-top). Capture the scroll on a
  // chip click and restore it after the re-render so the user stays put.
  const scrollRestore = useRef(null)
  const applyFilter = (next) => { scrollRestore.current = window.scrollY; setStatusFilter(next) }
  useLayoutEffect(() => {
    if (scrollRestore.current != null) {
      window.scrollTo(0, scrollRestore.current)
      scrollRestore.current = null
    }
  }, [statusFilter])

  // Save wrapper: on Closed Won, also record the sale on the commission tracker.
  const saveDeal = async (id, patch) => {
    await save(id, patch)
    if (patch.status === 'Closed Won') {
      const deal = deals.find(d => d.id === id)
      if (deal) {
        try { await recordCommissionDeal(profile, { ...deal, ...patch }) }
        catch (e) { setErr('Saved — but adding to the commission tracker failed: ' + (e.message || e)) }
      }
    }
  }

  const weekMeetings = useMemo(() => deals
    .filter(d => d.meeting_at && weekKeyOfMeeting(d.meeting_at) === weekKey)
    .sort((a, b) => new Date(a.meeting_at) - new Date(b.meeting_at)), [deals, weekKey])
  const manualNoDate = useMemo(() => deals.filter(d => !d.meeting_at), [deals])
  const rows = [...weekMeetings, ...manualNoDate]
  // Still-actionable meetings stay on top; anything the AE has already actioned
  // (status changed off 'Scheduled', incl. Deleted) tucks under "Past Meetings".
  const activeRows = rows.filter(d => d.status === 'Scheduled')
  const pastRows = rows.filter(d => d.status !== 'Scheduled')

  const attended = weekMeetings.filter(d => AE_ATTENDED_STATUSES.includes(d.status)).length
  const noShow = weekMeetings.filter(d => d.status === 'No-show').length
  const won = weekMeetings.filter(d => d.status === 'Closed Won').length
  // Close rate excludes 'Unqualified' (showed but not a fit) from the denominator.
  const closeable = weekMeetings.filter(d => AE_CLOSEABLE_STATUSES.includes(d.status)).length
  const showRate = safeDiv(attended, attended + noShow)
  const closeR = safeDiv(won, closeable)

  // Count of this week's meetings in each status bucket (for the breakdown chips).
  // 'Deleted' only appears once there's at least one, so it doesn't clutter the row.
  const statusCounts = AE_MEETING_STATUSES
    .filter(s => s !== 'Deleted' || weekMeetings.some(d => d.status === 'Deleted'))
    .filter(s => s !== 'Intro' || tracksIntros)
    .map(s => ({ status: s, n: weekMeetings.filter(d => d.status === s).length }))

  const doImport = async () => {
    setImporting(true); setErr(null)
    try {
      const n = await importCalMeetings(weekKey, profile.name)
      if (n === 0) setErr(`No new calendar meetings found this week for host "${profile.name}".`)
    } catch (e) { setErr(e.message || 'Import failed.') }
    finally { setImporting(false) }
  }
  const addRow = async () => {
    setErr(null)
    try { const r = await addManual({ meeting_at: new Date(weekKey + 'T12:00:00').toISOString() }); setExpanded(r?.id) }
    catch (e) { setErr(e.message || 'Could not add a row.') }
  }

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Meetings</div>
          <p className="text-sm text-stone-600 mt-1">This week's booked meetings, pulled from your calendar. Mark each outcome — MRR &amp; cash match from Stripe (manual for wire/ACH).</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={doImport} disabled={importing || !profile?.name}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-stone-300 hover:border-stone-900 hover:bg-stone-100 transition-colors text-sm font-medium text-stone-700 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} /> {importing ? 'Importing…' : 'Sync meetings'}
            </button>
            <button onClick={addRow} className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-8 my-4">
        <div>
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Show rate</span>
          <span className="num-tabular font-semibold text-stone-900 ml-2">{showRate == null ? '—' : `${Math.round(showRate * 100)}%`}</span>
          <span className="text-[11px] text-stone-400 ml-1">({attended}/{attended + noShow})</span>
        </div>
        <div>
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Close rate</span>
          <span className="num-tabular font-semibold text-stone-900 ml-2">{closeR == null ? '—' : `${Math.round(closeR * 100)}%`}</span>
          <span className="text-[11px] text-stone-400 ml-1">({won}/{closeable})</span>
        </div>
      </div>

      {/* Prospect search — spans all weeks. */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all prospects by name, phone, or email…"
          className="w-full pl-9 pr-9 py-2 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
        {search && (
          <button type="button" onClick={() => setSearch('')} title="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-800">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status breakdown — click a chip to filter the list to that status. Hidden
          during a search (search is global, the chips are this-week only). */}
      {!searchQ && (
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {statusCounts.map(({ status, n }) => {
          // 'Scheduled' returns to the default view (Scheduled on top + Past
          // Meetings), since that view already IS the scheduled list. Other
          // statuses filter to a flat list of just that status.
          const isDefault = status === 'Scheduled'
          const active = isDefault ? statusFilter === null : statusFilter === status
          return (
            <button key={status} type="button"
              onClick={() => applyFilter(isDefault ? null : (active ? null : status))}
              title={isDefault ? 'Scheduled + Past Meetings' : (n > 0 ? `Show only “${status}”` : `No “${status}” meetings this week`)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[11px] mono-font transition-colors ${
                active ? 'border-stone-900 bg-stone-900 text-white'
                : n > 0 ? 'border-stone-300 text-stone-700 bg-stone-50 hover:border-stone-500'
                : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}>
              {status}
              <span className={`num-tabular font-semibold ${active ? 'text-white' : n > 0 ? 'text-stone-900' : 'text-stone-400'}`}>{n}</span>
            </button>
          )
        })}
        {statusFilter && (
          <button type="button" onClick={() => applyFilter(null)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-stone-500 hover:text-stone-800">
            Clear filter ✕
          </button>
        )}
      </div>
      )}

      {err && <div className="text-[12px] text-amber-700 mb-2">{err}</div>}

      {searchQ && (
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">
          {searchResults.length} match{searchResults.length === 1 ? '' : 'es'} across all weeks
        </div>
      )}

      {(rows.length === 0 && !searchQ) ? (
        <div className="border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No meetings yet</div>
          <p className="text-sm text-stone-500">{canEdit ? 'Click “Sync meetings” to pull this week’s calendar, or add one manually.' : 'No meetings recorded for this week.'}</p>
        </div>
      ) : (
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">When</th>
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Prospect</th>
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[150px]">Status</th>
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Payment</th>
              <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">MRR</th>
              <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">Cash collected</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {searchQ ? (
              /* Search view: flat list of matches across ALL weeks. */
              searchResults.length === 0 ? (
                <tr><td colSpan={7} className="py-4 px-3 text-sm text-stone-400 italic">No prospects match “{search.trim()}”.</td></tr>
              ) : (
                searchResults.map(d => (
                  <MeetingRow key={d.id} deal={d} canEdit={canEdit}
                    expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                    onSave={saveDeal} onRemove={remove} onMatch={matchStripe} atlasTails={atlasTails}
                    tracksIntros={tracksIntros} partners={partners} />
                ))
              )
            ) : statusFilter ? (
              /* Filtered view: flat list of only the chosen status (ignores the
                 active/past split). */
              (() => {
                const filtered = rows.filter(d => d.status === statusFilter)
                if (filtered.length === 0) {
                  return <tr><td colSpan={7} className="py-4 px-3 text-sm text-stone-400 italic">No “{statusFilter}” meetings this week.</td></tr>
                }
                return filtered.map(d => (
                  <MeetingRow key={d.id} deal={d} canEdit={canEdit}
                    expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                    onSave={saveDeal} onRemove={remove} onMatch={matchStripe} atlasTails={atlasTails}
                    tracksIntros={tracksIntros} partners={partners} />
                ))
              })()
            ) : (
              <>
                {activeRows.map(d => (
                  <MeetingRow key={d.id} deal={d} canEdit={canEdit}
                    expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                    onSave={saveDeal} onRemove={remove} onMatch={matchStripe} atlasTails={atlasTails}
                    tracksIntros={tracksIntros} partners={partners} />
                ))}
                {activeRows.length === 0 && pastRows.length > 0 && (
                  <tr><td colSpan={7} className="py-3 px-3 text-sm text-stone-400 italic">All meetings actioned — see Past Meetings below.</td></tr>
                )}
                {pastRows.length > 0 && (
                  <tr className="border-t border-stone-200">
                    <td colSpan={7} className="py-0">
                      <button onClick={() => setShowPast(v => !v)}
                        className="w-full flex items-center gap-2 py-2.5 px-3 text-left text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
                        {showPast ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        Past Meetings <span className="text-stone-400">({pastRows.length})</span>
                      </button>
                    </td>
                  </tr>
                )}
                {showPast && pastRows.map(d => (
                  <MeetingRow key={d.id} deal={d} canEdit={canEdit}
                    expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                    onSave={saveDeal} onRemove={remove} onMatch={matchStripe} atlasTails={atlasTails}
                    tracksIntros={tracksIntros} partners={partners} />
                ))}
              </>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MoneyCell({ value, editable, onSave }) {
  // Controlled + synced to `value` so a Stripe match (which updates the deal)
  // reflects here, while the AE can still type a manual override at any time.
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  if (!editable) {
    return <span className="num-tabular text-stone-700">{value == null || value === '' ? '—' : `$${Number(value).toLocaleString()}`}</span>
  }
  return (
    <input type="number" min="0" step="any" value={v} placeholder="0"
      onChange={(e) => setV(e.target.value)}
      onBlur={(e) => onSave(e.target.value === '' ? null : Number(e.target.value))}
      className="w-24 py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
  )
}

// Past calls for a deal, shown in its expanded detail. Refetches when a call is
// logged (shared ['call-logs'] query key invalidated by the dialer after save).
function CallHistory({ dealId }) {
  const { data: logs } = useQuery({
    queryKey: ['call-logs', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, started_at, duration_seconds, disposition, notes, recording_url')
        .eq('ae_deal_id', dealId).order('started_at', { ascending: false }).limit(10)
      if (error) { console.warn('call_logs read:', error.message); return [] }
      return data || []
    },
  })
  if (!logs || logs.length === 0) return null
  return (
    <div className="pl-5 mt-3">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Call history</div>
      <div className="space-y-1">
        {logs.map(l => (
          <div key={l.id} className="flex items-center gap-2 text-[11px] text-stone-600">
            <span className="num-tabular text-stone-500 shrink-0">{new Date(l.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {l.disposition && <span className="px-1.5 py-0.5 border border-stone-200 rounded shrink-0">{l.disposition}</span>}
            {l.duration_seconds ? <span className="text-stone-400 num-tabular shrink-0">{Math.floor(l.duration_seconds / 60)}:{String(l.duration_seconds % 60).padStart(2, '0')}</span> : null}
            {l.notes && <span className="text-stone-400 truncate">— {l.notes}</span>}
            {l.recording_url && <RecordingPlayer logId={l.id} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// Plays a call recording through the authenticated dialer-recording-media proxy
// (RLS-enforced). We fetch the media as a blob with the session token — an <audio
// src> can't carry the auth header — then play it from an object URL.
function RecordingPlayer({ logId }) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(false)
  const load = async () => {
    if (src || loading) return
    setLoading(true); setErr(false)
    try {
      const { data, error } = await supabase.functions.invoke('dialer-recording-media', { body: { logId } })
      if (error || !data) throw new Error(error?.message || 'no data')
      // data is an octet-stream Blob; re-type as audio/mpeg so <audio> will play it.
      const bytes = data instanceof Blob ? await data.arrayBuffer() : data
      setSrc(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })))
    } catch (e) { console.warn('recording load:', e); setErr(true) } finally { setLoading(false) }
  }
  if (src) return <audio controls autoPlay src={src} className="h-6 max-w-[180px] shrink-0" />
  return (
    <button type="button" onClick={load} disabled={loading}
      title="Play recording"
      className="flex items-center gap-1 px-1.5 py-0.5 border border-stone-200 rounded shrink-0 hover:bg-stone-50 text-stone-500 disabled:opacity-50">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      {err ? 'Unavailable' : 'Recording'}
    </button>
  )
}

function MeetingRow({ deal, canEdit, expanded, onToggle, onSave, onRemove, onMatch, atlasTails, tracksIntros, partners }) {
  const { openDialer, openMessages, openAtlas } = useDialer()
  // 'Intro' status only offered to channel-intro-enabled profiles (e.g. Heather).
  const statusOptions = AE_MEETING_STATUSES.filter(s => s !== 'Intro' || tracksIntros)
  const hasImessage = !!atlasTails && atlasTails.has((deal.customer_phone || '').replace(/\D/g, '').slice(-10))
  const isWire = deal.payment_method === 'wire_ach'
  const when = deal.meeting_at ? new Date(deal.meeting_at) : null
  const setField = (patch) => onSave(deal.id, patch).catch(e => console.error('ae_deals save:', e))
  const [matching, setMatching] = useState(false)
  const [matchMsg, setMatchMsg] = useState(null)
  // Controlled copy of the override email so "Match" uses what's typed RIGHT NOW,
  // not the last-saved value (avoids the blur-save race where the first click missed).
  const [payEmail, setPayEmail] = useState(deal.payment_email || '')
  useEffect(() => { setPayEmail(deal.payment_email || '') }, [deal.payment_email])
  const runMatch = async () => {
    const email = (payEmail || deal.customer_email || '').trim()
    setMatching(true); setMatchMsg(null)
    try {
      // Persist the override (fire-and-forget) so it sticks, then match on the live value.
      if ((payEmail || '').trim() !== (deal.payment_email || '')) {
        onSave(deal.id, { payment_email: payEmail.trim() || null }).catch(() => {})
      }
      const r = await onMatch(deal.id, email)
      setMatchMsg(r?.matched ? `Matched${r.name ? ` · ${r.name}` : ''}` : 'No Stripe customer found for that email.')
    } catch (e) { setMatchMsg(e.message || 'Match failed.') }
    finally { setMatching(false) }
  }
  const rowCls = deal.status === 'Closed Won' ? 'bg-emerald-50/40'
    : (deal.status === 'Closed Lost' || deal.status === 'Unqualified' || deal.status === 'Deleted') ? 'opacity-60' : ''
  const ctrl = 'py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white'
  // Prospect's email for click-to-email (booking email wins; payment email is a fallback).
  const contactEmail = (deal.customer_email || deal.payment_email || '').trim() || null
  return (
    <>
      <tr className={`border-b border-stone-100 ${rowCls}`}>
        <td className="py-2 px-3 align-top">
          <button onClick={onToggle} className="inline-flex items-center gap-1 text-left">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-300 shrink-0" />}
            <span className="num-tabular text-stone-700 whitespace-nowrap">
              {when ? when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
              {when ? `, ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
            </span>
          </button>
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="text-stone-800">{deal.customer_name || <span className="text-stone-400">(no name)</span>}</div>
            {hasImessage && deal.customer_phone && (
              <button type="button" onClick={(e) => { e.stopPropagation(); openAtlas(deal.customer_phone, { name: deal.customer_name, dealId: deal.id }) }}
                title="Atlas Blue iMessage conversation — open"
                className="shrink-0 inline-flex items-center justify-center hover:opacity-80 transition-opacity"
                style={{ width: 16, height: 16, borderRadius: 5, background: '#0A84FF', border: 'none', cursor: 'pointer', padding: 0 }}>
                <MessageCircle className="w-2.5 h-2.5" style={{ color: 'white' }} strokeWidth={3} />
              </button>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} onClick={(e) => e.stopPropagation()} title={`Email ${contactEmail}`}
                  className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                </a>
              )}
              {deal.customer_phone && (
                <button type="button" onClick={(e) => { e.stopPropagation(); openDialer(deal.customer_phone, { name: deal.customer_name, dealId: deal.id }) }}
                  title={`Call ${deal.customer_phone}`}
                  className="p-1 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                </button>
              )}
              {deal.customer_phone && (
                <button type="button" onClick={(e) => { e.stopPropagation(); openMessages(deal.customer_phone, { name: deal.customer_name, dealId: deal.id }) }}
                  title={`Text via SMS (${deal.customer_phone})`}
                  className="p-1 text-stone-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
              )}
              {deal.customer_phone && (
                <button type="button" onClick={(e) => { e.stopPropagation(); openAtlas(deal.customer_phone, { name: deal.customer_name, dealId: deal.id }) }}
                  title="iMessage via Atlas Blue"
                  className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {deal.event_type && <div className="text-[10px] text-stone-400">{deal.event_type}</div>}
        </td>
        <td className="py-2 px-3">
          <select disabled={!canEdit} value={deal.status} onChange={(e) => setField({ status: e.target.value })} className={`w-full ${ctrl}`}>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td className="py-2 px-3">
          <select disabled={!canEdit} value={deal.payment_method || 'stripe'} onChange={(e) => setField({ payment_method: e.target.value })} className={`w-full ${ctrl}`}>
            <option value="stripe">Stripe</option>
            <option value="wire_ach">Wire/ACH</option>
          </select>
        </td>
        <td className="py-2 px-3 text-right"><MoneyCell value={deal.mrr} editable={canEdit} onSave={(v) => setField({ mrr: v })} /></td>
        <td className="py-2 px-3 text-right"><MoneyCell value={deal.one_time} editable={canEdit} onSave={(v) => setField({ one_time: v })} /></td>
        <td className="py-2 px-3 text-right">
          {canEdit && deal.source === 'manual' && (
            <button onClick={() => onRemove(deal.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-stone-100 bg-stone-50/60">
          <td colSpan={7} className="py-4 px-3">
            <div className="grid sm:grid-cols-2 gap-4 pl-5">
              {deal.status === 'Closed Won' && (
                <div>
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Closed date <span className="normal-case tracking-normal text-stone-400">· cash-collected week</span></div>
                  <input disabled={!canEdit} type="date"
                    value={deal.closed_at ? new Date(deal.closed_at).toISOString().slice(0, 10) : ''}
                    onChange={(e) => setField(e.target.value
                      ? { closed_at: new Date(e.target.value + 'T12:00:00Z').toISOString(), closed_at_source: 'manual' }
                      : { closed_at: null, closed_at_source: 'manual' })}
                    className={`w-full ${ctrl}`} />
                  <div className="text-[10px] text-stone-400 mt-1">Defaults to the Stripe cash-collected date; the Close rolls up under this week. Edit if the cash landed on a different date.</div>
                </div>
              )}
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Expected MRR <span className="normal-case tracking-normal text-stone-400">· pipeline forecast</span></div>
                <input disabled={!canEdit} type="number" min="0" step="any" defaultValue={deal.expected_mrr ?? ''}
                  onBlur={(e) => setField({ expected_mrr: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="forecast for this open deal" className={`w-full ${ctrl}`} />
                <div className="text-[10px] text-stone-400 mt-1">Forecast monthly recurring while this deal is open — feeds the investor pipeline figure. Set it once you can size the opportunity.</div>
              </div>
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Payment email (if different)</div>
                <input disabled={!canEdit} value={payEmail} placeholder={deal.customer_email || 'email used for the payment'}
                  onChange={(e) => setPayEmail(e.target.value)}
                  onBlur={(e) => setField({ payment_email: e.target.value.trim() || null })} className={`w-full ${ctrl}`} />
                <div className="text-[10px] text-stone-400 mt-1">Used to match the Stripe customer when they pay from a different address than they booked with.</div>
              </div>
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Phone <span className="normal-case tracking-normal text-stone-400">· click-to-call</span></div>
                <input disabled={!canEdit} type="tel" defaultValue={deal.customer_phone || ''} placeholder="add a number to call"
                  onBlur={(e) => setField({ customer_phone: e.target.value.trim() || null })} className={`w-full ${ctrl}`} />
                <div className="text-[10px] text-stone-400 mt-1">Auto-filled from the calendar booking when available; add one here otherwise. Powers the call icon on the row.</div>
              </div>
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Notes</div>
                <input key={deal.notes || 'empty'} disabled={!canEdit} defaultValue={deal.notes || ''} onBlur={(e) => setField({ notes: e.target.value.trim() || null })} className={`w-full ${ctrl}`} />
              </div>
              {tracksIntros && deal.status !== 'Intro' && (
                <div>
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Referred by <span className="normal-case tracking-normal text-stone-400">· channel partner</span></div>
                  <select disabled={!canEdit} value={deal.referred_by_partner || ''} onChange={(e) => setField({ referred_by_partner: e.target.value || null })} className={`w-full ${ctrl}`}>
                    <option value="">— None —</option>
                    {(partners || []).map(p => <option key={p} value={p}>{p}</option>)}
                    {deal.referred_by_partner && !(partners || []).includes(deal.referred_by_partner) && (
                      <option value={deal.referred_by_partner}>{deal.referred_by_partner}</option>
                    )}
                  </select>
                  <div className="text-[10px] text-stone-400 mt-1">Attribute this deal to the wholesaler who forwarded it (from your Intro meetings) — feeds the Partner Referrals rollup for comp.</div>
                </div>
              )}
            </div>
            {!isWire && canEdit && (
              <div className="pl-5 mt-3 flex items-center gap-3 flex-wrap">
                <button onClick={runMatch} disabled={matching}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-100 transition-colors text-xs font-medium text-stone-700 disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${matching ? 'animate-spin' : ''}`} /> {matching ? 'Matching…' : 'Match in Stripe'}
                </button>
                {matchMsg && <span className="text-[11px] text-stone-500">{matchMsg}</span>}
                {deal.matched_stripe_customer_id && !matchMsg && <span className="text-[11px] text-emerald-700">✓ Matched to Stripe</span>}
              </div>
            )}
            <div className="pl-5 mt-2 text-[11px] text-stone-500">
              {isWire
                ? 'Wire/ACH: enter MRR & cash collected manually above.'
                : 'Stripe payment: enter the payment email (if different), then “Match in Stripe” to auto-fill MRR & cash collected — you can still type over either figure to override it. Marking Closed Won adds it to your commission tracker.'}
            </div>
            <CallHistory dealId={deal.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function PipeTile({ label, value, emerald }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className={`display-font text-2xl font-medium num-tabular ${emerald ? 'text-emerald-700' : 'text-stone-900'}`}>{value}</div>
    </div>
  )
}

// Deals-from-meetings pipeline, driven by ae_deals. A meeting only appears here
// once the AE has ACTIONED it (status moved off 'Scheduled'); 'Deleted' meetings
// are hidden entirely. Sortable by status via per-status tabs.
function AeDealsPipeline({ profile, canEdit }) {
  const { deals, save, remove, matchStripe } = useAeDeals(profile.id)
  const [statusTab, setStatusTab] = useState('open')
  const [expanded, setExpanded] = useState(null)
  const [err, setErr] = useState(null)

  // Which prospects have an Atlas Blue iMessage conversation (last-10 phone set) —
  // drives the iMessage badge on each row. Same cached query as the Daily Funnel
  // section, so React Query dedupes it (no extra fetch).
  const { data: atlasTails } = useQuery({
    queryKey: ['atlas-contact-tails'],
    queryFn: async () => {
      const { data, error } = await supabase.from('atlas_sessions').select('contact_phone')
      if (error) { console.warn('atlas tails:', error.message); return new Set() }
      return new Set((data || []).map(r => (r.contact_phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean))
    },
  })

  const saveDeal = async (id, patch) => {
    await save(id, patch)
    if (patch.status === 'Closed Won') {
      const deal = deals.find(d => d.id === id)
      if (deal) { try { await recordCommissionDeal(profile, { ...deal, ...patch }) } catch (e) { setErr('Saved — but adding to the commission tracker failed: ' + (e.message || e)) } }
    }
  }

  const tracksIntros = !!profile?.tracks_channel_intros
  // Channel partners = the wholesalers from her Intro meetings (drives the
  // "Referred by" picker + the Partner Referrals rollup).
  const partners = tracksIntros
    ? [...new Set(deals.filter(d => d.status === 'Intro').map(d => (d.customer_name || '').trim()).filter(Boolean))].sort()
    : []

  // Only actioned deals surface (status changed off 'Scheduled'); Deleted hidden.
  const actioned = deals.filter(d => d.status !== 'Scheduled' && d.status !== 'Deleted')
  // "All open" = actioned and not terminal (Closed Won/Lost, Unqualified) and not
  // an Intro (channel-partner intros aren't revenue opportunities).
  const openDeals = actioned.filter(d => !AE_CLOSED_STATUSES.includes(d.status) && d.status !== 'Intro')
  // Per-status tabs, in lifecycle order, only for statuses that have deals.
  const presentStatuses = AE_MEETING_STATUSES.filter(
    s => s !== 'Scheduled' && s !== 'Deleted' && actioned.some(d => d.status === s)
  )
  const rows = (statusTab === 'open' ? openDeals : actioned.filter(d => d.status === statusTab))
    .slice().sort((a, b) => new Date(b.meeting_at || 0) - new Date(a.meeting_at || 0))

  // Pipeline forecasts from each open deal's expected MRR (set by the AE while it's
  // in flight); fall back to any matched actual MRR if no forecast is entered yet.
  const pipelineMrr = openDeals.reduce((s, d) => s + (Number(d.expected_mrr) || Number(d.mrr) || 0), 0)
  const wonDeals = deals.filter(d => d.status === 'Closed Won')
  const wonMrr = wonDeals.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const wonOneTime = wonDeals.reduce((s, d) => s + (Number(d.one_time) || 0), 0)

  const tabBtn = (id, label, n) => (
    <button key={id} onClick={() => setStatusTab(id)}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${statusTab === id ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
      {label} <span className="text-stone-400">({n})</span>
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <PipeTile label="Active deals" value={openDeals.length} />
        <PipeTile label="Pipeline MRR" value={`$${Math.round(pipelineMrr).toLocaleString()}`} />
        <PipeTile label="Won MRR" value={`$${Math.round(wonMrr).toLocaleString()}`} emerald />
        <PipeTile label="Won one-time" value={`$${Math.round(wonOneTime).toLocaleString()}`} emerald />
      </div>

      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="display-font text-2xl font-medium text-stone-900">Deals from meetings</div>
        <p className="text-sm text-stone-600 mt-1">A meeting appears here once you set its status in the Daily Funnel. Use the tabs to sort your pipeline and follow up.</p>
        <div className="flex gap-2 border-b border-stone-200 mt-3 mb-4 overflow-x-auto">
          {tabBtn('open', 'All open', openDeals.length)}
          {presentStatuses.map(s => tabBtn(s, s, actioned.filter(d => d.status === s).length))}
        </div>
        {err && <div className="text-[12px] text-amber-700 mb-2">{err}</div>}
        {rows.length === 0 ? (
          <div className="text-sm text-stone-500 py-6 text-center">No {statusTab === 'open' ? 'open' : `“${statusTab}”`} deals.</div>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">When</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Prospect</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[150px]">Status</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Payment</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">MRR</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">Cash collected</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => (
                <MeetingRow key={d.id} deal={d} canEdit={canEdit}
                  expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                  onSave={saveDeal} onRemove={remove} onMatch={matchStripe} atlasTails={atlasTails}
                  tracksIntros={tracksIntros} partners={partners} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {tracksIntros && <PartnerReferrals deals={deals} />}
    </div>
  )
}

// Per-channel-partner rollup of attributed deals — for compensating the
// wholesalers who forward deals. Read-only; source = the AE's ae_deals.
function PartnerReferrals({ deals }) {
  const byPartner = {}
  for (const d of deals) {
    const p = (d.referred_by_partner || '').trim()
    if (!p) continue
    const a = (byPartner[p] ||= { partner: p, count: 0, won: 0, wonValue: 0, openValue: 0 })
    a.count += 1
    if (d.status === 'Closed Won') { a.won += 1; a.wonValue += (Number(d.one_time) || 0) + (Number(d.mrr) || 0) }
    else if (!AE_CLOSED_STATUSES.includes(d.status) && d.status !== 'Intro') a.openValue += (Number(d.expected_mrr) || Number(d.mrr) || 0)
  }
  const rows = Object.values(byPartner).sort((a, b) => b.wonValue - a.wonValue || b.count - a.count)

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="flex items-center gap-2 mb-1">
        <Handshake className="w-5 h-5" style={{ color: '#6639A6' }} />
        <div className="display-font text-2xl font-medium text-stone-900">Partner Referrals</div>
      </div>
      <p className="text-sm text-stone-600 mb-4">
        Deals attributed to the channel partners you met in Intro meetings — for compensating referrals. Expand a deal and set <strong>Referred by</strong> to attribute it here.
      </p>
      {rows.length === 0 ? (
        <div className="text-sm text-stone-500 py-4">No deals attributed to a partner yet.</div>
      ) : (
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Partner</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Deals</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Won</th>
              <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">Won value</th>
              <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Open pipeline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.partner} className="border-b border-stone-100">
                <td className="py-2.5 px-3 font-medium text-stone-800">{r.partner}</td>
                <td className="py-2.5 px-2 text-center num-tabular text-stone-700">{r.count}</td>
                <td className="py-2.5 px-2 text-center num-tabular text-stone-700">{r.won}</td>
                <td className="py-2.5 px-3 text-right num-tabular font-semibold text-emerald-700">${Math.round(r.wonValue).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right num-tabular text-stone-700">${Math.round(r.openValue).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PipelineSection({ weekData, update, profile, canEdit }) {
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
      {/* New meeting-based pipeline (ae_deals) */}
      <AeDealsPipeline profile={profile} canEdit={canEdit} />

      {/* Legacy weekly deal tracker — being phased out in favor of the meeting pipeline above */}
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
            <div className="display-font text-2xl font-medium text-stone-900">Active deals · legacy</div>
            <p className="text-sm text-stone-600 mt-1">The old weekly tracker — being replaced by the meeting-based pipeline above. Kept for now so nothing's lost.</p>
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

// Status badge styling. Portal-sourced deals use qualified/pending/etc.; Attio-synced
// deals carry their real pipeline stage title. Unknown statuses fall back to a neutral
// badge (see ChannelStatusBadge), so new Attio stages still render.
const CHANNEL_STATUS = {
  pending:     { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700' },
  qualified:   { label: 'Qualified',      cls: 'bg-emerald-100 text-emerald-700' },
  declined:    { label: 'Declined',       cls: 'bg-red-100 text-red-700' },
  demo_booked: { label: 'Demo Booked',    cls: 'bg-violet-100 text-violet-700' },
  // Attio deal pipeline stages (keyed by the exact Attio stage title)
  'Intro Call / Pre-Demo': { label: 'Intro / Pre-Demo',  cls: 'bg-stone-100 text-stone-600' },
  'Demo scheduled':        { label: 'Demo Scheduled',    cls: 'bg-blue-100 text-blue-700' },
  'Demo complete':         { label: 'Demo Complete',     cls: 'bg-indigo-100 text-indigo-700' },
  'POC proposal sent':     { label: 'POC Proposal Sent', cls: 'bg-violet-100 text-violet-700' },
  'Closed won':            { label: 'Closed Won',        cls: 'bg-emerald-100 text-emerald-700' },
  'Closed lost':           { label: 'Closed Lost',       cls: 'bg-red-100 text-red-700' },
  'Closed - Churned':      { label: 'Closed – Churned',  cls: 'bg-red-100 text-red-700' },
}

function ChannelStatusBadge({ status }) {
  const s = CHANNEL_STATUS[status] || { label: status || '—', cls: 'bg-stone-100 text-stone-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

// Where the deal came from: Attio-originated (synced in) vs the Deals Portal.
function OriginBadge({ origin }) {
  const attio = origin === 'attio'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded mono-font text-[9px] uppercase tracking-wide font-semibold ${attio ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}
      title={attio ? 'Originated in Attio (synced into the Scorecard)' : 'Registered in the Deals Portal'}>
      {attio ? 'Attio' : 'Portal'}
    </span>
  )
}

function FlagDot({ flag }) {
  if (flag !== 'green' && flag !== 'red') return null
  return <span className={`inline-block w-2 h-2 rounded-full ${flag === 'green' ? 'bg-emerald-500' : 'bg-red-500'}`} title={flag === 'green' ? 'Great fit' : 'Needs review'} />
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

  // Pipeline buckets — shared open/won/lost predicate (channelDeals.js, mirrored by
  // open_partner_pipeline() in SQL). Won = Closed won; Lost = Closed lost/Churned/
  // declined; Open = everything still in flight.
  const won = deals.filter(d => isWonChannelDeal(d.status))
  const lost = deals.filter(d => isLostChannelDeal(d.status))
  const open = deals.filter(d => isOpenChannelDeal(d.status))
  const openPipeline = openPartnerPipeline(deals)

  return (
    <div className="space-y-6">
      {/* Open partner pipeline — the single computed metric (full precision). */}
      <div className="border border-violet-200 bg-violet-50/40 p-5 flex items-center justify-between gap-4">
        <div>
          <div className="mono-font text-[10px] uppercase tracking-widest text-violet-700 mb-1">Open Partner Pipeline</div>
          <div className="text-xs text-stone-500">Sum of open partner-sourced deal values currently in pipeline</div>
        </div>
        <div className="display-font text-3xl font-medium text-violet-900 num-tabular">${Math.round(openPipeline).toLocaleString()}</div>
      </div>

      {/* Channel summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total Channel Deals</div>
          <div className="display-font text-2xl font-medium text-stone-900 num-tabular">{deals.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Open</div>
          <div className="display-font text-2xl font-medium text-blue-700 num-tabular">{open.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Won</div>
          <div className="display-font text-2xl font-medium text-emerald-700 num-tabular">{won.length}</div>
        </div>
        <div className="border border-stone-200 bg-white p-4">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Lost / Churned</div>
          <div className="display-font text-2xl font-medium text-red-600 num-tabular">{lost.length}</div>
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
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-stone-800">{deal.business_name}</span>
                              <OriginBadge origin={deal.origin} />
                            </div>
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
