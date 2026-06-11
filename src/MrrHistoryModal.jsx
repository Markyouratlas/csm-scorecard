import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Plus, Check, AlertCircle, TrendingUp } from 'lucide-react'
import { supabase } from './supabase.js'

// =============================================================================
//  MrrHistoryModal
//
//  Exec-only editor for monthly MRR snapshots. Lists existing rows (read-only
//  month label + editable MRR + optional Customers + per-row Save), plus an
//  "Add month" row at the bottom.
//
//  All writes go through the upsert_mrr_snapshot RPC — never a direct table
//  write. On success it calls onSaved() (which refreshes the parent's data).
//
//  Props:
//    open     — render nothing when false
//    onClose  — close callback
//    rows     — [{ month_key, mrr, customers, ... }] (from useMrrHistory)
//    onSaved  — called after any successful upsert (refreshes)
// =============================================================================

const BRAND = '#6639A6'
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

async function upsertSnapshot({ monthKey, mrr, customers }) {
  const { error } = await supabase.rpc('upsert_mrr_snapshot', {
    p_month_key: monthKey,
    p_mrr: Number(mrr),
    p_customers: customers === '' ? null : Number(customers),
    p_source: 'manual',
  })
  if (error) throw error
}

function ExistingRow({ row, onSaved }) {
  const [mrr, setMrr] = useState(row.mrr != null ? String(row.mrr) : '')
  const [customers, setCustomers] = useState(row.customers != null ? String(row.customers) : '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'success' | null
  const [error, setError] = useState(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      await upsertSnapshot({ monthKey: row.month_key, mrr, customers })
      setStatus('success')
      setTimeout(() => setStatus(null), 2000)
      onSaved?.()
    } catch (e) {
      console.error('upsert_mrr_snapshot:', e)
      setError(e.message || 'Failed to save snapshot.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-[88px_1fr_1fr_auto] gap-2 items-center">
      <div className="mono-text text-[12px] font-semibold text-stone-700">{row.month_key}</div>
      <input
        type="number"
        step="any"
        value={mrr}
        onChange={e => setMrr(e.target.value)}
        placeholder="MRR"
        className="w-full text-sm num-tabular bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
      />
      <input
        type="number"
        step="any"
        value={customers}
        onChange={e => setCustomers(e.target.value)}
        placeholder="Customers"
        className="w-full text-sm num-tabular bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
      />
      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
        style={{ background: BRAND }}
      >
        {status === 'success' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : status === 'success' ? 'Saved' : 'Save'}
      </button>
      {error && (
        <div className="col-span-4 text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}

export default function MrrHistoryModal({ open, onClose, rows, onSaved }) {
  const [monthKey, setMonthKey] = useState('')
  const [mrr, setMrr] = useState('')
  const [customers, setCustomers] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const add = async () => {
    setError(null)
    if (!MONTH_RE.test(monthKey)) {
      setError('Month must be in YYYY-MM format (e.g. 2026-01).')
      return
    }
    if (mrr === '' || Number.isNaN(Number(mrr))) {
      setError('Enter a valid MRR amount.')
      return
    }
    setSaving(true)
    try {
      await upsertSnapshot({ monthKey, mrr, customers })
      setMonthKey('')
      setMrr('')
      setCustomers('')
      onSaved?.()
    } catch (e) {
      console.error('upsert_mrr_snapshot:', e)
      setError(e.message || 'Failed to add snapshot.')
    } finally {
      setSaving(false)
    }
  }

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
        aria-labelledby="mrr-history-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <TrendingUp className="w-3 h-3" /> MRR History
            </div>
            <h2 id="mrr-history-modal-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">
              Monthly MRR Snapshots
            </h2>
            <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">
              Stored monthly MRR (and optional customer count) that powers the trajectory chart.
              The current month is shown live from Stripe on top of these.
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
          {/* Column labels */}
          <div className="grid grid-cols-[88px_1fr_1fr_auto] gap-2 mono-text text-[10px] uppercase tracking-[0.14em] font-semibold text-stone-400">
            <span>Month</span>
            <span>MRR</span>
            <span>Customers</span>
            <span></span>
          </div>

          {/* Existing rows */}
          {(rows && rows.length > 0) ? (
            <div className="space-y-2.5">
              {rows.map(row => (
                <ExistingRow key={row.month_key} row={row} onSaved={onSaved} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-400 italic py-2">No snapshots yet — add your first month below.</div>
          )}

          {/* Add month */}
          <div className="pt-4 border-t border-stone-200">
            <div className="mono-text text-[10px] uppercase tracking-[0.16em] font-semibold text-stone-500 mb-2">Add month</div>
            <div className="grid grid-cols-[88px_1fr_1fr_auto] gap-2 items-center">
              <input
                type="text"
                value={monthKey}
                onChange={e => setMonthKey(e.target.value)}
                placeholder="2026-01"
                className="w-full mono-text text-[12px] bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
              />
              <input
                type="number"
                step="any"
                value={mrr}
                onChange={e => setMrr(e.target.value)}
                placeholder="MRR"
                className="w-full text-sm num-tabular bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
              />
              <input
                type="number"
                step="any"
                value={customers}
                onChange={e => setCustomers(e.target.value)}
                placeholder="Customers"
                className="w-full text-sm num-tabular bg-white border border-stone-300 focus:border-purple-500 outline-none rounded-lg px-2.5 py-1.5"
              />
              <button
                onClick={add}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
                style={{ background: BRAND }}
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? 'Adding…' : 'Add'}
              </button>
            </div>
            {error && (
              <div className="mt-2 text-[11px] text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
