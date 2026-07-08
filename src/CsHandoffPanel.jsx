import React, { useState } from 'react'
import { Phone, MessageSquare, Check, ChevronDown, UserCheck, RotateCcw, Sparkles, Mail } from 'lucide-react'
import { useDialer } from './DialerContext.jsx'
import { useCsHandoffs } from './hooks/useCsHandoffs.js'

// ============================================================================
//  CsHandoffPanel — Sales → CS/FDE hand-off queue
// ----------------------------------------------------------------------------
//  Shared by CsmView + FdeView Pipeline sections. Lists new customers an AE
//  closed (ae_deals.status = 'Closed Won') as callable contacts: click to call
//  or text via the in-app dialer, then "Mark onboarded" to clear them from the
//  active list into a collapsed "Onboarded" section.
// ============================================================================

const BRAND = '#6639a6'

function fmtMrr(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!isFinite(n) || n === 0) return null
  return `$${n.toLocaleString()}/mo`
}
function fmtDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return null }
}

function ContactCard({ deal, onboarded }) {
  const { openDialer, openMessages } = useDialer()
  const [busy, setBusy] = useState(false)
  const { markOnboarded } = useCsHandoffs()
  const phone = (deal.customer_phone || '').trim()
  const mrr = fmtMrr(deal.mrr)

  const toggle = async (done) => {
    setBusy(true)
    try { await markOnboarded(deal.id, done) } catch (e) { console.warn('markOnboarded failed', e) } finally { setBusy(false) }
  }

  return (
    <div className="border border-stone-200 rounded-lg p-4 flex flex-col gap-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-stone-900 truncate">{deal.customer_name || 'Unnamed customer'}</div>
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mt-0.5">
            {deal.ae_name ? `Closed by ${deal.ae_name}` : 'Closed Won'}{fmtDate(deal.meeting_at) ? ` · ${fmtDate(deal.meeting_at)}` : ''}
          </div>
        </div>
        {mrr && <div className="shrink-0 text-sm font-semibold num-tabular" style={{ color: BRAND }}>{mrr}</div>}
      </div>

      <div className="flex flex-col gap-1 text-xs text-stone-600">
        {phone && <div className="num-tabular">{phone}</div>}
        {deal.customer_email && (
          <div className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 text-stone-400 shrink-0" />{deal.customer_email}</div>
        )}
        {!phone && !deal.customer_email && <div className="text-stone-400 italic">No contact info on this deal</div>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {phone && (
          <>
            <button type="button" onClick={() => openDialer(phone, { name: deal.customer_name, dealId: deal.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: BRAND }}>
              <Phone className="w-3.5 h-3.5" /> Call
            </button>
            <button type="button" onClick={() => openMessages(phone, { name: deal.customer_name, dealId: deal.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors">
              <MessageSquare className="w-3.5 h-3.5" /> Text
            </button>
          </>
        )}
        <div className="ml-auto">
          {onboarded ? (
            <button type="button" disabled={busy} onClick={() => toggle(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 text-stone-500 hover:bg-stone-50 transition-colors disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Reactivate
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => toggle(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors disabled:opacity-50">
              <Check className="w-3.5 h-3.5" /> Mark onboarded
            </button>
          )}
        </div>
      </div>
      {onboarded && deal.cs_onboarded_at && (
        <div className="text-[10px] text-stone-400">
          Onboarded {fmtDate(deal.cs_onboarded_at)}{deal.onboarded_by_name ? ` by ${deal.onboarded_by_name}` : ''}
        </div>
      )}
    </div>
  )
}

export default function CsHandoffPanel() {
  const { active, onboarded, loading, error } = useCsHandoffs()
  const [showOnboarded, setShowOnboarded] = useState(false)

  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: BRAND }} />
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5" style={{ color: BRAND }} />
        <div className="display-font text-2xl font-medium text-stone-900">New customers from Sales</div>
      </div>
      <p className="text-sm text-stone-600 mb-5">
        Deals your AEs just closed. Call or text to kick off onboarding, then mark them onboarded to clear the list.
      </p>

      {loading && <div className="text-sm text-stone-400">Loading…</div>}
      {error && <div className="text-sm text-amber-700">Couldn’t load the hand-off queue.</div>}

      {!loading && !error && active.length === 0 && (
        <div className="text-sm text-stone-400 italic py-4">No new customers waiting. When an AE marks a deal Closed Won, it shows up here.</div>
      )}

      {active.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {active.map(d => <ContactCard key={d.id} deal={d} onboarded={false} />)}
        </div>
      )}

      {onboarded.length > 0 && (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <button type="button" onClick={() => setShowOnboarded(v => !v)}
            className="flex items-center gap-1.5 mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-800 transition-colors">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOnboarded ? 'rotate-180' : ''}`} />
            <UserCheck className="w-3.5 h-3.5" /> Onboarded ({onboarded.length})
          </button>
          {showOnboarded && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {onboarded.map(d => <ContactCard key={d.id} deal={d} onboarded={true} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
