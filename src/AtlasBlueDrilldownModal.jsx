import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AE_ATTENDED_STATUSES } from './roleConstants'

// ============================================================================
//  AtlasBlueDrilldownModal — lists the customers/prospects behind a single
//  bottom-of-funnel number in the Atlas Blue funnel. Opened by clicking any
//  value cell (per-day or the week total). Read-only.
//
//  Props:
//    drill   — { metricKey, dayIdx (number|null for the whole week), label }
//    deals   — viewedWeekDeals from useAtlasBlueFunnel (raw rows + dayIdx)
//    testDrives — viewedWeekTestDrives (contact_key + first_at + dayIdx) for the
//                 'testDrives' metric, which lists conversation contacts, not deals
//    workDayIdxs — the user's work days (getDay indices) for the "whole week" scope
//    onClose — close handler
// ============================================================================

const BRAND = '#6639a6'

// metricKey → how to filter the deals + how to summarize. The filters mirror the
// funnel math exactly (see useAtlasBlueFunnel / aeFunnel.js).
const METRICS = {
  booked:       { title: 'Booked calls',              filter: d => d.status !== 'Rescheduled' },
  completed:    { title: 'Completed',                 filter: d => AE_ATTENDED_STATUSES.includes(d.status) },
  newCustomers: { title: 'New customers',             filter: d => d.status === 'Closed Won' },
  cash:         { title: 'Cash collected',            filter: d => d.status === 'Closed Won', sumKey: 'one_time', money: true },
  dealValue:    { title: 'Deal value',                filter: d => d.status === 'Closed Won', sumKey: 'mrr', money: true },
  avgCash:      { title: 'Avg cash / customer',       filter: d => d.status === 'Closed Won', sumKey: 'one_time', money: true, avg: true },
  avgDeal:      { title: 'Avg deal value / customer', filter: d => d.status === 'Closed Won', sumKey: 'mrr', money: true, avg: true },
  showUp:       { title: 'Show-up rate — booked calls',    filter: d => d.status !== 'Rescheduled', note: 'Show-up % = who attended ÷ these booked calls.' },
  closing:      { title: 'Closing rate — closeable held',  filter: d => AE_ATTENDED_STATUSES.includes(d.status) && d.status !== 'Unqualified', note: 'Closing % = Closed Won ÷ these closeable calls (Unqualified already removed).' },
  testDrives:   { title: 'Test drives', testDrives: true, note: 'Distinct customers who had a conversation with the “Atlas Blue Paid Ads Funnel Agent” campaign, dated by their first conversation.' },
}

// A contact_key is a 10-digit phone (preferred) or an email. Pretty-print phones.
const fmtContact = (key) => {
  if (!key) return '—'
  const digits = String(key).replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  return key
}

const STATUS_STYLE = {
  'Closed Won':   { color: '#065F46', bg: 'rgba(16,185,129,0.12)' },
  'Closed Lost':  { color: '#9F1239', bg: 'rgba(244,63,94,0.10)' },
  'No-show':      { color: '#9A3412', bg: 'rgba(234,88,12,0.10)' },
  'Unqualified':  { color: '#57534E', bg: 'rgba(120,113,108,0.12)' },
}
const fmtMoney = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '—' } }

export default function AtlasBlueDrilldownModal({ drill, deals, testDrives = [], workDayIdxs, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const meta = METRICS[drill.metricKey] || { title: drill.metricKey, filter: () => true }
  const isTestDrives = !!meta.testDrives

  const rows = useMemo(() => {
    const source = isTestDrives ? testDrives : deals
    const inScope = drill.dayIdx == null
      ? source.filter(r => workDayIdxs.includes(r.dayIdx))
      : source.filter(r => r.dayIdx === drill.dayIdx)
    if (isTestDrives) {
      return inScope.slice().sort((a, b) => new Date(b.first_at || 0) - new Date(a.first_at || 0))
    }
    return inScope.filter(meta.filter)
      .slice()
      .sort((a, b) => new Date(b.meeting_at || 0) - new Date(a.meeting_at || 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, testDrives, drill, workDayIdxs])

  const total = meta.sumKey ? rows.reduce((s, d) => s + (Number(d[meta.sumKey]) || 0), 0) : null
  const summary = isTestDrives
    ? `${rows.length} test drive${rows.length === 1 ? '' : 's'}`
    : meta.avg
      ? `${rows.length} customer${rows.length === 1 ? '' : 's'} · avg ${fmtMoney(rows.length ? total / rows.length : 0)} · total ${fmtMoney(total)}`
      : meta.money
        ? `${rows.length} customer${rows.length === 1 ? '' : 's'} · ${fmtMoney(total)} total`
        : `${rows.length} ${rows.length === 1 ? 'deal' : 'deals'}`

  // Portal to <body> so the modal escapes the shell's locked-week wrapper
  // (pointer-events:none + reduced opacity) when viewing a submitted past week.
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,25,23,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-start justify-between gap-4">
          <div>
            <div className="mono-font text-[10px] uppercase tracking-widest" style={{ color: BRAND }}>
              Atlas Blue · {drill.label}
            </div>
            <div className="display-font text-2xl font-medium text-stone-900 leading-tight">{meta.title}</div>
            <div className="text-sm text-stone-600 mt-0.5">{summary}</div>
            {meta.note && <div className="text-[11px] text-stone-400 mt-1">{meta.note}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 text-stone-400 hover:text-stone-700 transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-stone-500">
              {isTestDrives ? 'No test drives in this period.' : 'No deals for this metric in this period.'}
            </div>
          ) : isTestDrives ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Contact</th>
                  <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">First conversation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((td, i) => (
                  <tr key={`${td.contact_key}-${i}`} className="border-b border-stone-100">
                    <td className="py-2.5 px-4 font-medium text-stone-900">{fmtContact(td.contact_key)}</td>
                    <td className="py-2.5 px-4 text-right num-tabular text-xs text-stone-600">{fmtDate(td.first_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Meeting</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Status</th>
                  <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Cash</th>
                  <th className="text-right py-2 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">MRR</th>
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
                      <td className="py-2.5 px-3 text-right num-tabular text-xs text-stone-700">{Number(d.one_time) ? fmtMoney(d.one_time) : '—'}</td>
                      <td className="py-2.5 px-4 text-right num-tabular text-xs text-stone-700">{Number(d.mrr) ? fmtMoney(d.mrr) : '—'}</td>
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
