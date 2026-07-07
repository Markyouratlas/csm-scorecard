import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Device } from '@twilio/voice-sdk'
import { Phone, PhoneOff, Mic, MicOff, X, Loader2, Check } from 'lucide-react'
import { supabase } from './supabase'

// =============================================================================
//  DialerContext — app-wide Twilio softphone + call logging.
//
//  Mounted once (inside App's Shell) so the call survives tab/section switches.
//  useDialer().openDialer(number, { name, dealId }) places a call; a floating
//  glass widget shows the live call, then an auto-popping (dismissible) after-call
//  card to log a disposition, notes, and an optional follow-up.
//
//  Logging is client-owned (insert on start, finalize on end) into `call_logs`;
//  the dialer-status webhook enriches status/duration server-side by client_ref.
//  Secrets stay server-side — the browser only fetches a Voice token.
// =============================================================================

const DialerCtx = createContext(null)
export const useDialer = () => useContext(DialerCtx) || { available: false, openDialer: () => {} }

const DISPOSITIONS = ['Connected', 'Voicemail', 'No answer', 'Busy', 'Wrong number', 'Callback', 'Not interested']
const fmtDur = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export function DialerProvider({ children }) {
  const qc = useQueryClient()
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const repIdRef = useRef(null)
  const logIdRef = useRef(null)     // call_logs row id for the current call
  const dealIdRef = useRef(null)
  const secondsRef = useRef(0)

  const [status, setStatus] = useState('idle')  // idle | connecting | open | wrapup | error
  const [target, setTarget] = useState(null)     // { number, name }
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => { secondsRef.current = seconds }, [seconds])
  useEffect(() => {
    if (status !== 'open') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const repId = useCallback(async () => {
    if (repIdRef.current) return repIdRef.current
    const { data } = await supabase.auth.getUser()
    repIdRef.current = data?.user?.id || null
    return repIdRef.current
  }, [])

  const getDevice = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current
    const { data, error: e } = await supabase.functions.invoke('dialer-token')
    if (e || !data?.token) throw new Error(e?.message || data?.error || 'Could not get a calling token.')
    const device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] })
    device.on('tokenWillExpire', async () => {
      try { const { data: d } = await supabase.functions.invoke('dialer-token'); if (d?.token) device.updateToken(d.token) } catch (err) { console.warn('token refresh failed', err) }
    })
    device.on('error', (err) => { console.error('Twilio Device error', err); setError(err?.message || 'Device error') })
    deviceRef.current = device
    return device
  }, [])

  // Best-effort call-log write; never blocks or breaks the call.
  const logInsert = useCallback(async (row) => {
    try {
      const { data } = await supabase.from('call_logs').insert(row).select('id').single()
      logIdRef.current = data?.id || null
    } catch (err) { console.warn('call_logs insert failed', err) }
  }, [])
  const logUpdate = useCallback(async (patch) => {
    if (!logIdRef.current) return
    try { await supabase.from('call_logs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', logIdRef.current) }
    catch (err) { console.warn('call_logs update failed', err) }
  }, [])

  const resetCall = useCallback(() => {
    callRef.current = null; logIdRef.current = null; dealIdRef.current = null
    setStatus('idle'); setTarget(null); setMuted(false); setSeconds(0); setError(null)
  }, [])

  const openDialer = useCallback(async (number, meta = {}) => {
    const to = String(number || '').trim()
    if (!to) return
    setError(null); setTarget({ number: to, name: meta.name || null }); setSeconds(0); setStatus('connecting')
    dealIdRef.current = meta.dealId || null
    const ref = (crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
    logIdRef.current = null

    // Log the attempt up front (so no-answers are captured too).
    const rid = await repId()
    if (rid) logInsert({
      rep_id: rid, ae_deal_id: meta.dealId || null, customer_name: meta.name || null,
      customer_phone: to, direction: 'outbound', status: 'initiated', client_ref: ref,
      started_at: new Date().toISOString(),
    })

    try {
      const device = await getDevice()
      const call = await device.connect({ params: { To: to, ref } })
      callRef.current = call
      call.on('accept', () => { setStatus('open'); logUpdate({ status: 'in-progress' }) })
      call.on('disconnect', () => { finalize(); })
      call.on('cancel', () => { finalize(); })
      call.on('reject', () => { finalize(); })
      call.on('error', (err) => { console.error('Call error', err); setError(err?.message || 'Call error'); finalize() })
    } catch (err) {
      console.error('openDialer failed', err)
      setError(err?.message || 'Could not start the call.')
      logUpdate({ status: 'failed', ended_at: new Date().toISOString() })
      setStatus('error')
    }
    // finalize: record duration + move to the after-call wrap-up card.
    function finalize() {
      const secs = secondsRef.current
      logUpdate({ status: 'completed', duration_seconds: secs, ended_at: new Date().toISOString() })
      callRef.current = null
      setStatus((s) => (s === 'error' ? 'error' : 'wrapup'))
    }
  }, [getDevice, repId, logInsert, logUpdate])

  const hangUp = useCallback(() => { if (callRef.current) callRef.current.disconnect() }, [])
  const toggleMute = useCallback(() => { setMuted((m) => { const n = !m; callRef.current?.mute(n); return n }) }, [])
  const dismiss = useCallback(() => resetCall(), [resetCall])

  // Save disposition/notes to the call log, append the note to the deal's Notes
  // (dated stamp), and optionally set a follow-up.
  const logOutcome = useCallback(async ({ disposition, notes, followUpDate }) => {
    const trimmed = (notes || '').trim()
    await logUpdate({ disposition: disposition || null, notes: trimmed || null })
    const dealId = dealIdRef.current
    if (dealId) {
      try {
        const patch = { updated_at: new Date().toISOString(), updated_by: repIdRef.current || null }
        if (followUpDate) { patch.status = 'Follow-up'; patch.follow_up_at = followUpDate }
        if (trimmed) {
          const { data: cur } = await supabase.from('ae_deals').select('notes').eq('id', dealId).maybeSingle()
          const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const line = `[${stamp} call${disposition ? ` · ${disposition}` : ''}] ${trimmed}`
          patch.notes = cur?.notes ? `${cur.notes}\n${line}` : line
        }
        if (patch.status || patch.follow_up_at || patch.notes) {
          await supabase.from('ae_deals').update(patch).eq('id', dealId)
          qc.invalidateQueries({ queryKey: ['ae-deals'] })
        }
      } catch (err) { console.warn('deal update failed', err) }
    }
    qc.invalidateQueries({ queryKey: ['call-logs'] })
    resetCall()
  }, [logUpdate, qc, resetCall])

  const value = { available: true, status, target, muted, seconds, error, openDialer, hangUp, toggleMute, dismiss, logOutcome, hasDeal: !!dealIdRef.current }
  return (
    <DialerCtx.Provider value={value}>
      {children}
      <DialerWidget />
    </DialerCtx.Provider>
  )
}

function DialerWidget() {
  const d = useDialer()
  if (!d.available || d.status === 'idle') return null
  return createPortal(
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 2000, width: 312,
      borderRadius: 20, padding: '18px', color: 'white',
      background: 'linear-gradient(160deg, rgba(40,22,70,0.97), rgba(20,12,38,0.97))',
      backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
      fontFamily: 'Manrope, system-ui, sans-serif',
    }}>
      {d.status === 'wrapup' ? <WrapUp d={d} /> : <LiveCall d={d} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>,
    document.body,
  )
}

function LiveCall({ d }) {
  const { status, target, muted, seconds, error, hangUp, toggleMute, dismiss } = d
  const title = target?.name || target?.number || 'Call'
  const sub = target?.name ? target?.number : null
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{sub}</div>}
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 6, minHeight: 16 }}>
            {status === 'connecting' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 className="w-3.5 h-3.5" style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</span>}
            {status === 'open' && <span style={{ color: '#30D158', fontVariantNumeric: 'tabular-nums' }}>● {fmtDur(seconds)}</span>}
            {status === 'error' && <span style={{ color: '#FF6B6B' }}>{error || 'Call failed'}</span>}
          </div>
        </div>
        {status === 'error' && (
          <button onClick={dismiss} title="Dismiss" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 2 }}><X className="w-4 h-4" /></button>
        )}
      </div>
      {(status === 'connecting' || status === 'open') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} disabled={status !== 'open'}
            style={{ width: 46, height: 46, borderRadius: '50%', cursor: status === 'open' ? 'pointer' : 'default', border: 'none',
              background: muted ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)', color: muted ? '#111' : 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: status === 'open' ? 1 : 0.5 }}>
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={hangUp} title="Hang up"
            style={{ flex: 1, height: 46, borderRadius: 24, background: '#FF453A', border: 'none', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            <PhoneOff className="w-5 h-5" /> End
          </button>
        </div>
      )}
    </>
  )
}

function WrapUp({ d }) {
  const { target, seconds, logOutcome, dismiss, hasDeal } = d
  const [disposition, setDisposition] = useState(null)
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [saving, setSaving] = useState(false)
  const chip = (active) => ({
    fontSize: 12, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? '#8B5CD0' : 'rgba(255,255,255,0.2)'}`,
    background: active ? '#6639A6' : 'rgba(255,255,255,0.06)', color: 'white', fontWeight: active ? 600 : 400,
  })
  const save = async () => { setSaving(true); try { await logOutcome({ disposition, notes, followUpDate: followUp || null }) } finally { setSaving(false) } }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Log call</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{target?.name || target?.number} · {fmtDur(seconds)}</div>
      </div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', margin: '12px 0 6px' }}>Outcome</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DISPOSITIONS.map((x) => <button key={x} style={chip(disposition === x)} onClick={() => setDisposition(disposition === x ? null : x)}>{x}</button>)}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
        style={{ width: '100%', marginTop: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: 'white', padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
      {hasDeal && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Schedule follow-up</div>
          <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: 'white', padding: '7px 10px', fontSize: 13, outline: 'none', colorScheme: 'dark' }} />
          {followUp && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Sets this deal to “Follow-up”.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={dismiss} style={{ flex: 1, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13 }}>Skip</button>
        <button onClick={save} disabled={saving} style={{ flex: 1, height: 40, borderRadius: 20, background: '#6639A6', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
          <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
