import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// =============================================================================
//  useRevenueBreakdown
//
//  Read-only aggregation of commission_customers.subscriptions (jsonb array).
//  Each element is shaped { status, product_label, mrr, ... } (written by the
//  stripe-sync edge function). We do NOT write anything here — RLS already lets
//  the exec viewing Odyssey read all rows.
//
//  This is DISPLAY ONLY. It is "contracted recurring at list price" — the full
//  signed book before discounts and before Stripe's trial/prepaid exclusions.
//  It is NOT net MRR and must never be labeled as such.
//
//  Returns:
//    byProduct: [{ product, activeSubs, contractedMrr, netMrr,
//                  customers: [{ name, stripeCustomerId, listMrr, netMrr,
//                                collecting, state, badge,
//                                otherProducts: [{ product, mrr, state }] }] }]
//                                                          (current subs = active/trialing/past_due,
//                                                           sorted by contractedMrr desc;
//                                                           customers sorted by listMrr desc;
//                                                           contractedMrr = gross list sum, netMrr = collected sum
//                                                           where active + trialing collect and
//                                                           paused/past_due/free contribute 0;
//                                                           otherProducts = the customer's other current
//                                                           products, deduped by label, sorted by mrr desc,
//                                                           each tagged with its state)
//    byStatus:  [{ status, subs, mrr }]                     (all statuses, sorted by mrr desc)
//    attention: [{ name, stripeCustomerId, product, listMrr, state, badge }]
//                                                          (state in past_due | paused | free,
//                                                           sorted past_due → paused → free, then listMrr desc)
//    attentionCounts: { past_due, paused, free }
//    totals:    { activeContracted, netContracted, activeSubs }
//    loading, error
//
//  Graceful handling:
//    - null / empty subscriptions array      => skipped
//    - missing product_label                  => "Uncategorized"
//    - missing / NaN mrr                       => 0
// =============================================================================

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Statuses we treat as part of the "current book" — non-canceled, non-expired.
// paused / free are sub-states of an 'active' status (pause_collection / coupon),
// so they're covered by 'active' here.
const CURRENT_STATUSES = new Set(['active', 'trialing', 'past_due'])

// Apply an ongoing (forever/repeating) coupon to a list price. 'once' coupons
// don't reduce ongoing revenue, so callers pass discountApplies=false for them.
function discountedNet(listMrr, d, discountApplies) {
  if (!discountApplies) return listMrr
  if (d.percent_off > 0) return listMrr * (1 - d.percent_off / 100)
  if (d.amount_off > 0) return Math.max(0, listMrr - d.amount_off / 100)
  return listMrr
}

// Classify a (current) subscription's economics after pause-collection, dunning,
// and ongoing coupons. Returns { listMrr, netMrr, collecting, state, badge }.
//   - listMrr   = the gross list-price recurring (sub.mrr)
//   - netMrr    = what it actually bills (0 if paused, past due, or fully comped)
//   - collecting= whether it contributes ongoing revenue (active + trialing)
//   - state     = 'collecting' | 'trial' | 'paused' | 'free' | 'past_due' | 'discounted'
//   - badge     = short reason string, or null
// A 'once' coupon does NOT reduce ongoing revenue, so it's treated as no discount.
function subEconomics(sub) {
  const listMrr = toNumber(sub.mrr)
  const status = sub.status || 'unknown'
  const paused = sub.pause_collection != null
  const d = sub.discount || null
  const discountApplies = d && (d.duration === 'forever' || d.duration === 'repeating')

  if (paused) {
    return { listMrr, netMrr: 0, collecting: false, state: 'paused', badge: 'Paused' }
  }
  if (status === 'past_due') {
    return { listMrr, netMrr: 0, collecting: false, state: 'past_due', badge: 'Past Due' }
  }
  if (discountApplies && d.percent_off === 100) {
    return { listMrr, netMrr: 0, collecting: false, state: 'free', badge: 'Free' }
  }
  if (status === 'trialing') {
    return {
      listMrr,
      netMrr: discountedNet(listMrr, d, discountApplies),
      collecting: true,
      state: 'trial',
      badge: 'Trial',
    }
  }
  if (discountApplies && d.percent_off > 0) {
    return {
      listMrr,
      netMrr: listMrr * (1 - d.percent_off / 100),
      collecting: true,
      state: 'discounted',
      badge: `${d.percent_off}% off`,
    }
  }
  if (discountApplies && d.amount_off > 0) {
    const net = Math.max(0, listMrr - d.amount_off / 100)
    if (net === 0) {
      return { listMrr, netMrr: 0, collecting: false, state: 'free', badge: 'Free' }
    }
    return { listMrr, netMrr: net, collecting: true, state: 'discounted', badge: 'discount' }
  }
  return { listMrr, netMrr: listMrr, collecting: true, state: 'collecting', badge: null }
}

export function useRevenueBreakdown() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    byProduct: [],
    byStatus: [],
    attention: [],
    attentionCounts: { past_due: 0, paused: 0, free: 0 },
    totals: { activeContracted: 0, netContracted: 0, activeSubs: 0 },
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data: rows, error } = await supabase
        .from('commission_customers')
        .select('name, stripe_customer_id, subscriptions')
      if (error) throw error

      setState({ loading: false, error: null, ...aggregate(rows || []) })
    } catch (e) {
      console.error('useRevenueBreakdown:', e)
      setState({
        loading: false,
        error: e,
        byProduct: [],
        byStatus: [],
        attention: [],
        attentionCounts: { past_due: 0, paused: 0, free: 0 },
        totals: { activeContracted: 0, netContracted: 0, activeSubs: 0 },
      })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}

// =============================================================================
//  Aggregation (pure, client-side)
// =============================================================================

// Sort priority for the "Needs attention" list.
const ATTENTION_ORDER = { past_due: 0, paused: 1, free: 2 }

function aggregate(rows) {
  // product_label -> { activeSubs, contractedMrr, netMrr, customers } for CURRENT subs
  const productMap = new Map()
  // status -> { subs, mrr } across ALL statuses
  const statusMap = new Map()
  // customer-subscriptions needing attention (past_due / paused / free)
  const attention = []

  let activeContracted = 0
  let netContracted = 0
  let activeSubs = 0

  for (const row of rows) {
    const subs = Array.isArray(row?.subscriptions) ? row.subscriptions : null
    if (!subs || subs.length === 0) continue

    const customerName = row.name || row.stripe_customer_id || 'Unknown customer'
    const stripeCustomerId = row.stripe_customer_id || null

    // This customer's current-product list (deduped by label), used to show
    // "also: ..." for each product they appear under. Each label is tagged with
    // the state of the first sub seen for it.
    const currentByLabel = new Map()
    for (const sub of subs) {
      if (!sub || !CURRENT_STATUSES.has(sub.status || 'unknown')) continue
      const label = sub.product_label || 'Uncategorized'
      const econ = subEconomics(sub)
      const prev = currentByLabel.get(label)
      if (prev) prev.mrr += econ.listMrr
      else currentByLabel.set(label, { mrr: econ.listMrr, state: econ.state })
    }

    for (const sub of subs) {
      if (!sub) continue
      const status = sub.status || 'unknown'
      const mrr = toNumber(sub.mrr)

      // ---- by status (all statuses) ----
      const st = statusMap.get(status) || { subs: 0, mrr: 0 }
      st.subs += 1
      st.mrr += mrr
      statusMap.set(status, st)

      // ---- by product (current subs: active / trialing / past_due) ----
      if (CURRENT_STATUSES.has(status)) {
        const product = sub.product_label || 'Uncategorized'
        const { listMrr, netMrr, collecting, state, badge } = subEconomics(sub)
        const otherProducts = [...currentByLabel.entries()]
          .filter(([label]) => label !== product)
          .map(([label, v]) => ({ product: label, mrr: v.mrr, state: v.state }))
          .sort((a, b) => b.mrr - a.mrr)
        const pr = productMap.get(product) || { activeSubs: 0, contractedMrr: 0, netMrr: 0, customers: [] }
        pr.activeSubs += 1
        pr.contractedMrr += listMrr
        pr.netMrr += netMrr
        pr.customers.push({ name: customerName, stripeCustomerId, listMrr, netMrr, collecting, state, badge, otherProducts })
        productMap.set(product, pr)

        activeContracted += listMrr
        netContracted += netMrr
        activeSubs += 1

        // ---- needs attention ----
        if (state === 'past_due' || state === 'paused' || state === 'free') {
          attention.push({ name: customerName, stripeCustomerId, product, listMrr, state, badge })
        }
      }
    }
  }

  const byProduct = [...productMap.entries()]
    .map(([product, v]) => ({
      product,
      activeSubs: v.activeSubs,
      contractedMrr: v.contractedMrr,
      netMrr: v.netMrr,
      customers: v.customers.sort((a, b) => b.listMrr - a.listMrr),
    }))
    .sort((a, b) => b.netMrr - a.netMrr)

  const byStatus = [...statusMap.entries()]
    .map(([status, v]) => ({ status, subs: v.subs, mrr: v.mrr }))
    .sort((a, b) => b.mrr - a.mrr)

  attention.sort((a, b) =>
    (ATTENTION_ORDER[a.state] - ATTENTION_ORDER[b.state]) || (b.listMrr - a.listMrr)
  )
  const attentionCounts = {
    past_due: attention.filter(a => a.state === 'past_due').length,
    paused: attention.filter(a => a.state === 'paused').length,
    free: attention.filter(a => a.state === 'free').length,
  }

  return {
    byProduct,
    byStatus,
    attention,
    attentionCounts,
    totals: { activeContracted, netContracted, activeSubs },
  }
}
