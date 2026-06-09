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
//    byProduct: [{ product, activeSubs, contractedMrr }]   (status==='active', sorted by contractedMrr desc)
//    byStatus:  [{ status, subs, mrr }]                     (all statuses, sorted by mrr desc)
//    totals:    { activeContracted, activeSubs }
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

export function useRevenueBreakdown() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    byProduct: [],
    byStatus: [],
    totals: { activeContracted: 0, activeSubs: 0 },
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data: rows, error } = await supabase
        .from('commission_customers')
        .select('subscriptions')
      if (error) throw error

      setState({ loading: false, error: null, ...aggregate(rows || []) })
    } catch (e) {
      console.error('useRevenueBreakdown:', e)
      setState({
        loading: false,
        error: e,
        byProduct: [],
        byStatus: [],
        totals: { activeContracted: 0, activeSubs: 0 },
      })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}

// =============================================================================
//  Aggregation (pure, client-side)
// =============================================================================

function aggregate(rows) {
  // product_label -> { activeSubs, contractedMrr } for ACTIVE subs only
  const productMap = new Map()
  // status -> { subs, mrr } across ALL statuses
  const statusMap = new Map()

  let activeContracted = 0
  let activeSubs = 0

  for (const row of rows) {
    const subs = Array.isArray(row?.subscriptions) ? row.subscriptions : null
    if (!subs || subs.length === 0) continue

    for (const sub of subs) {
      if (!sub) continue
      const status = sub.status || 'unknown'
      const mrr = toNumber(sub.mrr)

      // ---- by status (all statuses) ----
      const st = statusMap.get(status) || { subs: 0, mrr: 0 }
      st.subs += 1
      st.mrr += mrr
      statusMap.set(status, st)

      // ---- by product (active only) ----
      if (status === 'active') {
        const product = sub.product_label || 'Uncategorized'
        const pr = productMap.get(product) || { activeSubs: 0, contractedMrr: 0 }
        pr.activeSubs += 1
        pr.contractedMrr += mrr
        productMap.set(product, pr)

        activeContracted += mrr
        activeSubs += 1
      }
    }
  }

  const byProduct = [...productMap.entries()]
    .map(([product, v]) => ({ product, activeSubs: v.activeSubs, contractedMrr: v.contractedMrr }))
    .sort((a, b) => b.contractedMrr - a.contractedMrr)

  const byStatus = [...statusMap.entries()]
    .map(([status, v]) => ({ status, subs: v.subs, mrr: v.mrr }))
    .sort((a, b) => b.mrr - a.mrr)

  return {
    byProduct,
    byStatus,
    totals: { activeContracted, activeSubs },
  }
}
