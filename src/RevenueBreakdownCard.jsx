import React, { useState } from 'react'
import { Layers, AlertCircle, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
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
  "Contracted recurring at list price — Atlas's full signed book, before " +
  "discounts and before Stripe's trial/prepaid exclusions. Not the same as " +
  "Stripe net MRR (~$97K)."

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

export default function RevenueBreakdownCard() {
  const { byProduct, byStatus, totals, loading, error } = useRevenueBreakdown()
  const [expanded, setExpanded] = useState(null)

  const maxProductMrr = byProduct.reduce((m, p) => Math.max(m, p.contractedMrr), 0)
  const maxStatusMrr = byStatus.reduce((m, s) => Math.max(m, s.mrr), 0)

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
                  Active contracted recurring
                </div>
                <div
                  className="display-text font-medium leading-none num-tabular"
                  style={{ color: BRAND, fontSize: '44px' }}
                >
                  {fmtMoney(totals.activeContracted)}
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

            {/* ---- By product (active only) ---- */}
            <div className="mt-8">
              <div className="mono-text text-[10.5px] uppercase tracking-[0.14em] font-semibold text-stone-500 mb-3">
                Active recurring by product
              </div>
              {byProduct.length === 0 ? (
                <div className="text-sm text-stone-400">No active subscriptions.</div>
              ) : (
                <div className="space-y-2.5">
                  {byProduct.map((p) => {
                    const pct = maxProductMrr > 0 ? (p.contractedMrr / maxProductMrr) * 100 : 0
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
                              {fmtMoney(p.contractedMrr)}
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
                                  {url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[12px] text-stone-600 hover:underline truncate"
                                      style={{ color: BRAND }}
                                      title="Open this customer's profile in Stripe Dashboard"
                                    >
                                      <span className="truncate">{c.name}</span>
                                      <ExternalLink size={10} className="shrink-0 opacity-60" />
                                    </a>
                                  ) : (
                                    <span className="text-[12px] text-stone-600 truncate">{c.name}</span>
                                  )}
                                  <span className="mono-text text-[11px] num-tabular text-stone-700 whitespace-nowrap">
                                    {fmtMoney(c.mrr)}
                                  </span>
                                </div>
                              )
                            })}
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
