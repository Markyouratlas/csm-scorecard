import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'

// ============================================================================
//  BookedMeetingsDrilldownModal — lists the individual meetings behind one
//  event-type row on the Growth "Booked Meetings" tab.
//
//  Each row can be flagged as an internal/test meeting (onToggleTest), which backs
//  it out of every attribution count. Test rows still show here (dimmed) so they
//  can be found + un-flagged.
//
//  Props:
//    label        — event type's display label (modal title)
//    rows         — booked_meetings_detail rows for this event type
//                   { uid, start_time, attendee_name, attendee_email, host_name,
//                     cal_status, deal_status, mrr, one_time, products, is_test }
//    onToggleTest — (uid, isTest) => void
//    testBusy     — uid currently saving (spinner) | null
//    onClose      — close handler
// ============================================================================

const BRAND = '#2563EB'
const fmtMoney = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '—' } }

const STATUS_STYLE = {
  'Closed Won':   { color: '#065F46', bg: 'rgba(16,185,129,0.12)' },
  'Closed Lost':  { color: '#9F1239', bg: 'rgba(244,63,94,0.10)' },
  'Deposit collected': { color: '#B45309', bg: 'rgba(217,119,6,0.12)' },
  'No-show':      { color: '#9A3412', bg: 'rgba(234,88,12,0.10)' },
  'Unqualified':  { color: '#57534E', bg: 'rgba(120,113,108,0.12)' },
}
const calLabel = (s) => {
  if (!s) return 'No deal yet'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'accepted') return 'Booked'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function BookedMeetingsDrilldownModal({ label, rows = [], onToggleTest, testBusy, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const active = rows.filter(r => !r.is_test)
  const testCount = rows.length - active.length
  const wonRows = active.filter(r => r.deal_status === 'Closed Won')
  const cashTotal = wonRows.reduce((s, r) => s + (Number(r.one_time) || 0), 0)
  const mrrTotal = wonRows.reduce((s, r) => s + (Number(r.mrr) || 0), 0)
  const summary = `${active.length} meeting${active.length === 1 ? '' : 's'} · ${wonRows.length} closed won`
    + (wonRows.length ? ` · ${fmtMoney(cashTotal)} cash · ${fmtMoney(mrrTotal)} MRR` : '')
    + (testCount ? ` · ${testCount} test excluded` : '')

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,25,23,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-start justify-between gap-4">
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest" style={{ color: BRAND }}>Booked Meetings</div>
            <div className="display-font text-2xl font-medium text-stone-900 leading-tight">{label}</div>
            <div className="text-sm text-stone-600 mt-0.5">{summary}</div>
            <div className="text-[11px] text-stone-400 mt-1">“Mark test” flags an internal/team booking so it’s backed out of every attribution count.</div>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 text-stone-400 hover:text-stone-700 transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-stone-500">No meetings for this event type in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">With</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Meeting</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Status</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Cash</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">MRR</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Products</th>
                  <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isWon = r.deal_status === 'Closed Won'
                  const st = STATUS_STYLE[r.deal_status]
                  const busy = testBusy === r.uid
                  return (
                    <tr key={r.uid || i} className={`border-b border-stone-100 ${r.is_test ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-stone-900 leading-tight">{r.attendee_name || 'Unnamed'}</span>
                          {r.is_test && <span className="mono-font text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,119,6,0.12)', color: '#B45309' }}>Test</span>}
                        </div>
                        {r.attendee_email && <div className="text-[11px] text-stone-400 truncate max-w-[220px]">{r.attendee_email}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-stone-600">{r.host_name || '—'}</td>
                      <td className="py-2.5 px-3 num-tabular text-xs text-stone-600">{fmtDate(r.start_time)}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mono-font uppercase tracking-wide"
                          style={st ? { color: st.color, background: st.bg } : { color: '#57534E', background: 'rgba(120,113,108,0.10)' }}>
                          {r.deal_status || calLabel(r.cal_status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{isWon && Number(r.one_time) ? fmtMoney(r.one_time) : '—'}</td>
                      <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{isWon && Number(r.mrr) ? fmtMoney(r.mrr) : '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-stone-600 max-w-[200px] truncate">{isWon ? (r.products || '—') : '—'}</td>
                      <td className="py-2.5 px-4 text-right">
                        {onToggleTest && (
                          <button onClick={() => onToggleTest(r.uid, !r.is_test)} disabled={busy}
                            className="mono-font text-[9px] uppercase tracking-wider px-2 py-1 rounded border transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                            style={ r.is_test
                              ? { borderColor: '#e7e5e4', color: '#78716c', background: '#f5f5f4' }
                              : { borderColor: 'rgba(217,119,6,0.4)', color: '#B45309', background: 'rgba(217,119,6,0.08)' } }>
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {r.is_test ? 'Untag test' : 'Mark test'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}
