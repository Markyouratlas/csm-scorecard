import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  CalendarCheck, Users, TrendingUp, Quote, Activity, LogOut, LayoutDashboard,
  Award, Clock, Loader2, Check, Plus, Trash2, Upload, Download, Star, ShieldCheck
} from 'lucide-react'
import { supabase } from './supabase'
import {
  BLANK_WEEK, sum, fmt, DAYS, MEETING_CATEGORIES, PIPELINE_STAGES,
  customerTtfv, avgTtfv, newCustomer
} from './constants'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { fireConfetti } from './confetti'

export default function CsmView({ profile, onSignOut, onSwitchToManager }) {
  const [section, setSection] = useState('meetings')
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const weekKey = useMemo(() => getWeekKey(), [])

  // ----- Load this week's scorecard -----
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
        // Merge with BLANK_WEEK to handle older shapes / missing keys
        const blank = BLANK_WEEK()
        const loaded = data?.data || {}
        setWeekData({
          ...blank,
          ...loaded,
          meetings: { ...blank.meetings, ...(loaded.meetings || {}) },
          pipeline: { ...blank.pipeline, ...(loaded.pipeline || {}) },
          retention: { ...blank.retention, ...(loaded.retention || {}) },
          ttfvCustomers: Array.isArray(loaded.ttfvCustomers) ? loaded.ttfvCustomers : [],
        })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [profile.id, weekKey])

  // ----- Auto-save (debounced) -----
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

  // ----- Update helpers -----
  const update = (updater) => setWeekData(prev => updater(prev))
  const setMeeting = (cat, dayIdx, value) => update(d => ({
    ...d,
    meetings: { ...d.meetings, [cat]: d.meetings[cat].map((v, i) => i === dayIdx ? Number(value) || 0 : v) }
  }))
  const setPipeline = (key, value) => update(d => ({ ...d, pipeline: { ...d.pipeline, [key]: Number(value) || 0 } }))
  const setField = (key, value) => update(d => ({ ...d, [key]: value }))
  const setRetention = (k, v) => update(d => ({ ...d, retention: { ...d.retention, [k]: v } }))

  // ----- Computed numbers -----
  const meetingsByDay = DAYS.map((_, dayIdx) => sum(MEETING_CATEGORIES.map(c => weekData.meetings[c.key][dayIdx])))
  const totalMeetings = sum(meetingsByDay)
  const avgTtfvDays = avgTtfv(weekData.ttfvCustomers)

  const sections = [
    { id: 'meetings', label: 'Daily Meetings', icon: CalendarCheck },
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
            value={avgTtfvDays || '—'}
            unit={avgTtfvDays ? 'days' : ''}
            sublabel={avgTtfvDays ? (avgTtfvDays <= 14 ? '✓ Under 14-day goal' : '↑ Above 14-day goal') : 'Add customers below'}
            color="#1C1917"
            icon={Clock}
          />
          <TestimonialsNorthStar profile={profile} weekKey={weekKey} />
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

        <div className="fade-up" style={{ animationDelay: '160ms' }}>
          {section === 'meetings' && <MeetingsSection weekData={weekData} setMeeting={setMeeting} totalMeetings={totalMeetings} meetingsByDay={meetingsByDay} />}
          {section === 'pipeline' && <PipelineSection weekData={weekData} setPipeline={setPipeline} />}
          {section === 'launches' && <LaunchesSection weekData={weekData} setField={setField} update={update} />}
          {section === 'testimonials' && <TestimonialsSection profile={profile} />}
          {section === 'retention' && <RetentionSection weekData={weekData} setRetention={setRetention} />}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
//  Shared bits
// ============================================================================

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

// Live testimonials count (uploaded videos this month) — queries testimonial_candidates
function TestimonialsNorthStar({ profile, weekKey }) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    supabase.from('testimonial_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('csm_id', profile.id)
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', monthStart.toISOString())
      .then(({ count }) => setCount(count ?? 0))
  }, [profile.id, weekKey])
  return (
    <NorthStarTile
      label="Testimonials This Month"
      value={count ?? 0}
      sublabel={(count >= 1 ? '✓' : '○') + ' Target: 1 / month'}
      color="#7C3AED"
      icon={Quote}
    />
  )
}

// ============================================================================
//  Meetings section
// ============================================================================

function MeetingsSection({ weekData, setMeeting, totalMeetings, meetingsByDay }) {
  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Meetings logged by day</div>
      <p className="text-sm text-stone-600 mb-6">Tap into a cell to enter the count for that meeting type and day.</p>
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 pr-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Type</th>
            {DAYS.map(d => <th key={d} className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">{d}</th>)}
            <th className="text-right py-2 pl-3 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {MEETING_CATEGORIES.map(cat => {
            const rowTotal = sum(weekData.meetings[cat.key])
            return (
              <tr key={cat.key} className="border-b border-stone-100">
                <td className="py-2 pr-3 font-medium text-stone-800 whitespace-nowrap">{cat.label}</td>
                {DAYS.map((_, di) => (
                  <td key={di} className="py-2 px-2 text-center">
                    <input type="number" min="0" value={weekData.meetings[cat.key][di] || ''} onChange={(e) => setMeeting(cat.key, di, e.target.value)}
                      className="w-12 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular" />
                  </td>
                ))}
                <td className="py-2 pl-3 text-right num-tabular font-semibold text-stone-900">{rowTotal}</td>
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 pr-3 mono-font text-[10px] uppercase tracking-widest font-medium">Daily Total</td>
            {meetingsByDay.map((c, i) => <td key={i} className="py-3 px-2 text-center num-tabular font-bold">{c}</td>)}
            <td className="py-3 pl-3 text-right num-tabular font-bold text-lg" style={{ color: '#F59E0B' }}>{totalMeetings}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
//  Pipeline section
// ============================================================================

function PipelineSection({ weekData, setPipeline }) {
  const totalClients = PIPELINE_STAGES.reduce((s, p) => s + (weekData.pipeline[p.key] || 0), 0)
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

// ============================================================================
//  Launches & TTFV section
// ============================================================================

function LaunchesSection({ weekData, setField, update }) {
  const addCustomer = () => update(d => ({ ...d, ttfvCustomers: [...(d.ttfvCustomers || []), newCustomer()] }))
  const removeCustomer = (id) => update(d => ({ ...d, ttfvCustomers: d.ttfvCustomers.filter(c => c.id !== id) }))
  const updateCustomer = (id, patch) => update(d => ({
    ...d,
    ttfvCustomers: d.ttfvCustomers.map(c => c.id === id ? { ...c, ...patch } : c)
  }))

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-6">This week's launches</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <NumberField label="Launched This Week" value={weekData.launchedThisWeek} onChange={(v) => setField('launchedThisWeek', Number(v) || 0)} highlight />
          <NumberField label="Customers To Launch" value={weekData.customersToLaunch} onChange={(v) => setField('customersToLaunch', Number(v) || 0)} />
          <NumberField
            label="Backlog"
            value={weekData.backlogDays}
            onChange={(v) => setField('backlogDays', Number(v) || 0)}
            unit="days"
            help="Days until next available onboarding slot"
          />
          <NumberField label="Cancelled This Week" value={weekData.cancelledThisWeek} onChange={(v) => setField('cancelledThisWeek', Number(v) || 0)} />
        </div>
        <div className="mt-6">
          <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-2">Notes for the week</label>
          <textarea rows={3} value={weekData.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Wins, blockers, anything to flag..."
            className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
        </div>
      </div>

      <TtfvCustomersTable
        customers={weekData.ttfvCustomers}
        addCustomer={addCustomer}
        removeCustomer={removeCustomer}
        updateCustomer={updateCustomer}
      />
    </div>
  )
}

function TtfvCustomersTable({ customers, addCustomer, removeCustomer, updateCustomer }) {
  const avg = avgTtfv(customers)
  // Track which customer rows have already had confetti this session (to fire on every change to ≤14, but not on initial load)
  const initializedRef = useRef(false)
  const lastTotalsRef = useRef({})

  useEffect(() => {
    // After first run, mark initialized so confetti only fires on subsequent changes
    const timer = setTimeout(() => { initializedRef.current = true }, 600)
    return () => clearTimeout(timer)
  }, [])

  // Watch for totals dropping to ≤14 and fire confetti each time
  useEffect(() => {
    if (!initializedRef.current) {
      // Just initialize the totals on first render
      customers.forEach(c => { lastTotalsRef.current[c.id] = customerTtfv(c) })
      return
    }
    customers.forEach(c => {
      const total = customerTtfv(c)
      const prev = lastTotalsRef.current[c.id]
      // Fire when: customer has a name, total > 0 and ≤14, AND something actually changed about them
      if (c.name && c.name.trim() && total > 0 && total <= 14 && total !== prev) {
        fireConfetti({ count: 60 })
      }
      lastTotalsRef.current[c.id] = total
    })
    // Clean up totals for removed customers
    const ids = new Set(customers.map(c => c.id))
    Object.keys(lastTotalsRef.current).forEach(id => { if (!ids.has(id)) delete lastTotalsRef.current[id] })
  }, [customers])

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Time-to-First-Value</div>
          <p className="text-sm text-stone-600 mt-1">Track each customer's onboarding journey. Avg: <span className="font-semibold text-stone-900 num-tabular">{avg ? `${avg} days` : '—'}</span></p>
        </div>
        <button onClick={addCustomer}
          className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No customers yet</div>
          <p className="text-sm text-stone-500 mb-4">Add your first launched customer to start tracking TTFV.</p>
          <button onClick={addCustomer} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Add customer
          </button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                <th className="text-center py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Stage 1<br/><span className="text-[8px] normal-case tracking-normal text-stone-400">Signed → Kickoff</span></th>
                <th className="text-center py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Stage 2<br/><span className="text-[8px] normal-case tracking-normal text-stone-400">Kickoff → Onboarded</span></th>
                <th className="text-center py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Stage 3<br/><span className="text-[8px] normal-case tracking-normal text-stone-400">Onboarded → Live</span></th>
                <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const total = customerTtfv(c)
                const hasName = c.name && c.name.trim()
                const isHit = hasName && total > 0 && total <= 14
                return (
                  <tr key={c.id} className={`border-b border-stone-100 transition-colors ${isHit ? 'bg-emerald-50/40' : ''}`}>
                    <td className="py-2 px-3">
                      <input
                        value={c.name}
                        onChange={(e) => updateCustomer(c.id, { name: e.target.value })}
                        placeholder="Customer name (required)"
                        className={`w-full py-1.5 px-2 border focus:border-stone-900 transition-colors text-sm ${!hasName ? 'border-amber-300 bg-amber-50/40' : 'border-stone-200'}`}
                      />
                    </td>
                    {[1, 2, 3].map(s => (
                      <td key={s} className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={c[`stage${s}`] || ''}
                          onChange={(e) => updateCustomer(c.id, { [`stage${s}`]: Number(e.target.value) || 0 })}
                          className="w-16 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular"
                        />
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right num-tabular font-semibold">
                      {hasName ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span className={isHit ? 'text-emerald-700' : 'text-stone-900'}>{total} {total === 1 ? 'day' : 'days'}</span>
                          {isHit && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                      ) : (
                        <span className="text-stone-400 text-xs italic">name required</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => removeCustomer(c.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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

// ============================================================================
//  Testimonials section
// ============================================================================

function TestimonialsSection({ profile }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const fileInputRef = useRef(null)
  const [uploadingId, setUploadingId] = useState(null)

  const loadCandidates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('testimonial_candidates')
      .select('*')
      .eq('csm_id', profile.id)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) console.error('Load testimonials error', error)
    setCandidates(data || [])
    setLoading(false)
  }, [profile.id])

  useEffect(() => { loadCandidates() }, [loadCandidates])

  // Counts for the two summary tiles
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  }, [])
  const uploadedThisMonth = candidates.filter(c => c.video_uploaded_at && new Date(c.video_uploaded_at) >= monthStart).length
  const qualifiedThisMonth = candidates.filter(c => c.qualified && c.qualified_at && new Date(c.qualified_at) >= monthStart).length

  const addCandidate = async () => {
    setAdding(true)
    const { data, error } = await supabase.from('testimonial_candidates').insert({
      csm_id: profile.id,
      customer_name: '',
      score: 5,
    }).select().single()
    setAdding(false)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => [data, ...prev].sort((a, b) => b.score - a.score))
  }

  const updateCandidate = async (id, patch) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c).sort((a, b) => b.score - a.score))
    const { error } = await supabase.from('testimonial_candidates').update(patch).eq('id', id)
    if (error) { console.error(error); loadCandidates() }
  }

  const removeCandidate = async (id) => {
    if (!confirm('Remove this testimonial candidate?')) return
    const cand = candidates.find(c => c.id === id)
    // If there's a video, delete it from storage too
    if (cand?.video_path) {
      await supabase.storage.from('testimonial-videos').remove([cand.video_path])
    }
    const { error } = await supabase.from('testimonial_candidates').delete().eq('id', id)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const triggerUpload = (id) => {
    setUploadingId(id)
    fileInputRef.current.click()
  }

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be re-selected
    if (!file || !uploadingId) return
    if (!file.type.startsWith('video/')) { alert('Please select a video file.'); setUploadingId(null); return }

    const id = uploadingId
    setUploadingId(null)
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, _uploading: true } : c))

    const ext = file.name.split('.').pop() || 'mp4'
    const path = `${profile.id}/${id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('testimonial-videos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
    if (upErr) {
      console.error(upErr); alert('Upload failed: ' + upErr.message)
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, _uploading: false } : c))
      return
    }

    const now = new Date().toISOString()
    await updateCandidate(id, {
      video_path: path,
      video_filename: file.name,
      video_uploaded_at: now,
      _uploading: false,
    })
    fireConfetti({ count: 100 })
  }

  const downloadVideo = async (cand) => {
    if (!cand.video_path) return
    const { data, error } = await supabase.storage.from('testimonial-videos').createSignedUrl(cand.video_path, 60)
    if (error) { alert('Download failed: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChosen} />

      {/* Summary tiles */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SummaryTile label="Uploaded This Month" value={uploadedThisMonth} sublabel="Videos delivered" color="#7C3AED" icon={Upload} />
        <SummaryTile label="Qualified This Month" value={qualifiedThisMonth} sublabel="Manager-approved · commission-eligible" color="#0F766E" icon={ShieldCheck} />
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Testimonial pipeline</div>
            <p className="text-sm text-stone-600 mt-1">Score candidates 0-10. Higher scores rise to the top. Upload the video when secured.</p>
          </div>
          <button onClick={addCandidate} disabled={adding}
            className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add candidate
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
        ) : candidates.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No candidates yet</div>
            <p className="text-sm text-stone-500 mb-4">Add the customers you think would be willing to give a testimonial.</p>
            <button onClick={addCandidate} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first candidate
            </button>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[260px]">Score</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Video</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Qualified</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    onUpdate={(patch) => updateCandidate(c.id, patch)}
                    onUpload={() => triggerUpload(c.id)}
                    onDownload={() => downloadVideo(c)}
                    onRemove={() => removeCandidate(c.id)}
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

function CandidateRow({ candidate: c, onUpdate, onUpload, onDownload, onRemove }) {
  const hasVideo = !!c.video_uploaded_at
  const canDelete = !c.qualified // CSMs can only delete unqualified rows; managers can delete anything via a different view
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
      <td className="py-2 px-3">
        <input
          value={c.customer_name || ''}
          onChange={(e) => onUpdate({ customer_name: e.target.value })}
          placeholder="Customer name"
          className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm"
        />
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-3">
          <input
            type="range" min="0" max="10" step="1"
            value={c.score ?? 5}
            onChange={(e) => onUpdate({ score: Number(e.target.value) })}
            className="flex-1 accent-stone-900"
          />
          <div className="display-font text-lg font-medium num-tabular w-6 text-right">{c.score ?? 0}</div>
        </div>
      </td>
      <td className="py-2 px-3">
        {c._uploading ? (
          <div className="flex items-center gap-2 text-stone-600 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</div>
        ) : hasVideo ? (
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <button onClick={onDownload} className="text-xs text-stone-700 hover:text-stone-900 underline truncate max-w-[140px]" title={c.video_filename}>
              {c.video_filename || 'View video'}
            </button>
          </div>
        ) : (
          <button onClick={onUpload} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-50 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Upload video
          </button>
        )}
      </td>
      <td className="py-2 px-3">
        {c.qualified ? (
          <span className="inline-flex items-center gap-1 mono-font text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" /> Qualified
          </span>
        ) : hasVideo ? (
          <span className="mono-font text-[9px] uppercase tracking-widest text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">Pending review</span>
        ) : (
          <span className="text-xs text-stone-400">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        <button
          onClick={onRemove}
          disabled={!canDelete}
          title={canDelete ? 'Remove' : 'Qualified — only manager can remove'}
          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-stone-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

// ============================================================================
//  Retention section
// ============================================================================

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

// ============================================================================
//  Small shared widgets
// ============================================================================

function NumberField({ label, value, onChange, unit, highlight, help }) {
  return (
    <div className={`border p-4 ${highlight ? 'border-amber-400 bg-amber-50/40' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <input type="number" min="0" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
        {unit && <span className="text-sm text-stone-500">{unit}</span>}
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2 leading-snug">{help}</div>}
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

function SummaryTile({ label, value, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-4xl font-medium text-stone-900 num-tabular leading-none">{value}</div>
      <div className="text-xs text-stone-500 mt-2">{sublabel}</div>
    </div>
  )
}
