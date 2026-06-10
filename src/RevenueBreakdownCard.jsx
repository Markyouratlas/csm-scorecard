import React, { useState } from 'react'
import { Layers, AlertCircle, ChevronRight, ChevronDown, ExternalLink, Plus, X } from 'lucide-react'
import { supabase } from './supabase.js'
import { useRevenueBreakdown } from './hooks/useRevenueBreakdown.js'

// =============================================================================
//  RevenueBreakdownCard
//
//  READ-ONLY display card for the Odyssey Executive sub-tab. Surfaces two views
//  derived from commission_customers.subscriptions:
//    1. Active recurring (list price) by product, sorted desc.
//    2. Subscription count + recurring by status.
//
//  This is "contracted recurring at list price" — NOT net MRR. The footnote
//  below is non-negotiable. Nothing here writes to any table.
// =============================================================================

const BRAND = '#6639A6'

const FOOTNOTE =
  "Net recurring we're actively collecting — active and trialing subscriptions at their " +
  "billed price, after discounts. Paused, past-due, and fully-comped (100%-off) accounts " +
  "are shown but excluded. The 'at list' figure is the gross book before these adjustments."

// Status pill colors — muted, readable.
const STATUS_COLORS = {
  active:     '#15803D',
  trialing:   '#6639A6',
  past_due:   '#B45309',
  canceled:   '#78716C',
  paused:     '#A8A29E',
  incomplete: '#B45309',
  unpaid:     '#DC2649',
  unknown:    '#A8A29E',
}

function stripeCustomerUrl(id) {
  if (!id) return null
  return `https://dashboard.stripe.com/customers/${id}`
}

function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
}

function fmtStatus(s) {
  return String(s || 'unknown').replace(/_/g, ' ')
}

// Pill color for a customer revenue badge: amber for paused / past due,
// stone for free, purple for trial + any discount ('X% off' / 'discount').
function badgeColor(badge) {
  if (badge === 'Past Due') return '#DC2626'
  if (badge === 'Paused') return '#B45309'
  if (badge === 'Free') return '#78716C'
  if (badge === 'Manual · 1-time') return '#15803D'
  if (badge === 'Manual') return '#6639A6'
  return BRAND // 'Trial' / '% off' / 'discount'
}

const BLANK_MANUAL_FORM = { name: '', type: 'recurring', amount: '', paymentMethod: '', note: '' }

// "Needs attention" filter pills — Past Due first.
const ATTENTION_PILLS = [
  { state: 'past_due', label: 'Past Due', color: '#DC2626' },
  { state: 'paused',   label: 'Paused',   color: '#B45309' },
  { state: 'free',     label: 'Free',     color: '#78716C' },
]

// Short tag shown after a non-active product on the "also:" line.
// Active/collecting products show no tag.
const STATE_TAG = {
  trial: 'trial',
  paused: 'paused',
  past_due: 'past due',
  free: 'free',
  discounted: 'discounted',
}

export default function RevenueBreakdownCard() {
  const { byProduct, byStatus, attention, attentionCounts, totals, loading, error, refresh } = useRevenueBreakdown()
  const [expanded, setExpanded] = useState(null)
  const [attentionFilter, setAttentionFilter] = useState(null) // 'past_due' | 'paused' | 'free' | null

  // Inline "add manual entry" form state. Only one product's form is open at a time.
  const [formProduct, setFormProduct] = useState(null)
  const [formValues, setFormValues] = useState(BLANK_MANUAL_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [voidingId, setVoidingId] = useState(null)

  function openForm(product) {
    setFormProduct(product)
    setFormValues(BLANK_MANUAL_FORM)
    setFormError(null)
  }

  function closeForm() {
    setFormProduct(null)
    setFormError(null)
  }

  // All manual writes go through RPCs — we never touch manual_revenue directly.
  async function submitManual(productLabel) {
    setFormError(null)
    const name = formValues.name.trim()
    const amount = Number(formValues.amount)
    if (!name) { setFormError('Customer name is required.'); return }
    if (formValues.amount === '' || !Number.isFinite(amount) || amount < 0) {
      setFormError('Amount must be a number ≥ 0.'); return
    }
    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('add_manual_revenue', {
      p_product_label: productLabel,
      p_customer_name: name,
      p_entry_type: formValues.type, // 'recurring' | 'onetime'
      p_amount: amount,
      p_payment_method: formValues.paymentMethod.trim() || null,
      p_note: formValues.note.trim() || null,
    })
    setSubmitting(false)
    if (rpcError) { setFormError(rpcError.message); return } // keep form open on error (e.g. 42501)
    closeForm()
    refresh()
  }

  async function voidManual(manualId) {
    if (typeof window !== 'undefined' && !window.confirm('Void this manual entry?')) return
    setVoidingId(manualId)
    const { error: rpcError } = await supabase.rpc('void_manual_revenue', { p_id: manualId })
    setVoidingId(null)
    if (rpcError) {
      if (typeof window !== 'undefined') window.alert(`Couldn't void entry: ${rpcError.message}`)
      return
    }
    refresh()
  }

  const maxProductMrr = byProduct.reduce((m, p) => Math.max(m, p.netMrr), 0)
  const maxStatusMrr = byStatus.reduce((m, s) => Math.max(m, s.mrr), 0)
  const totalAttention = attentionCounts.past_due + attentionCounts.paused + attentionCounts.free
  const filteredAttention = attentionFilter
    ? attention.filter(a => a.state === attentionFilter)
    : []
  const filterLabel = ATTENTION_PILLS.find(p => p.state === attentionFilter)?.label

  return (
    <div className="card p-6 md:p-8 relative overflow-hidden">
      <div
        className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.10), transparent 70%)' }}
      />
      <div className="relative">
        {/* ---- Header ---- */}
        <div
          className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
          style={{ color: BRAND }}
        >
          <Layers className="w-3 h-3" /> Revenue
        </div>
        <h2 className="display-text text-3xl md:text-4xl font-medium leading-tight text-stone-900">
          Revenue by Product
        </h2>
        <p className="text-xs text-stone-500 mt-2 max-w-2xl leading-relaxed">
          {FOOTNOTE}
        </p>

        {/* ---- States ---- */}
        {loading && (
          <div className="mono-text text-[11px] uppercase tracking-widest text-stone-400 mt-8">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 text-sm text-rose-700 mt-8">
            <AlertCircle className="w-4 h-4" />
            Couldn't load subscription data.
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ---- Headline total ---- */}
            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-1">
                  Active recurring (collecting)
                </div>
                <div
                  className="display-text font-medium leading-none num-tabular"
                  style={{ color: BRAND, fontSize: '44px' }}
                >
                  {fmtMoney(totals.netContracted)}
                </div>
                <div className="mono-text text-[10.5px] text-stone-400 mt-1.5">
                  of {fmtMoney(totals.activeContracted)} at list
                </div>
              </div>
              <div>
                <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-1">
                  Active subscriptions
                </div>
                <div className="display-text font-medium leading-none num-tabular text-stone-800" style={{ fontSize: '44px' }}>
                  {(totals.activeSubs || 0).toLocaleString('en-US')}
                </div>
              </div>
            </div>

            {/* ---- Needs attention filter strip ---- */}
            {totalAttention > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="mono-text text-[10px] uppercase tracking-[0.14em] font-semibold text-stone-400 mr-1">
                  Needs attention
                </span>
                {ATTENTION_PILLS.map((pill) => {
                  const count = attentionCounts[pill.state]
                  const active = attentionFilter === pill.state
                  return (
                    <button
                      key={pill.state}
                      type="button"
                      onClick={() => setAttentionFilter(active ? null : pill.state)}
                      aria-pressed={active}
                      className="mono-text text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border transition-colors"
                      style={active
                        ? { color: '#fff', background: pill.color, borderColor: pill.color }
                        : { color: pill.color, background: `${pill.color}14`, borderColor: `${pill.color}33` }}
                    >
                      {pill.label} ({count})
                    </button>
                  )
                })}
                {attentionFilter && (
                  <button
                    type="button"
                    onClick={() => setAttentionFilter(null)}
                    className="mono-text text-[10px] uppercase tracking-wider text-stone-400 hover:text-stone-600 underline ml-1"
                  >
                    clear
                  </button>
                )}
              </div>
            )}

            {/* ---- By product (current subs) — or attention list when filtered ---- */}
            <div className="mt-8">
              <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
                {attentionFilter ? `${filterLabel} subscriptions` : 'Active recurring by product'}
              </div>
              {attentionFilter ? (
                filteredAttention.length === 0 ? (
                  <div className="text-sm text-stone-400">None.</div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredAttention.map((a, i) => {
                      const url = stripeCustomerUrl(a.stripeCustomerId)
                      return (
                        <div
                          key={(a.stripeCustomerId || a.name) + a.product + i}
                          className="flex items-baseline justify-between gap-3 py-1 border-b border-stone-50 last:border-b-0"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[12px] text-stone-600 hover:underline min-w-0"
                                style={{ color: BRAND }}
                                title="Open this customer's profile in Stripe Dashboard"
                              >
                                <span className="truncate">{a.name}</span>
                                <ExternalLink size={10} className="shrink-0 opacity-60" />
                              </a>
                            ) : (
                              <span className="text-[12px] text-stone-600 truncate">{a.name}</span>
                            )}
                            {a.badge && (
                              <span
                                className="mono-text text-[8.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: badgeColor(a.badge), background: `${badgeColor(a.badge)}1A` }}
                              >
                                {a.badge}
                              </span>
                            )}
                            <span className="text-[11px] text-stone-400 truncate">· {a.product}</span>
                          </span>
                          <span className="mono-text text-[11px] num-tabular text-stone-300 line-through whitespace-nowrap">
                            {fmtMoney(a.listMrr)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : byProduct.length === 0 ? (
                <div className="text-sm text-stone-400">No active subscriptions.</div>
              ) : (
                <div className="space-y-2.5">
                  {byProduct.map((p) => {
                    const pct = maxProductMrr > 0 ? (p.netMrr / maxProductMrr) * 100 : 0
                    const isOpen = expanded === p.product
                    return (
                      <div key={p.product}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpanded(isOpen ? null : p.product)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setExpanded(isOpen ? null : p.product)
                            }
                          }}
                          className="cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-stone-50 transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-3 mb-1">
                            <span className="flex items-center gap-1.5 min-w-0">
                              {isOpen
                                ? <ChevronDown size={13} className="text-stone-400 shrink-0" />
                                : <ChevronRight size={13} className="text-stone-400 shrink-0" />}
                              <span className="text-sm text-stone-700 truncate">{p.product}</span>
                            </span>
                            <span className="mono-text text-[12px] num-tabular text-stone-900 whitespace-nowrap">
                              {fmtMoney(p.netMrr)}
                              <span className="text-stone-400 ml-2">
                                {p.activeSubs} sub{p.activeSubs === 1 ? '' : 's'}
                              </span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: BRAND }}
                            />
                          </div>
                        </div>

                        {isOpen && (
                          <div className="pl-6 pr-2 pt-2 pb-1 space-y-1.5">
                            {p.customers.map((c, i) => {
                              const url = stripeCustomerUrl(c.stripeCustomerId)
                              return (
                                <div
                                  key={(c.stripeCustomerId || c.name) + i}
                                  className="flex items-baseline justify-between gap-3"
                                >
                                  <span className="min-w-0">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      {url ? (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 text-[12px] text-stone-600 hover:underline min-w-0"
                                          style={{ color: BRAND }}
                                          title="Open this customer's profile in Stripe Dashboard"
                                        >
                                          <span className="truncate">{c.name}</span>
                                          <ExternalLink size={10} className="shrink-0 opacity-60" />
                                        </a>
                                      ) : (
                                        <span className="text-[12px] text-stone-600 truncate">{c.name}</span>
                                      )}
                                      {c.badge && (
                                        <span
                                          className="mono-text text-[8.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0"
                                          style={{ color: badgeColor(c.badge), background: `${badgeColor(c.badge)}1A` }}
                                        >
                                          {c.badge}
                                        </span>
                                      )}
                                    </span>
                                    {c.otherProducts?.length > 0 && (
                                      <span className="block text-[10.5px] text-stone-400 leading-snug">
                                        also: {c.otherProducts.map(op => {
                                          const tag = STATE_TAG[op.state]
                                          return `${op.product} (${fmtMoney(op.mrr)}${tag ? ', ' + tag : ''})`
                                        }).join(', ')}
                                      </span>
                                    )}
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    {c.state === 'manual_onetime' ? (
                                      // Captured one-time cash — real revenue, just not MRR. Muted, not struck.
                                      <span className="mono-text text-[11px] num-tabular text-stone-400 whitespace-nowrap">
                                        {fmtMoney(c.listMrr)}
                                      </span>
                                    ) : c.collecting ? (
                                      <span className="mono-text text-[11px] num-tabular text-stone-700 whitespace-nowrap">
                                        {fmtMoney(c.netMrr)}
                                      </span>
                                    ) : (
                                      <span className="mono-text text-[11px] num-tabular text-stone-300 line-through whitespace-nowrap">
                                        {fmtMoney(c.listMrr)}
                                      </span>
                                    )}
                                    {c.manualId && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); voidManual(c.manualId) }}
                                        disabled={voidingId === c.manualId}
                                        title="Void this manual entry"
                                        aria-label="Void this manual entry"
                                        className="text-stone-300 hover:text-rose-600 disabled:opacity-40 transition-colors"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </span>
                                </div>
                              )
                            })}

                            {/* ---- Add manual entry ---- */}
                            {formProduct === p.product ? (
                              <ManualEntryForm
                                productLabel={p.product}
                                values={formValues}
                                setValues={setFormValues}
                                error={formError}
                                submitting={submitting}
                                onSubmit={() => submitManual(p.product)}
                                onCancel={closeForm}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openForm(p.product) }}
                                className="mono-text text-[10.5px] uppercase tracking-wider font-semibold inline-flex items-center gap-1 mt-1 hover:underline"
                                style={{ color: BRAND }}
                              >
                                <Plus size={12} /> Add manual entry
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ---- By status (all statuses) ---- */}
            <div className="mt-8">
              <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
                Subscriptions by status
              </div>
              {byStatus.length === 0 ? (
                <div className="text-sm text-stone-400">No subscriptions found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="mono-text text-[10px] uppercase tracking-[0.14em] text-stone-400">
                        <th className="font-semibold pb-2 pr-4">Status</th>
                        <th className="font-semibold pb-2 pr-4 text-right">Subs</th>
                        <th className="font-semibold pb-2 text-right">Recurring</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byStatus.map((s) => (
                        <tr key={s.status} className="border-t border-stone-100">
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center gap-2 text-sm text-stone-700">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: STATUS_COLORS[s.status] || STATUS_COLORS.unknown }}
                              />
                              <span className="capitalize">{fmtStatus(s.status)}</span>
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right mono-text text-[12px] num-tabular text-stone-900">
                            {(s.subs || 0).toLocaleString('en-US')}
                          </td>
                          <td className="py-2 text-right mono-text text-[12px] num-tabular text-stone-900">
                            {fmtMoney(s.mrr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Inline form for adding a manual revenue entry to one product. No <form> tag —
// submission is driven by the button's onClick. The product is fixed (read-only).
function ManualEntryForm({ productLabel, values, setValues, error, submitting, onSubmit, onCancel }) {
  const set = (key) => (e) => setValues(v => ({ ...v, [key]: e.target.value }))
  const inputClass =
    'w-full text-[12px] text-stone-700 bg-white border border-stone-200 rounded px-2 py-1.5 ' +
    'focus:outline-none focus:border-[#6639A6] transition-colors'
  const labelClass = 'mono-text text-[9px] uppercase tracking-[0.14em] font-semibold text-stone-400 mb-1 block'

  return (
    <div
      className="mt-2 rounded-lg border border-stone-200 bg-stone-50/60 p-3 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono-text text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: BRAND }}>
          New manual entry
        </span>
        <span className="text-[11px] text-stone-500 truncate">{productLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className={labelClass}>Customer name *</label>
          <input
            type="text"
            value={values.name}
            onChange={set('name')}
            placeholder="Customer name"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Amount *</label>
          <input
            type="number"
            min="0"
            step="any"
            value={values.amount}
            onChange={set('amount')}
            placeholder="0"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Type</label>
        <div className="inline-flex rounded-md border border-stone-200 overflow-hidden">
          {[{ v: 'recurring', l: 'Recurring' }, { v: 'onetime', l: 'One-time' }].map((opt) => {
            const active = values.type === opt.v
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setValues(v => ({ ...v, type: opt.v }))}
                className="mono-text text-[10px] uppercase tracking-wider font-semibold px-3 py-1.5 transition-colors"
                style={active
                  ? { color: '#fff', background: BRAND }
                  : { color: '#78716C', background: '#fff' }}
              >
                {opt.l}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className={labelClass}>Payment method</label>
          <input
            type="text"
            value={values.paymentMethod}
            onChange={set('paymentMethod')}
            placeholder="optional"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Note</label>
          <input
            type="text"
            value={values.note}
            onChange={set('note')}
            placeholder="optional"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="mono-text text-[10px] uppercase tracking-wider font-semibold text-white px-3 py-1.5 rounded-md disabled:opacity-50 transition-opacity"
          style={{ background: BRAND }}
        >
          {submitting ? 'Saving…' : 'Save entry'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="mono-text text-[10px] uppercase tracking-wider font-semibold text-stone-500 hover:text-stone-700 px-2 py-1.5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
