import React, { useState, useMemo } from 'react'
import { Loader2, BarChart3, Layers, FlaskConical, FileText, Users, DollarSign, TrendingUp, Plus, Trash2, Calendar } from 'lucide-react'
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
  const weekKey = useMemo(() => propWeekKey || getWeekKey(), [propWeekKey])
  const monthKey = useMemo(() => getMonthKey(), [])
  const { weekData, loading, saving, savedAt, update } = useScorecard(profile.id, weekKey, BLANK_GROWTH_WEEK)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('funnel')

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
    { id: 'monthly',     label: 'Monthly View',  icon: Calendar },
    { id: 'channels',    label: 'Channels',      icon: Layers },
    { id: 'experiments', label: 'Experiments',   icon: FlaskConical },
    { id: 'notes',       label: 'Notes',         icon: FileText },
  ]

  return (
    <ScorecardShell profile={profile} weekKey={weekKey} saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
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

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'funnel' && <FunnelSection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} totals={totals} />}
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
