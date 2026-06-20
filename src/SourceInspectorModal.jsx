import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Database } from 'lucide-react'
import { useSourceInspect } from './hooks/useSourceInspect.js'
import { useProfitwellMetrics } from './hooks/useProfitwellMetrics.js'

const BRAND = '#6639A6'

// One table's fields, fetched live and flattened (path · type · sample).
function TableInspect({ table, label, order }) {
  const { loading, error, fields, empty } = useSourceInspect(table, order)
  return (
    <div className="mb-5">
      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500 mb-2">
        {label} <span className="text-stone-300">· {table}</span>
        {!loading && !error && !empty && <span className="text-stone-300"> · {fields.length} fields</span>}
      </div>
      {loading ? (
        <div className="h-[80px] flex items-center justify-center text-stone-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-[12px] text-red-600">Couldn’t read {table}: {error.message || String(error)}</div>
      ) : empty ? (
        <div className="text-[12px] text-stone-400">No rows yet in {table}.</div>
      ) : (
        <div className="rounded-lg border border-stone-200 overflow-hidden">
          {fields.map((f, i) => (
            <div key={f.path + i} className="flex items-baseline gap-3 px-3 py-1.5 border-b border-stone-50 last:border-b-0">
              <span className="mono-text text-[11px] text-stone-700 flex-1 min-w-0 break-words">{f.path}</span>
              <span className="mono-text text-[9px] uppercase tracking-wider text-stone-400 shrink-0 w-14 text-right">{f.type}</span>
              <span className="mono-text text-[11px] text-stone-500 shrink-0 max-w-[45%] truncate">{f.sample}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ProfitWell is long-format (metric_name/month_key/value) — the real "data points" are
// the distinct metric names, so list each metric + its latest value rather than row columns.
function MetricCatalogInspect() {
  const { loading, error, metrics } = useProfitwellMetrics()
  return (
    <div className="mb-1">
      <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500 mb-2">
        Metrics <span className="text-stone-300">· profitwell_metrics</span>
        {!loading && !error && <span className="text-stone-300"> · {metrics.length} metrics</span>}
      </div>
      {loading ? (
        <div className="h-[80px] flex items-center justify-center text-stone-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-[12px] text-red-600">Couldn’t read profitwell_metrics: {error.message || String(error)}</div>
      ) : metrics.length === 0 ? (
        <div className="text-[12px] text-stone-400">No metrics synced yet.</div>
      ) : (
        <div className="rounded-lg border border-stone-200 overflow-hidden">
          {metrics.map(m => (
            <div key={m.name} className="flex items-baseline gap-3 px-3 py-1.5 border-b border-stone-50 last:border-b-0">
              <span className="mono-text text-[11px] text-stone-700 flex-1 min-w-0 break-words">{m.name}</span>
              <span className="mono-text text-[9px] uppercase tracking-wider text-stone-400 shrink-0">{m.months} mo</span>
              <span className="mono-text text-[11px] text-stone-500 shrink-0 max-w-[40%] truncate">
                {m.latest?.value != null ? `${m.latest.value} (${m.latest.monthKey})` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Read-only "what data points do we get from this source" inspector. Live-introspects a
// real row per table (or the metric catalog for ProfitWell). `source` is a Tracking Guide
// entry carrying an `inspect` descriptor.
export default function SourceInspectorModal({ source, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const inspect = source?.inspect
  const mode = inspect?.mode

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <SourceInspectorStyles />
      <div className="source-inspector-modal bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <Database className="w-3 h-3" /> Data Inspector
            </div>
            <h2 className="display-text text-2xl font-medium leading-tight text-stone-900">{source?.title}</h2>
            {source?.provider && <p className="text-sm text-stone-600 mt-1">{source.provider}</p>}
            <p className="text-[12px] text-stone-500 mt-2">Every data point we currently store from this source — to decide what to surface elsewhere.</p>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {mode === 'metric-catalog' ? (
            <MetricCatalogInspect />
          ) : mode === 'sample-row' ? (
            (inspect.tables || []).map(t => (
              <TableInspect key={t.table} table={t.table} label={t.label} order={t.order} />
            ))
          ) : (
            <div className="text-[12px] text-stone-400">No inspector configured for this source.</div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function SourceInspectorStyles() {
  return (
    <style>{`
      .source-inspector-modal {
        font-family: 'Manrope', sans-serif;
        animation: sourceInspectorIn 220ms cubic-bezier(.16,1,.3,1);
      }
      .source-inspector-modal .display-text { font-family: 'Instrument Serif', serif; font-weight: 400; letter-spacing: -0.01em; }
      .source-inspector-modal .mono-text { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum'; }
      @keyframes sourceInspectorIn {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `}</style>
  )
}
