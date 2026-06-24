// =============================================================================
//  dailyUpdateFormat — pure helpers for the Investor "Daily Update" tab.
//
//  ONE source of truth for the metric catalog, the pace-vs-weekly-target math,
//  the currency/percent formatting, and the Slack-post generator — so the on-
//  screen pace table and the copied Slack message can never disagree. No React,
//  no Supabase: just functions over plain data.
//
//  Implements the investors' spec verbatim:
//    expected_pct = workday_index * 20            (Mon=1..Fri=5)
//    vs_pace_pp   = round(wtd / target * 100 - expected_pct)
//    color        = 🟢 (>=0)  🟡 (-20..<0)  🔴 (<-20)
// =============================================================================

// ---- Metric catalog ---------------------------------------------------------
// The 8 pace metrics, in display order. unit drives formatting (count|usd).
export const PACE_METRICS = [
  { key: 'cold_outreach',  label: 'Cold Outreach',  unit: 'count',
    definition: 'Distinct recipients contacted via a cold channel (email, DM, call, intro). A 500-person sequence = 500.' },
  { key: 'ad_spend',       label: 'Ad Spend',       unit: 'usd',
    definition: 'Gross paid acquisition spend (Meta, Google, etc.), platform fees included, agency retainers excluded.' },
  { key: 'calls_booked',   label: 'Calls Booked',   unit: 'count',
    definition: 'Demos booked, logged by the AE team — pairs with Calls Held (demos completed) for the show-up rate.' },
  { key: 'calls_held',     label: 'Calls Held',     unit: 'count',
    definition: 'Calls that started with at least one rep + one prospect attending. Reschedules don’t count until they happen.' },
  { key: 'deals_closed',   label: 'Deals Closed',   unit: 'count',
    definition: 'Signed agreement OR first payment received, whichever is earlier.' },
  { key: 'new_customers',  label: 'New Customers',  unit: 'count',
    definition: 'Same trigger as Deals Closed; counts unique logos.' },
  { key: 'cash_collected', label: 'Cash Collected', unit: 'usd',
    definition: 'Gross deposits hit the bank. Refunds tracked separately.' },
  { key: 'mrr_added',      label: 'MRR Added',      unit: 'usd',
    definition: 'Gross new MRR signed (not net). Churn reported separately.' },
]

// Snapshot fields (point-in-time, no pace).
export const SNAPSHOT_METRICS = [
  { key: 'total_mrr',       label: 'Total MRR',       unit: 'usd',
    definition: 'Contract MRR. Annual contracts ÷ 12. Paying customers only.' },
  { key: 'total_customers', label: 'Total Customers', unit: 'count',
    definition: 'Active paying subscriptions. Excludes free trials and paused accounts.' },
]

// Derived WTD ratios (higher-is-better), with their weekly-target metric_key.
export const DERIVED_METRICS = [
  { key: 'show_rate',  label: 'Show Rate',  numKey: 'calls_held',   denKey: 'calls_booked',
    definition: '(Calls Held ÷ Calls Booked) × 100.' },
  { key: 'close_rate', label: 'Close Rate', numKey: 'deals_closed', denKey: 'calls_held',
    definition: '(Deals Closed ÷ Calls Held) × 100.' },
]

// All metric_keys that can carry a weekly target (pace + derived).
export const WEEKLY_TARGET_KEYS = [
  ...PACE_METRICS.map((m) => m.key),
  ...DERIVED_METRICS.map((m) => m.key),
]

// ---- Pace state colors (UI) -------------------------------------------------
export const PACE_HEX = { green: '#16A34A', yellow: '#D97706', red: '#DC2626' }

// ---- Date / pace math -------------------------------------------------------

// Parse a 'YYYY-MM-DD' string as a LOCAL date (no UTC shift). Pass-through Dates.
function asDate(d) {
  if (d instanceof Date) return d
  if (typeof d === 'string') return new Date(d + 'T00:00:00')
  return new Date()
}

// Mon=1 .. Fri=5. Weekends clamp to 5 (treated as end-of-week / 100% expected).
export function workdayIndex(date) {
  const day = asDate(date).getDay() // 0=Sun .. 6=Sat
  return day >= 1 && day <= 5 ? day : 5
}

export function expectedPct(date) {
  return workdayIndex(date) * 20
}

// round(wtd/target*100 - expectedPct). Returns null when target is N/A (null).
export function vsPacePP(wtd, target, expPct) {
  if (target == null || Number(target) === 0) return null
  const donePct = (Number(wtd) || 0) / Number(target) * 100
  return Math.round(donePct - expPct)
}

// Spec color rule, driven by vs Pace. Returns 'green' | 'yellow' | 'red' | null.
export function paceLevel(pp) {
  if (pp == null) return null
  if (pp >= 0) return 'green'
  if (pp >= -20) return 'yellow'
  return 'red'
}

const LEVEL_EMOJI = { green: '\u{1F7E2}', yellow: '\u{1F7E1}', red: '\u{1F534}' }
export function paceEmoji(pp) {
  const lvl = paceLevel(pp)
  return lvl ? LEVEL_EMOJI[lvl] : ''
}
export function paceHex(pp) {
  const lvl = paceLevel(pp)
  return lvl ? PACE_HEX[lvl] : null
}

// "+2pp" / "0pp" / "-18pp". null → the N/A dash.
export function fmtPacePP(pp) {
  if (pp == null) return '—'
  if (pp === 0) return '0pp'
  return pp > 0 ? `+${pp}pp` : `${pp}pp`
}

// Derived ratio: { pct, num, den } or null when the denominator is 0/N/A.
export function derivedRatio(numVal, denVal) {
  const den = Number(denVal)
  if (!den) return null
  const num = Number(numVal) || 0
  return { pct: Math.round((num / den) * 100), num, den }
}

// Higher-is-better emoji for a derived ratio vs its target.
export function derivedEmoji(actualPct, targetPct) {
  if (targetPct == null) return ''
  if (actualPct >= targetPct) return LEVEL_EMOJI.green
  if (actualPct >= targetPct - 20) return LEVEL_EMOJI.yellow
  return LEVEL_EMOJI.red
}
export function derivedHex(actualPct, targetPct) {
  if (targetPct == null) return null
  if (actualPct >= targetPct) return PACE_HEX.green
  if (actualPct >= targetPct - 20) return PACE_HEX.yellow
  return PACE_HEX.red
}

// ---- Formatting -------------------------------------------------------------

// Currency per spec: <$1,000 → $847 · $1k–$999k → $1.0k · $1M+ → $1.0M · neg → -$500.
// Returns null for null/NaN so the caller can render "N/A".
export function fmtCurrency(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  const v = Number(n)
  const neg = v < 0
  const abs = Math.abs(v)
  let s
  if (abs >= 1_000_000) s = `$${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 1000) s = `$${(abs / 1000).toFixed(1)}k`
  else s = `$${Math.round(abs)}`
  return neg ? `-${s}` : s
}

export function fmtCount(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return Math.round(Number(n)).toLocaleString('en-US')
}

export function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return `${Math.round(Number(n))}%`
}

// Format a metric value by its unit. Returns 'N/A' for null (display fallback).
export function fmtValue(unit, n) {
  const s = unit === 'usd' ? fmtCurrency(n) : fmtCount(n)
  return s == null ? 'N/A' : s
}

// "Wed, May 7, 2026"
export function formatReportDate(dateStr) {
  const d = asDate(dateStr)
  if (Number.isNaN(d.getTime())) return String(dateStr || '')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// ---- Slack post generator ---------------------------------------------------

function padCell(s, width, align) {
  const str = String(s)
  if (str.length >= width) return str
  const pad = ' '.repeat(width - str.length)
  return align === 'right' ? pad + str : str + pad
}

const TARGET_NA = 'N/A'

// Build the spec-exact Slack message body.
//   day      — the atlas_daily_updates row (today values + snapshot + qualitative)
//   wtd      — { [metricKey]: weekToDateValue }
//   targets  — { [metricKey]: weeklyTargetValue|null }
//   now      — optional Date for the staleness check (defaults to current time)
export function buildSlackPost(day, wtd = {}, targets = {}, now = new Date()) {
  const date = day?.update_date
  const expPct = expectedPct(date)
  const wi = workdayIndex(date)

  // ----- pace table rows -----
  const header = ['Metric', 'Today', 'WTD', 'Target', 'vs Pace']
  const rows = PACE_METRICS.map((m) => {
    const todayVal = day?.[m.key]
    const wtdVal = wtd?.[m.key]
    const target = targets?.[m.key]
    const today = todayVal == null ? TARGET_NA : fmtValue(m.unit, todayVal)
    const wtdStr = wtdVal == null ? TARGET_NA : fmtValue(m.unit, wtdVal)
    const targetStr = target == null ? TARGET_NA : fmtValue(m.unit, target)
    const pp = vsPacePP(wtdVal, target, expPct)
    const vsPace = pp == null ? '—' : `${fmtPacePP(pp)} ${paceEmoji(pp)}`
    return [m.label, today, wtdStr, targetStr, vsPace]
  })

  // column widths — Metric col = longest name + 2 (spec); others = max cell/header.
  const nameWidth = Math.max(...PACE_METRICS.map((m) => m.label.length)) + 2
  const widths = header.map((h, i) => {
    if (i === 0) return Math.max(nameWidth, h.length)
    return Math.max(h.length, ...rows.map((r) => r[i].length))
  })
  const aligns = ['left', 'right', 'right', 'right', 'right']
  const fmtRow = (cells) =>
    cells.map((c, i) => padCell(c, widths[i], aligns[i])).join('   ').replace(/\s+$/, '')
  const tableLines = [fmtRow(header), ...rows.map(fmtRow)]
  const table = '```\n' + tableLines.join('\n') + '\n```'

  // ----- snapshot -----
  const snapshot = [
    `• Total MRR: ${fmtCurrency(day?.total_mrr) ?? TARGET_NA}`,
    `• Total Customers: ${fmtCount(day?.total_customers) ?? TARGET_NA}`,
  ]

  // ----- derived (WTD), skip when denominator is 0/N/A -----
  const derivedLines = []
  for (const d of DERIVED_METRICS) {
    const ratio = derivedRatio(wtd?.[d.numKey], wtd?.[d.denKey])
    if (!ratio) continue
    const target = targets?.[d.key]
    const tail = target == null
      ? ''
      : ` — target ${Math.round(target)}% ${derivedEmoji(ratio.pct, target)}`
    derivedLines.push(`• ${d.label}: ${ratio.pct}% (${ratio.num}/${ratio.den})${tail}`)
  }

  // ----- qualitative -----
  const link = (url) => (url ? `<${url}|link>` : '?')
  const planMissing = !day?.plan_to_improve || String(day.plan_to_improve).trim().toUpperCase() === 'N/A'

  const out = []
  out.push(`*Daily Update — ${formatReportDate(date)}*`)
  out.push(`*#1 Focus:* ${day?.focus || '?'}`)
  out.push('')
  out.push(`*Pace vs. weekly target — Day ${wi} of 5 (${expPct}% expected)*`)
  out.push(table)
  out.push('')
  out.push('*Snapshot*')
  out.push(...snapshot)
  if (derivedLines.length) {
    out.push('')
    out.push('*Derived (WTD)*')
    out.push(...derivedLines)
  }
  out.push('')
  out.push(`*Focus metric:* ${day?.focus_metric || '?'}`)
  out.push(`*Plan to improve:* ${day?.plan_to_improve || '?'}`)
  out.push('')
  out.push(`*Key learning:* ${day?.key_learning || '?'}`)
  out.push(`*Blocker:* ${day?.blocker || 'none'}`)
  out.push('')
  out.push(`*Plan:* ${link(day?.plan_url)}`)
  out.push(`*Scorecard:* ${link(day?.scorecard_url)}`)

  // ----- bot notes -----
  if (planMissing) {
    out.push('')
    out.push('_Bot note: plan_to_improve missing — required every post_')
  }
  if (day?.updated_at) {
    const ageH = (now.getTime() - new Date(day.updated_at).getTime()) / 3_600_000
    if (ageH > 24) {
      out.push('')
      out.push(`_Bot note: spreadsheet stale (${Math.round(ageH)}h old)_`)
    }
  }

  return out.join('\n')
}
