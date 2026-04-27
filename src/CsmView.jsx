import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Phone, Users, TrendingUp, Quote, Activity, LogOut, LayoutDashboard,
  Award, Clock, Loader2, Check
} from 'lucide-react'
import { supabase } from './supabase'
import { BLANK_WEEK, sum, fmt, DAYS, CALL_CATEGORIES, PIPELINE_STAGES } from './constants'
import { getWeekKey, formatWeekLabel } from './dateUtils'

export default function CsmView({ profile, onSignOut, onSwitchToManager }) {
  const [section, setSection] = useState('calls')
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const weekKey = useMemo(() => getWeekKey(), [])

  // Load current week's data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('weekly_scorecards')
      .select('data')
      .eq('user_id', profile.id)
      .eq('week_key', weekKey)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Load error', error)
        setWeekData(data?.data || BLANK_WEEK())
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [profile.id, weekKey])

  // Auto-save with debounce
  const save = useCallback(async (newData) => {
    setSaving(true)
    const { error } = await supabase
      .from('weekly_scorecards')
      .upsert({
        user_id: profile.id,
        week_key: weekKey,
        data: newData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_key' })
    setSaving(false)
    if (error) {
      console.error('Save error', error)
    } else {
      setSavedAt(new Date())
    }
  }, [profile.id, weekKey])

  useEffect(() => {
    if (!weekData || loading) return
    const t = setTimeout(() => save(weekData), 800)
    return () => clearTimeout(t)
  }, [weekData, loading, save])

  if (loading || !weekData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>
  }

  const update = (updater) => setWeekData(prev => updater(prev))
  const setCall = (cat, dayIdx, value) => update(d => ({ ...d, calls: { ...d.calls, [cat]: d.calls[cat].map((v, i) => i === dayIdx ? Number(value) || 0 : v) } }))
  const setPipeline = (key, value) => update(d => ({ ...d, pipeline: { ...d.pipeline, [key]: Number(value) || 0 } }))
  const setField = (key, value) => update(d => ({ ...d, [key]: value }))
  const setTtfv = (k, v) => update(d => ({ ...d, ttfv: { ...d.ttfv, [k]: Number(v) || 0 } }))
  const setRetention = (k, v) => update(d => ({ ...d, retention: { ...d.retention, [k]: v } }))

  const callsByDay = DAYS.map((_, dayIdx) => sum(CALL_CATEGORIES.map(c => weekData.calls[c.key][dayIdx])))
  const totalCalls = sum(callsByDay)
  const ttfvTotal = (Number(weekData.ttfv.stage1) || 0) + (Number(weekData.ttfv.stage2) || 0) + (Number(weekData.ttfv.stage3) || 0)
  const totalClients = PIPELINE_STAGES.reduce((s, p) => s + (weekData.pipeline[p.key] || 0), 0)

  const sections = [
    { id: 'calls', label: 'Daily Calls', icon: Phone },
    { id: 'pipeline', label: 'Pipeline', icon: Users },
    { id: 'launches', label: 'Launches & TTFV', icon: TrendingUp },
    { id: 'testimonials', label: 'Testimonials', icon: Quote },
    { id: 'retention', label: 'Retention', icon: Activity },
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: profile.color, fontFamily: 'Fraunces, serif' }}>
              {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">{profile.name}</div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{profile.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator saving={saving} savedAt={savedAt} />
            {onSwitchToManager && (
              <button onClick={onSwitchToManager} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <LayoutDashboard className="w-4 h-4" /> Manager view
              </button>
            )}
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10 fade-up">
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">
            Weekly Scorecard · Week of {formatWeekLabel(weekKey)}
          </div>
          <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
            How was <em className="font-light">your week,</em><br />{profile.name.split(' ')[0]}?
          </h1>
        </div>

        {/* North Star tiles */}
        <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
          <NorthStarTile label="Launched This Week" value={weekData.launchedThisWeek} sublabel="North star metric" color="#0F766E" icon={Award} />
          <NorthStarTile
            label="Avg Time-to-First-Value"
            value={ttfvTotal || '—'}
            unit={ttfvTotal ? 'days' : ''}
            sublabel={ttfvTotal ? (ttfvTotal <= 14 ? '✓ Under 14-day goal' : '↑ Above 14-day goal') : 'Enter stage times below'}
            color="#1C1917"
            icon={Clock}
          />
          <NorthStarTile label="Testimonials This Month" value={weekData.testimonialsThisMonth} sublabel={(weekData.testimonialsThisMonth >= 1 ? '✓' : '○') + ' Target: 1 / month'} color="#7C3AED" icon={Quote} />
        </div>

        {/* Section nav */}
        <div className="flex flex-wrap gap-2 mb-8 fade-up" style={{ animationDelay: '120ms' }}>
          {sections.map(s => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm transition-all ${active ? 'bg-stone-900 text-stone-50' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-900'}`}>
                <Icon className="w-4 h-4" /> {s.label}
              </button>
            )
          })}
        </div>

        {/* Section content */}
        <div className="fade-up" style={{ animationDelay: '160ms' }}>
          {section === 'calls' && <CallsSection weekData={weekData} setCall={setCall} totalCalls={totalCalls} callsByDay={callsByDay} />}
          {section === 'pipeline' && <PipelineSection weekData={weekData} setPipeline={setPipeline} totalClients={totalClients} />}
          {section === 'launches' && <LaunchesSection weekData={weekData} setField={setField} setTtfv={setTtfv} ttfvTotal={ttfvTotal} />}
          {section === 'testimonials' && <TestimonialsSection weekData={weekData} setField={setField} />}
          {section === 'retention' && <RetentionSection weekData={weekData} setRetention={setRetention} />}
        </div>
      </div>
    </div>
  )
}

// ---------- Sub-components ----------

function SaveIndicator({ saving, savedAt }) {
  if (saving) return <div className="flex items-center gap-1.5 text-xs text-stone-500 px-2"><Loader2 className="w-3 h-3 animate-spin" /> Saving</div>
  if (savedAt) return <div className="flex items-center gap-1.5 text-xs text-emerald-700 px-2"><Check className="w-3 h-3" /> Saved</div>
  return null
}

function NorthStarTile({ label, value, unit, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-5xl font-medium text-stone-900 num-tabular leading-none">
        {value}
        {unit && <span className="text-xl text-stone-400 ml-2 font-normal">{unit}</span>}
      </div>
      <div className="text-xs text-stone-500 mt-3">{sublabel}</div>
    </div>
  )
}

function CallsSection({ weekData, setCall, totalCalls, callsByDay }) {
  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Calls logged by day</div>
      <p className="text-sm text-stone-600 mb-6">Tap into a cell to enter the count for that category and day.</p>
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 pr-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Category</th>
            {DAYS.map(d => <th key={d} className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">{d}</th>)}
            <th className="text-right py-2 pl-3 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {CALL_CATEGORIES.map(cat => {
            const rowTotal = sum(weekData.calls[cat.key])
            return (
              <tr key={cat.key} className="border-b border-stone-100">
                <td className="py-2 pr-3 font-medium text-stone-800">{cat.label}</td>
                {DAYS.map((_, di) => (
                  <td key={di} className="py-2 px-2 text-center">
                    <input type="number" min="0" value={weekData.calls[cat.key][di] || ''} onChange={(e) => setCall(cat.key, di, e.target.value)}
                      className="w-12 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular" />
                  </td>
                ))}
                <td className="py-2 pl-3 text-right num-tabular font-semibold text-stone-900">{rowTotal}</td>
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 pr-3 mono-font text-[10px] uppercase tracking-widest font-medium">Daily Total</td>
            {callsByDay.map((c, i) => <td key={i} className="py-3 px-2 text-center num-tabular font-bold">{c}</td>)}
            <td className="py-3 pl-3 text-right num-tabular font-bold text-lg" style={{ color: '#F59E0B' }}>{totalCalls}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PipelineSection({ weekData, setPipeline, totalClients }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Customer pipeline</div>
      <p className="text-sm text-stone-600 mb-6">Where do your customers currently sit? Total: <span className="font-semibold text-stone-900 num-tabular">{totalClients}</span></p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PIPELINE_STAGES.map(stage => (
          <div key={stage.key} className="border border-stone-200 p-4">
            <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{stage.label}</div>
            <input type="number" min="0" value={weekData.pipeline[stage.key] || ''} onChange={(e) => setPipeline(stage.key, e.target.value)}
              className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium" />
          </div>
        ))}
      </div>
    </div>
  )
}

function LaunchesSection({ weekData, setField, setTtfv, ttfvTotal }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-6">This week's launches</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <NumberField label="Launched This Week" value={weekData.launchedThisWeek} onChange={(v) => setField('launchedThisWeek', Number(v) || 0)} highlight />
          <NumberField label="Customers To Launch" value={weekData.customersToLaunch} onChange={(v) => setField('customersToLaunch', Number(v) || 0)} />
          <NumberField label="Backlog" value={weekData.backlog} onChange={(v) => setField('backlog', Number(v) || 0)} />
          <NumberField label="Cancelled This Week" value={weekData.cancelledThisWeek} onChange={(v) => setField('cancelledThisWeek', Number(v) || 0)} />
        </div>
        <div className="mt-6">
          <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-2">Notes for the week</label>
          <textarea rows={3} value={weekData.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Wins, blockers, anything to flag..."
            className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Time-to-First-Value</div>
        <p className="text-sm text-stone-600 mb-6">Average days at each stage. Total: <span className="font-semibold text-stone-900 num-tabular">{ttfvTotal} days</span></p>
        <div className="grid sm:grid-cols-3 gap-3">
          <NumberField label="Stage 1: Signed → Kickoff" value={weekData.ttfv.stage1} onChange={(v) => setTtfv('stage1', v)} unit="days" />
          <NumberField label="Stage 2: Kickoff → Onboarded" value={weekData.ttfv.stage2} onChange={(v) => setTtfv('stage2', v)} unit="days" />
          <NumberField label="Stage 3: Onboarded → Live" value={weekData.ttfv.stage3} onChange={(v) => setTtfv('stage3', v)} unit="days" />
        </div>
      </div>
    </div>
  )
}

function TestimonialsSection({ weekData, setField }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Testimonials collected</div>
      <p className="text-sm text-stone-600 mb-6">Target: 1 per month, per CSM.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <NumberField label="This Week" value={weekData.testimonialsThisWeek} onChange={(v) => setField('testimonialsThisWeek', Number(v) || 0)} />
        <NumberField label="This Month" value={weekData.testimonialsThisMonth} onChange={(v) => setField('testimonialsThisMonth', Number(v) || 0)} highlight />
      </div>
    </div>
  )
}

function RetentionSection({ weekData, setRetention }) {
  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Retention & health</div>
      <p className="text-sm text-stone-600 mb-6">Pulled manually from your other systems for now.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <TextField label="Churn Rate (%)" value={weekData.retention.churnRate} onChange={(v) => setRetention('churnRate', v)} />
        <TextField label="NRR (%)" value={weekData.retention.nrr} onChange={(v) => setRetention('nrr', v)} />
        <TextField label="NPS" value={weekData.retention.nps} onChange={(v) => setRetention('nps', v)} />
        <TextField label="Health Score" value={weekData.retention.healthScore} onChange={(v) => setRetention('healthScore', v)} />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, unit, highlight }) {
  return (
    <div className={`border p-4 ${highlight ? 'border-amber-400 bg-amber-50/40' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <input type="number" min="0" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
        {unit && <span className="text-sm text-stone-500">{unit}</span>}
      </div>
    </div>
  )
}

function TextField({ label, value, onChange }) {
  return (
    <div className="border border-stone-200 p-4">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
    </div>
  )
}
