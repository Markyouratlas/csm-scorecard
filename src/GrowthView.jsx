import React, { useState, useMemo } from 'react'
import { Loader2, BarChart3, Layers, FlaskConical, FileText, Users, DollarSign, TrendingUp, Plus, Trash2, Calendar, Activity, Clock, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ComposedChart, Cell } from 'recharts'
import { useMetaAds } from './hooks/useMetaAds.js'
import { useMetaDaily } from './hooks/useMetaDaily.js'
import { useMetaAdSets } from './hooks/useMetaAdSets.js'
import { useMetaLastSync } from './hooks/useMetaLastSync.js'
import { useCalBookings } from './hooks/useCalBookings.js'
import { useCalEventTypes } from './hooks/useCalEventTypes.js'
import { supabase } from './supabase.js'
import { useScorecard } from './useScorecard'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_GROWTH_WEEK, EXPERIMENT_STATUSES, newId } from './roleConstants'
import { cpm, ctr, cpc, cpl, bookingRate, showUpRate, closeRate, optinRate, leadToSql, costPerDemo } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, { NorthStarTile, SectionTabs, PageHeader } from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

export default function GrowthView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const {
    weekData, loading, saving, savedAt, update,
    weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    submittedAt, isLocked, submit, unsubmit, submitting,
  } = useScorecard(profile.id, propWeekKey, BLANK_GROWTH_WEEK, ['experiments'])
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('funnel')
  const [metaRefreshKey, setMetaRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const { lastSync } = useMetaLastSync(metaRefreshKey)

  const handleMetaSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      // Fire Meta + Cal syncs in parallel; both block until their data lands.
      // Cal uses mode=recent (fast: ~9s, walks upcoming/recurring/unconfirmed).
      const [metaRes, calRes] = await Promise.all([
        fetch('https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/meta-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch('https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/cal-sync?mode=recent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      ])
      const metaResult = await metaRes.json().catch(() => ({ ok: false, error: 'meta: bad response' }))
      const calResult = await calRes.json().catch(() => ({ ok: false, error: 'cal: bad response' }))
      if (!metaResult.ok) console.error('Meta sync returned an error:', metaResult.error)
      if (!calResult.ok) console.error('Cal sync returned an error:', calResult.error)
      // Bump the refresh key if EITHER succeeded so the dashboard re-fetches the
      // data that did land. refreshKey threads into both Meta hooks and useCalBookings.
      if (metaResult.ok || calResult.ok) {
        setMetaRefreshKey(k => k + 1)
      }
    } catch (e) {
      console.error('Manual Meta sync failed:', e)
    } finally {
      setSyncing(false)
    }
  }

  if (loading || !weekData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>
  }

  const workDayIdxs = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS

  const totals = workDayIdxs.reduce((acc, di) => {
    const d = weekData.daily[di]
    return {
      adSpend:         acc.adSpend + (Number(d.adSpend) || 0),
      websiteVisitors: acc.websiteVisitors + (Number(d.websiteVisitors) || 0),
      optins:          acc.optins + (Number(d.optins) || 0),
      organicLeads:    acc.organicLeads + (Number(d.organicLeads) || 0),
      impressions:     acc.impressions + (Number(d.impressions) || 0),
      clicks:          acc.clicks + (Number(d.clicks) || 0),
      leads:           acc.leads + (Number(d.leads) || 0),
      sqls:            acc.sqls + (Number(d.sqls) || 0),
      demosBooked:     acc.demosBooked + (Number(d.demosBooked) || 0),
      demosCompleted:  acc.demosCompleted + (Number(d.demosCompleted) || 0),
      trialSignups:    acc.trialSignups + (Number(d.trialSignups) || 0),
      newCustomers:    acc.newCustomers + (Number(d.newCustomers) || 0),
    }
  }, { adSpend: 0, websiteVisitors: 0, optins: 0, organicLeads: 0, impressions: 0, clicks: 0, leads: 0, sqls: 0, demosBooked: 0, demosCompleted: 0, trialSignups: 0, newCustomers: 0 })

  const overallCpl = cpl(totals.adSpend, totals.leads)
  const overallBookingRate = bookingRate(totals.demosBooked, totals.leads)

  const sections = [
    { id: 'funnel',      label: 'Daily Funnel',  icon: BarChart3 },
    { id: 'meta-live',   label: 'Meta Live',     icon: Activity },
    { id: 'ad-sets',     label: 'Ad Sets',       icon: Layers },
    { id: 'monthly',     label: 'Monthly View',  icon: Calendar },
    { id: 'channels',    label: 'Channels',      icon: Layers },
    { id: 'experiments', label: 'Experiments',   icon: FlaskConical },
    { id: 'notes',       label: 'Notes',         icon: FileText },
  ]

  return (
    <ScorecardShell
      profile={profile} weekKey={weekKey} setWeekKey={setWeekKey}
      isExecDrillIn={isExecDrillIn} isViewingCurrentWeek={isViewingCurrentWeek} currentWeekKey={currentWeekKey}
      submittedAt={submittedAt} isLocked={isLocked} submit={submit} unsubmit={unsubmit} submitting={submitting}
      saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Growth Manager · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#BE185D"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile label="Total Leads" value={totals.leads + totals.organicLeads} sublabel={`${totals.organicLeads} organic + ${totals.leads} paid`} color="#BE185D" icon={Users} />
        <NorthStarTile
          label="CPL"
          value={overallCpl !== null ? `$${overallCpl.toFixed(2)}` : '—'}
          sublabel={overallCpl !== null ? (overallCpl <= 5 ? '✓ At/below $5 target' : '↑ Above $5 target') : 'Awaiting data'}
          color="#1C1917"
          icon={DollarSign}
        />
        <NorthStarTile
          label="Booking Rate"
          value={overallBookingRate !== null ? `${(overallBookingRate * 100).toFixed(1)}%` : '—'}
          sublabel={overallBookingRate !== null ? (overallBookingRate >= 0.20 ? '✓ At/above 20% target' : '↓ Below 20% target') : 'Awaiting data'}
          color="#0F766E"
          icon={TrendingUp}
        />
      </div>

      <div className="flex items-start justify-between gap-3 mb-2">
        <SectionTabs sections={sections} active={section} onChange={setSection} />
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={handleMetaSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all disabled:opacity-60"
            style={{ background: 'rgba(24,119,242,0.08)', color: '#1877F2', border: '1px solid rgba(24,119,242,0.25)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <span className="mono-font text-[9px] uppercase tracking-wider text-stone-400 text-right">
            {syncing ? 'Syncing…' : lastSync ? `Synced ${timeAgo(lastSync)} · auto every 3h` : 'Auto-syncs every 3h'}
          </span>
        </div>
      </div>

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'funnel' && <FunnelSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} totals={totals} />}
        {section === 'meta-live' && <MetaLiveSection refreshKey={metaRefreshKey} />}
        {section === 'ad-sets' && <AdSetsSection refreshKey={metaRefreshKey} />}
        {section === 'monthly' && <MonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'channels' && <ChannelsSection weekData={weekData} update={update} />}
        {section === 'experiments' && <ExperimentsSection weekData={weekData} update={update} />}
        {section === 'notes' && <NotesSection weekData={weekData} update={update} />}
      </div>
    </ScorecardShell>
  )
}

function FunnelSection({ weekData, update, workDayIdxs, weekKey, totals }) {
  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday); d.setDate(monday.getDate() + (dayIdx - 1)); return d
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Top of funnel</div>
        <p className="text-sm text-stone-600 mb-6">
          Targets: opt-in <strong>20%</strong> · CPL <strong>$5</strong>
        </p>
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Spend</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Visitors</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Opt-ins</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Organic Leads</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Paid Leads</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">SQLs</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">Opt-in %</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CPL</th>
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => {
              const day = weekData.daily[dayIdx]
              const date = dateFor(dayIdx)
              return (
                <tr key={dayIdx} className="border-b border-stone-100">
                  <td className="py-2 px-3">
                    <div className="font-medium text-stone-800 text-xs">{DAY_NAMES[dayIdx]}</div>
                    <div className="text-[9px] text-stone-500 mono-font">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </td>
                  <NumCell value={day.adSpend} onChange={(v) => setCell(dayIdx, 'adSpend', v)} prefix="$" />
                  <NumCell value={day.websiteVisitors} onChange={(v) => setCell(dayIdx, 'websiteVisitors', v)} />
                  <NumCell value={day.optins} onChange={(v) => setCell(dayIdx, 'optins', v)} />
                  <NumCell value={day.organicLeads} onChange={(v) => setCell(dayIdx, 'organicLeads', v)} />
                  <NumCell value={day.leads} onChange={(v) => setCell(dayIdx, 'leads', v)} />
                  <NumCell value={day.sqls} onChange={(v) => setCell(dayIdx, 'sqls', v)} />
                  <DerivedCell value={optinRate(day.optins, day.websiteVisitors)} target={0.20} comparator="gte" format="pct" />
                  <DerivedCell value={cpl(day.adSpend, day.leads)} target={5} comparator="lte" format="money" />
                </tr>
              )
            })}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">${totals.adSpend.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.websiteVisitors.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.optins.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.organicLeads.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.leads.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.sqls.toLocaleString()}</td>
              <FooterDerivedCell value={optinRate(totals.optins, totals.websiteVisitors)} target={0.20} comparator="gte" format="pct" />
              <FooterDerivedCell value={cpl(totals.adSpend, totals.leads)} target={5} comparator="lte" format="money" />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Bottom of funnel</div>
        <p className="text-sm text-stone-600 mb-6">
          Targets: SQL rate <strong>25%</strong> · Booking <strong>20%</strong> · Show-Up <strong>75%</strong> · Close <strong>30%</strong>
        </p>
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Booked</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Completed</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Trials</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">New Customers</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">SQL Rate</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">Booking</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">Show-Up</th>
              <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">Close</th>
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => {
              const day = weekData.daily[dayIdx]
              return (
                <tr key={dayIdx} className="border-b border-stone-100">
                  <td className="py-2 px-3"><div className="font-medium text-stone-800 text-xs">{DAY_NAMES[dayIdx]}</div></td>
                  <NumCell value={day.demosBooked} onChange={(v) => setCell(dayIdx, 'demosBooked', v)} />
                  <NumCell value={day.demosCompleted} onChange={(v) => setCell(dayIdx, 'demosCompleted', v)} />
                  <NumCell value={day.trialSignups} onChange={(v) => setCell(dayIdx, 'trialSignups', v)} />
                  <NumCell value={day.newCustomers} onChange={(v) => setCell(dayIdx, 'newCustomers', v)} />
                  <DerivedCell value={leadToSql(day.sqls, day.leads)} target={0.25} comparator="gte" format="pct" />
                  <DerivedCell value={bookingRate(day.demosBooked, day.leads)} target={0.20} comparator="gte" format="pct" />
                  <DerivedCell value={showUpRate(day.demosCompleted, day.demosBooked)} target={0.75} comparator="gte" format="pct" />
                  <DerivedCell value={closeRate(day.trialSignups, day.demosCompleted)} target={0.30} comparator="gte" format="pct" />
                </tr>
              )
            })}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.demosBooked.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.demosCompleted.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.trialSignups.toLocaleString()}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{totals.newCustomers.toLocaleString()}</td>
              <FooterDerivedCell value={leadToSql(totals.sqls, totals.leads)} target={0.25} comparator="gte" format="pct" />
              <FooterDerivedCell value={bookingRate(totals.demosBooked, totals.leads)} target={0.20} comparator="gte" format="pct" />
              <FooterDerivedCell value={showUpRate(totals.demosCompleted, totals.demosBooked)} target={0.75} comparator="gte" format="pct" />
              <FooterDerivedCell value={closeRate(totals.trialSignups, totals.demosCompleted)} target={0.30} comparator="gte" format="pct" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NumCell({ value, onChange, prefix }) {
  return (
    <td className="py-2 px-2 text-center">
      <div className="flex items-center justify-center">
        {prefix && <span className="text-[10px] text-stone-400 mr-0.5">{prefix}</span>}
        <input type="number" min="0" step="any" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-16 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-xs" />
      </div>
    </td>
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
    <td className={`py-2 px-2 text-center num-tabular text-xs ${isGood === true ? 'text-emerald-700 font-semibold' : isGood === false ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>
      {display}
    </td>
  )
}

function FooterDerivedCell({ value, target, comparator, format }) {
  let isGood = null
  if (value !== null && value !== undefined && !isNaN(value) && target !== undefined) {
    isGood = comparator === 'gte' ? value >= target : value <= target
  }
  const display = value === null || value === undefined ? '—'
    : format === 'pct' ? `${(value * 100).toFixed(1)}%`
    : format === 'money' ? `$${value.toFixed(2)}`
    : value.toFixed(1)
  const color = isGood === true ? '#10B981' : isGood === false ? '#F87171' : '#F59E0B'
  return <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color }}>{display}</td>
}

function MonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-700" /></div>

  const totals = weeks.reduce((acc, w) => {
    const daily = w.data?.daily || []
    for (const d of daily) {
      acc.adSpend += Number(d.adSpend) || 0
      acc.websiteVisitors += Number(d.websiteVisitors) || 0
      acc.optins += Number(d.optins) || 0
      acc.organicLeads += Number(d.organicLeads) || 0
      acc.leads += Number(d.leads) || 0
      acc.sqls += Number(d.sqls) || 0
      acc.demosBooked += Number(d.demosBooked) || 0
      acc.demosCompleted += Number(d.demosCompleted) || 0
      acc.newCustomers += Number(d.newCustomers) || 0
    }
    return acc
  }, { adSpend: 0, websiteVisitors: 0, optins: 0, organicLeads: 0, leads: 0, sqls: 0, demosBooked: 0, demosCompleted: 0, newCustomers: 0 })

  const mtdOptin    = totals.websiteVisitors > 0 ? (totals.optins / totals.websiteVisitors) * 100 : null
  const mtdCpl      = totals.leads > 0 ? totals.adSpend / totals.leads : null
  const mtdSqlRate  = totals.leads > 0 ? (totals.sqls / totals.leads) * 100 : null
  const mtdBooking  = totals.leads > 0 ? (totals.demosBooked / totals.leads) * 100 : null
  const mtdCpd      = totals.demosBooked > 0 ? totals.adSpend / totals.demosBooked : null
  const mtdCac      = totals.newCustomers > 0 ? totals.adSpend / totals.newCustomers : null

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
        <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
        <MtdLegend />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MtdCard label="Organic Leads"        value={totals.organicLeads}     target={targets.organic_leads} />
          <MtdCard label="Website Visitors"     value={totals.websiteVisitors}  target={targets.website_visitors} />
          <MtdCard label="Opt-in Rate"          value={mtdOptin}                target={targets.optin_rate} unit="pct" />
          <MtdCard label="Cost Per Lead"        value={mtdCpl}                  target={targets.cpl} unit="money" />
          <MtdCard label="Lead → SQL Rate"      value={mtdSqlRate}              target={targets.lead_sql_rate} unit="pct" />
          <MtdCard label="Cost Per Booked Demo" value={mtdCpd}                  target={targets.cost_per_demo} unit="money" />
          <MtdCard label="CAC (blended)"        value={mtdCac}                  target={targets.cac} unit="money" />
          <MtdCard label="Booking Rate"         value={mtdBooking}              target={targets.booking_rate} unit="pct" />
          <MtdCard label="Ad Spend"             value={totals.adSpend}          target={null} unit="money" help="Track vs. monthly ad budget" />
        </div>
      </div>
    </div>
  )
}

const CHANNELS = [
  { key: 'meta',     label: 'Meta',     color: '#1877F2' },
  { key: 'google',   label: 'Google',   color: '#EA4335' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'other',    label: 'Other',    color: '#78716C' },
]

function ChannelsSection({ weekData, update }) {
  const setCh = (chKey, key, value) => update(d => ({
    ...d, channels: { ...d.channels, [chKey]: { ...d.channels[chKey], [key]: Number(value) || 0 } },
  }))

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Channel breakdown</div>
      <p className="text-sm text-stone-600 mb-6">Weekly totals per channel.</p>
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Channel</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Spend</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Impressions</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Clicks</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Leads</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Booked</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Trials</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CTR</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CPL</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map(ch => {
            const data = weekData.channels[ch.key]
            return (
              <tr key={ch.key} className="border-b border-stone-100">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: ch.color }} />
                    <span className="font-medium text-stone-800">{ch.label}</span>
                  </div>
                </td>
                {['spend','impressions','clicks','leads','demosBooked','trialSignups'].map(k => (
                  <td key={k} className="py-2 px-2 text-center">
                    <input type="number" min="0" step="any" value={data[k] || ''} onChange={(e) => setCh(ch.key, k, e.target.value)}
                      className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                  </td>
                ))}
                <DerivedCell value={ctr(data.clicks, data.impressions)} target={0.05} comparator="gte" format="pct" />
                <DerivedCell value={cpl(data.spend, data.leads)} target={5} comparator="lte" format="money" />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ExperimentsSection({ weekData, update }) {
  const exps = weekData.experiments || []
  const addExp = () => update(d => ({
    ...d, experiments: [...(d.experiments || []), { id: newId('e'), hypothesis: '', channel: '', status: 'Planned', result: '' }],
  }))
  const updateExp = (id, patch) => update(d => ({
    ...d, experiments: d.experiments.map(e => e.id === id ? { ...e, ...patch } : e),
  }))
  const removeExp = (id) => update(d => ({ ...d, experiments: d.experiments.filter(e => e.id !== id) }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Experiments</div>
          <p className="text-sm text-stone-600 mt-1">Hypotheses, what you tried, what you learned.</p>
        </div>
        <button onClick={addExp} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add experiment
        </button>
      </div>
      {exps.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700">No experiments tracked</div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[840px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Hypothesis</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[120px]">Channel</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[140px]">Status</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Result</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {exps.map(e => (
                <tr key={e.id} className="border-b border-stone-100">
                  <td className="py-2 px-3"><input value={e.hypothesis} onChange={(ev) => updateExp(e.id, { hypothesis: ev.target.value })} placeholder="If we change X..." className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 text-sm" /></td>
                  <td className="py-2 px-3"><input value={e.channel} onChange={(ev) => updateExp(e.id, { channel: ev.target.value })} placeholder="Channel" className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 text-sm" /></td>
                  <td className="py-2 px-3"><select value={e.status} onChange={(ev) => updateExp(e.id, { status: ev.target.value })} className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 text-sm bg-white">{EXPERIMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                  <td className="py-2 px-3"><input value={e.result || ''} onChange={(ev) => updateExp(e.id, { result: ev.target.value })} placeholder="What did you learn?" className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 text-sm" /></td>
                  <td className="py-2 px-3 text-right"><button onClick={() => removeExp(e.id)} className="p-1.5 text-stone-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NotesSection({ weekData, update }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Notes for the week</div>
      <p className="text-sm text-stone-600 mb-4">Strategic context, team alignment, anything to flag.</p>
      <textarea rows={10} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
        placeholder="Channel mix changes, big wins, what's not working..."
        className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
    </div>
  )
}

const META_BLUE = '#1877F2'

function MetaLiveSection({ refreshKey = 0 }) {
  const [preset, setPreset] = useState('last_7d')
  const meta = useMetaAds(preset, refreshKey)
  const [trendDays, setTrendDays] = useState(30)
  const daily = useMetaDaily(trendDays, refreshKey)
  const s = meta.summary

  // Cal.com booked calls, windowed to match the Meta performance preset above.
  const presetToDays = { today: 0, last_7d: 7, last_30d: 30, last_90d: 90 }
  const cal = useCalBookings({ days: presetToDays[preset] ?? 30, refreshKey })
  // Cost per booked call = Meta spend ÷ AD-DRIVEN (Atlas Blue) booked calls ONLY.
  // Organic bookings must never roll into ad-spend math.
  const costPerBookedCall = (cal.paidCount > 0 && s?.totalSpend != null)
    ? s.totalSpend / cal.paidCount
    : null

  const fmtMoney = (v) => v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const fmtNum = (v) => v == null ? '—' : Number(v).toLocaleString()
  const fmtPct = (v) => v == null ? '—' : `${Number(v).toFixed(2)}%`

  return (
    <div className="space-y-6">
      {/* Header + period toggle */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Atlas Blue Overview</div>
            <p className="text-sm text-stone-600 mt-1">Live Meta Ads performance across all campaigns.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['today', 'last_7d', 'last_30d', 'last_90d'].map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: preset === p ? META_BLUE : 'rgba(24,119,242,0.08)',
                  color: preset === p ? 'white' : META_BLUE,
                  border: '1px solid rgba(24,119,242,0.25)',
                }}>
                {p === 'today' ? 'Today' : p === 'last_7d' ? '7 Days' : p === 'last_30d' ? '30 Days' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        {/* Meta Ads Performance tiles */}
        <div className="mono-font text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mt-6 mb-3">Meta Ads Performance</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetaTile label="Spend" value={fmtMoney(s?.totalSpend)} sub="Total ad spend" loading={meta.loading} />
          <MetaTile label="CPM" value={fmtMoney(s?.avgCpm)} sub="Cost / 1,000 impr" loading={meta.loading} />
          <MetaTile label="Total CTR" value={fmtPct(s?.avgCtr)} sub="All clicks ÷ impr" loading={meta.loading} />
          <MetaTile label="Link Clicks" value={fmtNum(s?.totalClicks)} sub="Clicks to landing" loading={meta.loading} />
          <MetaTile label="Impressions" value={fmtNum(s?.totalImpressions)} sub={`Reach: ${fmtNum(s?.totalReach)}`} loading={meta.loading} />
          <MetaTile label="Registrations" value={fmtNum(s?.totalRegistrations)} sub="Complete registrations" loading={meta.loading} />
        </div>

        {/* Booked Calls & Conversions */}
        <div className="mono-font text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mt-8 mb-3">Booked Calls & Conversions</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaTile label="Paid Booked Calls" value={fmtNum(cal.paidCount)} sub="Atlas Blue (ad-driven)" loading={cal.loading} />
          <MetaTile label="Cost / Booked Call" value={fmtMoney(costPerBookedCall)} sub="Spend ÷ Atlas Blue calls" loading={cal.loading || meta.loading} />
          <MetaTile label="Organic Booked Calls" value={fmtNum(cal.organicCount)} sub="Non-ad bookings" loading={cal.loading} />
          <MetaTile label="Total Booked Calls" value={fmtNum(cal.bookedCalls)} sub="All bookings (via Cal.com)" loading={cal.loading} />
        </div>
      </div>

      {/* 30-Day Trend — spend + clicks */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="display-font text-xl font-medium text-stone-900">Daily Trend</div>
            <p className="text-sm text-stone-600 mt-1">Daily spend and link clicks over time.</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setTrendDays(d)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: trendDays === d ? META_BLUE : 'rgba(24,119,242,0.08)',
                  color: trendDays === d ? 'white' : META_BLUE,
                  border: '1px solid rgba(24,119,242,0.25)',
                }}>
                {d} Days
              </button>
            ))}
          </div>
        </div>
        {daily.loading ? (
          <div className="h-[300px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : daily.series.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-stone-400 text-sm">No daily data yet</div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={daily.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9c96a8' }} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9c96a8' }} />
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }}
                formatter={(value, name) => name === 'spend' ? [`$${value}`, 'Spend'] : [value, 'Link Clicks']}
              />
              <Area yAxisId="left" type="monotone" dataKey="spend" stroke={META_BLUE} fill="rgba(24,119,242,0.12)" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#10B981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Daily Spend bar chart */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">Daily Spend</div>
        <p className="text-sm text-stone-600 mb-4">Spend per day across all campaigns.</p>
        {daily.loading ? (
          <div className="h-[240px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : daily.series.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-stone-400 text-sm">No daily data yet</div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#9c96a8' }} tickFormatter={(v) => `$${v}`} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} formatter={(v) => [`$${v}`, 'Spend']} />
              <Bar dataKey="spend" fill={META_BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Paid Booked Calls per day (Atlas Blue / ad-driven) */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">Paid Booked Calls Per Day</div>
        <p className="text-sm text-stone-600 mb-4">Atlas Blue (ad-driven) bookings made per day, current window.</p>
        {cal.loading ? (
          <div className="h-[240px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : cal.paidSeries.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-stone-400 text-sm">No ad-driven bookings in this window</div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cal.paidSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#9c96a8' }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} formatter={(v) => [v, 'Paid Booked Calls']} />
                <Bar dataKey="count" fill={META_BLUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Bookings by Event Type (paid + organic, full breakdown) */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">Bookings by Event Type</div>
        <p className="text-sm text-stone-600 mb-4">Breakdown of bookings made in the current window. Atlas Blue = ad-driven; others organic.</p>
        {cal.loading ? (
          <div className="h-[180px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : cal.byEventType.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-stone-400 text-sm">No bookings in this window</div>
        ) : (
          <div className="space-y-2">
            {cal.byEventType.map(et => {
              const isPaid = et.isAdDriven
              return (
                <div key={et.slug || 'unknown'} className="flex items-center justify-between border border-stone-200 rounded-lg px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{et.label}</span>
                    <span className="mono-font text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={ isPaid
                        ? { background: 'rgba(24,119,242,0.1)', color: META_BLUE }
                        : { background: '#f5f5f4', color: '#78716c' } }>
                      {isPaid ? 'Ad-driven' : 'Organic'}
                    </span>
                  </span>
                  <span className="display-font text-lg font-medium" style={{ color: isPaid ? META_BLUE : '#57534e' }}>{et.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Event Type Settings — Nick tags which event types are ad-driven */}
      <EventTypeSettings refreshKey={refreshKey} />
    </div>
  )
}

function EventTypeSettings({ refreshKey = 0 }) {
  const [open, setOpen] = useState(false)
  const { types, loading, saveType } = useCalEventTypes(refreshKey)
  const [savingSlug, setSavingSlug] = useState(null)

  const toggle = async (t) => {
    if (t.isNull) return
    setSavingSlug(t.slug)
    try {
      await saveType(t.slug, { isAdDriven: !t.isAdDriven })
    } catch (e) {
      console.error('saveType failed:', e)
    } finally {
      setSavingSlug(null)
    }
  }

  const untaggedCount = types.filter(t => !t.isNull && !t.isConfigured).length

  return (
    <div className="bg-white border border-stone-200 p-6">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
          <span className="display-font text-xl font-medium text-stone-900">Event Type Settings</span>
        </div>
        {untaggedCount > 0 && (
          <span className="mono-font text-[9px] uppercase tracking-wider px-2 py-1 rounded" style={{ background: 'rgba(102,57,166,0.1)', color: '#6639A6' }}>
            {untaggedCount} new — needs tagging
          </span>
        )}
      </button>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-stone-600 mb-4">Tag which event types are ad-driven (count toward paid booked calls and cost-per-booked-call). Everything untagged is treated as organic.</p>
          {loading ? (
            <div className="h-[120px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
          ) : (
            <div className="space-y-2">
              {types.map(t => (
                <div key={t.slug} className="flex items-center justify-between border border-stone-200 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-stone-700 truncate">{t.label || t.slug}</span>
                    <span className="mono-font text-[10px] text-stone-400">{t.count}</span>
                    {!t.isNull && !t.isConfigured && (
                      <span className="mono-font text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(102,57,166,0.1)', color: '#6639A6' }}>New</span>
                    )}
                    {t.isNull && (
                      <span className="mono-font text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 bg-stone-100 text-stone-400">No slug</span>
                    )}
                  </div>
                  {t.isNull ? (
                    <span className="mono-font text-[9px] uppercase tracking-wider text-stone-300 shrink-0">Not taggable</span>
                  ) : (
                    <button
                      onClick={() => toggle(t)}
                      disabled={savingSlug === t.slug}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mono-font text-[9px] uppercase tracking-wider font-semibold transition-all disabled:opacity-50 shrink-0"
                      style={ t.isAdDriven
                        ? { background: 'rgba(24,119,242,0.1)', color: META_BLUE, border: '1px solid rgba(24,119,242,0.3)' }
                        : { background: '#f5f5f4', color: '#78716c', border: '1px solid #e7e5e4' } }
                    >
                      {savingSlug === t.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {t.isAdDriven ? 'Ad-driven' : 'Organic'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaTile({ label, value, sub, loading }) {
  return (
    <div className="border border-stone-200 rounded-lg p-4" style={{ background: 'rgba(24,119,242,0.02)' }}>
      <div className="mono-font text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-500 mb-2">{label}</div>
      {loading ? (
        <div className="h-7 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>
      ) : (
        <div className="display-font text-2xl font-medium" style={{ color: META_BLUE }}>{value}</div>
      )}
      {sub && <div className="text-[10px] text-stone-400 mt-1">{sub}</div>}
    </div>
  )
}

function MetaAwaitingTile({ label, awaiting }) {
  return (
    <div className="border border-stone-200 rounded-lg p-4 bg-stone-50/40">
      <div className="mono-font text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-500 mb-2">{label}</div>
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md mono-font text-[9px] uppercase tracking-wider font-semibold" style={{ color: '#6639A6', background: 'rgba(102,57,166,0.08)' }}>
        <Clock className="w-3 h-3" /> Awaiting {awaiting}
      </div>
    </div>
  )
}

function AdSetsSection({ refreshKey = 0 }) {
  const [days, setDays] = useState(30)
  const { adSets, groups, loading } = useMetaAdSets(days, refreshKey)

  const fmtMoney = (v) => v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const fmtPct = (v) => v == null ? '—' : `${Number(v).toFixed(2)}%`
  const fmtNum = (v) => v == null ? '—' : Number(v).toLocaleString()

  const cpmData = adSets.map(a => ({ name: a.adset_name, cpm: a.cpm, audience: a.audience }))

  return (
    <div className="space-y-6">
      {/* Header + period toggle */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Ad Set Performance</div>
            <p className="text-sm text-stone-600 mt-1">Cold vs. Warm audience breakdown.</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[{ d: 0, label: 'Today' }, { d: 7, label: '7 Days' }, { d: 30, label: '30 Days' }, { d: 90, label: '90 Days' }].map(({ d, label }) => (
              <button key={d} onClick={() => setDays(d)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: days === d ? META_BLUE : 'rgba(24,119,242,0.08)',
                  color: days === d ? 'white' : META_BLUE,
                  border: '1px solid rgba(24,119,242,0.25)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-[160px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <AudienceCard title="Cold Traffic" dotColor="#1877F2" group={groups?.Cold} fmtMoney={fmtMoney} fmtPct={fmtPct} fmtNum={fmtNum} />
            <AudienceCard title="Warm (Retargeting)" dotColor="#10B981" group={groups?.Warm} fmtMoney={fmtMoney} fmtPct={fmtPct} fmtNum={fmtNum} />
          </div>
        )}
      </div>

      {/* CPM by Ad Set */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">CPM by Ad Set</div>
        <p className="text-sm text-stone-600 mb-4">Cost per 1,000 impressions — lower is better.</p>
        {loading ? (
          <div className="h-[260px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : cpmData.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-stone-400 text-sm">No ad set data yet</div>
        ) : (
          <div style={{ width: '100%', height: Math.max(220, cpmData.length * 56) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cpmData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9c96a8' }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b6878' }} width={180} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} formatter={(v) => [`$${v}`, 'CPM']} />
                <Bar dataKey="cpm" radius={[0, 3, 3, 0]}>
                  {cpmData.map((entry, i) => (
                    <Cell key={i} fill={entry.audience === 'Warm' ? '#10B981' : '#1877F2'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* All Ad Sets table */}
      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">All Ad Sets</div>
        <p className="text-sm text-stone-600 mb-4">Detailed breakdown by ad set.</p>
        {loading ? (
          <div className="h-[120px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : adSets.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-stone-400 text-sm">No ad set data yet</div>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Ad Set</th>
                <th className="text-left py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Audience</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Spend</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">CPM</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Total CTR</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Link CTR</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Impressions</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Conversions</th>
                <th className="text-right py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Test Drive</th>
              </tr>
            </thead>
            <tbody>
              {adSets.map(a => (
                <tr key={a.adset_id} className="border-b border-stone-100">
                  <td className="py-3 px-3 font-medium text-stone-800">{a.adset_name}</td>
                  <td className="py-3 px-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold mono-font uppercase tracking-wider"
                      style={{
                        background: a.audience === 'Warm' ? 'rgba(16,185,129,0.12)' : a.audience === 'Cold' ? 'rgba(24,119,242,0.12)' : 'rgba(120,113,108,0.12)',
                        color: a.audience === 'Warm' ? '#047857' : a.audience === 'Cold' ? '#1877F2' : '#78716C',
                      }}>
                      {a.audience}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtMoney(a.spend)}</td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtMoney(a.cpm)}</td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtPct(a.totalCtr)}</td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtPct(a.linkCtr)}</td>
                  <td className="py-3 px-2 text-right num-tabular text-stone-500">{fmtNum(a.impressions)}</td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtNum(a.conversions)}</td>
                  <td className="py-3 px-2 text-right num-tabular">{fmtNum(a.testDrive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AudienceCard({ title, dotColor, group, fmtMoney, fmtPct, fmtNum }) {
  if (!group) return null
  return (
    <div className="border border-stone-200 rounded-lg p-5" style={{ background: 'rgba(24,119,242,0.02)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
          <span className="display-font text-lg font-medium text-stone-900">{title}</span>
        </div>
        <span className="mono-font text-[10px] uppercase tracking-wider text-stone-400">{group.count} ad sets</span>
      </div>
      <div className="grid grid-cols-3 gap-y-4 gap-x-2">
        <AudienceStat label="Spend" value={fmtMoney(group.spend)} />
        <AudienceStat label="Avg CPM" value={fmtMoney(group.avgCpm)} />
        <AudienceStat label="Total CTR" value={fmtPct(group.totalCtr)} />
        <AudienceStat label="Link CTR" value={fmtPct(group.linkCtr)} />
        <AudienceStat label="Test Drive" value={fmtNum(group.testDrive)} />
        <AudienceStat label="Conversions" value={fmtNum(group.conversions)} />
      </div>
    </div>
  )
}

function AudienceStat({ label, value }) {
  return (
    <div>
      <div className="mono-font text-[9px] uppercase tracking-[0.12em] text-stone-400 mb-1">{label}</div>
      <div className="display-font text-xl font-medium" style={{ color: META_BLUE }}>{value}</div>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const secs = Math.floor((Date.now() - then) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
