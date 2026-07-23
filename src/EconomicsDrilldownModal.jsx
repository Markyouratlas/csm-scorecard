import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// ============================================================================
//  EconomicsDrilldownModal — Ad spend / CAC breakdown for the Booked Meetings tab.
//
//  mode 'spend' — where the ad spend went (per Meta campaign).
//  mode 'cac'   — the blended-CAC math (spend ÷ new customers) + the campaign
//                 spend breakdown behind the numerator.
//
//  Props:
//    mode       — 'spend' | 'cac'
//    winLabel   — window label (e.g. '8w', 'all time')
//    spend      — total ad spend in the window
//    customers  — new customers (Closed Won) in the window (cac mode)
//    campaigns  — [{ id, name, spend }] desc
//    loading    — spend still loading
//    onClose
// ============================================================================

const BRAND = '#2563EB'
const META = '#1877F2'
const fmtMoney = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '—' } }

export default function EconomicsDrilldownModal({ mode, winLabel, spend = 0, customers = 0, campaigns = [], customerRows = [], ltvMonths = 24, onLtvMonthsChange, loading = false, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isCac = mode === 'cac'
  const isLtv = mode === 'ltv'
  const isSpend = mode === 'spend'
  const title = isLtv ? 'LTV' : isCac ? 'CAC (blended)' : 'Ad spend'
  const cac = customers ? spend / customers : null
  const total = campaigns.reduce((s, c) => s + c.spend, 0) || spend
  const ltvTotals = customerRows.reduce((a, r) => {
    const cash = Number(r.one_time) || 0, mrr = Number(r.mrr) || 0
    a.cash += cash; a.mrr += mrr; a.recurring += mrr * ltvMonths; a.ltv += cash + mrr * ltvMonths
    return a
  }, { cash: 0, mrr: 0, recurring: 0, ltv: 0 })

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,25,23,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-start justify-between gap-4">
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest" style={{ color: BRAND }}>Booked Meetings · {winLabel}</div>
            <div className="display-font text-2xl font-medium text-stone-900 leading-tight">{title}</div>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 text-stone-400 hover:text-stone-700 transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {isCac && (
            <div className="mb-6">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="border border-stone-200 rounded-xl p-4">
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mb-1">Ad spend</div>
                  <div className="display-font text-2xl font-medium" style={{ color: META }}>{fmtMoney(spend)}</div>
                </div>
                <div className="border border-stone-200 rounded-xl p-4">
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 mb-1">÷ New customers</div>
                  <div className="display-font text-2xl font-medium text-emerald-800">{customers.toLocaleString()}</div>
                </div>
                <div className="rounded-xl p-4" style={{ border: `2px solid ${BRAND}`, background: 'rgba(37,99,235,0.05)' }}>
                  <div className="mono-font text-[10px] uppercase tracking-widest mb-1" style={{ color: BRAND }}>= CAC</div>
                  <div className="display-font text-2xl font-medium" style={{ color: BRAND }}>{cac == null ? '—' : fmtMoney(cac)}</div>
                </div>
              </div>
              <p className="text-[11px] text-stone-400 mt-3">
                Blended: total Meta ad spend ÷ new customers from ad-driven booked meetings (test excluded).
                Spend isn’t attributable to a single campaign, so the breakdown below shows where the whole ad budget went.
              </p>
            </div>
          )}

          {isCac && (
            <div className="mb-6">
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">New customers ({customerRows.length})</div>
              {customerRows.length === 0 ? (
                <div className="py-4 text-sm text-stone-400">No new customers in this window.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Customer</th>
                      <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Closed</th>
                      <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Cash</th>
                      <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">MRR</th>
                      <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Products</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.map((r, i) => (
                      <tr key={r.uid || i} className="border-b border-stone-100">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-stone-900 leading-tight">{r.attendee_name || 'Unnamed'}</div>
                          {r.attendee_email && <div className="text-[11px] text-stone-400 truncate max-w-[200px]">{r.attendee_email}</div>}
                          {r.host_name && <div className="text-[11px] text-stone-400">with {r.host_name}</div>}
                        </td>
                        <td className="py-2.5 px-3 num-tabular text-xs text-stone-600">{fmtDate(r.start_time)}</td>
                        <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{Number(r.one_time) ? fmtMoney(r.one_time) : '—'}</td>
                        <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{Number(r.mrr) ? fmtMoney(r.mrr) : '—'}</td>
                        <td className="py-2.5 px-4 text-xs text-stone-600 max-w-[180px] truncate">{r.products || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {isLtv && (
            <div>
              <div className="rounded-xl p-4 mb-4 text-center" style={{ border: `2px solid #6639A6`, background: 'rgba(102,57,166,0.05)' }}>
                <div className="mono-font text-[10px] uppercase tracking-widest mb-1" style={{ color: '#6639A6' }}>Total LTV · {winLabel}</div>
                <div className="display-font text-3xl font-medium" style={{ color: '#6639A6' }}>{fmtMoney(ltvTotals.ltv)}</div>
                <div className="text-[11px] text-stone-400 mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                  <span>LTV = upfront cash + MRR ×</span>
                  {onLtvMonthsChange ? (
                    <input type="number" min={1} max={600} value={ltvMonths}
                      onChange={(e) => onLtvMonthsChange(Math.min(600, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                      className="w-14 text-center border border-stone-300 rounded px-1 py-0.5 num-tabular text-stone-800 focus:outline-none focus:border-[#6639A6]" />
                  ) : (<span className="font-medium">{ltvMonths}</span>)}
                  <span>months (assumed lifetime — edit to model)</span>
                </div>
              </div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">Per customer ({customerRows.length})</div>
              {customerRows.length === 0 ? (
                <div className="py-4 text-sm text-stone-400">No new customers in this window.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Customer</th>
                      <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Cash</th>
                      <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">MRR</th>
                      <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">× {ltvMonths}mo</th>
                      <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.map((r, i) => {
                      const cash = Number(r.one_time) || 0, mrr = Number(r.mrr) || 0
                      const recurring = mrr * ltvMonths
                      return (
                        <tr key={r.uid || i} className="border-b border-stone-100">
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-stone-900 leading-tight">{r.attendee_name || 'Unnamed'}</div>
                            {r.attendee_email && <div className="text-[11px] text-stone-400 truncate max-w-[180px]">{r.attendee_email}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{cash ? fmtMoney(cash) : '—'}</td>
                          <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{mrr ? fmtMoney(mrr) : '—'}</td>
                          <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-500">{recurring ? fmtMoney(recurring) : '—'}</td>
                          <td className="py-2.5 px-4 text-right num-tabular text-xs font-semibold" style={{ color: '#6639A6' }}>{fmtMoney(cash + recurring)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-stone-900 text-stone-50">
                      <td className="py-2.5 px-4 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
                      <td className="py-2.5 px-3 text-right num-tabular font-bold">{fmtMoney(ltvTotals.cash)}</td>
                      <td className="py-2.5 px-3 text-right num-tabular font-bold">{fmtMoney(ltvTotals.mrr)}</td>
                      <td className="py-2.5 px-3 text-right num-tabular font-bold">{fmtMoney(ltvTotals.recurring)}</td>
                      <td className="py-2.5 px-4 text-right num-tabular font-bold">{fmtMoney(ltvTotals.ltv)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(isSpend || isCac) && (<>
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">Ad spend by campaign</div>
          {loading ? (
            <div className="py-8 text-center text-sm text-stone-400">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="py-8 text-center text-sm text-stone-400">No ad spend in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Campaign</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Spend</th>
                  <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-stone-100">
                    <td className="py-2.5 px-4 text-stone-800">{c.name}</td>
                    <td className="py-2.5 px-3 text-right num-tabular text-stone-700">{fmtMoney(c.spend)}</td>
                    <td className="py-2.5 px-4 text-right num-tabular text-stone-500">{total ? `${Math.round((c.spend / total) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-stone-900 text-stone-50">
                  <td className="py-2.5 px-4 mono-font text-[10px] uppercase tracking-widest font-medium">Total</td>
                  <td className="py-2.5 px-3 text-right num-tabular font-bold">{fmtMoney(total)}</td>
                  <td className="py-2.5 px-4 text-right num-tabular font-bold">100%</td>
                </tr>
              </tbody>
            </table>
          )}
          </>)}
        </div>
      </div>
    </div>
  ), document.body)
}
