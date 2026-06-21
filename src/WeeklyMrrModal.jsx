import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertCircle, RotateCcw, TrendingUp, Plus } from 'lucide-react'
import { getWeekKey } from './dateUtils.js'

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

const BRAND = '#6639A6'        // eyebrow / icon accent
const BTN = '#5B21B6'          // filled action buttons (Save / Add)
const BORDER = '#E2E8F0'       // input borders
const DIVIDER = '#F3F4F6'      // row dividers

function weekLabel(weekKey) {
  const d = new Date(weekKey + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return weekKey
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Week · MRR · actions — fixed tracks so the header and every row line up.
const GRID_COLS = { gridTemplateColumns: '210px 140px 128px' }

// $-prefixed currency input with a shaded left adornment panel + purple focus ring.
// `value` is the RAW digit string (e.g. "172475"); it's shown with thousands
// commas ("172,475") but onChange always reports the raw digits, so the saved
// value is the plain number, never the formatted string.
function MoneyInput({ value, onChange, placeholder = '0' }) {
  const display = value === '' || value == null ? '' : Number(value).toLocaleString('en-US')
  const handleChange = (e) => onChange(e.target.value.replace(/[^0-9]/g, ''))
  return (
    <div className="flex items-stretch h-9 rounded-lg border bg-white overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-[#6B21A8]/20"
      style={{ borderColor: BORDER }}>
      <span className="flex items-center justify-center w-8 shrink-0 bg-gray-50 border-r text-stone-400 text-sm select-none" style={{ borderColor: BORDER }}>$</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 text-sm num-tabular bg-transparent outline-none"
      />
    </div>
  )
}

const SAVE_BTN_CLS = 'inline-flex items-center justify-center gap-1.5 h-9 w-20 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all hover:shadow-[0_1px_2px_rgba(0,0,0,0.1)]'

function WeekRow({ row, onSaveWeek }) {
  const [val, setVal] = useState(row.mrr != null ? String(row.mrr) : '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'success' | null
  const [error, setError] = useState(null)
  const isManual = row.source === 'manual'

  // Keep in sync if the underlying series value changes (e.g. an upstream
  // monthly edit reshapes the interpolation while this stays open).
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
    <div className="grid gap-3 items-center py-2.5" style={GRID_COLS}>
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm font-semibold text-stone-800 whitespace-nowrap">Week of {weekLabel(row.weekKey)}</span>
        <span
          className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase rounded px-[5px] py-px"
          style={isManual ? { background: '#ECFDF5', color: '#15803D' } : { background: '#FFF8E7', color: '#B45309' }}
        >
          {isManual ? 'Manual' : 'Estimated'}
        </span>
      </div>
      <MoneyInput value={val} onChange={setVal} />
      <div className="flex items-center justify-end gap-1.5">
        {isManual && (
          <button
            onClick={() => run(null)}
            disabled={saving}
            title="Reset to estimated (remove manual override)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border text-stone-500 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            style={{ borderColor: BORDER }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => run(val)} disabled={saving} className={SAVE_BTN_CLS} style={{ background: BTN }}>
          <Check className="w-3.5 h-3.5" />
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
  const [addDate, setAddDate] = useState('')
  const [addVal, setAddVal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState(null)

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

  const rows = [...series].reverse() // newest week first

  const addWeek = async () => {
    setAddErr(null)
    if (!addDate) { setAddErr('Pick a date in the week you want to add.'); return }
    if (addVal === '' || Number.isNaN(Number(addVal))) { setAddErr('Enter a valid MRR amount.'); return }
    setAdding(true)
    try {
      const wk = getWeekKey(new Date(addDate + 'T00:00:00')) // snaps the date to its Monday
      await onSaveWeek(wk, addVal)
      setAddDate(''); setAddVal('')
    } catch (e) {
      console.error('addWeek:', e)
      setAddErr(e.message || 'Failed to add week.')
    } finally {
      setAdding(false)
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-mrr-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-8 pt-6 pb-4 border-b" style={{ borderColor: DIVIDER }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
              <TrendingUp className="w-3 h-3" /> Weekly MRR
            </div>
            <h2 id="weekly-mrr-modal-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">
              Edit the weekly trajectory
            </h2>
            <p className="text-[13px] text-stone-500 mt-3 leading-relaxed">
              Weeks marked <span className="font-semibold text-stone-600">Estimated</span> are interpolated between the
              monthly MRR actuals. Enter a real figure to override any week — your value is shared with the
              Investor view. Use reset to fall back to the estimate.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 pt-4 pb-6 flex-1">
          <div className="grid gap-3 mono-text text-[10px] uppercase tracking-widest font-semibold text-stone-400 pb-1" style={GRID_COLS}>
            <span>Week</span>
            <span>MRR</span>
            <span></span>
          </div>
          {rows.length > 0 ? (
            <div className="divide-y" style={{ borderColor: DIVIDER }}>
              {rows.map(row => (
                <WeekRow key={row.weekKey} row={row} onSaveWeek={onSaveWeek} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-400 italic py-2">No weeks to show yet.</div>
          )}

          {/* Add a week */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Add a week</div>
            <div className="grid gap-3 items-center" style={GRID_COLS}>
              <input
                type="date"
                value={addDate}
                onChange={e => setAddDate(e.target.value)}
                className="w-full h-9 px-3 mono-text text-[12px] bg-white border rounded-lg outline-none transition-shadow focus:ring-2 focus:ring-[#6B21A8]/20"
                style={{ borderColor: BORDER }}
              />
              <MoneyInput value={addVal} onChange={setAddVal} />
              <div className="flex justify-end">
                <button onClick={addWeek} disabled={adding} className={SAVE_BTN_CLS} style={{ background: BTN }}>
                  <Plus className="w-3.5 h-3.5" /> {adding ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
            <div className="text-[12px] text-stone-400 italic mt-1">
              Pick any date — it snaps to that week's Monday. Adding a week outside the current range extends the chart.
            </div>
            {addErr && (
              <div className="mt-2 text-[11px] text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 flex-shrink-0" /> {addErr}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
