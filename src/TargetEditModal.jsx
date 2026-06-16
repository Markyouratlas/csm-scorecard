import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Edit3, TrendingUp, TrendingDown, Clock, Check, AlertCircle } from 'lucide-react'
import { METRIC_CATALOG, formatMetricValue } from './hooks/useAtlasTargets.js'

// =============================================================================
//  TargetEditModal
//
//  A modal that opens when a user clicks a metric card in Odyssey. Shows:
//   - The metric name + description
//   - Current month's actual (from atlas_targets or computed) + an editable target
//   - 12 months of history as a sparkline + small table
//   - A read-only "Awaiting [Provider]" banner if the actual source is external
//   - Save button (only enabled if the user is an executive)
//
//  Props:
//    metricKey       — the key in atlas_targets (e.g. 'total-mrr')
//    monthKey        — defaults to current month ('YYYY-MM')
//    initialActual   — fallback actual value when atlas_targets has no row
//    targetsHook     — the result of useAtlasTargets()
//    canEdit         — true if the current user can save targets (executive tier)
//    userId          — current user id (for updated_by)
//    onClose         — callback to close the modal
// =============================================================================

const BRAND = '#6639A6'

export default function TargetEditModal({
  metricKey,
  monthKey,
  initialActual,
  liveActual,
  targetsHook,
  canEdit = false,
  userId = null,
  onClose,
}) {
  const catalog = METRIC_CATALOG[metricKey] || {
    label: metricKey,
    format: 'count',
    description: '',
  }

  const currentMonth = monthKey || targetsHook.currentMonthKey
  const monthValue = targetsHook.getMonthValue(metricKey, currentMonth) || {}
  const history = targetsHook.getMonthHistory(metricKey)

  // Resolve actual: prefer atlas_targets value, fall back to caller-provided initialActual
  const displayActual = monthValue.actual ?? liveActual ?? initialActual ?? null
  const displayTarget = monthValue.target ?? null

  const [targetInput, setTargetInput] = useState(
    displayTarget != null ? String(displayTarget) : ''
  )
  const [actualInput, setActualInput] = useState(
    displayActual != null ? String(displayActual) : ''
  )
  const [notes, setNotes] = useState(monthValue.notes || '')
  const [editingActual, setEditingActual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'success' | 'error' | null
  const [errorMsg, setErrorMsg] = useState(null)

  // Close on ESC
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Compute delta vs target
  const targetNum = targetInput === '' ? null : Number(targetInput)
  const actualNum = displayActual
  const onTarget = targetNum != null && actualNum != null
    ? actualNum >= targetNum
    : null
  const pctToTarget = targetNum != null && actualNum != null && targetNum > 0
    ? (actualNum / targetNum) * 100
    : null

  const hasUnsavedChanges = useMemo(() => {
    if (!canEdit) return false
    const origTarget = displayTarget != null ? String(displayTarget) : ''
    const origActual = displayActual != null ? String(displayActual) : ''
    const origNotes = monthValue.notes || ''
    return targetInput !== origTarget
        || (editingActual && actualInput !== origActual)
        || notes !== origNotes
  }, [canEdit, targetInput, actualInput, editingActual, notes, displayTarget, displayActual, monthValue.notes])

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    setErrorMsg(null)
    setSaveStatus(null)
    try {
      const payload = {}
      if (targetInput !== (displayTarget != null ? String(displayTarget) : '')) {
        payload.target = targetInput === '' ? null : Number(targetInput)
      }
      if (editingActual && actualInput !== (displayActual != null ? String(displayActual) : '')) {
        payload.actual = actualInput === '' ? null : Number(actualInput)
      }
      if (notes !== (monthValue.notes || '')) {
        payload.notes = notes
      }
      if (Object.keys(payload).length === 0) {
        setSaving(false)
        return
      }
      await targetsHook.save(metricKey, currentMonth, payload, userId)
      setSaveStatus('success')
      setEditingActual(false)
      setTimeout(() => setSaveStatus(null), 2500)
    } catch (e) {
      console.error('Save target error:', e)
      setErrorMsg(e.message || 'Failed to save. Make sure you have executive permissions.')
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!canEdit) return
    setResetting(true)
    setErrorMsg(null)
    setSaveStatus(null)
    try {
      await targetsHook.resetActual(metricKey, currentMonth, userId)
      setEditingActual(false)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(null), 2500)
    } catch (e) {
      console.error('Reset actual error:', e)
      setErrorMsg(e.message || 'Reset failed')
      setSaveStatus('error')
    } finally {
      setResetting(false)
    }
  }

  // The historical table & sparkline data: use atlas_targets history, but if a month
  // has no actual AND we have initialActual for current month, drop that in
  const historyForChart = history
    .map(h => ({
      ...h,
      actual: h.monthKey === currentMonth && h.actual == null
        ? (liveActual ?? initialActual) ?? null
        : h.actual,
    }))

  // Render via portal so we float above everything
  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <ModalStyles />
      <div
        className="atlas-target-modal bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="target-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <Edit3 className="w-3 h-3" /> Edit Target · {formatMonthLabel(currentMonth)}
            </div>
            <h2 id="target-modal-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">
              {catalog.label}
            </h2>
            {catalog.description && (
              <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">{catalog.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Awaiting banner */}
        {catalog.awaiting && (
          <div className="mx-6 mt-4 px-3 py-2 rounded-lg flex items-center gap-2 text-[12px]"
            style={{ background: 'rgba(102,57,166,0.06)', border: '1px solid rgba(102,57,166,0.2)', color: BRAND }}>
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong className="font-semibold">Actuals come from {catalog.awaiting}</strong>
              {' '}— once that integration is live, real numbers will overwrite the manual backfill.
              Your targets here stay untouched.
            </span>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1 space-y-6">
          {/* Big number row: Actual ▸ vs ▸ Target */}
          <div className="grid grid-cols-2 gap-4">
            {/* Actual */}
            <div className="rounded-xl p-4 border" style={{ borderColor: 'rgba(26,15,46,0.12)', background: '#FAFAF7' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500">Actual</div>
                {canEdit && !editingActual && (
                  <button onClick={() => setEditingActual(true)}
                    className="text-[11px] font-semibold text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              {editingActual ? (
                <div className="space-y-1">
                  <input
                    type="number"
                    step="any"
                    value={actualInput}
                    onChange={e => setActualInput(e.target.value)}
                    className="w-full display-text text-3xl font-medium leading-none num-tabular bg-white border-2 border-stone-300 focus:border-purple-500 outline-none rounded-lg px-3 py-2"
                    style={{ color: BRAND }}
                    placeholder="—"
                    autoFocus
                  />
                  <div className="text-[10.5px] text-stone-500 mt-1">
                    Manual edits will be flagged as <code className="font-mono">source=manual</code> so Stripe sync doesn't overwrite.
                  </div>
                </div>
              ) : (
                <div className="display-text text-3xl md:text-4xl font-medium leading-none num-tabular" style={{ color: BRAND }}>
                  {displayActual != null ? formatMetricValue(displayActual, catalog.format) || '—' : <span className="text-stone-300 text-lg">No data</span>}
                </div>
              )}
              {monthValue.source && !editingActual && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] mono-text uppercase tracking-widest text-stone-400">
                    source: {monthValue.source.replace('_', ' ')}
                  </div>
                  {canEdit && (monthValue.source === 'manual' || monthValue.source === 'manual_backfill') && (
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={resetting}
                      title="Clear this manual override so the metric reverts to its live/synced source (Stripe or ProfitWell)."
                      className="text-[10px] font-semibold mono-text uppercase tracking-widest disabled:opacity-50"
                      style={{ color: BRAND }}
                    >
                      {resetting ? 'Resetting…' : '↺ Reset to source'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Target */}
            <div className="rounded-xl p-4 border" style={{ borderColor: 'rgba(102,57,166,0.3)', background: 'rgba(102,57,166,0.04)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: BRAND }}>
                  Target {canEdit && '· editable'}
                </div>
              </div>
              {canEdit ? (
                <input
                  type="number"
                  step="any"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  className="w-full display-text text-3xl md:text-4xl font-medium leading-none num-tabular bg-white border-2 border-purple-200 focus:border-purple-500 outline-none rounded-lg px-3 py-2"
                  style={{ color: BRAND }}
                  placeholder="—"
                />
              ) : (
                <div className="display-text text-3xl md:text-4xl font-medium leading-none num-tabular" style={{ color: BRAND }}>
                  {displayTarget != null
                    ? formatMetricValue(displayTarget, catalog.format) || '—'
                    : <span className="text-stone-300 text-lg">Not set</span>}
                </div>
              )}
              {pctToTarget != null && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold">
                  {onTarget
                    ? <span className="inline-flex items-center gap-1 text-green-700"><TrendingUp className="w-3 h-3" /> {pctToTarget.toFixed(0)}% — on or above target</span>
                    : <span className="inline-flex items-center gap-1 text-orange-700"><TrendingDown className="w-3 h-3" /> {pctToTarget.toFixed(0)}% to target</span>}
                </div>
              )}
            </div>
          </div>

          {/* Sparkline + history table */}
          {historyForChart.length >= 2 && (
            <div>
              <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500 mb-3 flex items-center justify-between">
                <span>All months · {historyForChart.length} total</span>
                {canEdit && <span className="text-stone-400 normal-case tracking-normal text-[11px]">Click any target to edit</span>}
              </div>
              <HistoryChart data={historyForChart} format={catalog.format} />
              <HistoryTable
                data={historyForChart}
                format={catalog.format}
                canEdit={canEdit}
                metricKey={metricKey}
                currentMonthKey={currentMonth}
                targetsHook={targetsHook}
                userId={userId}
                onCurrentMonthSaved={(newTarget) => setTargetInput(newTarget != null ? String(newTarget) : '')}
              />
            </div>
          )}

          {/* Notes (only when canEdit) */}
          {canEdit && (
            <div>
              <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500 mb-2">
                Notes (optional)
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full text-sm bg-stone-50 border border-stone-200 focus:border-purple-300 outline-none rounded-lg px-3 py-2"
                placeholder="Context for this month's target (e.g. 'Quarterly board commit', 'Conservative — Stripe just took down infra')"
              />
            </div>
          )}

          {!canEdit && (
            <div className="px-3 py-2 rounded-lg flex items-start gap-2 text-[12px] bg-stone-50 border border-stone-200 text-stone-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-stone-400" />
              <span>You're viewing this in read-only mode. Only users with executive access can edit targets.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-between gap-3 bg-stone-50">
          <div className="flex-1 min-w-0">
            {saveStatus === 'success' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                <Check className="w-3.5 h-3.5" /> Saved
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <AlertCircle className="w-3.5 h-3.5" /> {errorMsg || 'Save failed'}
              </div>
            )}
            {!saveStatus && monthValue.updatedAt && (
              <div className="text-[11px] text-stone-500 mono-text">
                Last edit: {new Date(monthValue.updatedAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-stone-600 hover:bg-stone-200 transition-colors"
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-all inline-flex items-center gap-1.5"
              style={{
                background: hasUnsavedChanges && !saving ? BRAND : '#E7E5E4',
                color: hasUnsavedChanges && !saving ? 'white' : '#A8A29E',
                boxShadow: hasUnsavedChanges && !saving ? '0 2px 8px rgba(102,57,166,0.3)' : 'none',
                cursor: hasUnsavedChanges && !saving ? 'pointer' : 'not-allowed',
              }}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// =============================================================================
//  Sub-components
// =============================================================================

function HistoryChart({ data, format }) {
  const w = 560
  const h = 110
  const padTop = 14
  const padBottom = 22
  const padLeft = 8
  const padRight = 8

  // Collect all non-null actuals and targets to figure out the y-axis range
  const allVals = data.flatMap(d => [d.actual, d.target]).filter(v => v != null && !isNaN(v))
  if (allVals.length < 2) return null
  const minV = Math.min(...allVals, 0)
  const maxV = Math.max(...allVals) || 1
  const range = maxV - minV || 1

  const innerW = w - padLeft - padRight
  const innerH = h - padTop - padBottom

  const xAt = (i) => padLeft + (i / Math.max(1, data.length - 1)) * innerW
  const yAt = (v) => padTop + (1 - (v - minV) / range) * innerH

  // Actual line (only points where actual != null)
  let actualPath = ''
  let actualPts = []
  data.forEach((d, i) => {
    if (d.actual != null && !isNaN(d.actual)) {
      const x = xAt(i)
      const y = yAt(d.actual)
      actualPath += (actualPath ? ' L' : 'M') + ` ${x.toFixed(1)},${y.toFixed(1)}`
      actualPts.push({ x, y, value: d.actual, monthKey: d.monthKey })
    }
  })

  // Target line
  let targetPath = ''
  data.forEach((d, i) => {
    if (d.target != null && !isNaN(d.target)) {
      const x = xAt(i)
      const y = yAt(d.target)
      targetPath += (targetPath ? ' L' : 'M') + ` ${x.toFixed(1)},${y.toFixed(1)}`
    }
  })

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-2 mb-3">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {/* Target line (dashed) */}
        {targetPath && (
          <path d={targetPath} fill="none" stroke={BRAND} strokeWidth="1.5"
            strokeDasharray="4 3" opacity="0.55" />
        )}
        {/* Actual line (solid) */}
        {actualPath && (
          <path d={actualPath} fill="none" stroke={BRAND} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* Actual dots */}
        {actualPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={BRAND} />
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % Math.max(1, Math.floor(data.length / 6)) !== 0 && i !== data.length - 1) return null
          return (
            <text key={i} x={xAt(i)} y={h - 6} textAnchor="middle"
              className="mono-text"
              style={{ fontSize: '9px', fill: '#A8A29E' }}>
              {shortMonth(d.monthKey)}
            </text>
          )
        })}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] mono-text uppercase tracking-widest text-stone-500 pl-2 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5" style={{ background: BRAND }}></span>
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed" style={{ borderColor: BRAND }}></span>
          Target
        </span>
      </div>
    </div>
  )
}

function HistoryTable({ data, format, canEdit, metricKey, currentMonthKey, targetsHook, userId, onCurrentMonthSaved }) {
  // Newest first, all months
  const rows = [...data].reverse()

  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden">
      <div className="max-h-[280px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-stone-50 text-[10.5px] mono-text uppercase tracking-widest text-stone-500 border-b border-stone-200">
              <th className="text-left px-3 py-2 font-semibold">Month</th>
              <th className="text-right px-3 py-2 font-semibold">Actual</th>
              <th className="text-right px-3 py-2 font-semibold">Target</th>
              <th className="text-right px-3 py-2 font-semibold w-16">vs Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <EditableTargetRow
                key={row.monthKey}
                row={row}
                format={format}
                canEdit={canEdit}
                isCurrentMonth={row.monthKey === currentMonthKey}
                metricKey={metricKey}
                targetsHook={targetsHook}
                userId={userId}
                onSavedCurrent={onCurrentMonthSaved}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EditableTargetRow({ row, format, canEdit, isCurrentMonth, metricKey, targetsHook, userId, onSavedCurrent }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(row.target != null ? String(row.target) : '')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  // Re-sync local input if the parent's row changes (e.g. after parent save)
  useEffect(() => {
    if (!editing) {
      setInput(row.target != null ? String(row.target) : '')
    }
  }, [row.target, editing])

  // Auto-focus the input when we enter editing mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const pct = row.target != null && row.actual != null && row.target > 0
    ? (row.actual / row.target) * 100
    : null

  function startEdit() {
    if (!canEdit) return
    setInput(row.target != null ? String(row.target) : '')
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setInput(row.target != null ? String(row.target) : '')
    setError(null)
  }

  async function saveEdit() {
    if (!canEdit) return
    const newTarget = input === '' ? null : Number(input)
    if (newTarget != null && isNaN(newTarget)) {
      setError('Invalid number')
      return
    }
    const origTarget = row.target ?? null
    if (newTarget === origTarget) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await targetsHook.save(metricKey, row.monthKey, { target: newTarget }, userId)
      setEditing(false)
      setSavedFlash(true)
      if (isCurrentMonth && onSavedCurrent) onSavedCurrent(newTarget)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      console.error('Inline save error:', e)
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const rowBg = savedFlash ? 'bg-green-50' : (isCurrentMonth ? 'bg-purple-50/40' : '')

  return (
    <tr className={`border-t border-stone-100 transition-colors ${rowBg}`}>
      <td className="px-3 py-2 text-stone-700 mono-text whitespace-nowrap">
        {formatMonthLabel(row.monthKey)}
        {isCurrentMonth && (
          <span className="ml-1.5 text-[9px] uppercase tracking-widest font-semibold" style={{ color: BRAND }}>now</span>
        )}
      </td>
      <td className="px-3 py-2 text-right num-tabular text-stone-900">
        {row.actual != null ? formatMetricValue(row.actual, format) : <span className="text-stone-300">—</span>}
      </td>
      <td className="px-3 py-2 text-right num-tabular text-stone-700">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <input
              ref={inputRef}
              type="number"
              step="any"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={(e) => {
                // Allow click on save/cancel buttons without losing focus
                if (!e.relatedTarget?.closest('.row-edit-actions')) {
                  saveEdit()
                }
              }}
              className="w-24 text-right num-tabular bg-white border border-purple-300 focus:border-purple-500 outline-none rounded px-2 py-1 text-sm"
              disabled={saving}
            />
            <div className="row-edit-actions flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveEdit}
                disabled={saving}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-green-100 text-green-700 disabled:opacity-50"
                title="Save (Enter)"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelEdit}
                disabled={saving}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-stone-100 text-stone-500 disabled:opacity-50"
                title="Cancel (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={!canEdit}
            className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${
              canEdit ? 'hover:bg-purple-50 cursor-pointer group' : 'cursor-default'
            }`}
            title={canEdit ? 'Click to edit' : ''}
          >
            <span>
              {row.target != null
                ? formatMetricValue(row.target, format)
                : <span className="text-stone-300">{canEdit ? 'Set target' : '—'}</span>}
            </span>
            {canEdit && <Edit3 className="w-2.5 h-2.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
        )}
        {error && (
          <div className="text-[10px] text-red-600 font-semibold mt-0.5">{error}</div>
        )}
      </td>
      <td className="px-3 py-2 text-right num-tabular w-16">
        {pct != null
          ? <span className={pct >= 100 ? 'text-green-700 font-semibold' : 'text-orange-700 font-semibold'}>
              {pct.toFixed(0)}%
            </span>
          : <span className="text-stone-300">—</span>}
      </td>
    </tr>
  )
}

function formatMonthLabel(monthKey) {
  // monthKey is 'YYYY-MM'
  if (!monthKey) return ''
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function shortMonth(monthKey) {
  if (!monthKey) return ''
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short' })
}

function ModalStyles() {
  return (
    <style>{`
      .atlas-target-modal {
        font-family: 'Manrope', sans-serif;
        animation: targetModalIn 220ms cubic-bezier(.16,1,.3,1);
      }
      .atlas-target-modal .display-text {
        font-family: 'Instrument Serif', serif;
        font-weight: 400;
        letter-spacing: -0.01em;
      }
      .atlas-target-modal .mono-text {
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: 'tnum';
      }
      .atlas-target-modal .num-tabular {
        font-variant-numeric: tabular-nums;
      }
      @keyframes targetModalIn {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `}</style>
  )
}
