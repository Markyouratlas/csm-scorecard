import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Users, ChevronDown, ChevronRight } from 'lucide-react'

const BRAND = '#6639A6'

export default function BreakdownModal({ title, subtitle, rows = [], total = 0, loading = false, showSplit = false, splitMode = 'show', onClose }) {
  // Close on ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const maxCount = rows.reduce((m, r) => Math.max(m, r.count || 0), 0) || 1

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <BreakdownStyles />
      <div className="breakdown-modal bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col"
        role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <Users className="w-3 h-3" /> Breakdown by Rep
            </div>
            <h2 className="display-text text-2xl font-medium leading-tight text-stone-900">{title}</h2>
            {subtitle && <p className="text-sm text-stone-600 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {loading ? (
            <div className="h-[120px] flex items-center justify-center text-stone-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-stone-400 text-sm">No data for this week</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <BreakdownRow key={(r.name || '') + i} row={r} maxCount={maxCount} showSplit={showSplit} splitMode={splitMode} />
              ))}
            </div>
          )}
        </div>

        {/* Footer total */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <span className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500">Total</span>
          <span className="display-text text-2xl font-medium num-tabular" style={{ color: BRAND }}>{total}</span>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function fmtMeetingDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' })
}

function BreakdownRow({ row, maxCount, showSplit, splitMode }) {
  const [open, setOpen] = useState(false)
  const hasMeetings = Array.isArray(row.meetings) && row.meetings.length > 0
  const BRAND = '#6639A6'
  return (
    <div className="rounded-lg border border-stone-100">
      <div
        className={`flex items-center gap-3 px-2 py-1.5 ${hasMeetings ? 'cursor-pointer hover:bg-stone-50' : ''}`}
        onClick={() => hasMeetings && setOpen(o => !o)}
        role={hasMeetings ? 'button' : undefined}
        tabIndex={hasMeetings ? 0 : undefined}
        onKeyDown={(e) => { if (hasMeetings && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(o => !o) } }}
      >
        {hasMeetings ? (
          open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-stone-700 truncate">{row.name}</span>
            <span className="num-tabular text-sm font-semibold shrink-0" style={{ color: BRAND }}>{row.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(row.count / maxCount) * 100}%`, background: BRAND }} />
          </div>
          {showSplit && splitMode === 'show' && (row.paid != null || row.organic != null) && (
            <div className="mono-text text-[10px] text-stone-400 mt-1">
              {row.paid || 0} ad-driven · {row.organic || 0} organic
            </div>
          )}
        </div>
      </div>

      {open && hasMeetings && (
        <div className="px-3 pb-2 pt-0.5 space-y-1">
          {row.meetings.map((m) => (
            <div key={m.uid} className="flex items-center justify-between gap-2 text-[11px] pl-6 py-1 border-t border-stone-50">
              <span className="text-stone-600 truncate flex-1 min-w-0">{m.customer}</span>
              <span className="mono-text text-stone-400 shrink-0">{fmtMeetingDate(m.date)}</span>
              <span className="mono-text text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                style={ m.isPaid
                  ? { background: 'rgba(102,57,166,0.1)', color: '#6639A6' }
                  : { background: '#f5f5f4', color: '#78716c' } }>
                {m.eventLabel || m.eventType}
              </span>
              {m.status && m.status.toLowerCase() === 'cancelled' && (
                <span className="mono-text text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 bg-red-50 text-red-500">cancelled</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BreakdownStyles() {
  return (
    <style>{`
      .breakdown-modal {
        font-family: 'Manrope', sans-serif;
        animation: breakdownIn 220ms cubic-bezier(.16,1,.3,1);
      }
      .breakdown-modal .display-text { font-family: 'Instrument Serif', serif; font-weight: 400; letter-spacing: -0.01em; }
      .breakdown-modal .mono-text { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum'; }
      .breakdown-modal .num-tabular { font-variant-numeric: tabular-nums; }
      @keyframes breakdownIn {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `}</style>
  )
}
