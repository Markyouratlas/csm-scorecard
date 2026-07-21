import React, { useState } from 'react'
import { Phone, MessageSquare, ChevronDown, UserCheck, Sparkles, Mail, ExternalLink } from 'lucide-react'
import { useDialer } from './DialerContext.jsx'
import { useCsHandoffs } from './hooks/useCsHandoffs.js'

// ============================================================================
//  CsHandoffPanel — "New customers from Sales", PER-PERSON.
// ----------------------------------------------------------------------------
//  Rendered in CsmView + FdeView. Shows the fulfillment customers ASSIGNED to
//  the logged-in CSM/FDE (assigned in the Fulfillment view). Call or text to
//  kick off onboarding, or open the full record in Fulfillment. Onboarding
//  progress itself lives in the Fulfillment stages.
//
//  Props: profile (whose name is the assignee key), onSwitchToFulfillment.
// ============================================================================

const BRAND = '#6639a6'

// Compact stage labels (mirror of FulfillmentView's STAGES).
const STAGE_LABELS = {
  pre: 'Pre-Onboarding', contact: 'In Contact', kickoff: 'Kickoff Scheduled', obprog: 'OB - In Progress',
  backlog: 'Backlog', imp: 'Implementation', review: 'IMP Review', launch: 'Launch',
  postlaunch: 'Post-Launch', ongoing: 'Ongoing Support', hold: 'Hold', cancelled: 'Cancelled',
}

function fmtMrr(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!isFinite(n) || n === 0) return null
  return `$${n.toLocaleString()}/mo`
}

function ContactCard({ c, onOpen }) {
  const { openDialer, openMessages } = useDialer()
  const phone = (c.poc_phone || '').trim()
  const mrr = fmtMrr(c.mrr)
  return (
    <div className="border border-stone-200 rounded-lg p-4 flex flex-col gap-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-stone-900 truncate">{c.name || 'Unnamed customer'}</div>
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mt-0.5">{STAGE_LABELS[c.stage] || c.stage}</div>
        </div>
        {mrr && <div className="shrink-0 text-sm font-semibold num-tabular" style={{ color: BRAND }}>{mrr}</div>}
      </div>

      <div className="flex flex-col gap-1 text-xs text-stone-600">
        {phone && <div className="num-tabular">{phone}</div>}
        {c.poc_email && <div className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 text-stone-400 shrink-0" />{c.poc_email}</div>}
        {!phone && !c.poc_email && <div className="text-stone-400 italic">No contact info yet</div>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {phone && (
          <>
            <button type="button" onClick={() => openDialer(phone, { name: c.name })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90" style={{ background: BRAND }}>
              <Phone className="w-3.5 h-3.5" /> Call
            </button>
            <button type="button" onClick={() => openMessages(phone, { name: c.name })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors">
              <MessageSquare className="w-3.5 h-3.5" /> Text
            </button>
          </>
        )}
        {onOpen && (
          <button type="button" onClick={onOpen} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Open in Fulfillment
          </button>
        )}
      </div>
    </div>
  )
}

export default function CsHandoffPanel({ profile, onSwitchToFulfillment }) {
  const { active, done, loading, error } = useCsHandoffs(profile?.name)
  const [showDone, setShowDone] = useState(false)
  const open = onSwitchToFulfillment || null

  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: BRAND }} />
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5" style={{ color: BRAND }} />
        <div className="display-font text-2xl font-medium text-stone-900">New customers from Sales</div>
      </div>
      <p className="text-sm text-stone-600 mb-5">
        Customers assigned to you for onboarding. Call or text to kick things off — track the full onboarding in Fulfillment.
      </p>

      {loading && <div className="text-sm text-stone-400">Loading…</div>}
      {error && <div className="text-sm text-amber-700">Couldn’t load your onboarding queue.</div>}

      {!loading && !error && active.length === 0 && (
        <div className="text-sm text-stone-400 italic py-4">Nothing assigned to you yet. When a Closed Won customer is assigned to you in Fulfillment, they show up here.</div>
      )}

      {active.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {active.map((c) => <ContactCard key={c.id} c={c} onOpen={open} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-800 transition-colors">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-180' : ''}`} />
            <UserCheck className="w-3.5 h-3.5" /> Ongoing / closed ({done.length})
          </button>
          {showDone && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {done.map((c) => <ContactCard key={c.id} c={c} onOpen={open} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
