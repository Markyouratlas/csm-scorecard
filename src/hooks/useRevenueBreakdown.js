import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useRevenueBreakdown
//
//  Aggregation of commission_customers.subscriptions (jsonb array, written by the
//  stripe-sync edge function) MERGED with manual_revenue rows (added by execs via
//  the add_manual_revenue RPC). This hook only READS both tables — all manual
//  writes go through RPCs in the component, never direct table writes.
//
//  This is DISPLAY ONLY. It is "contracted recurring at list price" — the full
//  signed book before discounts and before Stripe's trial/prepaid exclusions.
//  It is NOT net MRR and must never be labeled as such.
//
//  Returns:
//    byProduct: [{ product, activeSubs, contractedMrr, netMrr,
//                  customers: [{ name, stripeCustomerId, listMrr, netMrr,
//                                collecting, state, badge,
//                                otherProducts: [{ product, mrr, state }],
//                                // manual entries also carry:
//                                manualId, paymentMethod, note }] }]
//                  (manual rows: state 'manual' (recurring) or 'manual_onetime';
//                   one-time = captured cash, not MRR, so contributes 0 to net)
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
//    allSubRecords: [{ product, name, stripeCustomerId, status, state, listMrr, netMrr,
//                      committedMrr, collecting, inMrr, inCollecting, badge, manualId,
//                      otherProducts }]
//                 (one flat record per subscription across ALL statuses, plus manual
//                  entries — drives the click-to-filter product breakdown in the UI;
//                  ADDITIVE, does not feed totals)
//    totals:    { activeContracted, netContracted, committedContracted, activeSubs }
//                 (committedContracted = net committed recurring across ALL current subs at
//                  their discounted price — incl. paused/past_due, excl. 100%-off — plus
//                  recurring manual entries)
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

  // Net committed recurring at the discounted (billed) price, regardless of
  // paused / past_due. 100%-off → 0, partial → net, no/once discount → list.
  const committedMrr = discountedNet(listMrr, d, discountApplies)

  if (paused) {
    return { listMrr, netMrr: 0, committedMrr, collecting: false, state: 'paused', badge: 'Paused' }
  }
  if (status === 'past_due') {
    return { listMrr, netMrr: 0, committedMrr, collecting: false, state: 'past_due', badge: 'Past Due' }
  }
  if (discountApplies && d.percent_off === 100) {
    return { listMrr, netMrr: 0, committedMrr, collecting: false, state: 'free', badge: 'Free' }
  }
  if (status === 'trialing') {
    return {
      listMrr,
      netMrr: discountedNet(listMrr, d, discountApplies),
      committedMrr,
      collecting: true,
      state: 'trial',
      badge: 'Trial',
    }
  }
  if (discountApplies && d.percent_off > 0) {
    return {
      listMrr,
      netMrr: listMrr * (1 - d.percent_off / 100),
      committedMrr,
      collecting: true,
      state: 'discounted',
      badge: `${d.percent_off}% off`,
    }
  }
  if (discountApplies && d.amount_off > 0) {
    const net = Math.max(0, listMrr - d.amount_off / 100)
    if (net === 0) {
      return { listMrr, netMrr: 0, committedMrr, collecting: false, state: 'free', badge: 'Free' }
    }
    return { listMrr, netMrr: net, committedMrr, collecting: true, state: 'discounted', badge: 'discount' }
  }
  return { listMrr, netMrr: listMrr, committedMrr, collecting: true, state: 'collecting', badge: null }
}

// Empty shape returned before the first successful fetch (and on error with no
// prior data). Identical to the legacy initial state so consumers never see undefined.
const EMPTY = {
  byProduct: [],
  byStatus: [],
  attention: [],
  attentionCounts: { past_due: 0, paused: 0, free: 0 },
  allSubRecords: [],
  totals: { activeContracted: 0, netContracted: 0, committedContracted: 0, activeSubs: 0 },
}

// Read both tables, then aggregate client-side. Throws on Supabase error so
// React Query surfaces it via `error` (and keeps the last good data on refetch).
async function fetchRevenueBreakdown() {
  const [custRes, manualRes] = await Promise.all([
    supabase.from('commission_customers').select('name, stripe_customer_id, subscriptions'),
    supabase.from('manual_revenue').select('*').eq('voided', false),
  ])
  if (custRes.error) throw custRes.error
  if (manualRes.error) throw manualRes.error
  return aggregate(custRes.data || [], manualRes.data || [])
}

// Cached via the app-root QueryClient (queryKey ['revenue-breakdown']). Revisiting
// the Executive view renders last-known data instantly and refetches in the
// background; a hard reload pulls fresh. Both OdysseyView call sites share the one
// cache entry, so they dedupe to a single fetch and stay in sync.
//
// Return shape is identical to the legacy hook: the aggregated fields plus
// { loading, error, refresh }. `error` stays the raw error object (not stringified)
// to preserve the old contract.
export function useRevenueBreakdown() {
  const { data, isPending, error: queryError, refetch } = useQuery({
    queryKey: ['revenue-breakdown'],
    queryFn: fetchRevenueBreakdown,
  })

  return {
    ...(data ?? EMPTY),
    loading: isPending,
    error: queryError ?? null,
    refresh: refetch,
  }
}

// =============================================================================
//  Aggregation (pure, client-side)
// =============================================================================

// Sort priority for the "Needs attention" list.
const ATTENTION_ORDER = { past_due: 0, paused: 1, free: 2 }

function aggregate(rows, manualRows = []) {
  // product_label -> { activeSubs, contractedMrr, netMrr, customers } for CURRENT subs
  const productMap = new Map()
  // status -> { subs, mrr } across ALL statuses
  const statusMap = new Map()
  // customer-subscriptions needing attention (past_due / paused / free)
  const attention = []
  // one flat record per subscription across ALL statuses + manual entries.
  // ADDITIVE — drives the click-to-filter product breakdown; does not feed totals.
  const allSubRecords = []

  let activeContracted = 0
  let netContracted = 0
  let committedContracted = 0
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

      // ---- flat record (all statuses) — ADDITIVE, no effect on totals ----
      const recEcon = subEconomics(sub)
      const recProduct = sub.product_label || 'Uncategorized'
      const recOtherProducts = CURRENT_STATUSES.has(status)
        ? [...currentByLabel.entries()]
            .filter(([label]) => label !== recProduct)
            .map(([label, v]) => ({ product: label, mrr: v.mrr, state: v.state }))
            .sort((a, b) => b.mrr - a.mrr)
        : []
      allSubRecords.push({
        product: recProduct,
        name: customerName,
        stripeCustomerId,
        status,
        state: recEcon.state,
        listMrr: recEcon.listMrr,
        netMrr: recEcon.netMrr,
        committedMrr: recEcon.committedMrr,
        collecting: recEcon.collecting,
        inMrr: ['active', 'trialing', 'past_due'].includes(status), // paused is 'active'
        inCollecting: recEcon.collecting === true,
        badge: recEcon.badge,
        manualId: null,
        otherProducts: recOtherProducts,
      })

      // ---- by product (current subs: active / trialing / past_due) ----
      if (CURRENT_STATUSES.has(status)) {
        const product = sub.product_label || 'Uncategorized'
        const econ = subEconomics(sub)
        const { listMrr, netMrr, collecting, state, badge } = econ
        committedContracted += econ.committedMrr
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

  // ---- Merge manual revenue (added via the add_manual_revenue RPC) ----
  // A manual-only product is valid, so create its bucket if needed. Recurring
  // entries count toward net + contracted; one-time entries are captured cash
  // that is NOT MRR, so they only attach to the customer list.
  for (const m of manualRows) {
    if (!m) continue
    const product = m.product_label || 'Uncategorized'
    const amount = toNumber(m.amount)
    const pr = productMap.get(product) || { activeSubs: 0, contractedMrr: 0, netMrr: 0, customers: [] }
    const base = {
      name: m.customer_name || 'Manual entry',
      stripeCustomerId: null,
      listMrr: amount,
      otherProducts: [],
      manualId: m.id,
      paymentMethod: m.payment_method || null,
      note: m.note || null,
    }
    if (m.entry_type === 'onetime') {
      pr.customers.push({ ...base, netMrr: 0, collecting: false, state: 'manual_onetime', badge: 'Manual · 1-time' })
      allSubRecords.push({
        product, name: base.name, stripeCustomerId: null, status: 'manual', state: 'manual_onetime',
        listMrr: amount, netMrr: 0, committedMrr: 0, collecting: false, inMrr: false, inCollecting: false,
        badge: 'Manual · 1-time', manualId: m.id, otherProducts: [],
      })
    } else {
      pr.netMrr += amount
      pr.contractedMrr += amount
      pr.activeSubs += 1
      netContracted += amount
      committedContracted += amount
      activeSubs += 1
      pr.customers.push({ ...base, netMrr: amount, collecting: true, state: 'manual', badge: 'Manual' })
      allSubRecords.push({
        product, name: base.name, stripeCustomerId: null, status: 'manual', state: 'manual',
        listMrr: amount, netMrr: amount, committedMrr: amount, collecting: true, inMrr: true, inCollecting: true,
        badge: 'Manual', manualId: m.id, otherProducts: [],
      })
    }
    productMap.set(product, pr)
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
    allSubRecords,
    totals: { activeContracted, netContracted, committedContracted, activeSubs },
  }
}
