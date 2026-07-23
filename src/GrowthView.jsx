import React, { useState, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, BarChart3, Layers, FlaskConical, FileText, Users, DollarSign, TrendingUp, Plus, Trash2, Calendar, Activity, Clock, RefreshCw, ChevronDown, ChevronRight, Sparkles, Info, Globe, Check } from 'lucide-react'
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ComposedChart, Cell } from 'recharts'
import { useMetaAds } from './hooks/useMetaAds.js'
import { useMetaDaily } from './hooks/useMetaDaily.js'
import { useMetaAdSets } from './hooks/useMetaAdSets.js'
import { useMetaLastSync } from './hooks/useMetaLastSync.js'
import { useCalBookings } from './hooks/useCalBookings.js'
import { useCalBookingsByRep } from './hooks/useCalBookingsByRep.js'
import BreakdownModal from './BreakdownModal.jsx'
import { useCalEventTypes } from './hooks/useCalEventTypes.js'
import { supabase } from './supabase.js'
import { useScorecard } from './useScorecard'
import RocketLoader from './RocketLoader'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_GROWTH_WEEK, EXPERIMENT_STATUSES, newId } from './roleConstants'
import { cpm, ctr, cpc, cpl, bookingRate, showUpRate, closeRate, optinRate, leadToSql, costPerDemo, cpbc, safeDiv } from './metrics'
import { useAtlasBlueFunnel } from './hooks/useAtlasBlueFunnel.js'
import { useAtlasBlueWebinar } from './hooks/useAtlasBlueWebinar.js'
import { useBookedMeetingsDetail } from './hooks/useBookedMeetingsDetail.js'
import { useCalBookingsAllTimeByType } from './hooks/useCalBookingsAllTimeByType.js'
import { useTotalAdSpend } from './hooks/useTotalAdSpend.js'
import { useSpendByCampaign } from './hooks/useSpendByCampaign.js'
import EconomicsDrilldownModal from './EconomicsDrilldownModal'
import { useGa4Metrics } from './hooks/useGa4Metrics.js'
import AtlasBlueDrilldownModal from './AtlasBlueDrilldownModal'
import BookedMeetingsDrilldownModal from './BookedMeetingsDrilldownModal'
import { dayIdxOfYMD } from './aeFunnel'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, { NorthStarTile, SectionTabs, PageHeader, WeekNavigator } from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

export default function GrowthView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToFulfillment, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey, setWeekKey: propSetWeekKey }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const {
    weekData, loading, saving, savedAt, update,
    weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    submittedAt, isLocked, submit, unsubmit, submitting,
  } = useScorecard(profile.id, propWeekKey, BLANK_GROWTH_WEEK, ['experiments'])
  // Week setter: the hook owns it in self-view; in an exec drill-in the hook's
  // setter is a no-op and ScorecardViewer passes the real one down as propSetWeekKey.
  const effectiveSetWeekKey = isExecDrillIn ? propSetWeekKey : setWeekKey
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('funnel')
  const [metaRefreshKey, setMetaRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const { lastSync } = useMetaLastSync(metaRefreshKey)

  // --- Auto-fill Spend + Paid Leads from Meta (authoritative, read-only) ---
  // Meta is the source of truth for ad spend and paid-lead conversions, so we
  // pull the viewed week's daily rows from meta_ads_daily and write them into
  // weekData.daily[].adSpend / .leads. Persisting (via the normal autosave, which
  // only writes the editable current week) keeps the Odyssey/Investor/Executive
  // rollups — which read these fields — accurate without Nick hand-typing them.
  const [metaByDay, setMetaByDay] = useState(null) // 7-el [{spend, leads}] by getDay, or null when Meta has no rows for the week
  useEffect(() => {
    let cancelled = false
    const [y, m, d] = weekKey.split('-').map(Number)
    const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 6)
    const endStr = end.toISOString().slice(0, 10)
    supabase
      .from('meta_ads_daily')
      .select('date_start, spend, actions')
      .gte('date_start', weekKey)
      .lte('date_start', endStr)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) { setMetaByDay(null); return } // no Meta rows → leave existing values untouched
        const byDay = Array.from({ length: 7 }, () => ({ spend: 0, leads: 0 }))
        for (const r of data) {
          if (!r.date_start) continue
          const idx = dayIdxOfYMD(r.date_start)
          byDay[idx].spend += Number(r.spend) || 0
          const lead = (r.actions || []).find(a => a.action_type === 'lead')
          if (lead) byDay[idx].leads += Number(lead.value) || 0
        }
        byDay.forEach(x => { x.spend = Math.round(x.spend * 100) / 100; x.leads = Math.round(x.leads) })
        setMetaByDay(byDay)
      })
    return () => { cancelled = true }
  }, [weekKey, metaRefreshKey])

  useEffect(() => {
    if (loading || !weekData || !metaByDay) return
    const changed = metaByDay.some((x, i) => {
      const day = weekData.daily[i] || {}
      return (Math.round((Number(day.adSpend) || 0) * 100) / 100) !== x.spend || (Number(day.leads) || 0) !== x.leads
    })
    if (!changed) return
    update(prev => ({
      ...prev,
      daily: prev.daily.map((day, i) => metaByDay[i] ? { ...day, adSpend: metaByDay[i].spend, leads: metaByDay[i].leads } : day),
    }))
  }, [metaByDay, loading, weekData, update])

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
    return <RocketLoader className="min-h-screen" />
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
    { id: 'booked-meetings', label: 'Booked Meetings', icon: Calendar },
    { id: 'atlas-blue',  label: 'Atlas Blue',    icon: Sparkles },
    { id: 'atlas-blue-webinar', label: 'AB Webinar', icon: Users },
    { id: 'ga4',         label: 'Website (GA4)', icon: Globe },
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
      saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToFulfillment={onSwitchToFulfillment} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated} hideWeekNav>
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

      <WeekNavigator weekKey={weekKey} setWeekKey={effectiveSetWeekKey} currentWeekKey={currentWeekKey} isViewingCurrentWeek={isViewingCurrentWeek} />

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
        {section === 'booked-meetings' && <BookedMeetingsSection />}
        {section === 'atlas-blue' && <AtlasBlueFunnelSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} profile={profile} />}
        {section === 'atlas-blue-webinar' && <AtlasBlueWebinarSection workDayIdxs={workDayIdxs} weekKey={weekKey} />}
        {section === 'ga4' && <Ga4Section />}
        {section === 'meta-live' && <MetaLiveSection refreshKey={metaRefreshKey} />}
        {section === 'ad-sets' && <AdSetsSection refreshKey={metaRefreshKey} />}
        {section === 'monthly' && <MonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'channels' && <ChannelsSection weekData={weekData} update={update} weekKey={weekKey} />}
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
          <span className="text-stone-400"> · Spend &amp; Paid Leads are pulled live from Meta (read-only).</span>
        </p>
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <AbHeadCell label="Spend" tone="live"
                tip="Live from Meta Ads (meta_ads_daily.spend) — total daily ad spend across all Meta campaigns. Read-only." />
              <AbHeadCell label="Visitors" tone="manual"
                tip="Manual entry. Website visitors — Meta has no true visitor count, so this is typed in." />
              <AbHeadCell label="Opt-ins" tone="manual"
                tip="Manual entry. Email / lead-magnet opt-ins." />
              <AbHeadCell label="Organic Leads" tone="manual"
                tip="Manual entry. Leads from non-paid (organic) sources." />
              <AbHeadCell label="Paid Leads" tone="live"
                tip="Live from Meta Ads — 'lead' conversions per day. Read-only." />
              <AbHeadCell label="SQLs" tone="manual"
                tip="Manual entry. Sales-qualified leads." />
              <AbHeadCell label="Opt-in %" tone="calc"
                tip="Calculated: Opt-ins ÷ Visitors. Target ≥ 20%." />
              <AbHeadCell label="CPL" tone="calc"
                tip="Calculated: Spend ÷ Paid Leads (cost per lead). Target ≤ $5." />
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
                  <ReadCell value={day.adSpend} money />
                  <NumCell value={day.websiteVisitors} onChange={(v) => setCell(dayIdx, 'websiteVisitors', v)} />
                  <NumCell value={day.optins} onChange={(v) => setCell(dayIdx, 'optins', v)} />
                  <NumCell value={day.organicLeads} onChange={(v) => setCell(dayIdx, 'organicLeads', v)} />
                  <ReadCell value={day.leads} />
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
              <AbHeadCell label="Booked" tone="manual"
                tip="Manual entry. Demos / calls booked." />
              <AbHeadCell label="Completed" tone="manual"
                tip="Manual entry. Demos / calls completed (prospect attended)." />
              <AbHeadCell label="Trials" tone="manual"
                tip="Manual entry. Trial signups." />
              <AbHeadCell label="New Customers" tone="manual"
                tip="Manual entry. New customers acquired." />
              <AbHeadCell label="SQL Rate" tone="calc"
                tip="Calculated: SQLs ÷ Paid Leads. ⚠ NEEDS CLARIFICATION — can exceed 100% because SQLs are entered manually while Paid Leads is now pulled live from Meta, so they aren't the same population. Confirm the intended denominator (e.g. total leads incl. organic, or a different source). Target ≥ 25%." />
              <AbHeadCell label="Booking" tone="calc"
                tip="Calculated: Booked ÷ Paid Leads. ⚠ NEEDS CLARIFICATION — this can exceed 100% because Booked is entered manually while Paid Leads is now pulled live from Meta, so they aren't the same population. Confirm the intended denominator (e.g. total leads incl. organic, or a different source). Target ≥ 20%." />
              <AbHeadCell label="Show-Up" tone="calc"
                tip="Calculated: Completed ÷ Booked. Target ≥ 75%." />
              <AbHeadCell label="Close" tone="calc"
                tip="Calculated: Trials ÷ Completed (close rate). Target ≥ 30%." />
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

// ============================================================================
//  Atlas Blue funnel — Nick's ad-driven-only funnel. Manual top-of-funnel inputs
//  (ad spend / visitors / test drives), everything else auto from ae_deals +
//  Stripe via useAtlasBlueFunnel. See src/13-atlas-blue-funnel.sql.
// ============================================================================
const AB_BLUE = '#2563EB'
// Assumed customer lifetime for LTV = cash + MRR × months. Adjust if Finance sets a real figure.
const LTV_LIFETIME_MONTHS = 24
const fmtWhole = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const money2 = (v) => (v == null || isNaN(v) ? '—' : `$${Number(v).toFixed(2)}`)
const fmtDay = (d) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '')

// Hero stat card. Pass onClick to make it a clickable drill-down tile.
function HeroStat({ label, value, accent, onClick }) {
  const inner = (
    <>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mb-1 flex items-center gap-1">
        {label}{onClick && <span className="text-stone-300">›</span>}
      </div>
      <div className="display-font text-3xl font-medium leading-none" style={{ color: accent }}>{value}</div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick}
        className="border border-stone-200 rounded-xl p-4 bg-white text-left w-full hover:border-stone-400 hover:shadow-sm transition-all cursor-pointer">
        {inner}
      </button>
    )
  }
  return <div className="border border-stone-200 rounded-xl p-4 bg-white">{inner}</div>
}

// Read-only numeric cell (auto-derived columns). When onClick is passed the
// value becomes a button that opens the drill-down modal.
function ReadCell({ value, money, onClick }) {
  const content = money ? fmtWhole(value) : (Number(value) || 0).toLocaleString()
  return (
    <td className="py-2 px-2 text-center num-tabular text-xs text-stone-700">
      {onClick
        ? <button type="button" onClick={onClick} style={{ pointerEvents: 'auto' }}
            className="underline decoration-dotted decoration-stone-300 underline-offset-2 hover:text-stone-900 hover:decoration-stone-500 transition-colors cursor-pointer">
            {content}
          </button>
        : content}
    </td>
  )
}

// Chart legend item with a hover tooltip documenting where the series comes from.
function LegendItem({ color, label, tip }) {
  return (
    <span className="inline-flex items-center gap-1.5 cursor-help normal-case tracking-normal" title={tip}>
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
      <Info className="w-3 h-3 opacity-40" />
    </span>
  )
}

// Column heading with a hover tooltip (native title, so it never clips inside the
// table's horizontal scroll container) documenting the source/calculation. tone:
// 'live' = auto-pulled, 'manual' = typed in, 'calc' = derived from other columns.
function AbHeadCell({ label, tip, tone = 'manual' }) {
  const color = tone === 'live' ? AB_BLUE : tone === 'calc' ? '#047857' : undefined
  const cls = tone === 'manual' ? 'text-stone-500' : ''
  return (
    <th title={tip}
      className={`text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest font-medium cursor-help ${cls}`}
      style={color ? { color } : undefined}>
      <span className="inline-flex items-center justify-center gap-1">{label}<Info className="w-3 h-3 opacity-40" /></span>
    </th>
  )
}

function AtlasBlueFunnelSection({ weekData, update, workDayIdxs, weekKey, profile }) {
  const [chartWeeks, setChartWeeks] = useState(8)
  const { viewedWeekDays, viewedWeekDeals, viewedWeekBookings, viewedWeekTestDrives, weeklyTrend, loading, error } = useAtlasBlueFunnel(profile.id, weekKey, chartWeeks)

  // Drill-down modal: click any bottom-funnel value to see the deals behind it.
  const [drill, setDrill] = useState(null)
  const openDrill = (metricKey, dayIdx, label) => setDrill({ metricKey, dayIdx, label })

  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  // Totals across the user's work days for the viewed week.
  const t = workDayIdxs.reduce((acc, di) => {
    const a = viewedWeekDays[di] || {}
    acc.adSpend += Number(a.adSpend) || 0
    acc.visitors += Number(a.visitors) || 0
    acc.testDrives += Number(a.testDrives) || 0
    acc.callsBooked += a.callsBooked || 0
    acc.booked += a.demosBooked || 0
    acc.completed += a.demosCompleted || 0
    acc.unqualified += a.demosUnqualified || 0
    acc.newCustomers += a.newCustomers || 0
    acc.cash += a.cashCollected || 0
    acc.dealValue += a.dealValue || 0
    return acc
  }, { adSpend: 0, visitors: 0, testDrives: 0, callsBooked: 0, booked: 0, completed: 0, unqualified: 0, newCustomers: 0, cash: 0, dealValue: 0 })

  const chartData = weeklyTrend.map(w => ({
    name: formatWeekLabel(w.weekKey),
    adSpend: w.adSpend,
    cashCollected: w.cashCollected,
    roas: w.roas,
  }))
  const WEEK_OPTIONS = [4, 8, 12, 26]

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded">
          Couldn’t load the Atlas Blue deal data. The <code>atlas_blue_deals</code> function may not be
          installed yet, or you may not have access.
        </div>
      )}

      {/* ---------- TOP OF FUNNEL ---------- */}
      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5" style={{ color: AB_BLUE }} />
          <div className="display-font text-2xl font-medium text-stone-900">Top of funnel</div>
        </div>
        <p className="text-sm text-stone-600 mb-6">
          Atlas Blue (ad-driven) only. Every column is pulled live — Ad Spend + Visitors from the
          Atlas Blue (iMessage) Meta campaign, Test Drives from Atlas Blue conversations, and Booked
          Calls from ad-driven bookings.
        </p>
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <AbHeadCell label="Ad Spend" tone="live"
                tip="Live from Meta Ads (meta_ads_daily.spend) for the Atlas Blue (iMessage) campaign only." />
              <AbHeadCell label="Visitors" tone="live"
                tip="Live from Meta Ads — the 'landing_page_view' action (someone clicked the ad AND the page loaded) for the Atlas Blue (iMessage) campaign only." />
              <AbHeadCell label="Test Drives" tone="live"
                tip="Live — distinct customers who had a conversation with the 'Atlas Blue Paid Ads Funnel Agent' campaign, counted on the day of their first conversation." />
              <AbHeadCell label="Booked Calls" tone="live"
                tip="Live from AD-DRIVEN bookings only (ae_deals whose Cal event type is flagged ad-driven). Counted on the day the call was BOOKED (Cal.com booking date), not the meeting date, excluding Rescheduled and Deleted. Organic bookings are excluded." />
              <AbHeadCell label="Action %" tone="calc"
                tip="Calculated: (Test Drives + Booked Calls) ÷ Visitors. Booked Calls are ad-driven only." />
              <AbHeadCell label="Cost / Test Drive" tone="calc"
                tip="Calculated: Ad Spend ÷ Test Drives." />
              <AbHeadCell label="Cost / Booked Call" tone="calc"
                tip="Calculated: Ad Spend ÷ Booked Calls, using AD-DRIVEN booked calls only — organic bookings are never counted here." />
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => {
              const a = viewedWeekDays[dayIdx] || {}
              const callsBooked = a.callsBooked || 0
              const lbl = DAY_NAMES[dayIdx]
              return (
                <tr key={dayIdx} className="border-b border-stone-100">
                  <td className="py-2 px-3"><div className="font-medium text-stone-800 text-xs">{lbl}</div></td>
                  <ReadCell value={a.adSpend} money />
                  <ReadCell value={a.visitors} />
                  <ReadCell value={a.testDrives} onClick={a.testDrives ? () => openDrill('testDrives', dayIdx, lbl) : undefined} />
                  <ReadCell value={callsBooked} onClick={callsBooked ? () => openDrill('callsBooked', dayIdx, lbl) : undefined} />
                  <DerivedCell value={safeDiv((Number(a.testDrives) || 0) + callsBooked, a.visitors)} format="pct" />
                  <DerivedCell value={safeDiv(a.adSpend, a.testDrives)} format="money" />
                  <DerivedCell value={cpbc(a.adSpend, callsBooked)} format="money" />
                </tr>
              )
            })}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{fmtWhole(t.adSpend)}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{t.visitors.toLocaleString()}</td>
              <FooterReadCell text={t.testDrives.toLocaleString()} onClick={t.testDrives ? () => openDrill('testDrives', null, 'This week') : undefined} />
              <FooterReadCell text={t.callsBooked.toLocaleString()} onClick={t.callsBooked ? () => openDrill('callsBooked', null, 'This week') : undefined} />
              <FooterDerivedCell value={safeDiv(t.testDrives + t.callsBooked, t.visitors)} format="pct" />
              <FooterDerivedCell value={safeDiv(t.adSpend, t.testDrives)} format="money" />
              <FooterDerivedCell value={cpbc(t.adSpend, t.callsBooked)} format="money" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------- BOTTOM OF FUNNEL ---------- */}
      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Bottom of funnel</div>
        <p className="text-sm text-stone-600 mb-6">
          Live from your ad-driven deals, for the selected week only (use the week navigator to change it).
          Show-Up and Close back out Deleted / Rescheduled / Unqualified, matching the AE funnel.{loading ? ' · Syncing deals…' : ''}
        </p>
        <table className="w-full text-sm min-w-[1040px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <AbHeadCell label="Booked" tone="live"
                tip="Live from AD-DRIVEN ae_deals. Meetings booked that day, excluding Rescheduled and Deleted. Organic bookings are excluded." />
              <AbHeadCell label="Completed" tone="live"
                tip="Live from ad-driven ae_deals. Meetings the prospect attended (Showed, Proposal sent, Follow-up, Closed Won/Lost, and Unqualified — anyone who showed up)." />
              <AbHeadCell label="New Customers" tone="live"
                tip="Live from ad-driven ae_deals. Deals marked Closed Won, dated by the meeting day." />
              <AbHeadCell label="Cash Collected" tone="live"
                tip="Live from Stripe via ae_deals.one_time (Stripe-matched cash) on Closed Won deals. Shows $0 until a payment is matched to the deal in Stripe." />
              <AbHeadCell label="Deal Value" tone="live"
                tip="Live from ae_deals.mrr (Stripe-matched monthly contracted MRR) on Closed Won deals." />
              <AbHeadCell label="Show-Up %" tone="calc"
                tip="Calculated: Completed ÷ Booked. (Booked already excludes Rescheduled/Deleted.)" />
              <AbHeadCell label="Closing %" tone="calc"
                tip="Calculated: New Customers ÷ (Completed − Unqualified). Unqualified (showed-but-not-a-fit) are backed out of the denominator, matching the AE funnel." />
              <AbHeadCell label="Avg Cash" tone="calc"
                tip="Calculated: Cash Collected ÷ New Customers." />
              <AbHeadCell label="Avg Deal Value" tone="calc"
                tip="Calculated: Deal Value ÷ New Customers." />
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => {
              const a = viewedWeekDays[dayIdx] || {}
              const closeable = (a.demosCompleted || 0) - (a.demosUnqualified || 0)
              const lbl = DAY_NAMES[dayIdx]
              return (
                <tr key={dayIdx} className="border-b border-stone-100">
                  <td className="py-2 px-3"><div className="font-medium text-stone-800 text-xs">{lbl}</div></td>
                  <ReadCell value={a.demosBooked} onClick={a.demosBooked ? () => openDrill('booked', dayIdx, lbl) : undefined} />
                  <ReadCell value={a.demosCompleted} onClick={a.demosCompleted ? () => openDrill('completed', dayIdx, lbl) : undefined} />
                  <ReadCell value={a.newCustomers} onClick={a.newCustomers ? () => openDrill('newCustomers', dayIdx, lbl) : undefined} />
                  <ReadCell value={a.cashCollected} money onClick={a.newCustomers ? () => openDrill('cash', dayIdx, lbl) : undefined} />
                  <ReadCell value={a.dealValue} money onClick={a.newCustomers ? () => openDrill('dealValue', dayIdx, lbl) : undefined} />
                  <DerivedCell value={showUpRate(a.demosCompleted, a.demosBooked)} format="pct" onClick={a.demosBooked ? () => openDrill('showUp', dayIdx, lbl) : undefined} />
                  <DerivedCell value={safeDiv(a.newCustomers, closeable)} format="pct" onClick={closeable > 0 ? () => openDrill('closing', dayIdx, lbl) : undefined} />
                  <DerivedCell value={safeDiv(a.cashCollected, a.newCustomers)} format="money" onClick={a.newCustomers ? () => openDrill('avgCash', dayIdx, lbl) : undefined} />
                  <DerivedCell value={safeDiv(a.dealValue, a.newCustomers)} format="money" onClick={a.newCustomers ? () => openDrill('avgDeal', dayIdx, lbl) : undefined} />
                </tr>
              )
            })}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
              <FooterReadCell text={t.booked.toLocaleString()} onClick={t.booked ? () => openDrill('booked', null, 'This week') : undefined} />
              <FooterReadCell text={t.completed.toLocaleString()} onClick={t.completed ? () => openDrill('completed', null, 'This week') : undefined} />
              <FooterReadCell text={t.newCustomers.toLocaleString()} onClick={t.newCustomers ? () => openDrill('newCustomers', null, 'This week') : undefined} />
              <FooterReadCell text={fmtWhole(t.cash)} onClick={t.newCustomers ? () => openDrill('cash', null, 'This week') : undefined} />
              <FooterReadCell text={fmtWhole(t.dealValue)} onClick={t.newCustomers ? () => openDrill('dealValue', null, 'This week') : undefined} />
              <FooterDerivedCell value={showUpRate(t.completed, t.booked)} format="pct" onClick={t.booked ? () => openDrill('showUp', null, 'This week') : undefined} />
              <FooterDerivedCell value={safeDiv(t.newCustomers, t.completed - t.unqualified)} format="pct" onClick={(t.completed - t.unqualified) > 0 ? () => openDrill('closing', null, 'This week') : undefined} />
              <FooterDerivedCell value={safeDiv(t.cash, t.newCustomers)} format="money" onClick={t.newCustomers ? () => openDrill('avgCash', null, 'This week') : undefined} />
              <FooterDerivedCell value={safeDiv(t.dealValue, t.newCustomers)} format="money" onClick={t.newCustomers ? () => openDrill('avgDeal', null, 'This week') : undefined} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------- WEEKLY OVERVIEW ---------- */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
          <div className="display-font text-2xl font-medium text-stone-900">Weekly Overview</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEK_OPTIONS.map(w => (
              <button key={w} onClick={() => setChartWeeks(w)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: chartWeeks === w ? AB_BLUE : 'rgba(37,99,235,0.08)',
                  color: chartWeeks === w ? 'white' : AB_BLUE,
                  border: '1px solid rgba(37,99,235,0.25)',
                }}>
                {w}w
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-stone-600 mt-1">
          Ad-driven only. Cash is bucketed by each deal’s meeting week, so a week compares that
          week’s Meta ad spend against cash from the ad-driven deals that met that week.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 mono-font text-[10px] text-stone-500">
          <LegendItem color="#93C5FD" label="Ad Spend"
            tip="Live from Meta Ads (meta_ads_daily.spend), summed per calendar week. Total across all Meta campaigns." />
          <LegendItem color="#10B981" label="Cash Collected"
            tip="Stripe-matched cash (ae_deals.one_time) on AD-DRIVEN Closed Won deals only, bucketed by the deal’s meeting week. Organic deals are excluded. Same source as the bottom-of-funnel table." />
          <LegendItem color={AB_BLUE} label="ROAS"
            tip="Return on ad spend = Cash Collected ÷ Ad Spend for the week. Blank when there was no ad spend that week." />
        </div>
        <div className="h-[300px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }}
                formatter={(v, name) => {
                  if (name === 'ROAS') return [v == null ? '—' : `${Number(v).toFixed(2)}x`, name]
                  return [fmtWhole(v), name]
                }}
              />
              <Bar yAxisId="left" dataKey="adSpend" name="Ad Spend" fill="#93C5FD" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="cashCollected" name="Cash Collected" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke={AB_BLUE} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {drill && (
        <AtlasBlueDrilldownModal
          drill={drill}
          deals={viewedWeekDeals}
          bookings={viewedWeekBookings}
          testDrives={viewedWeekTestDrives}
          workDayIdxs={workDayIdxs}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}

// Atlas Blue Webinar — the "Atlas Blue - Workshop" Meta campaign. Only Ad Spend +
// Visitors are available today (from Meta); later funnel stages have no source yet
// so they're intentionally not rendered. Same visual language as the Atlas Blue tab.
function AtlasBlueWebinarSection({ workDayIdxs, weekKey }) {
  const [chartWeeks, setChartWeeks] = useState(8)
  const [deselected, setDeselected] = useState([])
  const { viewedWeekDays, weeklyTrend, campaigns, lifetime, recentSignups, revenueBreakdown, totalSignups, loading, error } = useAtlasBlueWebinar(weekKey, chartWeeks, deselected)
  const toggleCampaign = (id) => setDeselected(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id])

  const t = workDayIdxs.reduce((acc, di) => {
    const a = viewedWeekDays[di] || {}
    acc.adSpend += Number(a.adSpend) || 0
    acc.visitors += Number(a.visitors) || 0
    acc.signups += Number(a.signups) || 0
    return acc
  }, { adSpend: 0, visitors: 0, signups: 0 })
  // Opt-ins arrive any day (incl. weekends), so the headline count spans the full week.
  const weekSignups = viewedWeekDays.reduce((n, d) => n + (Number(d.signups) || 0), 0)

  const chartData = weeklyTrend.map(w => ({ name: formatWeekLabel(w.weekKey), adSpend: w.adSpend, visitors: w.visitors, signups: w.signups }))
  const WEEK_OPTIONS = [4, 8, 12, 26]

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded">
          Couldn’t load the Atlas Blue Webinar Meta data.
        </div>
      )}

      {/* ---------- CAMPAIGN LIFETIME TOTALS + FILTER ---------- */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400">Campaign totals · full duration</div>
            <div className="display-font text-2xl font-medium text-stone-900">Atlas Blue Webinar</div>
          </div>
          {loading && <span className="text-xs text-stone-400">Syncing…</span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <HeroStat label="Total Ad Spend" value={fmtWhole(lifetime?.adSpend)} accent={AB_BLUE} />
          <HeroStat label="Visitors" value={(lifetime?.visitors || 0).toLocaleString()} accent={AB_BLUE} />
          <HeroStat label="Cost / Visitor" value={money2(safeDiv(lifetime?.adSpend, lifetime?.visitors))} accent="#047857" />
          <HeroStat label="Opt-ins" value={(totalSignups || 0).toLocaleString()} accent="#059669" />
          <HeroStat label="Cost / Opt-in" value={money2(safeDiv(lifetime?.adSpend, totalSignups))} accent="#047857" />
        </div>

        {campaigns && campaigns.length > 0 && (
          <div className="mt-5 pt-4 border-t border-stone-100">
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mb-2">Campaigns included</div>
            <div className="flex flex-wrap gap-2">
              {campaigns.map(c => {
                const on = !deselected.includes(c.id)
                return (
                  <button key={c.id} type="button" onClick={() => toggleCampaign(c.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors"
                    style={{ borderColor: on ? AB_BLUE : '#e7e5e4', background: on ? 'rgba(37,99,235,0.06)' : 'white' }}>
                    <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 border"
                      style={{ borderColor: on ? AB_BLUE : '#d6d3d1', background: on ? AB_BLUE : 'white' }}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-stone-800">{c.name}</span>
                      <span className="block text-[11px] text-stone-500 num-tabular">{fmtWhole(c.adSpend)} · {fmtDay(c.firstDay)}–{fmtDay(c.lastDay)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-stone-400 mt-2">
              Opt-ins come from the single opt-in form and aren’t split by campaign, so they stay constant when you toggle campaigns — toggling changes the ad-spend side (and Cost / Opt-in).
            </p>
          </div>
        )}
      </div>

      {/* ---------- TOP OF FUNNEL (weekly) ---------- */}
      <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5" style={{ color: AB_BLUE }} />
          <div className="display-font text-2xl font-medium text-stone-900">This Week</div>
        </div>
        <p className="text-sm text-stone-600 mb-6">
          Daily Ad Spend + Visitors (live from Meta) and Opt-ins (live from the GHL workshop opt-in form)
          for the selected campaign{campaigns && campaigns.length !== 1 ? 's' : ''}, this week.
          {loading ? ' · Syncing…' : ''}
        </p>
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
              <AbHeadCell label="Ad Spend" tone="live"
                tip="Live from Meta Ads (meta_ads_daily.spend) for the Atlas Blue - Workshop campaign only." />
              <AbHeadCell label="Visitors" tone="live"
                tip="Live from Meta Ads — the 'landing_page_view' action (someone clicked the ad AND the page loaded) for the Atlas Blue - Workshop campaign only." />
              <AbHeadCell label="Cost / Visitor" tone="calc"
                tip="Calculated: Ad Spend ÷ Visitors." />
              <AbHeadCell label="Opt-ins" tone="live"
                tip="Live from the GHL workshop opt-in form (webinar_signups), bucketed by submission date." />
              <AbHeadCell label="Cost / Opt-in" tone="calc"
                tip="Calculated: Ad Spend ÷ Opt-ins." />
            </tr>
          </thead>
          <tbody>
            {workDayIdxs.map(dayIdx => {
              const a = viewedWeekDays[dayIdx] || {}
              return (
                <tr key={dayIdx} className="border-b border-stone-100">
                  <td className="py-2 px-3"><div className="font-medium text-stone-800 text-xs">{DAY_NAMES[dayIdx]}</div></td>
                  <ReadCell value={a.adSpend} money />
                  <ReadCell value={a.visitors} />
                  <DerivedCell value={safeDiv(a.adSpend, a.visitors)} format="money" />
                  <ReadCell value={a.signups} />
                  <DerivedCell value={safeDiv(a.adSpend, a.signups)} format="money" />
                </tr>
              )
            })}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{fmtWhole(t.adSpend)}</td>
              <td className="py-3 px-2 text-center num-tabular font-bold">{t.visitors.toLocaleString()}</td>
              <FooterDerivedCell value={safeDiv(t.adSpend, t.visitors)} format="money" />
              <td className="py-3 px-2 text-center num-tabular font-bold">{t.signups.toLocaleString()}</td>
              <FooterDerivedCell value={safeDiv(t.adSpend, t.signups)} format="money" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------- WEEKLY OVERVIEW ---------- */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
          <div className="display-font text-2xl font-medium text-stone-900">Weekly Overview</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEK_OPTIONS.map(w => (
              <button key={w} onClick={() => setChartWeeks(w)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: chartWeeks === w ? AB_BLUE : 'rgba(37,99,235,0.08)',
                  color: chartWeeks === w ? 'white' : AB_BLUE,
                  border: '1px solid rgba(37,99,235,0.25)',
                }}>
                {w}w
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 mono-font text-[10px] text-stone-500">
          <LegendItem color="#93C5FD" label="Ad Spend"
            tip="Live from Meta Ads (meta_ads_daily.spend) for the workshop campaign, summed per calendar week." />
          <LegendItem color={AB_BLUE} label="Visitors"
            tip="Meta 'landing_page_view' for the workshop campaign, summed per calendar week." />
          <LegendItem color="#059669" label="Opt-ins"
            tip="Workshop opt-in form submissions (webinar_signups), summed per calendar week." />
        </div>
        <div className="h-[300px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }}
                formatter={(v, name) => [name === 'Ad Spend' ? fmtWhole(v) : Number(v).toLocaleString(), name]}
              />
              <Bar yAxisId="left" dataKey="adSpend" name="Ad Spend" fill="#93C5FD" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="visitors" name="Visitors" stroke={AB_BLUE} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="signups" name="Opt-ins" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---------- WORKSHOP OPT-INS (registration stage) ---------- */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: '#059669' }} />
            <div className="display-font text-2xl font-medium text-stone-900">Workshop Opt-ins</div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400">This week</div>
              <div className="num-tabular text-2xl font-bold" style={{ color: '#059669' }}>{weekSignups.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400">Last {chartWeeks}w</div>
              <div className="num-tabular text-2xl font-bold text-stone-800">{(totalSignups || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>
        <p className="text-sm text-stone-600 mb-4">
          Live from the “Stop Hiring, Start Cloning Workshop” opt-in form (GHL). Full history syncs daily.
        </p>

        {revenueBreakdown && revenueBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {revenueBreakdown.map(({ band, count }) => (
              <span key={band} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                {band}<span className="num-tabular font-bold">{count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Name</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Email</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Phone</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Revenue</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Source</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Opted in</th>
              </tr>
            </thead>
            <tbody>
              {(recentSignups || []).length === 0 && (
                <tr><td colSpan={6} className="py-6 px-3 text-center text-sm text-stone-400 italic">{loading ? 'Loading opt-ins…' : 'No opt-ins in this window yet.'}</td></tr>
              )}
              {(recentSignups || []).slice(0, 25).map((s, i) => (
                <tr key={i} className="border-b border-stone-100">
                  <td className="py-2 px-3 text-stone-800 font-medium text-xs">{s.name || '—'}</td>
                  <td className="py-2 px-3 text-stone-600 text-xs">{s.email || '—'}</td>
                  <td className="py-2 px-3 text-stone-600 text-xs num-tabular">{s.phone || '—'}</td>
                  <td className="py-2 px-3 text-stone-600 text-xs">{s.revenueBand || '—'}</td>
                  <td className="py-2 px-3 text-stone-600 text-xs">{s.source || '—'}</td>
                  <td className="py-2 px-3 text-right text-stone-500 text-xs num-tabular">
                    {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(recentSignups || []).length > 25 && (
          <div className="text-xs text-stone-400 mt-3">Showing the 25 most recent of {recentSignups.length} in this window.</div>
        )}
      </div>
    </div>
  )
}

// Booked-meeting attribution — its own Growth sub-tab. ONE list: bookings per
// Cal.com event type over a selectable window, with an inline ad-driven toggle on
// each row (writes the shared cal_event_type_config, same source the Meta Live tab
// + funnels read). The windowed booking count comes from useCalBookings; the full
// taggable set (incl. types with no bookings in the window) comes from
// useCalEventTypes, so a brand-new type can always be tagged.
function BookedMeetingsSection() {
  const [weeks, setWeeks] = useState(8)
  const isWeek = weeks === 'week'
  const isAllTime = weeks === 'all'
  const currentWeekKey = getWeekKey() // this week's Monday (YYYY-MM-DD)
  const days = isAllTime ? 3650 : isWeek ? 7 : weeks * 7 // fallback detail window
  const winLabel = isWeek ? 'this week' : isAllTime ? 'all time' : `${weeks}w`
  const weekSinceISO = isWeek ? new Date(`${currentWeekKey}T00:00:00`).toISOString() : null
  const cal = useCalBookings(isWeek ? { weekKey: currentWeekKey } : { days })
  const { types, loading: typesLoading, saveType } = useCalEventTypes()
  const detail = useBookedMeetingsDetail(days, weekSinceISO)
  const allTime = useCalBookingsAllTimeByType()
  // Blended CAC = total Meta ad spend over this window ÷ new customers.
  const spendSince = isAllTime ? null : (isWeek ? currentWeekKey : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10))
  const adSpend = useTotalAdSpend(spendSince)
  const queryClient = useQueryClient()
  const [savingSlug, setSavingSlug] = useState(null)
  const [drill, setDrill] = useState(null) // { slug, label } | null
  const [testBusy, setTestBusy] = useState(null)
  const [ltvMonths, setLtvMonths] = useState(LTV_LIFETIME_MONTHS) // editable for modeling (not persisted)
  const WEEK_OPTIONS = ['week', 4, 8, 12, 26, 'all']

  // Flag/unflag a booking as internal/test — backs it out of all counts.
  const markTest = async (uid, isTest) => {
    setTestBusy(uid)
    try {
      const { error } = await supabase.rpc('set_booking_test', { p_uid: uid, p_is_test: isTest })
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['booked-meetings-detail'] })
      queryClient.invalidateQueries({ queryKey: ['cal-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['cal-bookings-alltime-by-type'] })
    } catch (e) { console.error('set_booking_test failed:', e) }
    finally { setTestBusy(null) }
  }

  // All-time booked meetings per AD-DRIVEN event type (test-excluded), sorted by volume.
  const allTimeCards = useMemo(() => {
    return (types || [])
      .map(t => ({
        slug: t.slug, label: t.label || t.slug, isAdDriven: t.isAdDriven,
        count: allTime.bySlug[t.slug ?? '(none)'] || 0,
      }))
      .filter(c => c.count > 0 && c.isAdDriven)
      .sort((a, b) => b.count - a.count)
  }, [types, allTime.bySlug])
  const allTimeAdDrivenTotal = allTimeCards.reduce((n, c) => n + c.count, 0)

  // Closed Won from ad-driven (paid-attributable), test-excluded bookings in the window.
  const adDrivenSlugs = useMemo(() => new Set((types || []).filter(t => t.isAdDriven).map(t => t.slug)), [types])
  const won = useMemo(() => {
    const rws = (detail.rows || []).filter(r => !r.is_test && r.deal_status === 'Closed Won' && adDrivenSlugs.has(r.event_type_slug))
    return {
      rows: rws,
      count: rws.length,
      cash: rws.reduce((s, r) => s + (Number(r.one_time) || 0), 0),
      mrr: rws.reduce((s, r) => s + (Number(r.mrr) || 0), 0),
      // LTV = upfront cash + recurring MRR over the assumed lifetime.
      ltv: rws.reduce((s, r) => s + (Number(r.one_time) || 0) + (Number(r.mrr) || 0) * ltvMonths, 0),
    }
  }, [detail.rows, adDrivenSlugs, ltvMonths])
  const spendByCampaign = useSpendByCampaign(spendSince)
  const [tileDrill, setTileDrill] = useState(null) // 'won' | 'spend' | 'cac' | null

  // Per-booking detail grouped by event-type slug (for the drill-down modal).
  const detailBySlug = useMemo(() => {
    const m = {}
    for (const r of detail.rows || []) (m[r.event_type_slug ?? '(none)'] ||= []).push(r)
    return m
  }, [detail.rows])
  const openDrill = (r) => setDrill({ slug: r.slug, label: r.label })
  const drillRows = drill ? (detailBySlug[drill.slug ?? '(none)'] || []) : []

  // Booking count per slug (the numbers). All-time reads the RPC (test-excluded, no
  // row cap); a rolling window reads useCalBookings (also test-excluded).
  const windowCount = {}
  if (isAllTime) {
    Object.assign(windowCount, allTime.bySlug)
  } else {
    for (const et of cal.byEventType || []) windowCount[et.slug ?? '(none)'] = Number(et.count) || 0
  }

  // One row per known event type: windowed count + tagging state. Ad-driven types
  // group to the top; within each group sort by booking count (desc), then label.
  // Count-0 types stay listed (dimmed) so they're taggable.
  const rows = (types || []).map(t => ({
    slug: t.slug,
    label: t.label || t.slug,
    count: windowCount[t.slug] ?? 0,
    isAdDriven: t.isAdDriven,
    isConfigured: t.isConfigured,
    isNull: t.isNull,
  })).sort((a, b) =>
    (Number(b.isAdDriven) - Number(a.isAdDriven)) ||
    (b.count - a.count) ||
    String(a.label).localeCompare(String(b.label))
  )

  const adDrivenBooked = rows.reduce((n, r) => n + (r.isAdDriven ? r.count : 0), 0)
  const totalBooked = rows.reduce((n, r) => n + r.count, 0)
  const untaggedCount = rows.filter(r => !r.isNull && !r.isConfigured).length
  const loading = typesLoading || (isAllTime ? allTime.loading : cal.loading)

  const toggle = async (r) => {
    if (r.isNull) return
    setSavingSlug(r.slug)
    try { await saveType(r.slug, { isAdDriven: !r.isAdDriven }) }
    catch (e) { console.error('saveType failed:', e) }
    finally { setSavingSlug(null) }
  }

  return (
    <div className="space-y-6">
      {/* ---------- ALL-TIME BOOKED (per event type + total) ---------- */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-5 h-5" style={{ color: AB_BLUE }} />
          <div className="display-font text-2xl font-medium text-stone-900">All-Time Booked Meetings</div>
        </div>
        <p className="text-sm text-stone-600 mb-4">Every meeting ever booked, per <span className="font-medium">ad-driven</span> Cal.com event type. Organic and test/internal meetings are excluded.</p>
        {allTime.loading ? (
          <div className="h-[100px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : allTimeCards.length === 0 ? (
          <div className="h-[100px] flex items-center justify-center text-stone-400 text-sm">No ad-driven event types tagged yet — tag them below.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {allTimeCards.map(c => (
              <HeroStat key={c.slug || 'none'} label={c.label} value={c.count.toLocaleString()} accent={AB_BLUE} />
            ))}
            <div className="rounded-xl p-4" style={{ border: `2px solid ${AB_BLUE}`, background: 'rgba(37,99,235,0.05)' }}>
              <div className="mono-font text-[10px] uppercase tracking-widest mb-1" style={{ color: AB_BLUE }}>Total</div>
              <div className="display-font text-3xl font-medium leading-none" style={{ color: AB_BLUE }}>{allTimeAdDrivenTotal.toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: AB_BLUE }} />
            <div className="display-font text-2xl font-medium text-stone-900">Booked Meetings</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEK_OPTIONS.map(w => (
              <button key={w} onClick={() => setWeeks(w)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: weeks === w ? AB_BLUE : 'rgba(37,99,235,0.08)',
                  color: weeks === w ? 'white' : AB_BLUE,
                  border: '1px solid rgba(37,99,235,0.25)',
                }}>
                {w === 'week' ? 'This Week' : w === 'all' ? 'All-Time' : `${w}w`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <HeroStat label={`Ad-driven booked · ${winLabel}`} value={adDrivenBooked.toLocaleString()} accent={AB_BLUE} />
          <HeroStat label={`Total booked · ${winLabel}`} value={totalBooked.toLocaleString()} accent="#57534e" />
          <HeroStat label="% Ad-driven" value={totalBooked ? `${Math.round((adDrivenBooked / totalBooked) * 100)}%` : '—'} accent="#047857" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
          <HeroStat label={`New customers · ${winLabel}`} value={won.count.toLocaleString()} accent="#065F46" onClick={won.count ? () => setTileDrill('won') : undefined} />
          <HeroStat label={`Cash collected · ${winLabel}`} value={fmtWhole(won.cash)} accent="#065F46" onClick={won.count ? () => setTileDrill('won') : undefined} />
          <HeroStat label={`MRR · ${winLabel}`} value={fmtWhole(won.mrr)} accent="#065F46" onClick={won.count ? () => setTileDrill('won') : undefined} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
          <HeroStat label={`Ad spend · ${winLabel}`} value={fmtWhole(adSpend.spend)} accent="#1877F2" onClick={() => setTileDrill('spend')} />
          <HeroStat label={`CAC (blended) · ${winLabel}`} value={won.count ? fmtWhole(adSpend.spend / won.count) : '—'} accent={AB_BLUE} onClick={() => setTileDrill('cac')} />
          <HeroStat label={`LTV · ${ltvMonths}mo lifetime · ${winLabel}`} value={fmtWhole(won.ltv)} accent="#6639A6" onClick={won.count ? () => setTileDrill('ltv') : undefined} />
        </div>
        <p className="text-[11px] text-stone-400 mb-6">
          Closed Won from ad-driven booked meetings (test-excluded). CAC is blended: total Meta ad spend ÷ new customers.
          LTV = cash + MRR × {ltvMonths} months (editable in the LTV drill-down).
          {isAllTime ? ' All-time ad spend covers synced history (Meta daily data accumulates over time).' : ''}
        </p>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div className="display-font text-xl font-medium text-stone-900">By Event Type</div>
          {untaggedCount > 0 && (
            <span className="mono-font text-[9px] uppercase tracking-wider px-2 py-1 rounded" style={{ background: 'rgba(102,57,166,0.1)', color: '#6639A6' }}>
              {untaggedCount} new — needs tagging
            </span>
          )}
        </div>
        <p className="text-sm text-stone-600 mb-4">
          {isWeek ? 'Meetings booked this week' : isAllTime ? 'All meetings ever booked' : `Meetings booked in the last ${weeks} weeks`} per Cal.com event type. Tap a type’s tag to flip it between
          <span className="font-medium"> Ad-driven</span> (counts as a paid-attributable booked call) and
          <span className="font-medium"> Organic</span>. Types with no bookings {isAllTime ? '' : 'in this window '}still show so they can be tagged.
        </p>
        {loading ? (
          <div className="h-[120px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        ) : rows.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-stone-400 text-sm">No event types yet</div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const dRows = detailBySlug[r.slug ?? '(none)'] || []
              const testInSlug = dRows.filter(x => x.is_test).length
              const canDrill = dRows.length > 0 // clickable if there's anything behind it, incl. test-only
              return (
              <div key={r.slug || 'none'} className={`flex items-center justify-between gap-3 border border-stone-200 rounded-lg px-4 py-2.5 ${r.count === 0 && !testInSlug ? 'opacity-60' : ''}`}>
                <button type="button" onClick={() => openDrill(r)} disabled={!canDrill}
                  title={canDrill ? 'View the meetings behind this count' : 'No meetings in this window'}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group disabled:cursor-default">
                  <span className="display-font text-lg font-medium num-tabular w-8 text-right shrink-0" style={{ color: r.isAdDriven && r.count ? AB_BLUE : '#57534e' }}>{r.count}</span>
                  <span className={`text-sm font-medium text-stone-700 truncate ${canDrill ? 'group-hover:underline decoration-dotted decoration-stone-400 underline-offset-2' : ''}`}>{r.label}</span>
                  {testInSlug > 0 && (
                    <span className="mono-font text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,119,6,0.12)', color: '#B45309' }}>{testInSlug} test</span>
                  )}
                  {!r.isNull && !r.isConfigured && (
                    <span className="mono-font text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(102,57,166,0.1)', color: '#6639A6' }}>New</span>
                  )}
                </button>
                {r.isNull ? (
                  <span className="mono-font text-[9px] uppercase tracking-wider text-stone-300 shrink-0">No slug · not taggable</span>
                ) : (
                  <button onClick={() => toggle(r)} disabled={savingSlug === r.slug}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mono-font text-[9px] uppercase tracking-wider font-semibold transition-all disabled:opacity-50 shrink-0"
                    style={ r.isAdDriven
                      ? { background: 'rgba(37,99,235,0.1)', color: AB_BLUE, border: '1px solid rgba(37,99,235,0.3)' }
                      : { background: '#f5f5f4', color: '#78716c', border: '1px solid #e7e5e4' } }>
                    {savingSlug === r.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {r.isAdDriven ? 'Ad-driven' : 'Organic'}
                  </button>
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>

      {drill && (
        <BookedMeetingsDrilldownModal label={drill.label} rows={drillRows}
          onToggleTest={markTest} testBusy={testBusy} onClose={() => setDrill(null)} />
      )}

      {tileDrill === 'won' && (
        <BookedMeetingsDrilldownModal label={`New customers · ${winLabel}`} rows={won.rows}
          onToggleTest={markTest} testBusy={testBusy} onClose={() => setTileDrill(null)} />
      )}
      {(tileDrill === 'spend' || tileDrill === 'cac' || tileDrill === 'ltv') && (
        <EconomicsDrilldownModal mode={tileDrill} winLabel={winLabel}
          spend={adSpend.spend} customers={won.count} campaigns={spendByCampaign.campaigns}
          customerRows={won.rows} ltvMonths={ltvMonths} onLtvMonthsChange={setLtvMonths}
          loading={spendByCampaign.loading} onClose={() => setTileDrill(null)} />
      )}
    </div>
  )
}

function DerivedCell({ value, target, comparator, format, onClick }) {
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
      {onClick
        ? <button type="button" onClick={onClick} style={{ pointerEvents: 'auto' }}
            className="underline decoration-dotted decoration-stone-300 underline-offset-2 hover:decoration-stone-500 transition-colors cursor-pointer">
            {display}
          </button>
        : display}
    </td>
  )
}

function FooterDerivedCell({ value, target, comparator, format, onClick }) {
  let isGood = null
  if (value !== null && value !== undefined && !isNaN(value) && target !== undefined) {
    isGood = comparator === 'gte' ? value >= target : value <= target
  }
  const display = value === null || value === undefined ? '—'
    : format === 'pct' ? `${(value * 100).toFixed(1)}%`
    : format === 'money' ? `$${value.toFixed(2)}`
    : value.toFixed(1)
  const color = isGood === true ? '#10B981' : isGood === false ? '#F87171' : '#F59E0B'
  return (
    <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color }}>
      {onClick
        ? <button type="button" onClick={onClick} style={{ pointerEvents: 'auto' }} className="underline decoration-dotted decoration-white/40 underline-offset-2 hover:decoration-white/80 transition-colors cursor-pointer">{display}</button>
        : display}
    </td>
  )
}

// Total-row read cell (Booked/Completed/etc. on the dark footer). Clickable when
// onClick is passed — opens the drill-down for the whole week.
function FooterReadCell({ text, onClick }) {
  return (
    <td className="py-3 px-2 text-center num-tabular font-bold">
      {onClick
        ? <button type="button" onClick={onClick} style={{ pointerEvents: 'auto' }} className="underline decoration-dotted decoration-white/40 underline-offset-2 hover:decoration-white/80 transition-colors cursor-pointer">{text}</button>
        : text}
    </td>
  )
}

// ---- GA4 "Website" section (reads ga4_daily_metrics/ga4_daily_events) ----
const GA4_ORANGE = '#E8710A'

function Ga4Tile({ label, value, sub, loading }) {
  return (
    <div className="border border-stone-200 rounded-lg p-4" style={{ background: 'rgba(232,113,10,0.03)' }}>
      <div className="mono-font text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-500 mb-2">{label}</div>
      {loading
        ? <div className="h-7 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>
        : <div className="display-font text-2xl font-medium" style={{ color: GA4_ORANGE }}>{value}</div>}
      {sub && <div className="text-[10px] text-stone-400 mt-1">{sub}</div>}
    </div>
  )
}

function Ga4Section() {
  const [days, setDays] = useState(30)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncErr, setSyncErr] = useState(null)

  // Range = the 7/30/90 preset, unless a full custom From→To is set (then it wins).
  const todayStr = new Date().toISOString().split('T')[0]
  const useCustom = !!(customFrom && customTo)
  const presetFrom = new Date(); presetFrom.setDate(presetFrom.getDate() - days)
  const from = useCustom ? customFrom : presetFrom.toISOString().split('T')[0]
  const to = useCustom ? customTo : todayStr
  const rangeLabel = useCustom ? `${customFrom} → ${customTo}` : `Last ${days} days`

  const { channelRows, dailyTrend, totals, optIns, hasData, loading, error, refresh } = useGa4Metrics({ from, to }, refreshKey)

  const fmtNum = (v) => v == null ? '—' : Number(v).toLocaleString()
  const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

  const runRefresh = async () => {
    setSyncing(true); setSyncErr(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('ga4-sync')
      if (e || data?.ok === false) throw new Error(e?.message || data?.error || 'Sync failed')
      setRefreshKey(k => k + 1); refresh()
    } catch (err) { setSyncErr(err.message || 'Sync failed') } finally { setSyncing(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header + period + refresh */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5" style={{ color: GA4_ORANGE }} />
            <div>
              <div className="display-font text-2xl font-medium text-stone-900">Website (GA4)</div>
              <p className="text-sm text-stone-600 mt-1">Google Analytics 4 — sessions, users, opt-ins, and traffic by channel. Synced daily.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { setDays(d); setCustomFrom(''); setCustomTo('') }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: (!useCustom && days === d) ? GA4_ORANGE : 'rgba(232,113,10,0.08)',
                  color: (!useCustom && days === d) ? 'white' : GA4_ORANGE,
                  border: '1px solid rgba(232,113,10,0.25)',
                }}>
                {d} Days
              </button>
            ))}
            {/* Custom date range — takes over from the pills once both dates are set */}
            <input type="date" value={customFrom} max={customTo || todayStr}
              onChange={e => setCustomFrom(e.target.value)} title="Custom range — from"
              className="px-2 py-1 text-xs rounded-full border outline-none transition-all"
              style={{ borderColor: useCustom ? GA4_ORANGE : '#e7e5e4', color: '#57534e' }} />
            <span className="text-stone-400 text-xs">–</span>
            <input type="date" value={customTo} min={customFrom} max={todayStr}
              onChange={e => setCustomTo(e.target.value)} title="Custom range — to"
              className="px-2 py-1 text-xs rounded-full border outline-none transition-all"
              style={{ borderColor: useCustom ? GA4_ORANGE : '#e7e5e4', color: '#57534e' }} />
            <button onClick={runRefresh} disabled={syncing} title="Pull the latest from GA4"
              className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-stone-200 text-stone-600 hover:border-stone-400 transition-all disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        {syncErr && <div className="text-xs text-red-600 mt-2">{syncErr}</div>}

        {!loading && !hasData ? (
          <div className="mt-6 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded">
            No GA4 data yet. Once the service-account credentials are set and the first sync runs, sessions / users / opt-ins will appear here.
          </div>
        ) : (
          <>
            <div className="mono-font text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mt-6 mb-3">{rangeLabel}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Ga4Tile label="Sessions" value={fmtNum(totals?.sessions)} sub="Total sessions" loading={loading} />
              <Ga4Tile label="Active Users" value={fmtNum(totals?.activeUsers)} sub="Sum of daily active users" loading={loading} />
              <Ga4Tile label="Opt-in Rate" value={fmtPct(totals?.optInRate)} sub="Session key-event rate" loading={loading} />
            </div>

            <div className="mono-font text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-400 mt-8 mb-3">Opt-ins</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Ga4Tile label="Voice clone" value={fmtNum(optIns.voice_clone_optin)} sub="voice_clone_optin" loading={loading} />
              <Ga4Tile label="iMessage clone" value={fmtNum(optIns.imessage_clone_optin)} sub="imessage_clone_optin" loading={loading} />
              <Ga4Tile label="Demo booked" value={fmtNum(optIns.demo_booked)} sub="demo_booked" loading={loading} />
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded">
          Couldn’t load GA4 data. The <code>ga4_daily_metrics</code> tables may not be created yet, or you may not have access.
        </div>
      )}

      {hasData && (
        <>
          {/* Sessions over time */}
          <div className="bg-white border border-stone-200 p-6">
            <div className="display-font text-xl font-medium text-stone-900 mb-1">Sessions Over Time</div>
            <p className="text-sm text-stone-600 mb-4">Daily sessions across all channels.</p>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9c96a8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#9c96a8' }} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} />
                  <Area type="monotone" dataKey="sessions" name="Sessions" stroke={GA4_ORANGE} fill="rgba(232,113,10,0.12)" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Traffic by channel */}
          <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
            <div className="display-font text-xl font-medium text-stone-900 mb-1">Traffic by Channel</div>
            <p className="text-sm text-stone-600 mb-4">Sessions, users, and key events by default channel group ({rangeLabel.toLowerCase()}).</p>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Channel</th>
                  <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Sessions</th>
                  <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Active Users</th>
                  <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Key Events</th>
                  <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Opt-in Rate</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map(c => (
                  <tr key={c.channel} className="border-b border-stone-100">
                    <td className="py-2 px-3 font-medium text-stone-800 text-xs">{c.channel}</td>
                    <td className="py-2 px-2 text-center num-tabular text-xs text-stone-700">{c.sessions.toLocaleString()}</td>
                    <td className="py-2 px-2 text-center num-tabular text-xs text-stone-700">{c.activeUsers.toLocaleString()}</td>
                    <td className="py-2 px-2 text-center num-tabular text-xs text-stone-700">{c.keyEvents.toLocaleString()}</td>
                    <td className="py-2 px-2 text-center num-tabular text-xs text-stone-500">{(c.rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ width: '100%', height: 260 }} className="mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0eef5" vertical={false} />
                  <XAxis dataKey="channel" tick={{ fontSize: 10, fill: '#9c96a8' }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: '#9c96a8' }} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }} />
                  <Bar dataKey="sessions" name="Sessions" fill={GA4_ORANGE} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)

  // Ad Spend + Paid Leads for the month, straight from Meta (meta_ads_daily) — so
  // MTD is accurate for the whole month regardless of which weeks got persisted.
  const [metaMonth, setMetaMonth] = useState(null) // { spend, leads } or null when Meta has no rows
  useEffect(() => {
    let cancelled = false
    const [y, m] = monthKey.split('-').map(Number)
    const start = `${monthKey}-01`
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // last day of the month
    supabase
      .from('meta_ads_daily')
      .select('spend, actions')
      .gte('date_start', start)
      .lte('date_start', end)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) { setMetaMonth(null); return }
        let spend = 0, leads = 0
        for (const r of data) {
          spend += Number(r.spend) || 0
          const lead = (r.actions || []).find(a => a.action_type === 'lead')
          if (lead) leads += Number(lead.value) || 0
        }
        setMetaMonth({ spend: Math.round(spend * 100) / 100, leads: Math.round(leads) })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])

  // Multi-month trend for the "Monthly Overview" chart (Ad Spend + Paid Leads),
  // pulled from Meta. Selector controls how many trailing months to show.
  const [chartMonths, setChartMonths] = useState(6)
  const [monthlyTrend, setMonthlyTrend] = useState([])
  useEffect(() => {
    let cancelled = false
    const [y, m] = monthKey.split('-').map(Number)
    const startD = new Date(Date.UTC(y, m - 1 - (chartMonths - 1), 1))
    const startStr = startD.toISOString().slice(0, 10)
    const endStr = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    supabase
      .from('meta_ads_daily')
      .select('date_start, spend, actions')
      .gte('date_start', startStr)
      .lte('date_start', endStr)
      .then(({ data, error }) => {
        if (cancelled) return
        const byMonth = {}
        for (const r of (error ? [] : data || [])) {
          if (!r.date_start) continue
          const mk = r.date_start.slice(0, 7)
          const agg = (byMonth[mk] ||= { adSpend: 0, leads: 0 })
          agg.adSpend += Number(r.spend) || 0
          const lead = (r.actions || []).find(a => a.action_type === 'lead')
          if (lead) agg.leads += Number(lead.value) || 0
        }
        const out = []
        for (let i = 0; i < chartMonths; i++) {
          const d = new Date(Date.UTC(y, m - 1 - (chartMonths - 1) + i, 1))
          const mk = d.toISOString().slice(0, 7)
          const agg = byMonth[mk] || { adSpend: 0, leads: 0 }
          out.push({
            label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            adSpend: Math.round(agg.adSpend),
            leads: agg.leads,
            cpl: agg.leads > 0 ? agg.adSpend / agg.leads : null,
          })
        }
        setMonthlyTrend(out)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, chartMonths])

  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><RocketLoader className="min-h-[160px]" label="Loading…" /></div>

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

  // Meta is authoritative for ad spend + paid leads (matches the Daily Funnel).
  const adSpend = metaMonth ? metaMonth.spend : totals.adSpend
  const leads   = metaMonth ? metaMonth.leads : totals.leads

  const mtdOptin    = totals.websiteVisitors > 0 ? (totals.optins / totals.websiteVisitors) * 100 : null
  const mtdCpl      = leads > 0 ? adSpend / leads : null
  const mtdSqlRate  = leads > 0 ? (totals.sqls / leads) * 100 : null
  const mtdBooking  = leads > 0 ? (totals.demosBooked / leads) * 100 : null
  const mtdCpd      = totals.demosBooked > 0 ? adSpend / totals.demosBooked : null
  const mtdCac      = totals.newCustomers > 0 ? adSpend / totals.newCustomers : null

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
        <div className="text-sm text-stone-600 mb-4">
          {formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data
          {metaMonth ? ' · Ad Spend, CPL & Paid-Lead rates are live from Meta' : ''}
        </div>
        <MtdLegend />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MtdCard label="Organic Leads"        value={totals.organicLeads}     target={targets.organic_leads} />
          <MtdCard label="Paid Leads"           value={leads}                   target={targets.paid_leads ?? null} help={metaMonth ? 'Live from Meta this month' : undefined} />
          <MtdCard label="Website Visitors"     value={totals.websiteVisitors}  target={targets.website_visitors} />
          <MtdCard label="Opt-in Rate"          value={mtdOptin}                target={targets.optin_rate} unit="pct" />
          <MtdCard label="Cost Per Lead"        value={mtdCpl}                  target={targets.cpl} unit="money" />
          <MtdCard label="Lead → SQL Rate"      value={mtdSqlRate}              target={targets.lead_sql_rate} unit="pct" />
          <MtdCard label="Cost Per Booked Demo" value={mtdCpd}                  target={targets.cost_per_demo} unit="money" />
          <MtdCard label="CAC (blended)"        value={mtdCac}                  target={targets.cac} unit="money" />
          <MtdCard label="Booking Rate"         value={mtdBooking}              target={targets.booking_rate} unit="pct" />
          <MtdCard label="Ad Spend"             value={adSpend}                 target={null} unit="money" help={metaMonth ? 'Live from Meta this month' : 'Track vs. monthly ad budget'} />
        </div>
      </div>

      {/* Monthly Overview — Ad Spend vs Paid Leads per month, live from Meta. */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
          <div className="display-font text-2xl font-medium text-stone-900">Monthly Overview</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[3, 6, 12, 24].map(n => (
              <button key={n} onClick={() => setChartMonths(n)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: chartMonths === n ? AB_BLUE : 'rgba(37,99,235,0.08)',
                  color: chartMonths === n ? 'white' : AB_BLUE,
                  border: '1px solid rgba(37,99,235,0.25)',
                }}>
                {n}m
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-stone-600 mt-1">
          Ad Spend vs Paid Leads per month, live from Meta. Cost-per-lead shows in the tooltip.
        </p>
        <div className="h-[300px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="spend" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11 }} />
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4' }}
                formatter={(v, name) => {
                  if (name === 'Ad Spend') return [`$${Math.round(Number(v)).toLocaleString()}`, name]
                  if (name === 'CPL') return [v == null ? '—' : `$${Number(v).toFixed(2)}`, name]
                  return [Number(v).toLocaleString(), name]
                }}
              />
              <Bar yAxisId="spend" dataKey="adSpend" name="Ad Spend" fill="#93C5FD" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="leads" dataKey="leads" name="Paid Leads" fill="#10B981" radius={[3, 3, 0, 0]} />
              {/* CPL carried for the tooltip only (transparent so it doesn't clutter the axes). */}
              <Line yAxisId="leads" dataKey="cpl" name="CPL" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
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

function ChannelsSection({ weekData, update, weekKey }) {
  const setCh = (chKey, key, value) => update(d => ({
    ...d, channels: { ...d.channels, [chKey]: { ...d.channels[chKey], [key]: Number(value) || 0 } },
  }))

  // Meta channel — pull spend / impressions / clicks / leads live for the week
  // (read-only). Other channels stay manual (no integration). Display-only:
  // weekData.channels isn't consumed anywhere else, so no need to persist.
  const [metaWeek, setMetaWeek] = useState(null)
  useEffect(() => {
    let cancelled = false
    const [y, m, d] = weekKey.split('-').map(Number)
    const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 6)
    const endStr = end.toISOString().slice(0, 10)
    supabase
      .from('meta_ads_daily')
      .select('spend, impressions, inline_link_clicks, actions')
      .gte('date_start', weekKey)
      .lte('date_start', endStr)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) { setMetaWeek(null); return }
        let spend = 0, impressions = 0, clicks = 0, leads = 0
        for (const r of data) {
          spend += Number(r.spend) || 0
          impressions += Number(r.impressions) || 0
          clicks += Number(r.inline_link_clicks) || 0
          const lead = (r.actions || []).find(a => a.action_type === 'lead')
          if (lead) leads += Number(lead.value) || 0
        }
        setMetaWeek({ spend: Math.round(spend * 100) / 100, impressions, clicks, leads })
      })
    return () => { cancelled = true }
  }, [weekKey])

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Channel breakdown</div>
      <p className="text-sm text-stone-600 mb-6">
        Weekly totals per channel.
        <span className="text-stone-400"> Meta’s Spend / Impressions / Clicks / Leads are pulled live from Meta (read-only); other channels are entered manually.</span>
      </p>
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
            // For Meta, override spend/impressions/clicks/leads with the live values.
            const eff = (ch.key === 'meta' && metaWeek)
              ? { ...data, spend: metaWeek.spend, impressions: metaWeek.impressions, clicks: metaWeek.clicks, leads: metaWeek.leads }
              : data
            const autoKeys = (ch.key === 'meta' && metaWeek) ? ['spend', 'impressions', 'clicks', 'leads'] : []
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
                    {autoKeys.includes(k)
                      ? <span className="num-tabular text-sm text-stone-700" title="Live from Meta">
                          {k === 'spend' ? fmtWhole(eff[k]) : (Number(eff[k]) || 0).toLocaleString()}
                        </span>
                      : <input type="number" min="0" step="any" value={data[k] || ''} onChange={(e) => setCh(ch.key, k, e.target.value)}
                          className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />}
                  </td>
                ))}
                <DerivedCell value={ctr(eff.clicks, eff.impressions)} target={0.05} comparator="gte" format="pct" />
                <DerivedCell value={cpl(eff.spend, eff.leads)} target={5} comparator="lte" format="money" />
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
  const [callsOpen, setCallsOpen] = useState(false)
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
          <MetaTile label="Paid Booked Calls" value={fmtNum(cal.paidCount)} sub="Atlas Blue (ad-driven) · click to view" loading={cal.loading} onClick={() => setCallsOpen(true)} />
          <MetaTile label="Cost / Booked Call" value={fmtMoney(costPerBookedCall)} sub="Spend ÷ Atlas Blue calls" loading={cal.loading || meta.loading} />
          <MetaTile label="Organic Booked Calls" value={fmtNum(cal.organicCount)} sub="Non-ad bookings" loading={cal.loading} />
          <MetaTile label="Total Booked Calls" value={fmtNum(cal.bookedCalls)} sub="All bookings (via Cal.com)" loading={cal.loading} />
        </div>
        {callsOpen && <PaidCallsBreakdownModal days={presetToDays[preset] ?? 30} onClose={() => setCallsOpen(false)} />}
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

function MetaTile({ label, value, sub, loading, onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  const props = onClick
    ? { type: 'button', onClick, className: 'border border-stone-200 rounded-lg p-4 text-left w-full hover:border-stone-400 hover:shadow-sm transition-all cursor-pointer' }
    : { className: 'border border-stone-200 rounded-lg p-4' }
  return (
    <Wrapper {...props} style={{ background: 'rgba(24,119,242,0.02)' }}>
      <div className="mono-font text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-500 mb-2">{label}</div>
      {loading ? (
        <div className="h-7 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>
      ) : (
        <div className="display-font text-2xl font-medium" style={{ color: META_BLUE }}>{value}</div>
      )}
      {sub && <div className="text-[10px] text-stone-400 mt-1">{sub}</div>}
    </Wrapper>
  )
}

// Drill-down for the "Paid Booked Calls" tile — lists the ad-driven bookings
// (per host, expandable to the individual customers) for the selected window.
function PaidCallsBreakdownModal({ days, onClose }) {
  const { rows, total, loading } = useCalBookingsByRep({ days, filter: 'paid' })
  return (
    <BreakdownModal
      title="Paid Booked Calls"
      subtitle="Ad-driven (Atlas Blue) bookings in this window, by host"
      rows={rows}
      total={total}
      loading={loading}
      onClose={onClose}
    />
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
