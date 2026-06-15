import { useProfitwellMetrics } from './hooks/useProfitwellMetrics.js'

const BRAND = '#6639A6'

const MONTH_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

// Humanize a metric_name: underscores → spaces, Title Case.
function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// "2026-05" → "MAY '26"
function monthTag(monthKey) {
  if (!monthKey) return ''
  const [y, m] = monthKey.split('-')
  const abbr = MONTH_ABBR[Number(m) - 1] || ''
  return `${abbr} '${y.slice(2)}`
}

// Format ProfitWell's RAW value for display. Negatives are kept — this is the
// raw feed, not the curated dashboard.
function formatValue(name, value) {
  if (value == null) return '—'

  if (name.includes('rate') || name.includes('retention')) {
    return `${Number(value).toFixed(1)}%`
  }
  if (name === 'saas_quick_ratio') {
    return Number(value).toFixed(2)
  }
  if (name === 'trial_conversion_time') {
    return `${value} days`
  }
  if (
    name.includes('revenue') ||
    name.includes('value') ||
    name.includes('arpu') ||
    name === 'average_revenue_per_user'
  ) {
    return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  // else: customer counts and the like — integer with thousands separators
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function MetricCard({ metric }) {
  const { name, latest } = metric
  const value = latest?.value ?? null
  return (
    <div className="dashboard-card">
      <div className="mono-font" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em', color: '#78716c' }}>
        {humanize(name)}
      </div>
      <div className="display-font num-tabular" style={{ color: BRAND, fontSize: 28, lineHeight: 1.1, marginTop: 4 }}>
        {formatValue(name, value)}
      </div>
      <div className="mono-font" style={{ fontSize: 10, color: '#a8a29e', marginTop: 4 }}>
        {monthTag(latest?.monthKey)}
      </div>
    </div>
  )
}

export default function ProfitwellAllMetrics() {
  const { loading, error, metrics } = useProfitwellMetrics()

  return (
    <section style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="mono-font" style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.08em', color: BRAND }}>
          Subscription Analytics · ProfitWell
        </div>
        <div className="display-font" style={{ fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>
          Everything ProfitWell tracks
        </div>
        <div style={{ fontSize: 13, color: '#78716c', marginTop: 4 }}>
          The full raw feed, synced from ProfitWell. Latest complete month shown.
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="dashboard-card" style={{ opacity: 0.5 }}>
              <div className="mono-font" style={{ fontSize: 11, color: '#a8a29e' }}>Loading…</div>
              <div className="display-font" style={{ fontSize: 28, color: '#d6d3d1', marginTop: 4 }}>—</div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ fontSize: 13, color: '#b91c1c' }}>
          Couldn’t load ProfitWell metrics: {error.message || String(error)}
        </div>
      )}

      {!loading && !error && metrics.length === 0 && (
        <div style={{ fontSize: 13, color: '#78716c' }}>
          No ProfitWell data yet — run the sync.
        </div>
      )}

      {!loading && !error && metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {metrics.map(metric => (
            <MetricCard key={metric.name} metric={metric} />
          ))}
        </div>
      )}
    </section>
  )
}
