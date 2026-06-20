import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Check, AlertCircle, RotateCcw, TrendingUp } from 'lucide-react'

// =============================================================================
//  WeeklyMrrModal
//
//  Exec-only editor for the WEEKLY MRR trajectory shown in the hero chart.
//  We only have real MONTHLY anchors, so the in-between weeks are interpolated;
//  this modal lets an executive type the real figure for any week. A manual
//  value overrides the interpolated one and is shared with the Investor view
//  (both read useWeeklyMrr's ['weekly-mrr'] cache). "Reset" clears the override
//  and the week falls back to interpolation.
//
//  Props:
//    open        — render nothing when false
//    onClose     — close callback
//    series      — [{ week, weekKey, mrr, source }] from useWeeklyMrr
//    onSaveWeek  — (weekKey, value|null) => Promise  (useWeeklyMrr.saveWeek)
// =============================================================================

const BRAND = '#6639A6'

function weekLabel(weekKey) {
  // weekKey = Monday 'YYYY-MM-DD'
  const d = new Date(weekKey + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return weekKey
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function WeekRow({ row, onSaveWeek }) {
  const [val, setVal] = useState(row.mrr != null ? String(row.mrr) : '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'success' | null
  const [error, setError] = useState(null)
  const isManual = row.source === 'manual'

  // Keep the input in sync if the underlying series value changes (e.g. an
  // upstream monthly edit reshapes the interpolation while this stays open).
  useEffect(() => { setVal(row.mrr != null ? String(row.mrr) : '') }, [row.mrr])

  const run = async (value) => {
    setSaving(true); setError(null); setStatus(null)
    try {
      await onSaveWeek(row.weekKey, value)
      setStatus('success')
      setTimeout(() => setStatus(null), 1800)
    } catch (e) {
      console.error('saveWeek:', e)
      setError(e.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-[150px_1fr_auto] gap-2 items-center">
      <div className="flex items-center gap-2">
        <div className="mono-text text-[12px] font-semibold text-stone-700">Week of {weekLabel(row.weekKey)}</div>
        <span
          className="mono-text text-[8.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={isManual
            ? { color: '#15803D', background: 'rgba(22,163,74,0.12)' }
            : { color: '#8A6D1B', background: 'rgba(184,134,11,0.12)' }}
        >
          {isManual ? 'Manual' : 'Estimated'}
        </span>
      </div>
      <input
        type="number"
        step="any"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="MRR"
        className="w-full text-sm num-tabular bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
      />
      <div className="flex items-center gap-1.5">
        {isManual && (
          <button
            onClick={() => run(null)}
            disabled={saving}
            title="Reset to estimated (remove manual override)"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-stone-300 text-stone-500 hover:bg-stone-100 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => run(val)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
          style={{ background: BRAND }}
        >
          {status === 'success' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : status === 'success' ? 'Saved' : 'Save'}
        </button>
      </div>
      {error && (
        <div className="col-span-3 text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}

export default function WeeklyMrrModal({ open, onClose, series = [], onSaveWeek }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  // Newest week first reads most naturally for editing.
  const rows = [...series].reverse()

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-mrr-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <TrendingUp className="w-3 h-3" /> Weekly MRR
            </div>
            <h2 id="weekly-mrr-modal-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">
              Edit the weekly trajectory
            </h2>
            <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">
              Weeks marked <span className="font-semibold">Estimated</span> are interpolated between the
              monthly MRR actuals. Enter a real figure to override any week — your value is shared with
              the Investor view. Use reset to fall back to the estimate.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1 space-y-5">
          <div className="grid grid-cols-[150px_1fr_auto] gap-2 mono-text text-[10px] uppercase tracking-[0.14em] font-semibold text-stone-400">
            <span>Week</span>
            <span>MRR</span>
            <span></span>
          </div>
          {rows.length > 0 ? (
            <div className="space-y-2.5">
              {rows.map(row => (
                <WeekRow key={row.weekKey} row={row} onSaveWeek={onSaveWeek} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-400 italic py-2">No weeks to show yet.</div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
