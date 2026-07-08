import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

// ============================================================================
//  AtlasMessenger — the Atlas Blue (iMessage) surface.
// ----------------------------------------------------------------------------
//  Distinct from the SMS dialer thread (Twilio). Styled like the iPhone Messages
//  app: clean LIGHT canvas, blue outbound bubbles, gray inbound bubbles — so it
//  reads clearly. Lets the AE "Take over" (pause the AI) and reply as a human via
//  send-human-response, or START a new iMessage for a contact with no session.
//
//  Opened via useDialer().openAtlas(number, { name, dealId }).
// ============================================================================

const FONT = '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'
const BLUE = '#0A84FF'
const GRAY_BUBBLE = '#E9E9EB'
const INK = '#1A1A1A'
const SUBTLE = '#8E8E93'

// supabase-js hides a non-2xx function body behind a generic message; dig out the
// real error we returned ({ error } / { atlas }) from the Response on error.context.
async function fnErr(error, data) {
  if (data?.error) return data.error
  try { const b = await error?.context?.json?.(); if (b?.error || b?.atlas) return b.error || b.atlas } catch { /* not json */ }
  return error?.message || 'Something went wrong.'
}

const I = (p) => ({ width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...p })
const ChevronLeft = () => (<svg {...I({ stroke: BLUE, width: 26, height: 26 })}><path d="M15 18l-6-6 6-6" /></svg>)
const ArrowUp = () => (<svg {...I({ stroke: 'white', width: 20, height: 20 })}><path d="M12 19V5M5 12l7-7 7 7" /></svg>)

function Bubble({ me, children, sub }) {
  return (
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
      <div style={{
        background: me ? BLUE : GRAY_BUBBLE, color: me ? 'white' : INK,
        padding: '8px 13px', borderRadius: 18,
        borderBottomRightRadius: me ? 5 : 18, borderBottomLeftRadius: me ? 18 : 5,
        fontSize: 15, lineHeight: 1.35, fontFamily: FONT, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{children}</div>
      {sub && <div style={{ color: SUBTLE, fontSize: 10.5, textAlign: me ? 'right' : 'left', marginTop: 2, marginRight: me ? 4 : 0, marginLeft: me ? 0 : 4 }}>{sub}</div>}
    </div>
  )
}

export default function AtlasMessenger({ target, onClose }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const scrollRef = useRef(null)
  const tail = String(target.number || '').replace(/\D/g, '').slice(-10)

  const msgsKey = ['atlas-msgs', tail]
  const sessionKey = ['atlas-session', tail]

  const { data: msgs } = useQuery({
    queryKey: msgsKey,
    enabled: !!tail,
    refetchInterval: 6000,
    queryFn: async () => {
      const { data, error } = await supabase.from('atlas_messages')
        .select('id, role, content, status, created_at')
        .ilike('contact_phone', `%${tail}`).order('created_at', { ascending: true }).limit(300)
      if (error) { console.warn('atlas msgs:', error.message); return [] }
      return data || []
    },
  })
  const { data: session } = useQuery({
    queryKey: sessionKey,
    enabled: !!tail,
    refetchInterval: 6000,
    queryFn: async () => {
      const { data, error } = await supabase.from('atlas_sessions')
        .select('id, status, human_handoff, campaign_id, campaign_name, line_number')
        .ilike('contact_phone', `%${tail}`).order('created_at', { ascending: false }).limit(1)
      if (error) { console.warn('atlas session:', error.message); return null }
      return (data && data[0]) || null
    },
  })
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [msgs])

  const hasSession = !!session
  const handedOver = !!session?.human_handoff
  const canType = !hasSession || handedOver // start-new (no session) OR taken-over

  const toggleHandoff = async () => {
    if (!session || busy) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('atlas-handoff', { body: { sessionId: session.id } })
      if (error || data?.error) throw new Error(await fnErr(error, data))
      qc.invalidateQueries({ queryKey: sessionKey })
    } catch (e) { setErr(e.message || 'Could not switch handoff.') } finally { setBusy(false) }
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true); setErr(null)
    try {
      if (!hasSession) {
        const { data, error } = await supabase.functions.invoke('atlas-start', { body: { to: target.number, name: target.name, message: body, dealId: target.dealId } })
        if (error || data?.error) throw new Error(await fnErr(error, data))
      } else {
        const { data, error } = await supabase.functions.invoke('atlas-send', { body: { sessionId: session.id, message: body } })
        if (error || data?.error) throw new Error(await fnErr(error, data))
      }
      setDraft('')
      qc.invalidateQueries({ queryKey: msgsKey }); qc.invalidateQueries({ queryKey: sessionKey })
    } catch (e) { setErr(e.message || 'Could not send.') } finally { setBusy(false) }
  }

  const statusLine = !hasSession ? 'New iMessage'
    : handedOver ? 'You’ve taken over · AI paused'
    : 'Atlas AI is handling this'

  return createPortal(
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 2002, width: 360, height: 720, maxHeight: '92vh',
      borderRadius: 46, overflow: 'hidden', background: '#FFFFFF',
      boxShadow: '0 40px 90px rgba(0,0,0,0.5), 0 0 0 9px #1c1c20, 0 0 0 11px #34343a', fontFamily: FONT,
      display: 'flex', flexDirection: 'column' }}>

      {/* Brand strip — Atlas Blue gradient. Right side shows the sending number. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px 6px', background: 'linear-gradient(90deg,#0A84FF 0%,#4FB0FF 100%)' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'white', letterSpacing: 0.2 }}>Atlas Blue</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
          {session?.line_number ? `via ${session.line_number}` : 'iMessage'}
        </span>
      </div>

      {/* Header — subtle blue tint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 10px', borderBottom: '1px solid #C5DCF5', background: 'linear-gradient(180deg,#C4DEFF 0%,#E9F3FF 100%)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}><ChevronLeft /></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: INK, fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{target.name || target.number}</div>
          <div style={{ color: '#2E4A63', fontWeight: 500, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {target.name ? `${target.number} · ${statusLine}` : statusLine}
          </div>
          {session?.campaign_name && (
            <div style={{ color: '#3E6187', fontWeight: 500, fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session.campaign_name}
            </div>
          )}
        </div>
        {hasSession && handedOver && (
          <button onClick={toggleHandoff} disabled={busy}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 14, cursor: 'pointer',
              border: `1px solid ${BLUE}`, background: BLUE, color: 'white', opacity: busy ? 0.5 : 1 }}>
            Resume AI
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#FFFFFF' }}>
        {(!msgs || msgs.length === 0) && (
          <div style={{ color: SUBTLE, fontSize: 14, textAlign: 'center', marginTop: 26, padding: '0 24px' }}>
            {hasSession ? 'No messages yet.' : 'No Atlas Blue conversation yet. Send a message to start one over iMessage 💬'}
          </div>
        )}
        {(msgs || []).map((m) => {
          const me = m.role !== 'user'
          const sub = me ? (m.role === 'human' ? 'You' : 'Atlas AI') : null
          return <Bubble key={m.id} me={me} sub={sub}>{m.content}</Bubble>
        })}
      </div>

      {err && <div style={{ color: '#DC2626', fontSize: 12, padding: '2px 16px' }}>{err}</div>}

      {/* Composer — subtle blue tint. When the AI is still active, the input is
          replaced by a "Take over to reply" button in the same spot. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 20px', borderTop: '1px solid #C5DCF5', background: 'linear-gradient(0deg,#C4DEFF 0%,#E9F3FF 100%)' }}>
        {canType ? (
          <>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={!hasSession ? 'Start an iMessage…' : 'iMessage reply…'}
              style={{ flex: 1, borderRadius: 20, border: '1px solid #D1D1D6', padding: '10px 15px', color: INK, fontSize: 15, outline: 'none', fontFamily: FONT, background: 'white' }} />
            <button onClick={send} disabled={busy || !draft.trim()}
              style={{ width: 40, height: 40, borderRadius: '50%', background: BLUE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: `0 6px 18px ${BLUE}44`, opacity: (busy || !draft.trim()) ? 0.4 : 1 }}>
              <ArrowUp />
            </button>
          </>
        ) : (
          <button onClick={toggleHandoff} disabled={busy}
            style={{ flex: 1, padding: '12px', borderRadius: 22, background: BLUE, color: 'white', border: 'none',
              fontWeight: 700, fontSize: 15, fontFamily: FONT, cursor: 'pointer', opacity: busy ? 0.6 : 1,
              boxShadow: `0 6px 18px ${BLUE}44` }}>
            {busy ? 'Taking over…' : 'Take over to reply'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
