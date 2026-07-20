import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, TrendingUp, AlertTriangle } from 'lucide-react'

// =============================================================================
//  GrossMarginModal
//
//  The COGS breakdown + editor behind the Odyssey "Gross Margin" tile. Renders
//  the infrastructure line items (7 vendors, some TBD), the delivery-labor rows
//  (annual salary → monthly), subtotals, and both margin views (infra-only vs
//  fully-loaded). Executives can edit every figure inline; the numbers persist to
//  Supabase (cogs_line_items / cogs_config) and the headline margin flows to
//  atlas_targets['gross-margin'] via useCogs — so the Investor gauge updates too.
//
//  Props:
//    open      — visibility
//    onClose   — close callback
//    cogs      — the useCogs() result (computed values + mutations), shared with the tile
//    mrr       — MRR single-source-of-truth value (revenue in the margin formula)
//    mrrSource — 'manual' | 'stripe' | 'asof' | null (for the "via" label)
//    canEdit   — executive tier (enables inline editing)
// =============================================================================

const BRAND = '#6639A6'
const BRIEF_MRR = 177100

const usd = (n) => (n == null || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdSigned = (n) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`)
const pct = (n) => (n == null || Number.isNaN(n)) ? '—' : `${(Math.round(n * 10) / 10).toFixed(1)}%`

// Inline-editable currency cell. Read-only span when the viewer can't edit.
function AmountCell({ value, onSave, canEdit, placeholder = 'TBD' }) {
  if (!canEdit) return <span className="num-tabular text-stone-800">{value == null ? '—' : usd(value)}</span>
  return (
    <input
      key={value ?? 'empty'} type="number" min="0" step="any" defaultValue={value ?? ''} placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value)
        if (v !== (value ?? null)) onSave(v)
      }}
      className="w-32 text-right num-tabular border border-stone-200 focus:border-stone-900 focus:outline-none rounded px-2 py-1 text-sm"
    />
  )
}

export default function GrossMarginModal({ open, onClose, cogs, mrr, mrrSource, canEdit = false }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const [busy, setBusy] = useState(false)
  if (!open) return null

  const {
    infraItems = [], laborItems = [],
    allInfraEntered, infraSubtotal, infraVariance, interimInfraTotal,
    laborSubtotal, totalCogsInfra, totalCogsLoaded,
    marginInfra, marginLoaded, grossProfitInfra, grossProfitLoaded,
    contractorLabor = 0, deliverySalaries = 0, totalSalaries = 0, otherOpex = 0,
    operatingCosts, operatingMargin, operatingProfit,
    headlineView,
    saveItem, addItem, removeItem, saveConfig,
  } = cogs || {}

  const infraPending = infraItems.filter(i => i.monthly_amount == null).length
  const mrrOff = mrr != null && Math.abs(Math.round(mrr) - BRIEF_MRR) > 1

  const run = async (fn) => { setBusy(true); try { await fn() } catch (e) { console.error(e); alert(e.message || 'Save failed — executive access required.') } finally { setBusy(false) } }
  const setView = (v) => canEdit && run(() => saveConfig({ headline_view: v }))

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog" aria-modal="true" aria-labelledby="gm-modal-title">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: BRAND }}>
              <TrendingUp className="w-3 h-3" /> Gross Margin · COGS breakdown
            </div>
            <h2 id="gm-modal-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">Gross Margin</h2>
            <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">Revenue minus cost of service, as a percentage of revenue. Infra amounts are editable as invoices arrive.</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {/* Headline + view toggle */}
          <div className="rounded-xl border border-stone-200 p-5" style={{ background: 'linear-gradient(180deg,#faf7ff,#ffffff)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden text-xs font-medium">
                {['infra', 'loaded'].map(v => (
                  <button key={v} onClick={() => setView(v)} disabled={!canEdit || busy}
                    className={`px-3 py-1.5 transition-colors ${headlineView === v ? 'text-white' : 'text-stone-600 hover:bg-stone-50'} ${!canEdit ? 'cursor-default' : ''}`}
                    style={headlineView === v ? { background: BRAND } : undefined}>
                    {v === 'infra' ? 'Infra only' : 'Fully loaded'}
                  </button>
                ))}
              </div>
              <div className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-400">
                MRR {usd(mrr)}{mrrSource ? ` · via ${mrrSource}` : ''}
              </div>
            </div>
            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <div className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1">{headlineView === 'loaded' ? 'Fully-loaded margin' : 'Infra-only margin'}</div>
                <div className="display-text font-medium leading-none" style={{ color: BRAND, fontSize: 44 }}>
                  {pct(headlineView === 'loaded' ? marginLoaded : marginInfra)}
                </div>
              </div>
              <div className="pb-1">
                <div className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1">Gross profit / mo</div>
                <div className="num-tabular text-xl text-stone-800">{usd(headlineView === 'loaded' ? grossProfitLoaded : grossProfitInfra)}</div>
              </div>
              <div className="pb-1">
                <div className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-400 mb-1">{headlineView === 'loaded' ? 'Infra only' : 'Fully loaded'}</div>
                <div className="num-tabular text-sm text-stone-500">{pct(headlineView === 'loaded' ? marginInfra : marginLoaded)} · {usd(headlineView === 'loaded' ? grossProfitInfra : grossProfitLoaded)}</div>
              </div>
            </div>
            {mrrOff && (
              <div className="mt-3 text-[11px] text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> MRR ({usd(mrr)}) differs from the brief's assumed {usd(BRIEF_MRR)}. Edit MRR on the Total MRR tile.
              </div>
            )}
          </div>

          {/* Infrastructure */}
          <Section title="Infrastructure" subtitle="Cloud + tooling vendors" onAdd={canEdit ? () => run(() => addItem('infra')) : null} busy={busy}>
            <Table>
              {infraItems.map(item => (
                <Row key={item.id} name={item.name} canEdit={canEdit} onRemove={() => run(() => removeItem(item.id))}>
                  <AmountCell value={item.monthly_amount} canEdit={canEdit} onSave={(v) => run(() => saveItem(item.id, { monthly_amount: v }))} />
                </Row>
              ))}
              <SubtotalRow label={allInfraEntered ? 'Infrastructure subtotal' : 'Infrastructure (interim total)'} value={infraSubtotal} />
            </Table>
            {!allInfraEntered ? (
              <div className="mt-2 text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                Showing the fixed interim total <strong>{usd(interimInfraTotal)}</strong> — {infraPending} of {infraItems.length} line item{infraPending === 1 ? '' : 's'} still pending. Once all are entered, the subtotal is computed from the line items.
              </div>
            ) : infraVariance !== null && Math.abs(infraVariance) >= 1 ? (
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Line items sum to {usd(infraSubtotal)} — {usdSigned(infraVariance)} vs the interim {usd(interimInfraTotal)}.
              </div>
            ) : null}
          </Section>

          {/* Delivery labor */}
          <Section title="Delivery labor" subtitle="Roster salaries flagged as delivery + manual contractors" onAdd={canEdit ? () => run(() => addItem('labor', { annual_amount: null })) : null} busy={busy}>
            <Table headers={['Annual', 'Monthly']}>
              {deliverySalaries > 0 && (
                <tr className="border-b border-stone-100">
                  <td className="py-2 text-stone-800">Delivery salaries <span className="text-[10px] text-stone-400">· from roster</span></td>
                  <td className="py-2 text-right text-stone-300">—</td>
                  <td className="py-2 text-right num-tabular text-stone-800">{usd(deliverySalaries)}</td>
                  <td />
                </tr>
              )}
              {laborItems.map(item => (
                <Row key={item.id} name={item.name} canEdit={canEdit} onRemove={() => run(() => removeItem(item.id))}
                  extra={<AmountCell value={item.annual_amount} canEdit={canEdit}
                    onSave={(v) => run(() => saveItem(item.id, { annual_amount: v, monthly_amount: v == null ? null : Math.round(v / 12) }))} />}>
                  <AmountCell value={item.monthly_amount} canEdit={canEdit} onSave={(v) => run(() => saveItem(item.id, { monthly_amount: v }))} />
                </Row>
              ))}
              <SubtotalRow label="Delivery labor subtotal" value={laborSubtotal} span2 />
            </Table>
            <div className="mt-1 text-[10px] text-stone-400">Per-person salaries are entered privately on the Roster (executives only). Contractors can be added here.</div>
          </Section>

          {/* Margins summary */}
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-2.5 mono-text text-[10px] uppercase tracking-[0.14em] text-stone-500 bg-stone-50 border-b border-stone-200">Summary</div>
            <table className="w-full text-sm">
              <tbody>
                <SummaryRow label="MRR" a={usd(mrr)} b={usd(mrr)} />
                <SummaryRow label="Total COGS" a={usd(totalCogsInfra)} b={usd(totalCogsLoaded)} />
                <SummaryRow label="Gross profit" a={usd(grossProfitInfra)} b={usd(grossProfitLoaded)} />
                <tr className="border-t border-stone-200 font-semibold" style={{ color: BRAND }}>
                  <td className="px-4 py-2.5">Gross margin</td>
                  <td className="px-4 py-2.5 text-right num-tabular">{pct(marginInfra)}</td>
                  <td className="px-4 py-2.5 text-right num-tabular">{pct(marginLoaded)}</td>
                </tr>
                <tr className="mono-text text-[9px] uppercase tracking-[0.14em] text-stone-400">
                  <td className="px-4 pb-2"></td>
                  <td className="px-4 pb-2 text-right">Infra only</td>
                  <td className="px-4 pb-2 text-right">Fully loaded</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Operating margin — executives only (never written to atlas_targets) */}
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-2.5 mono-text text-[10px] uppercase tracking-[0.14em] text-stone-500 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-2">
              <span>Operating margin</span>
              <span className="normal-case tracking-normal text-stone-400">executives only · not shown to investors</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <OpRow label="MRR" value={usd(mrr)} />
                <OpRow label="Infrastructure" value={usd(infraSubtotal)} />
                <OpRow label="Contractor labor" value={usd(contractorLabor)} />
                <OpRow label="Employee salaries (all)" value={usd(totalSalaries)} />
                <tr className="border-b border-stone-100">
                  <td className="px-4 py-2.5 text-stone-700">Other operating costs</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit
                      ? <AmountCell value={otherOpex} canEdit onSave={(v) => run(() => saveConfig({ other_opex_monthly: v ?? 0 }))} placeholder="0" />
                      : <span className="num-tabular text-stone-800">{usd(otherOpex)}</span>}
                  </td>
                </tr>
                <tr className="border-t border-stone-200 font-semibold text-stone-900">
                  <td className="px-4 py-2.5">Operating costs</td>
                  <td className="px-4 py-2.5 text-right num-tabular">{usd(operatingCosts)}</td>
                </tr>
                <tr className="border-t border-stone-200 font-semibold" style={{ color: BRAND }}>
                  <td className="px-4 py-2.5">Operating margin</td>
                  <td className="px-4 py-2.5 text-right num-tabular">{pct(operatingMargin)} · {usd(operatingProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {!canEdit && (
            <div className="text-[11px] text-stone-400">Read-only — executive access is required to edit COGS figures.</div>
          )}
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

// ---- small presentational helpers ----
function Section({ title, subtitle, onAdd, busy, children }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="display-text text-lg font-medium text-stone-900">{title}</div>
          {subtitle && <div className="text-[11px] text-stone-500">{subtitle}</div>}
        </div>
        {onAdd && (
          <button onClick={onAdd} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" /> Add line item
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Table({ headers = [], children }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-400 border-b border-stone-200">
          <th className="text-left font-medium py-2">Line item</th>
          {headers.map(h => <th key={h} className="text-right font-medium py-2">{h}</th>)}
          {headers.length === 0 && <th className="text-right font-medium py-2">Monthly</th>}
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function Row({ name, children, extra, canEdit, onRemove }) {
  return (
    <tr className="border-b border-stone-100">
      <td className="py-2 text-stone-800">{name}</td>
      {extra && <td className="py-2 text-right">{extra}</td>}
      <td className="py-2 text-right">{children}</td>
      <td className="py-2 text-right">
        {canEdit && onRemove && (
          <button onClick={onRemove} className="p-1 text-stone-300 hover:text-red-600 transition-colors" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, value, span2 }) {
  return (
    <tr className="border-t border-stone-200 font-semibold text-stone-900">
      <td className="py-2.5">{label}</td>
      {span2 && <td />}
      <td className="py-2.5 text-right num-tabular">{usd(value)}</td>
      <td />
    </tr>
  )
}

function OpRow({ label, value }) {
  return (
    <tr className="border-b border-stone-100">
      <td className="px-4 py-2.5 text-stone-700">{label}</td>
      <td className="px-4 py-2.5 text-right num-tabular text-stone-800">{value}</td>
    </tr>
  )
}

function SummaryRow({ label, a, b }) {
  return (
    <tr className="border-b border-stone-100">
      <td className="px-4 py-2.5 text-stone-700">{label}</td>
      <td className="px-4 py-2.5 text-right num-tabular text-stone-800">{a}</td>
      <td className="px-4 py-2.5 text-right num-tabular text-stone-800">{b}</td>
    </tr>
  )
}
