import React from 'react'
import { TrendingUp, TrendingDown, Target as TargetIcon } from 'lucide-react'

// Compute health: green (>=90% to target), yellow (70-89%), red (<70%)
//   value:      actual MTD value
//   target:     target value
//   comparator: 'gte' (higher is better) or 'lte' (lower is better)
//
// Returns { pct, status }  where pct is the % to target and status is 'green'|'yellow'|'red'|null
export function computeHealth(value, target, comparator = 'gte') {
  if (target === undefined || target === null || target === 0 || target === '') return { pct: null, status: null }
  if (value === undefined || value === null || value === '' || isNaN(Number(value))) return { pct: null, status: null }
  const v = Number(value)
  const t = Number(target)
  let pct
  if (comparator === 'gte') {
    pct = (v / t) * 100
  } else {
    // For 'lte' (lower is better): if value <= target → 100%; else degraded
    if (v <= t) pct = 100
    else pct = Math.max(0, 100 - ((v - t) / t) * 100)
  }
  pct = Math.round(pct)
  let status
  if (pct >= 90) status = 'green'
  else if (pct >= 70) status = 'yellow'
  else status = 'red'
  return { pct, status }
}

const STATUS_BG = { green: 'bg-emerald-50/60 border-emerald-300', yellow: 'bg-amber-50/60 border-amber-300', red: 'bg-red-50/60 border-red-300' }
const STATUS_TEXT = { green: 'text-emerald-700', yellow: 'text-amber-700', red: 'text-red-700' }

// Format a value based on unit
function formatValue(value, unit) {
  if (value === null || value === undefined || value === '' || isNaN(Number(value))) return '—'
  const v = Number(value)
  switch (unit) {
    case 'pct':   return `${v.toFixed(1)}%`
    case 'money': return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    default:      return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
}

// MTD metric card.
//   label:       what we're measuring (e.g. "Cost per lead")
//   value:       MTD actual value
//   target:      target object { value, comparator, unit, source }  (from useTargets)
//   unit:        override unit if not in target
//   help:        optional help text below
export function MtdCard({ label, value, target, unit, help }) {
  const effectiveUnit = unit || target?.unit || 'number'
  const { pct, status } = computeHealth(value, target?.value, target?.comparator || 'gte')

  return (
    <div className={`border p-5 transition-all ${status ? STATUS_BG[status] : 'border-stone-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 leading-snug">{label}</div>
        {status === 'green' && <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
        {status === 'red' && <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />}
      </div>
      <div className={`display-font text-3xl font-medium num-tabular leading-none ${status ? STATUS_TEXT[status] : 'text-stone-900'}`}>
        {formatValue(value, effectiveUnit)}
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs">
        {target?.value !== undefined && target?.value !== null ? (
          <>
            <span className="text-stone-500 flex items-center gap-1">
              <TargetIcon className="w-3 h-3" />
              {target.comparator === 'gte' ? '≥' : '≤'} {formatValue(target.value, effectiveUnit)}
            </span>
            {pct !== null && (
              <span className={`mono-font font-semibold ${status ? STATUS_TEXT[status] : 'text-stone-700'}`}>
                {pct}% to target
              </span>
            )}
          </>
        ) : (
          <span className="text-stone-400 italic">No target set</span>
        )}
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2 leading-snug">{help}</div>}
    </div>
  )
}

// Legend strip explaining the green/yellow/red bands
export function MtdLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 mb-4">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span>On Track <span className="text-stone-400">(≥90% to target)</span></span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-amber-500" />
        <span>At Risk <span className="text-stone-400">(70–89%)</span></span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span>Behind <span className="text-stone-400">(&lt;70%)</span></span>
      </div>
    </div>
  )
}
