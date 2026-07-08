import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Device } from '@twilio/voice-sdk'
import { Phone, PhoneOff, Mic, MicOff, X, Loader2, Check, MessageSquare, Send } from 'lucide-react'
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
export const useDialer = () => useContext(DialerCtx) || { available: false, openDialer: () => {}, openMessages: () => {} }

const DISPOSITIONS = ['Connected', 'Voicemail', 'No answer', 'Busy', 'Wrong number', 'Callback', 'Not interested']
const fmtDur = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export function DialerProvider({ children }) {
  const qc = useQueryClient()
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const incomingRef = useRef(null)  // the ringing inbound Call, before accept
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
    callRef.current = null; incomingRef.current = null; logIdRef.current = null; dealIdRef.current = null
    setStatus('idle'); setTarget(null); setMuted(false); setSeconds(0); setError(null)
  }, [])

  // Shared end-of-call: record duration + move to the after-call wrap-up card.
  const finalize = useCallback(() => {
    logUpdate({ status: 'completed', duration_seconds: secondsRef.current, ended_at: new Date().toISOString() })
    callRef.current = null; incomingRef.current = null
    setStatus((s) => (s === 'error' ? 'error' : 'wrapup'))
  }, [logUpdate])

  const attachCallHandlers = useCallback((call) => {
    call.on('accept', () => { setStatus('open'); logUpdate({ status: 'in-progress' }) })
    call.on('disconnect', finalize)
    call.on('cancel', finalize)
    call.on('reject', () => resetCall())
    call.on('error', (err) => { console.error('Call error', err); setError(err?.message || 'Call error'); finalize() })
  }, [finalize, logUpdate, resetCall])

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
      attachCallHandlers(call)
    } catch (err) {
      console.error('openDialer failed', err)
      setError(err?.message || 'Could not start the call.')
      logUpdate({ status: 'failed', ended_at: new Date().toISOString() })
      setStatus('error')
    }
  }, [getDevice, repId, logInsert, logUpdate, attachCallHandlers])

  // Register the Device on mount so inbound calls to the rep's number ring here.
  // Non-dialer roles get a 403 from dialer-token → inbound (and outbound) disabled.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const device = await getDevice()
        if (cancelled) return
        device.on('registrationFailed', (e) => console.warn('[dialer] registration failed', e))
        device.on('incoming', (call) => {
          if (callRef.current || incomingRef.current) { call.reject(); return } // already busy
          incomingRef.current = call
          setTarget({ number: call.parameters?.From || 'Unknown', name: null }); setSeconds(0); setStatus('incoming')
          call.on('cancel', () => resetCall())          // caller hung up before answer
          call.on('disconnect', finalize)
          call.on('error', finalize)
        })
        try { await device.register() } catch (e) { console.warn('device.register failed', e) }
      } catch { /* not a dialer user — no inbound */ }
    })()
    return () => { cancelled = true }
  }, [getDevice, finalize, resetCall])

  const acceptIncoming = useCallback(async () => {
    const call = incomingRef.current
    if (!call) return
    callRef.current = call; dealIdRef.current = null; logIdRef.current = null
    setSeconds(0); setStatus('open')
    const rid = await repId()
    if (rid) logInsert({
      rep_id: rid, ae_deal_id: null, customer_name: null,
      customer_phone: call.parameters?.From || null, direction: 'inbound', status: 'in-progress',
      // Store the inbound CallSid so dialer-recording can attach the recording
      // (inbound has no client `ref`, so recordings match on CallSid).
      twilio_call_sid: call.parameters?.CallSid || null,
      client_ref: (crypto?.randomUUID?.() || String(Date.now())), started_at: new Date().toISOString(),
    })
    call.accept()
  }, [repId, logInsert])

  const declineIncoming = useCallback(() => {
    const call = incomingRef.current
    if (call) call.reject()
    resetCall()
  }, [resetCall])

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

  // SMS thread panel (independent of the call state).
  const [smsTarget, setSmsTarget] = useState(null) // { number, name, dealId }
  const openMessages = useCallback((number, meta = {}) => {
    const n = String(number || '').trim()
    if (n) setSmsTarget({ number: n, name: meta.name || null, dealId: meta.dealId || null })
  }, [])
  const closeMessages = useCallback(() => setSmsTarget(null), [])

  const value = { available: true, status, target, muted, seconds, error, openDialer, hangUp, toggleMute, dismiss, logOutcome, acceptIncoming, declineIncoming, openMessages, hasDeal: !!dealIdRef.current }
  return (
    <DialerCtx.Provider value={value}>
      {children}
      <DialerWidget />
      {smsTarget && <SmsThread target={smsTarget} onClose={closeMessages} />}
    </DialerCtx.Provider>
  )
}

function SmsThread({ target, onClose }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)
  const [tryRcs, setTryRcs] = useState(false) // opt-in RCS; falls back to SMS until the brand agent is live
  const scrollRef = useRef(null)
  // Match by last-10 digits so the thread finds rows regardless of stored format
  // (inbound is E.164 +1..., outbound/deal numbers may be bare 10-digit).
  const tail = String(target.number || '').replace(/\D/g, '').slice(-10)
  const key = ['sms', tail]

  const { data: msgs } = useQuery({
    queryKey: key,
    enabled: !!tail,
    refetchInterval: 8000, // poll for inbound replies
    queryFn: async () => {
      // Merge Twilio SMS/RCS (sms_messages) + Atlas Blue iMessage (atlas_messages),
      // both keyed by last-10 phone, into one chronological thread. RLS scopes each.
      const [sms, atlas] = await Promise.all([
        supabase.from('sms_messages')
          .select('id, direction, body, status, channel, created_at')
          .ilike('contact_phone', `%${tail}`).order('created_at', { ascending: true }).limit(200),
        supabase.from('atlas_messages')
          .select('id, role, content, status, created_at')
          .ilike('contact_phone', `%${tail}`).order('created_at', { ascending: true }).limit(200),
      ])
      if (sms.error) console.warn('sms read:', sms.error.message)
      if (atlas.error) console.warn('atlas read:', atlas.error.message)
      const norm = [
        ...(sms.data || []).map((m) => ({ id: `s_${m.id}`, out: m.direction === 'outbound', body: m.body, status: m.status, channel: m.channel || 'sms', created_at: m.created_at })),
        ...(atlas.data || []).map((m) => ({ id: `a_${m.id}`, out: m.role !== 'user', body: m.content, status: m.status, channel: 'imessage', created_at: m.created_at })),
      ]
      norm.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      return norm
    },
  })
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [msgs])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('dialer-send', { body: { to: target.number, body, dealId: target.dealId, channel: tryRcs ? 'rcs' : 'sms' } })
      if (error || data?.error) throw new Error(error?.message || data?.error)
      // If RCS wasn't live, the server fell back to SMS and says so — reflect that.
      if (tryRcs && data?.channel === 'sms') setTryRcs(false)
      setDraft(''); qc.invalidateQueries({ queryKey: key })
    } catch (e) { setErr(e.message || 'Could not send.') } finally { setSending(false) }
  }

  return createPortal(
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 2001, width: 340, height: 460, display: 'flex', flexDirection: 'column',
      borderRadius: 18, overflow: 'hidden', background: 'white', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F0EEF5', background: '#6639A6', color: 'white' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{target.name || target.number}</div>
          {target.name && <div style={{ fontSize: 11, opacity: 0.8 }}>{target.number}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 2 }}><X className="w-4 h-4" /></button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: '#FAF9FC' }}>
        {(!msgs || msgs.length === 0) && <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 20 }}>No messages yet. Say hello 👋</div>}
        {(msgs || []).map((m) => {
          const out = m.out
          const isRcs = m.channel === 'rcs'
          const isImsg = m.channel === 'imessage'
          const isRead = m.status === 'read'
          // iMessage bubbles use Apple blue for outbound to read as iMessage.
          const outBg = isImsg ? '#0B93F6' : '#6639A6'
          return (
            <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{ background: out ? outBg : '#EDEAF3', color: out ? 'white' : '#1A0F2E', padding: '8px 12px', borderRadius: 14,
                borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4, fontSize: 13.5, lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: out ? 'flex-end' : 'flex-start', marginTop: 2 }}>
                {isRcs && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: '#1D9BF0', border: '1px solid #1D9BF0', borderRadius: 4, padding: '0 3px' }}>RCS</span>}
                {isImsg && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: '#0B93F6', border: '1px solid #0B93F6', borderRadius: 4, padding: '0 3px' }}>iMessage</span>}
                {out && <span style={{ fontSize: 10, color: isRead ? '#1D9BF0' : '#9CA3AF', fontWeight: isRead ? 600 : 400 }}>{isRead ? '✓✓ Read' : m.status}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {err && <div style={{ color: '#DC2626', fontSize: 12, padding: '4px 12px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #F0EEF5', alignItems: 'center' }}>
        <button type="button" onClick={() => setTryRcs(v => !v)}
          title={tryRcs ? 'Sending as RCS (falls back to SMS if unavailable)' : 'Send as RCS rich message'}
          style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', padding: '4px 6px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${tryRcs ? '#1D9BF0' : '#E2E0EA'}`, background: tryRcs ? '#E8F5FE' : 'white', color: tryRcs ? '#1D9BF0' : '#9CA3AF' }}>
          RCS
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={tryRcs ? 'RCS message' : 'Text message'}
          style={{ flex: 1, borderRadius: 20, border: '1px solid #E2E0EA', padding: '9px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={sending || !draft.trim()} title="Send"
          style={{ width: 40, height: 40, borderRadius: '50%', background: '#6639A6', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: sending || !draft.trim() ? 0.5 : 1 }}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body,
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
      {d.status === 'wrapup' ? <WrapUp d={d} /> : d.status === 'incoming' ? <IncomingCall d={d} /> : <LiveCall d={d} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>,
    document.body,
  )
}

function IncomingCall({ d }) {
  const { target, acceptIncoming, declineIncoming } = d
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#30D158', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: '#30D158', animation: 'pulse 1.2s ease-in-out infinite' }} /> Incoming call
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>{target?.number || 'Unknown'}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={declineIncoming} title="Decline"
          style={{ flex: 1, height: 48, borderRadius: 24, background: '#FF453A', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
          <PhoneOff className="w-5 h-5" /> Decline
        </button>
        <button onClick={acceptIncoming} title="Accept"
          style={{ flex: 1, height: 48, borderRadius: 24, background: '#30D158', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
          <Phone className="w-5 h-5" /> Accept
        </button>
      </div>
    </div>
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
