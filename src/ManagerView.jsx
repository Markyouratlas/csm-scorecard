import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  LayoutDashboard, Users, UserCircle2, LogOut, Award, Clock, Quote,
  CalendarCheck, Loader2, Shield, ShieldOff, ShieldCheck, Trash2, Download
} from 'lucide-react'
import { supabase } from './supabase'
import {
  sum, BLANK_WEEK, PIPELINE_STAGES, MEETING_CATEGORIES, avgTtfv, customerTtfv
} from './constants'
import { getWeekKey, formatWeekLabel } from './dateUtils'

export default function ManagerView({ profile, onSignOut, onSwitchToSelf }) {
  const [tab, setTab] = useState('overview')
  const [csms, setCsms] = useState([])
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const weekKey = useMemo(() => getWeekKey(), [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (pErr) console.error(pErr)
    const { data: scorecards, error: sErr } = await supabase.from('weekly_scorecards').select('*').eq('week_key', weekKey)
    if (sErr) console.error(sErr)
    const map = {}
    ;(scorecards || []).forEach(s => { map[s.user_id] = s.data })
    setCsms(profiles || [])
    setData(map)
    setLoading(false)
  }, [weekKey])

  useEffect(() => { loadAll() }, [loadAll])

  const promoteToManager = async (id) => {
    await supabase.from('profiles').update({ role: 'manager' }).eq('id', id)
    loadAll()
  }
  const demoteToCsm = async (id) => {
    await supabase.from('profiles').update({ role: 'csm' }).eq('id', id)
    loadAll()
  }
  const removeUser = async (id) => {
    if (!confirm('Remove this user from the roster? Their account remains, but they will no longer appear in the dashboard.')) return
    await supabase.from('profiles').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: '#1C1917' }}>
              <LayoutDashboard className="w-5 h-5" style={{ color: '#F59E0B' }} strokeWidth={2.5} />
            </div>
            <div>
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">Manager Dashboard</div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Week of {formatWeekLabel(weekKey)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSwitchToSelf} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <UserCircle2 className="w-4 h-4" /> My scorecard
            </button>
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-wrap gap-2 mb-8">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={LayoutDashboard}>Overview</TabButton>
          <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')} icon={Users}>Pipeline</TabButton>
          <TabButton active={tab === 'testimonials'} onClick={() => setTab('testimonials')} icon={Quote}>Testimonials</TabButton>
          <TabButton active={tab === 'roster'} onClick={() => setTab('roster')} icon={UserCircle2}>Roster</TabButton>
        </div>

        {tab === 'overview' && <OverviewTab csms={csms} data={data} />}
        {tab === 'pipeline' && <PipelineTab csms={csms} data={data} />}
        {tab === 'testimonials' && <TestimonialsManagerTab csms={csms} />}
        {tab === 'roster' && <RosterTab csms={csms} currentUserId={profile.id} onPromote={promoteToManager} onDemote={demoteToCsm} onRemove={removeUser} />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm transition-all ${active ? 'bg-stone-900 text-stone-50' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-900'}`}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  )
}

// ============================================================================
//  Overview
// ============================================================================

function OverviewTab({ csms, data }) {
  const totalLaunched = csms.reduce((s, c) => s + (data[c.id]?.launchedThisWeek || 0), 0)

  // Aggregate avg TTFV across all customers across all CSMs
  const allCustomers = useMemo(() => {
    return csms.flatMap(c => (data[c.id]?.ttfvCustomers || []))
  }, [csms, data])
  const teamAvgTtfv = avgTtfv(allCustomers)

  // Total meetings across all CSMs
  const totalMeetings = csms.reduce((s, c) => {
    const m = data[c.id]?.meetings
    if (!m) return s
    return s + Object.values(m).reduce((sub, arr) => sub + sum(arr), 0)
  }, 0)

  // Live testimonial counts (from testimonial_candidates table)
  const [testimonialStats, setTestimonialStats] = useState({ uploaded: 0, qualified: 0 })
  useEffect(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    Promise.all([
      supabase.from('testimonial_candidates')
        .select('id', { count: 'exact', head: true })
        .not('video_uploaded_at', 'is', null)
        .gte('video_uploaded_at', monthStart.toISOString()),
      supabase.from('testimonial_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('qualified', true)
        .gte('qualified_at', monthStart.toISOString()),
    ]).then(([up, qu]) => {
      setTestimonialStats({ uploaded: up.count ?? 0, qualified: qu.count ?? 0 })
    })
  }, [csms])

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Team performance · this week</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          The team's <em className="font-light">scorecard.</em>
        </h1>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 fade-up" style={{ animationDelay: '60ms' }}>
        <KpiTile label="Launched" value={totalLaunched} sublabel="This week" color="#0F766E" icon={Award} />
        <KpiTile label="Avg TTFV" value={teamAvgTtfv || '—'} unit={teamAvgTtfv ? 'days' : ''} sublabel={teamAvgTtfv && teamAvgTtfv <= 14 ? '✓ On target' : teamAvgTtfv ? '↑ Above goal' : 'No data'} color="#1C1917" icon={Clock} />
        <KpiTile label="Testimonials Uploaded" value={testimonialStats.uploaded} sublabel="This month" color="#7C3AED" icon={Quote} />
        <KpiTile label="Qualified" value={testimonialStats.qualified} sublabel="Commission-eligible" color="#BE185D" icon={ShieldCheck} />
        <KpiTile label="Meetings" value={totalMeetings} sublabel="Across all CSMs" color="#C2410C" icon={CalendarCheck} />
      </div>

      <div className="fade-up" style={{ animationDelay: '120ms' }}>
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">By CSM</div>
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">CSM</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Launched</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Avg TTFV</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium"># Customers</th>
                <th className="text-right py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {csms.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-stone-500">No CSMs yet. People who sign up will show here automatically.</td></tr>
              )}
              {csms.map(c => {
                const d = data[c.id]
                const customers = d?.ttfvCustomers || []
                const ttfv = avgTtfv(customers)
                const meetings = d?.meetings ? Object.values(d.meetings).reduce((s, arr) => s + sum(arr), 0) : 0
                return (
                  <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs" style={{ background: c.color, fontFamily: 'Fraunces, serif' }}>
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-stone-900">{c.name}</div>
                          <div className="text-xs text-stone-500">{c.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right num-tabular font-semibold text-stone-900">{d?.launchedThisWeek || 0}</td>
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{ttfv ? `${ttfv}d` : '—'}</td>
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{customers.length}</td>
                    <td className="py-3 px-4 text-right num-tabular text-stone-700">{meetings}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, unit, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-4xl font-medium text-stone-900 num-tabular leading-none">
        {value}
        {unit && <span className="text-base text-stone-400 ml-2 font-normal">{unit}</span>}
      </div>
      <div className="text-xs text-stone-500 mt-2">{sublabel}</div>
    </div>
  )
}

// ============================================================================
//  Pipeline
// ============================================================================

function PipelineTab({ csms, data }) {
  const totals = PIPELINE_STAGES.reduce((acc, p) => ({ ...acc, [p.key]: csms.reduce((s, c) => s + (data[c.id]?.pipeline?.[p.key] || 0), 0) }), {})
  const grandTotal = PIPELINE_STAGES.reduce((s, p) => s + totals[p.key], 0)

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Pipeline · this week</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Where every customer <em className="font-light">sits.</em>
        </h1>
      </div>

      <div className="bg-white border border-stone-200 overflow-x-auto fade-up" style={{ animationDelay: '60ms' }}>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Stage</th>
              {csms.map(c => (
                <th key={c.id} className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium" style={{ color: c.color }}>
                  {c.name.split(' ')[0]}
                </th>
              ))}
              <th className="text-right py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold bg-stone-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {PIPELINE_STAGES.map(stage => (
              <tr key={stage.key} className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
                <td className="py-3 px-4 font-medium text-stone-800">
                  {stage.label}
                  {stage.key === 'launch' && <span className="ml-2 mono-font text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">North Star</span>}
                </td>
                {csms.map(c => (
                  <td key={c.id} className="py-3 px-3 text-right num-tabular text-stone-700">{data[c.id]?.pipeline?.[stage.key] || 0}</td>
                ))}
                <td className="py-3 px-4 text-right num-tabular font-bold text-stone-900 bg-stone-100">{totals[stage.key]}</td>
              </tr>
            ))}
            <tr className="bg-stone-900 text-stone-50">
              <td className="py-4 px-4 mono-font text-[10px] uppercase tracking-widest font-medium">Total Clients</td>
              {csms.map(c => {
                const t = PIPELINE_STAGES.reduce((s, p) => s + (data[c.id]?.pipeline?.[p.key] || 0), 0)
                return <td key={c.id} className="py-4 px-3 text-right num-tabular font-bold text-base">{t}</td>
              })}
              <td className="py-4 px-4 text-right num-tabular font-bold text-xl" style={{ color: '#F59E0B' }}>{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
//  Testimonials Manager Tab
// ============================================================================

function TestimonialsManagerTab({ csms }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  const csmById = useMemo(() => {
    const m = {}; csms.forEach(c => { m[c.id] = c }); return m
  }, [csms])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('testimonial_candidates')
      .select('*')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setCandidates(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const toggleQualified = async (cand) => {
    const newVal = !cand.qualified
    const patch = newVal
      ? { qualified: true, qualified_at: new Date().toISOString() }
      : { qualified: false, qualified_at: null }
    setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, ...patch } : c))
    const { error } = await supabase.from('testimonial_candidates').update(patch).eq('id', cand.id)
    if (error) { console.error(error); load() }
  }

  const removeRow = async (cand) => {
    if (!confirm('Remove this testimonial candidate? This will also delete the uploaded video.')) return
    if (cand.video_path) {
      await supabase.storage.from('testimonial-videos').remove([cand.video_path])
    }
    const { error } = await supabase.from('testimonial_candidates').delete().eq('id', cand.id)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => prev.filter(c => c.id !== cand.id))
  }

  const downloadVideo = async (cand) => {
    if (!cand.video_path) return
    const { data, error } = await supabase.storage.from('testimonial-videos').createSignedUrl(cand.video_path, 60)
    if (error) { alert('Download failed: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const withVideo = candidates.filter(c => c.video_uploaded_at)
  const withoutVideo = candidates.filter(c => !c.video_uploaded_at)

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Testimonials · review & qualify</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Sign off on <em className="font-light">commissions.</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-xl">Review uploaded testimonial videos. Mark as Qualified to make them commission-eligible for the CSM.</p>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
      ) : (
        <>
          <Section title="Uploaded — awaiting your review" count={withVideo.length}>
            {withVideo.length === 0 ? (
              <div className="text-stone-500 text-sm py-6 text-center">No videos uploaded yet.</div>
            ) : (
              <CandidateTable rows={withVideo} csmById={csmById} onToggleQualified={toggleQualified} onDownload={downloadVideo} onRemove={removeRow} showVideo />
            )}
          </Section>

          <Section title="In the pipeline — no video yet" count={withoutVideo.length}>
            {withoutVideo.length === 0 ? (
              <div className="text-stone-500 text-sm py-6 text-center">No pending candidates.</div>
            ) : (
              <CandidateTable rows={withoutVideo} csmById={csmById} onToggleQualified={toggleQualified} onDownload={downloadVideo} onRemove={removeRow} showVideo={false} />
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div className="fade-up">
      <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">{title} · {count}</div>
      <div className="bg-white border border-stone-200 overflow-x-auto">{children}</div>
    </div>
  )
}

function CandidateTable({ rows, csmById, onToggleQualified, onDownload, onRemove, showVideo }) {
  return (
    <table className="w-full text-sm min-w-[760px]">
      <thead>
        <tr className="border-b border-stone-200 bg-stone-50">
          <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">CSM</th>
          <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
          <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Score</th>
          {showVideo && <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Video</th>}
          <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Qualified</th>
          <th className="w-10"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(c => {
          const csm = csmById[c.csm_id]
          return (
            <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
              <td className="py-3 px-4">
                {csm ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-[10px]" style={{ background: csm.color, fontFamily: 'Fraunces, serif' }}>
                      {csm.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-stone-800 font-medium">{csm.name}</span>
                  </div>
                ) : (
                  <span className="text-stone-400 italic">Removed CSM</span>
                )}
              </td>
              <td className="py-3 px-3 text-stone-800">{c.customer_name || <span className="text-stone-400 italic">unnamed</span>}</td>
              <td className="py-3 px-3 text-right num-tabular font-semibold text-stone-900">{c.score ?? 0}</td>
              {showVideo && (
                <td className="py-3 px-3">
                  <button onClick={() => onDownload(c)} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  {c.video_filename && <div className="text-[10px] text-stone-400 mt-1 truncate max-w-[180px]">{c.video_filename}</div>}
                </td>
              )}
              <td className="py-3 px-3">
                <button
                  onClick={() => onToggleQualified(c)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 transition-colors ${c.qualified ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-stone-300 hover:border-stone-900 text-stone-700'}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> {c.qualified ? 'Qualified' : 'Mark qualified'}
                </button>
              </td>
              <td className="py-3 px-3 text-right">
                <button onClick={() => onRemove(c)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ============================================================================
//  Roster
// ============================================================================

function RosterTab({ csms, currentUserId, onPromote, onDemote, onRemove }) {
  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Roster</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Manage the <em className="font-light">team.</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-xl">New CSMs appear here automatically when they sign up. Promote someone to manager to give them this view, or remove someone who has left the team.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 fade-up" style={{ animationDelay: '60ms' }}>
        {csms.map(c => (
          <div key={c.id} className="bg-white border border-stone-200 overflow-hidden">
            <div className="h-2" style={{ background: c.color }} />
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: c.color, fontFamily: 'Fraunces, serif' }}>
                  {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="display-font text-lg font-medium text-stone-900 truncate">{c.name}</div>
                  <div className="text-xs text-stone-500 mt-0.5">{c.title}</div>
                  <div className="mt-1.5">
                    {c.role === 'manager'
                      ? <span className="mono-font text-[9px] uppercase tracking-widest text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">Manager</span>
                      : <span className="mono-font text-[9px] uppercase tracking-widest text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">CSM</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {c.role === 'manager' ? (
                  <button onClick={() => onDemote(c.id)} disabled={c.id === currentUserId}
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-stone-300 hover:bg-stone-100 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                    <ShieldOff className="w-3.5 h-3.5" /> Make CSM
                  </button>
                ) : (
                  <button onClick={() => onPromote(c.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-stone-300 hover:bg-stone-100 transition-colors text-sm font-medium">
                    <Shield className="w-3.5 h-3.5" /> Make Manager
                  </button>
                )}
                <button onClick={() => onRemove(c.id)} disabled={c.id === currentUserId}
                  className="flex items-center justify-center gap-2 py-2 px-3 border border-stone-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
