import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Device } from '@twilio/voice-sdk'
import { Phone, PhoneOff, Mic, MicOff, X, Loader2 } from 'lucide-react'
import { supabase } from './supabase'

// =============================================================================
//  DialerContext — app-wide Twilio softphone.
//
//  Mounted once (inside App's Shell) so the call survives tab/section switches.
//  Any component calls useDialer().openDialer(number, { name }) to place a call;
//  a floating glass call widget renders the live call (duration, mute, hang-up).
//
//  The browser never sees Twilio secrets: it fetches a short-lived Voice access
//  token from the `dialer-token` edge function (per-rep identity), and the Device
//  refreshes it on 'tokenWillExpire'. Outbound only in M1; inbound is M3.
// =============================================================================

const BRAND = '#6639A6'
const DialerCtx = createContext(null)
// Safe default so components outside the provider (or non-dialer roles) no-op.
export const useDialer = () => useContext(DialerCtx) || { available: false, openDialer: () => {} }

const fmtDur = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export function DialerProvider({ children }) {
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const [status, setStatus] = useState('idle')   // idle | connecting | open | error
  const [target, setTarget] = useState(null)      // { number, name }
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState(null)

  // Duration ticker while the call is open.
  useEffect(() => {
    if (status !== 'open') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  // Lazily create the Twilio Device on first call; reuse after. Token auto-refreshes.
  const getDevice = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current
    const { data, error: e } = await supabase.functions.invoke('dialer-token')
    if (e || !data?.token) throw new Error(e?.message || data?.error || 'Could not get a calling token.')
    const device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] })
    device.on('tokenWillExpire', async () => {
      try {
        const { data: d } = await supabase.functions.invoke('dialer-token')
        if (d?.token) device.updateToken(d.token)
      } catch (err) { console.warn('token refresh failed', err) }
    })
    device.on('error', (err) => { console.error('Twilio Device error', err); setError(err?.message || 'Device error') })
    deviceRef.current = device
    return device
  }, [])

  const cleanup = useCallback(() => {
    callRef.current = null
    setStatus('idle'); setTarget(null); setMuted(false); setSeconds(0)
  }, [])

  const openDialer = useCallback(async (number, meta = {}) => {
    const to = String(number || '').trim()
    if (!to) return
    setError(null); setTarget({ number: to, name: meta.name || null }); setSeconds(0); setStatus('connecting')
    try {
      const device = await getDevice()
      const call = await device.connect({ params: { To: to } })
      callRef.current = call
      call.on('accept', () => setStatus('open'))
      call.on('disconnect', cleanup)
      call.on('cancel', cleanup)
      call.on('reject', cleanup)
      call.on('error', (err) => { console.error('Call error', err); setError(err?.message || 'Call error'); cleanup() })
    } catch (err) {
      console.error('openDialer failed', err)
      setError(err?.message || 'Could not start the call.')
      setStatus('error')
    }
  }, [getDevice, cleanup])

  const hangUp = useCallback(() => {
    if (callRef.current) callRef.current.disconnect()
    else cleanup()
  }, [cleanup])

  const toggleMute = useCallback(() => {
    setMuted((m) => { const next = !m; callRef.current?.mute(next); return next })
  }, [])

  const dismiss = useCallback(() => cleanup(), [cleanup])

  const value = { available: true, status, target, muted, seconds, error, openDialer, hangUp, toggleMute, dismiss }
  return (
    <DialerCtx.Provider value={value}>
      {children}
      <DialerWidget />
    </DialerCtx.Provider>
  )
}

function DialerWidget() {
  const { status, target, muted, seconds, error, hangUp, toggleMute, dismiss } = useDialer()
  if (status === 'idle') return null

  const title = target?.name || target?.number || 'Call'
  const sub = target?.name ? target?.number : null

  const card = (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 2000, width: 300,
      borderRadius: 20, padding: '18px 18px 16px', color: 'white',
      background: 'linear-gradient(160deg, rgba(40,22,70,0.96), rgba(20,12,38,0.96))',
      backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
      fontFamily: 'Manrope, system-ui, sans-serif',
    }}>
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
          <button onClick={dismiss} title="Dismiss" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 2 }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {(status === 'connecting' || status === 'open') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} disabled={status !== 'open'}
            style={{ width: 46, height: 46, borderRadius: '50%', cursor: status === 'open' ? 'pointer' : 'default',
              background: muted ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)', border: 'none',
              color: muted ? '#111' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: status === 'open' ? 1 : 0.5 }}>
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={hangUp} title="Hang up"
            style={{ flex: 1, height: 46, borderRadius: 24, background: '#FF453A', border: 'none', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            <PhoneOff className="w-5 h-5" /> End
          </button>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  return createPortal(card, document.body)
}
