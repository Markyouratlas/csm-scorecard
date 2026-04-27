import React, { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard, Users, UserCircle2, LogOut, Award, Clock, Quote,
  TrendingUp, Phone, Loader2, Shield, ShieldOff, Trash2
} from 'lucide-react'
import { supabase } from './supabase'
import { sum, fmt, BLANK_WEEK, PIPELINE_STAGES, CALL_CATEGORIES } from './constants'
import { getWeekKey, formatWeekLabel } from './dateUtils'

export default function ManagerView({ profile, onSignOut, onSwitchToSelf }) {
  const [tab, setTab] = useState('overview')
  const [csms, setCsms] = useState([])
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const weekKey = useMemo(() => getWeekKey(), [])

  const loadAll = async () => {
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
  }

  useEffect(() => { loadAll() }, [weekKey])

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
          <TabButton active={tab === 'roster'} onClick={() => setTab('roster')} icon={UserCircle2}>Roster</TabButton>
        </div>

        {tab === 'overview' && <OverviewTab csms={csms} data={data} />}
        {tab === 'pipeline' && <PipelineTab csms={csms} data={data} />}
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

// ---------- Overview ----------

function OverviewTab({ csms, data }) {
  const totalLaunched = csms.reduce((s, c) => s + (data[c.id]?.launchedThisWeek || 0), 0)
  const totalTestimonials = csms.reduce((s, c) => s + (data[c.id]?.testimonialsThisMonth || 0), 0)
  const ttfvAvg = useMemo(() => {
    const vals = csms.map(c => {
      const t = data[c.id]?.ttfv
      if (!t) return 0
      return (Number(t.stage1) || 0) + (Number(t.stage2) || 0) + (Number(t.stage3) || 0)
    }).filter(v => v > 0)
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0
  }, [csms, data])
  const totalCalls = csms.reduce((s, c) => {
    const calls = data[c.id]?.calls
    if (!calls) return s
    return s + Object.values(calls).reduce((sub, arr) => sub + sum(arr), 0)
  }, 0)

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Team performance · this week</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          The team's <em className="font-light">scorecard.</em>
        </h1>
      </div>

      {/* North Star KPIs */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 fade-up" style={{ animationDelay: '60ms' }}>
        <KpiTile label="Customers Launched" value={totalLaunched} sublabel="Across all CSMs" color="#0F766E" icon={Award} />
        <KpiTile label="Avg TTFV" value={ttfvAvg || '—'} unit={ttfvAvg ? 'days' : ''} sublabel={ttfvAvg && ttfvAvg <= 14 ? '✓ On target' : ttfvAvg ? '↑ Above goal' : 'Awaiting data'} color="#1C1917" icon={Clock} />
        <KpiTile label="Testimonials This Month" value={totalTestimonials} sublabel="Target: 1 / CSM / month" color="#7C3AED" icon={Quote} />
        <KpiTile label="Calls Logged" value={totalCalls} sublabel="Across all categories" color="#C2410C" icon={Phone} />
      </div>

      {/* Per-CSM breakdown */}
      <div className="fade-up" style={{ animationDelay: '120ms' }}>
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">By CSM</div>
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">CSM</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Launched</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">TTFV</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Testimonials</th>
                <th className="text-right py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody>
              {csms.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-stone-500">No CSMs yet. People who sign up will show here automatically.</td></tr>
              )}
              {csms.map(c => {
                const d = data[c.id]
                const ttfv = d?.ttfv ? (Number(d.ttfv.stage1) || 0) + (Number(d.ttfv.stage2) || 0) + (Number(d.ttfv.stage3) || 0) : 0
                const calls = d?.calls ? Object.values(d.calls).reduce((s, arr) => s + sum(arr), 0) : 0
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
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{d?.testimonialsThisMonth || 0}</td>
                    <td className="py-3 px-4 text-right num-tabular text-stone-700">{calls}</td>
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

// ---------- Pipeline ----------

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
                  {stage.key === 'launched' && <span className="ml-2 mono-font text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">North Star</span>}
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

// ---------- Roster ----------

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
