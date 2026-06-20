import React, { useState, useMemo } from 'react'
import { Megaphone, Layers, Image, FileText, DollarSign, MousePointerClick, Users, Plus, Trash2, Calendar } from 'lucide-react'
import { useScorecard } from './useScorecard'
import RocketLoader from './RocketLoader'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_AD_WEEK, AD_CHANNELS, CAMPAIGN_STATUSES, CREATIVE_STATUSES, newId } from './roleConstants'
import { cpm, ctr, cpc, cpl, optinRate } from './metrics'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'
import ScorecardShell, {
  NorthStarTile, SectionTabs, PageHeader
} from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

export default function AdStrategistView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated, weekKey: propWeekKey }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const {
    weekData, loading, saving, savedAt, update,
    weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey,
    submittedAt, isLocked, submit, unsubmit, submitting,
  } = useScorecard(profile.id, propWeekKey, BLANK_AD_WEEK)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('daily')

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
      impressions:     acc.impressions + (Number(d.impressions) || 0),
      clicks:          acc.clicks + (Number(d.clicks) || 0),
      leads:           acc.leads + (Number(d.leads) || 0),
    }
  }, { adSpend: 0, websiteVisitors: 0, optins: 0, impressions: 0, clicks: 0, leads: 0 })

  const overallCpl = cpl(totals.adSpend, totals.leads)
  const overallCtr = ctr(totals.clicks, totals.impressions)
  const overallCpm = cpm(totals.adSpend, totals.impressions)

  const sections = [
    { id: 'daily',     label: 'Daily Performance',  icon: Megaphone },
    { id: 'campaigns', label: 'Active Campaigns',   icon: Layers },
    { id: 'creatives', label: 'Creative Tests',     icon: Image },
    { id: 'monthly',   label: 'Monthly View',       icon: Calendar },
    { id: 'notes',     label: 'Notes',              icon: FileText },
  ]

  return (
    <ScorecardShell
      profile={profile} weekKey={weekKey} setWeekKey={setWeekKey}
      isExecDrillIn={isExecDrillIn} isViewingCurrentWeek={isViewingCurrentWeek} currentWeekKey={currentWeekKey}
      submittedAt={submittedAt} isLocked={isLocked} submit={submit} unsubmit={unsubmit} submitting={submitting}
      saving={saving} savedAt={savedAt} onSwitchToFeatureRequests={onSwitchToFeatureRequests} onSwitchToIntegrations={onSwitchToIntegrations} onSwitchToCancellations={onSwitchToCancellations} onSwitchToApiGuide={onSwitchToApiGuide} onSwitchToLeadership={onSwitchToLeadership}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Ad Strategist · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#BE185D"
        title="How was"
        italicized={`your week, ${profile.name.split(' ')[0]}?`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile
          label="CPL"
          value={overallCpl !== null ? `$${overallCpl.toFixed(2)}` : '—'}
          sublabel={overallCpl !== null ? (overallCpl <= 5 ? '✓ At/below $5 target' : '↑ Above $5 target') : 'Awaiting data'}
          color="#BE185D"
          icon={DollarSign}
        />
        <NorthStarTile
          label="CTR"
          value={overallCtr !== null ? `${(overallCtr * 100).toFixed(2)}%` : '—'}
          sublabel={overallCtr !== null ? (overallCtr >= 0.05 ? '✓ At/above 5% target' : '↓ Below 5% target') : 'Awaiting data'}
          color="#1C1917"
          icon={MousePointerClick}
        />
        <NorthStarTile
          label="CPM"
          value={overallCpm !== null ? `$${overallCpm.toFixed(2)}` : '—'}
          sublabel={overallCpm !== null ? (overallCpm <= 10 ? '✓ At/below $10 target' : '↑ Above $10 target') : 'Awaiting data'}
          color="#0F766E"
          icon={Users}
        />
      </div>

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'daily' && <DailySection weekData={weekData} update={update} workDayIdxs={workDayIdxs} weekKey={weekKey} totals={totals} />}
        {section === 'campaigns' && <CampaignsSection weekData={weekData} update={update} />}
        {section === 'creatives' && <CreativesSection weekData={weekData} update={update} />}
        {section === 'monthly' && <AdMonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
        {section === 'notes' && <NotesSection weekData={weekData} update={update} />}
      </div>
    </ScorecardShell>
  )
}

function DailySection({ weekData, update, workDayIdxs, weekKey, totals }) {
  const setCell = (dayIdx, key, value) => update(d => ({
    ...d,
    daily: d.daily.map((day, i) => i === dayIdx ? { ...day, [key]: Number(value) || 0 } : day),
  }))

  const monday = useMemo(() => new Date(weekKey + 'T00:00:00'), [weekKey])
  const dateFor = (dayIdx) => {
    const d = new Date(monday); d.setDate(monday.getDate() + (dayIdx - 1)); return d
  }

  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Daily ad performance</div>
      <p className="text-sm text-stone-600 mb-6">
        Targets: CPM <strong>$10</strong> · CTR <strong>5%</strong> · CPL <strong>$5</strong>
      </p>
      <table className="w-full text-sm min-w-[800px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Day</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Spend</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Impressions</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Clicks</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Leads</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CPM</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CTR</th>
            <th className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium">CPC</th>
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
                <td className="py-2 px-2 text-center">
                  <div className="flex items-center justify-center">
                    <span className="text-[10px] text-stone-400 mr-0.5">$</span>
                    <input type="number" min="0" step="any" value={day.adSpend || ''} onChange={(e) => setCell(dayIdx, 'adSpend', e.target.value)}
                      className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.impressions || ''} onChange={(e) => setCell(dayIdx, 'impressions', e.target.value)}
                    className="w-24 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.clicks || ''} onChange={(e) => setCell(dayIdx, 'clicks', e.target.value)}
                    className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <td className="py-2 px-2 text-center">
                  <input type="number" min="0" value={day.leads || ''} onChange={(e) => setCell(dayIdx, 'leads', e.target.value)}
                    className="w-20 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm" />
                </td>
                <DerivedCell value={cpm(day.adSpend, day.impressions)} target={10} comparator="lte" format="money" />
                <DerivedCell value={ctr(day.clicks, day.impressions)} target={0.05} comparator="gte" format="pct" />
                <DerivedCell value={cpc(day.adSpend, day.clicks)} format="money" />
                <DerivedCell value={cpl(day.adSpend, day.leads)} target={5} comparator="lte" format="money" />
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">${totals.adSpend.toLocaleString()}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.impressions.toLocaleString()}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.clicks.toLocaleString()}</td>
            <td className="py-3 px-2 text-center num-tabular font-bold">{totals.leads.toLocaleString()}</td>
            <FooterDerivedCell value={cpm(totals.adSpend, totals.impressions)} target={10} comparator="lte" format="money" />
            <FooterDerivedCell value={ctr(totals.clicks, totals.impressions)} target={0.05} comparator="gte" format="pct" />
            <FooterDerivedCell value={cpc(totals.adSpend, totals.clicks)} format="money" />
            <FooterDerivedCell value={cpl(totals.adSpend, totals.leads)} target={5} comparator="lte" format="money" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DerivedCell({ value, target, comparator, format }) {
  let isGood = null
  if (target !== undefined && value !== null && value !== undefined && !isNaN(value)) {
    isGood = comparator === 'gte' ? value >= target : value <= target
  }
  const display = value === null || value === undefined ? '—'
    : format === 'pct' ? `${(value * 100).toFixed(2)}%`
    : format === 'money' ? `$${value.toFixed(2)}`
    : value.toFixed(2)
  return (
    <td className={`py-2 px-2 text-center num-tabular text-xs ${isGood === true ? 'text-emerald-700 font-semibold' : isGood === false ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>
      {display}
    </td>
  )
}

function FooterDerivedCell({ value, target, comparator, format }) {
  let isGood = null
  if (target !== undefined && value !== null && value !== undefined && !isNaN(value)) {
    isGood = comparator === 'gte' ? value >= target : value <= target
  }
  const display = value === null || value === undefined ? '—'
    : format === 'pct' ? `${(value * 100).toFixed(2)}%`
    : format === 'money' ? `$${value.toFixed(2)}`
    : value.toFixed(2)
  const color = isGood === true ? '#10B981' : isGood === false ? '#F87171' : '#F59E0B'
  return <td className="py-3 px-2 text-center num-tabular font-bold" style={{ color }}>{display}</td>
}

function CampaignsSection({ weekData, update }) {
  const camps = weekData.campaigns || []
  const addCamp = () => update(d => ({
    ...d, campaigns: [...(d.campaigns || []), { id: newId('c'), name: '', channel: 'Meta', status: 'Active', spend: 0, leads: 0 }],
  }))
  const updateCamp = (id, patch) => update(d => ({
    ...d, campaigns: d.campaigns.map(c => c.id === id ? { ...c, ...patch } : c),
  }))
  const removeCamp = (id) => update(d => ({ ...d, campaigns: d.campaigns.filter(c => c.id !== id) }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Active campaigns</div>
          <p className="text-sm text-stone-600 mt-1">Track each running campaign with spend, leads, and CPL.</p>
        </div>
        <button onClick={addCamp} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add campaign
        </button>
      </div>

      {camps.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No campaigns tracked</div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Campaign</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Channel</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Status</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">Spend</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[80px]">Leads</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-emerald-700 font-medium w-[80px]">CPL</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {camps.map(c => {
                const cplValue = cpl(c.spend, c.leads)
                return (
                  <tr key={c.id} className="border-b border-stone-100">
                    <td className="py-2 px-3">
                      <input value={c.name} onChange={(e) => updateCamp(c.id, { name: e.target.value })}
                        placeholder="Campaign name"
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                    </td>
                    <td className="py-2 px-3">
                      <select value={c.channel} onChange={(e) => updateCamp(c.id, { channel: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                        {AD_CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select value={c.status} onChange={(e) => updateCamp(c.id, { status: e.target.value })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                        {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="any" value={c.spend || ''} onChange={(e) => updateCamp(c.id, { spend: Number(e.target.value) || 0 })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" value={c.leads || ''} onChange={(e) => updateCamp(c.id, { leads: Number(e.target.value) || 0 })}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
                    </td>
                    <td className={`py-2 px-3 text-right num-tabular text-sm font-semibold ${cplValue !== null && cplValue <= 5 ? 'text-emerald-700' : cplValue !== null ? 'text-red-700' : 'text-stone-400'}`}>
                      {cplValue !== null ? `$${cplValue.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => removeCamp(c.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CreativesSection({ weekData, update }) {
  const creatives = weekData.creatives || []
  const addCr = () => update(d => ({
    ...d, creatives: [...(d.creatives || []), { id: newId('cr'), name: '', status: 'Testing', ctr: 0, notes: '' }],
  }))
  const updateCr = (id, patch) => update(d => ({
    ...d, creatives: d.creatives.map(c => c.id === id ? { ...c, ...patch } : c),
  }))
  const removeCr = (id) => update(d => ({ ...d, creatives: d.creatives.filter(c => c.id !== id) }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Creative tests</div>
          <p className="text-sm text-stone-600 mt-1">Track which ad creatives are winning, killed, or still testing.</p>
        </div>
        <button onClick={addCr} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add creative
        </button>
      </div>

      {creatives.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No creatives tracked</div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Creative name</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[110px]">Status</th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[100px]">CTR (%)</th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Notes</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {creatives.map(c => (
                <tr key={c.id} className={`border-b border-stone-100 ${c.status === 'Killed' ? 'opacity-60' : ''}`}>
                  <td className="py-2 px-3">
                    <input value={c.name} onChange={(e) => updateCr(c.id, { name: e.target.value })}
                      placeholder="Creative or hook"
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                  </td>
                  <td className="py-2 px-3">
                    <select value={c.status} onChange={(e) => updateCr(c.id, { status: e.target.value })}
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                      {CREATIVE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input type="number" min="0" step="0.01" value={c.ctr || ''} onChange={(e) => updateCr(c.id, { ctr: Number(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-sm text-right" />
                  </td>
                  <td className="py-2 px-3">
                    <input value={c.notes || ''} onChange={(e) => updateCr(c.id, { notes: e.target.value })}
                      placeholder="Why winning/killed?"
                      className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm" />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => removeCr(c.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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

function NotesSection({ weekData, update }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Notes for the week</div>
      <p className="text-sm text-stone-600 mb-4">Audience insights, channel issues, things you'd want to remember.</p>
      <textarea rows={10} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
        placeholder="What's working at the top of funnel? What's not? Audience or platform changes?"
        className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
    </div>
  )
}

function AdMonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><RocketLoader className="min-h-[160px]" label="Loading…" /></div>

  const totals = weeks.reduce((acc, w) => {
    for (const d of (w.data?.daily || [])) {
      acc.adSpend += Number(d.adSpend) || 0
      acc.websiteVisitors += Number(d.websiteVisitors) || 0
      acc.optins += Number(d.optins) || 0
      acc.impressions += Number(d.impressions) || 0
      acc.clicks += Number(d.clicks) || 0
      acc.leads += Number(d.leads) || 0
    }
    return acc
  }, { adSpend: 0, websiteVisitors: 0, optins: 0, impressions: 0, clicks: 0, leads: 0 })

  const mtdCpl = totals.leads > 0 ? totals.adSpend / totals.leads : null
  const mtdCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null
  const mtdCpm = totals.impressions > 0 ? (totals.adSpend * 1000) / totals.impressions : null
  const mtdOptin = totals.websiteVisitors > 0 ? (totals.optins / totals.websiteVisitors) * 100 : null

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
      <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
      <MtdLegend />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MtdCard label="CPL"           value={mtdCpl}    target={targets.cpl} unit="money" />
        <MtdCard label="CTR"           value={mtdCtr}    target={targets.ctr} unit="pct" />
        <MtdCard label="CPM"           value={mtdCpm}    target={targets.cpm} unit="money" />
        <MtdCard label="Opt-in Rate"   value={mtdOptin}  target={targets.optin_rate} unit="pct" />
        <MtdCard label="Total Leads"   value={totals.leads}    target={null} />
        <MtdCard label="Total Spend"   value={totals.adSpend}  target={null} unit="money" />
      </div>
    </div>
  )
}
