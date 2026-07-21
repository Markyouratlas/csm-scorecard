import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'

// =============================================================================
//  useFulfillment
//
//  Backs the Fulfillment view (customer onboarding tracker). Fetch-on-mount with
//  plain state (no react-query) to match the other nav-row pages; sessionStorage
//  viewMode survival is handled by App.jsx. Local state is the optimistic source
//  of truth — every mutator updates it immediately, then persists the full row to
//  Supabase (debounced for typed fields, immediate for selects/dates/stage).
//
//  DB is snake_case + flat date columns; the app object is camelCase with nested
//  `dates` and `wl` (matches docs/fulfillment/atlas-fulfillment-tracker-light.jsx).
// =============================================================================

const todayISO = () => new Date().toISOString().slice(0, 10)

// Fields auto-stamped when a client enters a stage (mirror of the prototype).
export const STAGE_STAMP = {
  kickoff: 'obKsStart', obprog: 'obIpStart', imp: 'impStart', review: 'impReviewStart',
  postlaunch: 'postLaunchStart', ongoing: 'ongoingStart', hold: 'holdStart',
}

const WL_DEFAULTS = {
  appUrl: '', adminUrl: '', password: '', company: '', website: '', brandColors: '',
  dnsApp: '', dnsAdmin: '', twilioSid: '', twilioToken: '', emailAdmin: '', emailSupport: '', emailApp: '',
}

// DB row (snake) → app client (camel, nested dates/wl)
function fromRow(r) {
  return {
    id: r.id,
    aeDealId: r.ae_deal_id || null,
    name: r.name || '',
    atlasUsername: r.atlas_username || '',
    pocEmail: r.poc_email || '',
    pocPhone: r.poc_phone || '',
    mrr: r.mrr,
    stage: r.stage || 'pre',
    status: r.status || 'none',
    statusDate: r.status_date || null,
    taskProgress: r.task_progress ?? 0,
    csm: r.csm || '',
    imp: r.imp || '',
    csa: r.csa || '',
    priority: r.priority || 'Medium',
    subscription: r.subscription || 'Starter',
    tShirt: r.t_shirt || 'Medium',
    temperament: r.temperament || 'Neutral',
    touchpoints: r.touchpoints ?? 0,
    revisionCount: r.revision_count ?? 0,
    obCompletionTime: r.ob_completion_time ?? null,
    impEscalation: !!r.imp_escalation,
    notes: r.notes || '',
    dates: {
      payment: r.payment_date, koScheduling: r.ko_scheduling_date, koDue: r.ko_due_date,
      kickoff: r.kickoff_date, csmMeeting2: r.csm_meeting2_date, impBacklog: r.imp_backlog_date,
      obKsStart: r.ob_ks_start, obIpStart: r.ob_ip_start, impStart: r.imp_start,
      impReviewStart: r.imp_review_start, impReviewDue: r.imp_review_due, launchDue: r.launch_due,
      launch: r.launch_date, postLaunchStart: r.post_launch_start, ongoingStart: r.ongoing_start,
      supportCall: r.support_call_latest, holdStart: r.hold_start, holdEnd: r.hold_end,
      cancellation: r.cancellation_date,
    },
    wl: { ...WL_DEFAULTS, ...(r.wl || {}) },
  }
}

// app client (camel) → DB row (snake) for update/insert
function toRow(c) {
  const d = c.dates || {}
  const n = (v) => (v === '' || v == null ? null : Number(v))
  return {
    ae_deal_id: c.aeDealId || null,
    name: c.name || '', atlas_username: c.atlasUsername || '', poc_email: c.pocEmail || '', poc_phone: c.pocPhone || '',
    mrr: n(c.mrr),
    stage: c.stage, status: c.status, status_date: c.statusDate || null,
    task_progress: Number(c.taskProgress) || 0,
    csm: c.csm || '', imp: c.imp || '', csa: c.csa || '',
    priority: c.priority, subscription: c.subscription, t_shirt: c.tShirt, temperament: c.temperament,
    touchpoints: Number(c.touchpoints) || 0, revision_count: Number(c.revisionCount) || 0,
    ob_completion_time: n(c.obCompletionTime), imp_escalation: !!c.impEscalation, notes: c.notes || '',
    payment_date: d.payment || null, ko_scheduling_date: d.koScheduling || null, ko_due_date: d.koDue || null,
    kickoff_date: d.kickoff || null, csm_meeting2_date: d.csmMeeting2 || null, imp_backlog_date: d.impBacklog || null,
    ob_ks_start: d.obKsStart || null, ob_ip_start: d.obIpStart || null, imp_start: d.impStart || null,
    imp_review_start: d.impReviewStart || null, imp_review_due: d.impReviewDue || null, launch_due: d.launchDue || null,
    launch_date: d.launch || null, post_launch_start: d.postLaunchStart || null, ongoing_start: d.ongoingStart || null,
    support_call_latest: d.supportCall || null, hold_start: d.holdStart || null, hold_end: d.holdEnd || null,
    cancellation_date: d.cancellation || null,
    wl: c.wl || {},
  }
}

export function useFulfillment() {
  const [clients, setClients] = useState([])
  const [people, setPeople] = useState({ csms: [], imps: [], colors: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const ref = useRef([])              // synchronous mirror of `clients`
  const timers = useRef({})           // per-id debounce timers

  const commit = useCallback((next) => { ref.current = next; setClients(next) }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [cRes, pRes] = await Promise.all([
        supabase.from('fulfillment_clients').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('name, team, role_type, color').is('archived_at', null),
      ])
      if (!alive) return
      if (cRes.error) { setError(cRes.error.message); setLoading(false); return }
      commit((cRes.data || []).map(fromRow))
      const profs = pRes.data || []
      const colors = {}
      profs.forEach(p => { if (p.name) colors[p.name] = p.color || '#c7c9d1' })
      const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b))
      setPeople({
        csms: uniqSorted(profs.filter(p => p.team === 'customer_success' || p.team === 'forward_deployed').map(p => p.name)),
        imps: uniqSorted(profs.filter(p => p.role_type === 'implementation').map(p => p.name)),
        colors,
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [commit])

  // Core: replace one client in state + persist its full row (debounced or now).
  const write = useCallback((id, mutate, { debounce = false } = {}) => {
    const next = ref.current.map(c => (c.id === id ? mutate(c) : c))
    commit(next)
    const nc = next.find(c => c.id === id)
    if (!nc) return
    const doWrite = () => supabase.from('fulfillment_clients').update(toRow(nc)).eq('id', id)
      .then(({ error: e }) => { if (e) console.warn('fulfillment persist:', e.message) })
    clearTimeout(timers.current[id])
    if (debounce) timers.current[id] = setTimeout(doWrite, 600)
    else doWrite()
  }, [commit])

  // Public mutators (mirror the prototype's patch/patchDates/patchWL/changeStage).
  const patch = useCallback((id, p, opts) => write(id, c => ({ ...c, ...p }), opts), [write])
  const patchDates = useCallback((id, p, opts) => write(id, c => ({ ...c, dates: { ...c.dates, ...p } }), opts), [write])
  const patchWL = useCallback((id, p, opts) => write(id, c => ({ ...c, wl: { ...c.wl, ...p } }), opts), [write])

  const changeStage = useCallback((id, stageId) => write(id, c => {
    const dates = { ...c.dates }
    const stamp = STAGE_STAMP[stageId]
    if (stamp && !dates[stamp]) dates[stamp] = todayISO()
    if (c.stage === 'hold' && stageId !== 'hold' && dates.holdStart && !dates.holdEnd) dates.holdEnd = todayISO()
    if (stageId === 'cancelled' && !dates.cancellation) dates.cancellation = todayISO()
    return { ...c, stage: stageId, dates }
  }, { debounce: false }), [write])

  const addClient = useCallback(async (fields = {}) => {
    const row = {
      name: fields.name || '', poc_email: fields.pocEmail || '', atlas_username: fields.atlasUsername || '',
      stage: fields.stage || 'pre', csm: fields.csm || '', subscription: fields.subscription || 'Starter',
      status: 'ontrack', status_date: todayISO(),
    }
    const { data, error: e } = await supabase.from('fulfillment_clients').insert(row).select().single()
    if (e) { alert('Could not add client: ' + e.message); return null }
    const c = fromRow(data)
    commit([c, ...ref.current])
    return c
  }, [commit])

  const removeClient = useCallback(async (id) => {
    const { error: e } = await supabase.from('fulfillment_clients').delete().eq('id', id)
    if (e) { alert('Could not delete client: ' + e.message); return }
    commit(ref.current.filter(c => c.id !== id))
  }, [commit])

  return { clients, people, loading, error, patch, patchDates, patchWL, changeStage, addClient, removeClient }
}
