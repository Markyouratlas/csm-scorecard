import React, { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { AE_ATTENDED_STATUSES } from './roleConstants'
import { weekKeyOfMeeting, dayIdxOfMeeting } from './aeFunnel'

// ============================================================================
//  AeFunnelDrilldownModal — lists the ae_deals behind a Daily-funnel number.
//  Opened by clicking a count cell (per-day or the weekly total). Read-only.
//
//  Filters mirror deriveFunnelWeek EXACTLY: booked/completed/intros bucket by the
//  MEETING date; closes bucket by the CLOSE date (closed_at, else meeting_at).
//
//  Props:
//    drill       — { metricKey: 'booked'|'completed'|'closes'|'intros', dayIdx (number|null=whole week), label }
//    deals       — all of the AE's ae_deals (useAeDeals.deals)
//    weekKey     — the week being viewed (Monday YYYY-MM-DD)
//    workDayIdxs — the AE's work days (getDay indices) for the whole-week scope
//    onClose     — close handler
// ============================================================================

const BRAND = '#1E40AF'

const METRICS = {
  booked:    { title: 'Demos booked',           bucket: 'meeting', filter: d => !['Rescheduled', 'Deleted', 'Intro'].includes(d.status) },
  completed: { title: 'Demos completed',        bucket: 'meeting', filter: d => AE_ATTENDED_STATUSES.includes(d.status) },
  intros:    { title: 'Intro meetings',         bucket: 'meeting', filter: d => d.status === 'Intro' },
  closes:    { title: 'Closes (Closed Won)',    bucket: 'close',   filter: d => d.status === 'Closed Won', money: true },
}

const STATUS_STYLE = {
  'Closed Won':  { color: '#065F46', bg: 'rgba(16,185,129,0.12)' },
  'Closed Lost': { color: '#9F1239', bg: 'rgba(244,63,94,0.10)' },
  'No-show':     { color: '#9A3412', bg: 'rgba(234,88,12,0.10)' },
  'Unqualified': { color: '#57534E', bg: 'rgba(120,113,108,0.12)' },
  'Intro':       { color: '#6639A6', bg: 'rgba(102,57,166,0.12)' },
}
const fmtMoney = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '—' } }

export default function AeFunnelDrilldownModal({ drill, deals, weekKey, workDayIdxs, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const meta = METRICS[drill.metricKey] || { title: drill.metricKey, bucket: 'meeting', filter: () => true }

  const rows = useMemo(() => {
    return (deals || []).filter(d => {
      if (!meta.filter(d)) return false
      const src = meta.bucket === 'close' ? (d.closed_at || d.meeting_at) : d.meeting_at
      if (!src || weekKeyOfMeeting(src) !== weekKey) return false
      const di = dayIdxOfMeeting(src)
      return drill.dayIdx == null ? workDayIdxs.includes(di) : di === drill.dayIdx
    }).sort((a, b) => {
      const as = meta.bucket === 'close' ? (a.closed_at || a.meeting_at) : a.meeting_at
      const bs = meta.bucket === 'close' ? (b.closed_at || b.meeting_at) : b.meeting_at
      return new Date(bs || 0) - new Date(as || 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, drill, weekKey, workDayIdxs])

  const totalMrr = rows.reduce((s, d) => s + (Number(d.mrr) || 0), 0)
  const totalCash = rows.reduce((s, d) => s + (Number(d.one_time) || 0), 0)
  const summary = meta.money
    ? `${rows.length} ${rows.length === 1 ? 'deal' : 'deals'} · ${fmtMoney(totalMrr)}/mo · ${fmtMoney(totalCash)} cash`
    : `${rows.length} ${rows.length === 1 ? 'meeting' : 'meetings'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,25,23,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-start justify-between gap-4">
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest" style={{ color: BRAND }}>Daily Funnel · {drill.label}</div>
            <div className="display-font text-2xl font-medium text-stone-900 leading-tight">{meta.title}</div>
            <div className="text-sm text-stone-600 mt-0.5">{summary}</div>
            {meta.bucket === 'close' && <div className="text-[11px] text-stone-400 mt-1">Bucketed by the close/cash date (Closed date), not the meeting date.</div>}
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 text-stone-400 hover:text-stone-700 transition-colors" title="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-stone-500">No deals for this metric in this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Meeting</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Status</th>
                  {meta.bucket === 'close' && <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Closed</th>}
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">MRR</th>
                  <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Cash</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const st = STATUS_STYLE[d.status]
                  return (
                    <tr key={d.id} className="border-b border-stone-100">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-stone-900 leading-tight">{d.customer_name || 'Unnamed'}</div>
                        {d.customer_email && <div className="text-[11px] text-stone-400 truncate max-w-[220px]">{d.customer_email}</div>}
                      </td>
                      <td className="py-2.5 px-3 num-tabular text-xs text-stone-600">{fmtDate(d.meeting_at)}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mono-font uppercase tracking-wide"
                          style={st ? { color: st.color, background: st.bg } : { color: '#57534E', background: 'rgba(120,113,108,0.10)' }}>
                          {d.status}
                        </span>
                      </td>
                      {meta.bucket === 'close' && <td className="py-2.5 px-3 num-tabular text-xs text-stone-600">{d.closed_at ? fmtDate(d.closed_at) : '—'}</td>}
                      <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{Number(d.mrr) ? fmtMoney(d.mrr) : '—'}</td>
                      <td className="py-2.5 px-4 text-right num-tabular text-xs text-stone-700">{Number(d.one_time) ? fmtMoney(d.one_time) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
