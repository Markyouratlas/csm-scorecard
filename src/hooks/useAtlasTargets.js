import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useAtlasTargets
//
//  Fetches the atlas_targets table (one row per metric_key × month_key) and
//  exposes helpers to read and update target/actual values.
//
//  Shape returned:
//    targets: {
//      [metric_key]: {
//        [YYYY-MM]: { actual, target, source, updatedAt }
//      }
//    }
//
//  Helpers:
//    getMonthValue(metricKey, monthKey) → { actual, target, source }
//    getLatestActual(metricKey)         → most recent actual + monthKey
//    getCurrentMonthTarget(metricKey)   → target for the current month
//    save(metricKey, monthKey, { actual, target, notes })
//
//  Caching: fetched once on mount; manual refresh available via refresh().
// =============================================================================

function monthKeyFromDate(d) {
  // d is a Date or ISO string. Return 'YYYY-MM'.
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const ATLAS_TARGETS_KEY = ['atlas-targets']
const EMPTY = { targets: {}, raw: [] }

async function fetchAtlasTargets() {
  const { data, error } = await supabase
    .from('atlas_targets')
    .select('*')
    .order('month_key', { ascending: true })

  if (error) throw error

  const targets = {}
  for (const row of data || []) {
    const mk = monthKeyFromDate(row.month_key)
    if (!mk) continue
    if (!targets[row.metric_key]) targets[row.metric_key] = {}
    targets[row.metric_key][mk] = {
      actual: row.actual_value != null ? Number(row.actual_value) : null,
      target: row.target_value != null ? Number(row.target_value) : null,
      source: row.actual_source || null,
      notes: row.notes || null,
      updatedAt: row.updated_at || null,
    }
  }

  return { targets, raw: data || [] }
}

export function useAtlasTargets() {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ATLAS_TARGETS_KEY,
    queryFn: fetchAtlasTargets,
  })
  const targets = data?.targets ?? EMPTY.targets
  const raw = data?.raw ?? EMPTY.raw

  const getMonthValue = useCallback((metricKey, monthKey) => {
    return targets[metricKey]?.[monthKey] || null
  }, [targets])

  const getLatestActual = useCallback((metricKey) => {
    const metric = targets[metricKey]
    if (!metric) return null
    // Find the most recent month with a non-null actual
    const entries = Object.entries(metric)
      .filter(([_, v]) => v.actual != null)
      .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    if (!entries.length) return null
    const [monthKey, value] = entries[0]
    return { monthKey, ...value }
  }, [targets])

  const getCurrentMonthTarget = useCallback((metricKey) => {
    const cm = currentMonthKey()
    const entry = targets[metricKey]?.[cm]
    return entry?.target ?? null
  }, [targets])

  const getAnnualTarget = useCallback((metricKey, year) => {
    // Returns the target value for December of the given year (or this year if not specified)
    const y = year || new Date().getFullYear()
    const decKey = `${y}-12`
    return targets[metricKey]?.[decKey]?.target ?? null
  }, [targets])

  const getMonthHistory = useCallback((metricKey, monthsBack = null) => {
    // Returns months of {monthKey, actual, target}, oldest first.
    // If monthsBack is null, returns ALL months that exist for this metric.
    const metric = targets[metricKey]
    if (!metric) return []
    const entries = Object.entries(metric)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, v]) => ({ monthKey, ...v }))
    return monthsBack == null ? entries : entries.slice(-monthsBack)
  }, [targets])

  // Write one {metricKey, monthKey} cell into the cached targets so an edit shows
  // instantly (optimistic), exactly like the old setState — the next refetch reconciles.
  const patchCell = useCallback((metricKey, monthKey, cell) => {
    queryClient.setQueryData(ATLAS_TARGETS_KEY, (old) => {
      const base = old ?? EMPTY
      const nextTargets = { ...base.targets }
      nextTargets[metricKey] = { ...(nextTargets[metricKey] || {}), [monthKey]: cell }
      return { ...base, targets: nextTargets }
    })
  }, [queryClient])

  const save = useCallback(async (metricKey, monthKey, fields, userId) => {
    // monthKey is 'YYYY-MM'; we convert to first-of-month date.
    const dateKey = `${monthKey}-01`
    const payload = {
      metric_key: metricKey,
      month_key: dateKey,
      updated_at: new Date().toISOString(),
    }
    if (userId) payload.updated_by = userId
    if (fields.target !== undefined) {
      payload.target_value = fields.target === '' || fields.target == null ? null : Number(fields.target)
    }
    if (fields.actual !== undefined) {
      payload.actual_value = fields.actual === '' || fields.actual == null ? null : Number(fields.actual)
      // If user manually overrode an actual, mark source so Stripe import can decide whether to clobber it
      payload.actual_source = 'manual'
    }
    if (fields.notes !== undefined) {
      payload.notes = fields.notes
    }

    const { data: saved, error: saveErr } = await supabase
      .from('atlas_targets')
      .upsert(payload, { onConflict: 'metric_key,month_key' })
      .select()
      .single()

    if (saveErr) throw saveErr

    // Update the cache optimistically so the edit shows immediately.
    patchCell(metricKey, monthKey, {
      actual: saved.actual_value != null ? Number(saved.actual_value) : null,
      target: saved.target_value != null ? Number(saved.target_value) : null,
      source: saved.actual_source || null,
      notes: saved.notes || null,
      updatedAt: saved.updated_at,
    })

    return saved
  }, [patchCell])

  const resetActual = useCallback(async (metricKey, monthKey, userId) => {
    const dateKey = `${monthKey}-01`
    const payload = {
      metric_key: metricKey,
      month_key: dateKey,
      actual_value: null,
      actual_source: null,
      updated_at: new Date().toISOString(),
    }
    if (userId) payload.updated_by = userId
    const { data: saved, error: resetErr } = await supabase
      .from('atlas_targets')
      .upsert(payload, { onConflict: 'metric_key,month_key' })
      .select()
      .single()
    if (resetErr) throw resetErr
    patchCell(metricKey, monthKey, {
      actual: null,
      target: saved.target_value != null ? Number(saved.target_value) : null,
      source: null,
      notes: saved.notes || null,
      updatedAt: saved.updated_at,
    })
    return saved
  }, [patchCell])

  return {
    loading: isPending,
    error: error ?? null,
    targets,
    raw,
    getMonthValue,
    getLatestActual,
    getCurrentMonthTarget,
    getAnnualTarget,
    getMonthHistory,
    save,
    resetActual,
    refresh: refetch,
    currentMonthKey: currentMonthKey(),
  }
}

// Catalog of metrics that have target modals — single source of truth for
// the OdysseyView and the modal itself.
// `format` controls display: 'currency', 'percent', 'count', 'ratio'
// `description` is the human-readable explanation shown in the modal
export const METRIC_CATALOG = {
  'total-mrr': {
    label: 'Total MRR',
    format: 'currency',
    description: 'Total monthly recurring revenue across all active customers. Stripe will be the source of truth once connected; until then this is from manual entry.',
    awaiting: 'Stripe',
  },
  'total-customers': {
    label: 'Total Customers',
    format: 'count',
    description: 'Total paying customers at end of month.',
    awaiting: 'Stripe',
  },
  'arpu': {
    label: 'ARPU',
    format: 'currency',
    description: 'Average Revenue Per User = Total MRR ÷ Total Customers.',
    awaiting: 'Stripe',
  },
  'net-new-sales': {
    label: 'Net New Sales',
    format: 'count',
    description: 'Net new paying customers added this month.',
    awaiting: 'Stripe',
  },
  'net-new-mrr': {
    label: 'Net New MRR',
    format: 'currency',
    description: 'Net new monthly recurring revenue closed this month.',
    awaiting: 'Stripe',
  },
  'net-mrr-churned': {
    label: 'MRR Churned',
    format: 'currency',
    description: 'Monthly recurring revenue lost from cancellations and downgrades.',
    awaiting: 'Stripe / ProfitWell',
  },
  'churn-pct': {
    label: 'Churn %',
    format: 'percent',
    description: 'Percentage of MRR churned this month, relative to starting MRR.',
    awaiting: 'ProfitWell',
  },
  'ltv-cac': {
    label: 'LTV : CAC',
    format: 'ratio',
    description: 'Customer lifetime value divided by customer acquisition cost.',
    awaiting: 'ProfitWell',
  },
  'gross-margin': {
    label: 'Gross Margin',
    format: 'percent',
    description: 'Revenue minus cost of service, as a percentage of revenue.',
    awaiting: 'ProfitWell',
  },
  'net-rev-retention': {
    label: 'Net Rev Retention',
    format: 'percent',
    description: 'Revenue retained from existing customers, including upsells, after churn.',
    awaiting: 'ProfitWell',
  },
  'sales-calls-booked': {
    label: 'Sales Calls Booked',
    format: 'count',
    description: 'Total demos / sales calls booked this month.',
  },
  'sales-calls-sat': {
    label: 'Sales Calls Sat',
    format: 'count',
    description: 'Demos / sales calls that actually happened (excludes no-shows).',
  },
  'no-shows': {
    label: 'No Shows',
    format: 'count',
    description: 'Demos that were booked but did not happen.',
  },
  'show-rate': {
    label: 'Show Rate',
    format: 'percent',
    description: 'Sales Calls Sat ÷ Sales Calls Booked.',
  },
  'close-rate': {
    label: 'Close Rate',
    format: 'percent',
    description: 'Closes ÷ Sales Calls Sat.',
  },
  'prs-deployed': {
    label: 'PRs Deployed',
    format: 'count',
    description: 'Pull requests deployed to production this month.',
  },
  'prs-submitted': {
    label: 'PRs Submitted',
    format: 'count',
    description: 'Pull requests opened by engineering this month.',
  },
  'new-bugs': {
    label: 'New Bugs',
    format: 'count',
    description: 'New bugs reported this month.',
  },
  'cac': {
    label: 'CAC',
    format: 'currency',
    description: 'Customer Acquisition Cost = Sales & Marketing spend ÷ new customers.',
    awaiting: 'Stripe + Ads',
  },
  'cac-payback': {
    label: 'CAC Payback',
    format: 'count',
    description: 'Months to recover the cost of acquiring a customer.',
    awaiting: 'Stripe + Ads',
  },
  'new-customers': {
    label: 'New Customers',
    format: 'count',
    description: 'New customers acquired this month.',
    awaiting: 'Stripe',
  },
  // Marketing / growth metrics
  'website-visitors': {
    label: 'Website Visitors',
    format: 'count',
    description: 'Unique visitors to the website this month.',
  },
  'organic-leads': {
    label: 'Organic Leads',
    format: 'count',
    description: 'Leads from organic (non-paid) channels this month.',
  },
  'paid-leads': {
    label: 'Paid Ad Leads',
    format: 'count',
    description: 'Leads from paid advertising this month.',
  },
  'opt-in-rate': {
    label: 'Opt-In Rate',
    format: 'percent',
    description: 'Opt-ins ÷ Website Visitors.',
  },
  'cost-per-lead': {
    label: 'Cost / Lead',
    format: 'currency',
    description: 'Total ad spend ÷ paid leads this month.',
  },
  'total-ad-spend': {
    label: 'Total Ad Spend',
    format: 'currency',
    description: 'Sum of Growth + Ad Strategist spend this month.',
  },
  'trials-started': {
    label: 'Trials Started',
    format: 'count',
    description: 'Net new trial signups this month.',
  },
  'trial-to-paid': {
    label: 'Trial → Paid %',
    format: 'percent',
    description: 'Percentage of trial users who convert to paid.',
    awaiting: 'Amplitude',
  },
  'activation-rate': {
    label: 'User Activation Rate',
    format: 'percent',
    description: 'Percentage of new users who reach the "aha moment".',
    awaiting: 'Amplitude',
  },
}

// Helper to format a value for display, given a metric's format type
export function formatMetricValue(value, format) {
  if (value == null || isNaN(value)) return null
  const n = Number(value)
  switch (format) {
    case 'currency': {
      if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
      if (Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(0)}K`
      if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`
      return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    }
    case 'percent': {
      // If passed as 0–1 fraction, multiply; if already a percentage (>1), use directly
      const pct = n <= 1 ? n * 100 : n
      return `${pct.toFixed(1)}%`
    }
    case 'ratio':
      return `${n.toFixed(1)} : 1`
    case 'count':
    default:
      return Math.round(n).toLocaleString()
  }
}
