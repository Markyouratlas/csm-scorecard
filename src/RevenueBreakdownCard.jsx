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

// Each headline pill maps to a view: which records it shows, which dollar field it
// sums, and whether amounts render muted (segments that aren't live revenue).
// Keys match the pill `key`s. 'mrr' is home and also keeps manual one-time entries
// visible (greyed, $0) so they don't disappear from the default view.
const PILL_VIEWS = {
  mrr:                { predicate: (r) => r.inMrr || r.state === 'manual_onetime', amountOf: (r) => r.committedMrr, greyed: false },
  collecting:         { predicate: (r) => r.inCollecting,                          amountOf: (r) => r.netMrr,       greyed: false },
  trialing:           { predicate: (r) => r.status === 'trialing',                 amountOf: (r) => r.committedMrr, greyed: false },
  past_due:           { predicate: (r) => r.status === 'past_due',                 amountOf: (r) => r.committedMrr, greyed: true },
  paused:             { predicate: (r) => r.state === 'paused',                    amountOf: (r) => r.committedMrr, greyed: true },
  free:               { predicate: (r) => r.state === 'free',                      amountOf: (r) => r.listMrr,      greyed: true },
  canceled:           { predicate: (r) => r.status === 'canceled',                 amountOf: (r) => r.listMrr,      greyed: true },
  incomplete_expired: { predicate: (r) => r.status === 'incomplete_expired',       amountOf: (r) => r.listMrr,      greyed: true },
}

// Group flat records into the product breakdown for the selected view. `amountOf`
// chooses which dollar field each record contributes. Products sorted by total
// amount desc; customers within a product by their chosen amount desc.
function buildBreakdown(records, amountOf) {
  const map = new Map()
  for (const r of records) {
    const pr = map.get(r.product) || { product: r.product, count: 0, amount: 0, customers: [] }
    const amount = amountOf(r)
    pr.count += 1
    pr.amount += amount
    pr.customers.push({
      name: r.name,
      stripeCustomerId: r.stripeCustomerId,
      amount,
      state: r.state,
      badge: r.badge,
      collecting: r.collecting,
      manualId: r.manualId,
      otherProducts: r.otherProducts,
    })
    map.set(r.product, pr)
  }
  return [...map.values()]
    .map((p) => ({ ...p, customers: p.customers.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.amount - a.amount)
}

// Short tag shown after a non-active product on the "also:" line.
// Active/collecting products show no tag.
const STATE_TAG = {
  trial: 'trial',
  paused: 'paused',
  past_due: 'past due',
  free: 'free',
  discounted: 'discounted',
}

// Hover copy for each row in the "Subscriptions by status" table, keyed by status.
const STATUS_TOOLTIPS = {
  active:
    "Subscriptions Stripe marks active — currently billing, plus paused-collection " +
    "accounts (which keep 'active' status). Shown at list price; the MRR pill is the net figure.",
  canceled: 'Subscriptions that have been canceled. Not part of current revenue.',
  trialing:
    'Accounts in their trial/onboarding window (often prepaid). Roll into billing when the trial ends.',
  past_due:
    'Active subscriptions whose latest charge failed. Still active; in dunning until recovered or canceled.',
  incomplete_expired:
    'Signups whose first payment never completed within ~23 hours, so Stripe expired them. ' +
    'Never activated; not revenue.',
}

// Pure-CSS hover tooltip for the headline pills. Parent must be `group relative`.
// Sits above the pill, ~260px, dark, hidden until group-hover, never intercepts pointer.
function PillTooltip({ children }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 mb-2 w-[260px] rounded-lg bg-stone-900 text-white text-[11px] leading-snug p-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150 z-20"
    >
      {children}
    </div>
  )
}

export default function RevenueBreakdownCard() {
  const { byStatus, attentionCounts, allSubRecords, totals, loading, error, refresh } = useRevenueBreakdown()
  const [expanded, setExpanded] = useState(null)
  const [view, setView] = useState('mrr') // which headline pill drives the breakdown; MRR is home
  const [zeroOpen, setZeroOpen] = useState(false) // show/hide the rolled-up $0 products

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

  // Records for the selected view, grouped into the product breakdown.
  const viewDef = PILL_VIEWS[view] || PILL_VIEWS.mrr
  const breakdown = buildBreakdown(allSubRecords.filter(viewDef.predicate), viewDef.amountOf)
  const maxBreakdownAmount = breakdown.reduce((m, p) => Math.max(m, p.amount), 0)

  // ---- Pill headline data ----
  // Per-status lookups for tooltips / counts (byStatus rows: { status, subs, mrr }).
  const trialingRow = byStatus.find(s => s.status === 'trialing') || { subs: 0, mrr: 0 }
  const pastDueRow  = byStatus.find(s => s.status === 'past_due') || { subs: 0, mrr: 0 }
  const canceledRow = byStatus.find(s => s.status === 'canceled') || { subs: 0, mrr: 0 }
  const incExpRow   = byStatus.find(s => s.status === 'incomplete_expired') || { subs: 0, mrr: 0 }

  // Two revenue pills (show $), largest first.
  const revenuePills = [
    {
      key: 'mrr',
      label: 'MRR',
      value: fmtMoney(totals.committedContracted),
      color: '#6639A6',
      primary: true,
      tooltip:
        'Net committed recurring across all non-cancelled subscriptions — active, ' +
        'trialing, paused, and past-due — at their discounted (billed) price, plus recurring ' +
        'manual entries. Fully-comped (100%-off) accounts count as $0. Includes committed ' +
        'accounts not currently billing (paused/past-due); excludes canceled.',
    },
    {
      key: 'collecting',
      label: 'Collecting',
      value: fmtMoney(totals.netContracted),
      color: '#15803D',
      tooltip:
        "Net recurring we're actively billing right now: active + trialing at billed " +
        'price, plus recurring manual. Excludes paused, past-due, and 100%-off. Matches Stripe MRR.',
    },
  ]

  // Six bucket pills (show counts). All are clickable and drive the breakdown view.
  const bucketPills = [
    {
      key: 'trialing',
      label: 'Trialing',
      count: trialingRow.subs,
      color: '#6639A6',
      tooltip:
        `Committed prepaid accounts in their onboarding/trial window (~${fmtMoney(trialingRow.mrr)} at ` +
        'list). Roll into billing when the trial ends. Counted in MRR.',
    },
    {
      key: 'past_due',
      label: 'Past Due',
      count: attentionCounts.past_due,
      color: '#DC2626',
      tooltip:
        `Active subscriptions whose latest charge failed (~${fmtMoney(pastDueRow.mrr)} at risk). ` +
        'Counted in MRR but not Collecting until recovered — the follow-up list.',
    },
    {
      key: 'paused',
      label: 'Paused',
      count: attentionCounts.paused,
      color: '#B45309',
      tooltip:
        'Collection paused (e.g. prepaid window). Counted in MRR (committed) but not currently billing.',
    },
    {
      key: 'free',
      label: 'Free',
      count: attentionCounts.free,
      color: '#78716C',
      tooltip:
        'Fully-comped (100%-off) accounts — staff and promos. $0 revenue; shown for visibility.',
    },
    {
      key: 'canceled',
      label: 'Canceled',
      count: canceledRow.subs,
      color: '#78716C',
      tooltip: 'Churned subscriptions. Not part of MRR.',
    },
    {
      key: 'incomplete_expired',
      label: 'Incomplete Expired',
      count: incExpRow.subs,
      color: '#78716C',
      tooltip:
        'Signups whose first payment never completed, so Stripe expired them before they ' +
        'activated. Never billed; not revenue. Shown so you can follow up.',
    },
  ]

  // The pill currently driving the list — used for the section heading + bar color.
  const allPills = [...revenuePills, ...bucketPills]
  const activePill = allPills.find((p) => p.key === view) || revenuePills[0]

  // Split the breakdown so $0-in-this-view products roll up into one collapsible
  // "Other" row at the bottom. Order within each group is preserved from breakdown.
  const nonZeroProducts = breakdown.filter((p) => p.amount > 0)
  const zeroProducts = breakdown.filter((p) => p.amount === 0)

  // One product row + its chevron drill-down. Identical markup for both groups.
  const renderProduct = (p) => {
    const pct = maxBreakdownAmount > 0 ? (p.amount / maxBreakdownAmount) * 100 : 0
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
              {fmtMoney(p.amount)}
              <span className="text-stone-400 ml-2">
                {p.count} sub{p.count === 1 ? '' : 's'}
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: activePill.color }}
            />
          </div>
        </div>

        {isOpen && (
          <div className="pl-6 pr-2 pt-2 pb-1 space-y-1.5">
            {p.customers.map((c, i) => {
              const url = stripeCustomerUrl(c.stripeCustomerId)
              // Greyed view (not live revenue) or a $0 one-time → muted amount.
              const muted = viewDef.greyed || c.state === 'manual_onetime'
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
                    <span
                      className={
                        'mono-text text-[11px] num-tabular whitespace-nowrap ' +
                        (muted ? 'text-stone-400' : 'text-stone-700')
                      }
                    >
                      {fmtMoney(c.amount)}
                    </span>
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
  }

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
            {/* ---- Pill headline ---- */}
            {/* Two revenue pills (large, show $) then six bucket pills (counts).
                Every pill is clickable and selects which segment the list renders. */}
            <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
              {revenuePills.map((p) => {
                const active = view === p.key
                return (
                  <div key={p.key} className="group relative">
                    <button
                      type="button"
                      onClick={() => setView(p.key)}
                      aria-pressed={active}
                      className="text-left rounded-2xl border px-4 py-3 cursor-pointer transition-colors"
                      style={active
                        ? { borderColor: p.color, background: `${p.color}1A`, boxShadow: `inset 0 0 0 1px ${p.color}` }
                        : { borderColor: `${p.color}33`, background: `${p.color}0D` }}
                    >
                      <div
                        className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold mb-1"
                        style={{ color: p.color }}
                      >
                        {p.label}
                      </div>
                      <div
                        className="display-text font-medium leading-none num-tabular"
                        style={{ color: p.color, fontSize: p.primary ? '44px' : '34px' }}
                      >
                        {p.value}
                      </div>
                    </button>
                    <PillTooltip>{p.tooltip}</PillTooltip>
                  </div>
                )
              })}

              {/* Kept visible: active subscription count + at-list gross. */}
              <div className="self-end pb-0.5">
                <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-1">
                  Active subscriptions
                </div>
                <div className="display-text font-medium leading-none num-tabular text-stone-800" style={{ fontSize: '34px' }}>
                  {(totals.activeSubs || 0).toLocaleString('en-US')}
                </div>
                <div className="mono-text text-[10.5px] text-stone-400 mt-1.5">
                  of {fmtMoney(totals.activeContracted)} at list
                </div>
              </div>
            </div>

            {/* ---- Bucket pills (counts) — all clickable, no clear button ---- */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {bucketPills.map((p) => {
                const active = view === p.key
                return (
                  <div key={p.key} className="group relative">
                    <button
                      type="button"
                      onClick={() => setView(p.key)}
                      aria-pressed={active}
                      className="mono-text text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors"
                      style={active
                        ? { color: '#fff', background: p.color, borderColor: p.color }
                        : { color: p.color, background: `${p.color}14`, borderColor: `${p.color}33` }}
                    >
                      {p.label} ({(p.count || 0).toLocaleString('en-US')})
                    </button>
                    <PillTooltip>{p.tooltip}</PillTooltip>
                  </div>
                )
              })}
            </div>

            {/* ---- Selected segment, broken down by product ---- */}
            <div className="mt-8">
              <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
                {activePill.label} · by product
              </div>
              {breakdown.length === 0 ? (
                <div className="text-sm text-stone-400">No subscriptions in this segment.</div>
              ) : (
                <div className="space-y-2.5">
                  {nonZeroProducts.map(renderProduct)}

                  {/* ---- Rolled-up $0-in-this-view products ---- */}
                  {zeroProducts.length > 0 && (
                    <div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setZeroOpen((o) => !o)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setZeroOpen((o) => !o)
                          }
                        }}
                        className="cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-stone-50 transition-colors flex items-center gap-1.5"
                      >
                        {zeroOpen
                          ? <ChevronDown size={13} className="text-stone-300 shrink-0" />
                          : <ChevronRight size={13} className="text-stone-300 shrink-0" />}
                        <span className="text-sm text-stone-400">
                          Other — $0 in this view ({zeroProducts.length})
                        </span>
                      </div>
                      {zeroOpen && (
                        <div className="space-y-2.5 mt-2.5">
                          {zeroProducts.map(renderProduct)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ---- By status (all statuses) ---- */}
            <div className="mt-8">
              <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
                Subscriptions by status · at list price
              </div>
              {byStatus.length === 0 ? (
                <div className="text-sm text-stone-400">No subscriptions found.</div>
              ) : (
                // No overflow wrapper here: the table is narrow (3 fixed columns) and never
                // needs horizontal scroll, and overflow-x-auto would force overflow-y:clip,
                // slicing off the upward (bottom-full) row tooltips on the first row.
                <div>
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
                            <span className="group relative inline-flex items-center gap-2 text-sm text-stone-700 cursor-default">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: STATUS_COLORS[s.status] || STATUS_COLORS.unknown }}
                              />
                              <span className="capitalize">{fmtStatus(s.status)}</span>
                              {STATUS_TOOLTIPS[s.status] && (
                                <PillTooltip>{STATUS_TOOLTIPS[s.status]}</PillTooltip>
                              )}
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
