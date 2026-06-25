// =============================================================================
//  weeklyUpdateFormat — pure helpers for the investor "Weekly Update".
//
//  Reuses the daily module's metric catalog + formatting, and adds the weekly
//  "vs Target" math (no pace — the week is complete), WoW deltas, and the
//  spec-exact Slack-post generator. Shared by the on-screen weekly section and
//  the exec form's Copy-as-Slack button.
//
//    vs Target = round((this_week - target) / target * 100)
//    color     = 🟢 (>=0)  🟡 (-20..<0)  🔴 (<-20)
// =============================================================================

import {
  PACE_METRICS, DERIVED_METRICS, PACE_HEX,
  fmtCurrency, fmtCount, fmtValue, derivedRatio, derivedFor, derivedEmoji,
} from './dailyUpdateFormat.js'

export { PACE_METRICS, DERIVED_METRICS, fmtCurrency, fmtCount, fmtValue, derivedRatio, derivedFor, derivedEmoji }

const LEVEL_EMOJI = { green: '\u{1F7E2}', yellow: '\u{1F7E1}', red: '\u{1F534}' }

// ---- vs Target ----
export function vsTargetPct(thisWk, target) {
  if (target == null || Number(target) === 0) return null
  return Math.round((((Number(thisWk) || 0) - Number(target)) / Number(target)) * 100)
}
export function vsTargetLevel(pct) {
  if (pct == null) return null
  if (pct >= 0) return 'green'
  if (pct >= -20) return 'yellow'
  return 'red'
}
export function vsTargetEmoji(pct) { const l = vsTargetLevel(pct); return l ? LEVEL_EMOJI[l] : '' }
export function vsTargetHex(pct) { const l = vsTargetLevel(pct); return l ? PACE_HEX[l] : null }
export function fmtVsTarget(pct) { if (pct == null) return '—'; return pct > 0 ? `+${pct}%` : `${pct}%` }

// Higher-is-better derived ratios (show/close) vs their target — reuse daily emoji.
export function derivedHex(actualPct, targetPct) {
  if (targetPct == null) return null
  if (actualPct >= targetPct) return PACE_HEX.green
  if (actualPct >= targetPct - 20) return PACE_HEX.yellow
  return PACE_HEX.red
}

// ---- Week-over-week delta ----
export function fmtWoW(delta, unit = 'count') {
  if (delta == null || Number.isNaN(Number(delta))) return null
  const n = Number(delta)
  const sign = n >= 0 ? '+' : '-'
  const body = unit === 'usd' ? fmtCurrency(Math.abs(n)) : fmtCount(Math.abs(n))
  return body == null ? null : `${sign}${body}`
}

// ---- Dates ----
// week_key is the Monday; the weekly post is dated that week's Friday.
export function weekFridayLabel(weekKey) {
  if (!weekKey) return ''
  const [y, m, d] = weekKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 4)
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// newline-separated text → array of trimmed non-empty bullets
export function bullets(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean)
}

// ---- Slack post ----
function padCell(s, width, align) {
  const str = String(s)
  if (str.length >= width) return str
  const pad = ' '.repeat(width - str.length)
  return align === 'right' ? pad + str : str + pad
}

// week:    atlas_weekly_updates row (narrative, snapshot extras, total_mrr/customers, urls)
// thisWk:  { [metricKey]: weekly total }   targets: { [metricKey]: weekly target }
// deltas:  { mrr, customers }              now: optional Date for the stale check
export function buildWeeklySlackPost(week, thisWk = {}, targets = {}, deltas = {}, now = new Date()) {
  const w = week || {}
  const out = []
  out.push(`*Weekly Update — ${weekFridayLabel(w.week_key)}*`)
  out.push(`*#1 Focus:* ${w.focus || '?'}`)
  out.push('')
  out.push('*This week vs. weekly target*')

  // ----- pace table -----
  const header = ['Metric', 'This Wk', 'Target', 'vs Target']
  const rows = PACE_METRICS.map((m) => {
    const tw = thisWk?.[m.key]
    const target = targets?.[m.key]
    const twStr = tw == null ? 'N/A' : fmtValue(m.unit, tw)
    const targetStr = target == null ? 'N/A' : fmtValue(m.unit, target)
    const pct = vsTargetPct(tw, target)
    const vs = pct == null ? '—' : `${fmtVsTarget(pct)} ${vsTargetEmoji(pct)}`
    return [m.label, twStr, targetStr, vs]
  })
  const nameWidth = Math.max(...PACE_METRICS.map((m) => m.label.length)) + 2
  const widths = header.map((h, i) => (i === 0 ? Math.max(nameWidth, h.length) : Math.max(h.length, ...rows.map((r) => r[i].length))))
  const aligns = ['left', 'right', 'right', 'right']
  const fmtRow = (cells) => cells.map((c, i) => padCell(c, widths[i], aligns[i])).join('   ').replace(/\s+$/, '')
  out.push('```\n' + [fmtRow(header), ...rows.map(fmtRow)].join('\n') + '\n```')

  // ----- snapshot -----
  out.push('')
  out.push('*Snapshot*')
  const mrr = fmtCurrency(w.total_mrr)
  const mrrWoW = fmtWoW(deltas?.mrr, 'usd')
  out.push(`• Total MRR: ${mrr ?? 'N/A'}${mrrWoW ? ` (Δ ${mrrWoW} WoW)` : ''}`)
  const cust = fmtCount(w.total_customers)
  const custWoW = fmtWoW(deltas?.customers, 'count')
  const churn = w.churned_this_week != null ? `${fmtCount(w.churned_this_week)} churned this week` : ''
  const custTail = [custWoW ? `Δ ${custWoW} WoW` : '', churn].filter(Boolean).join('; ')
  out.push(`• Total Customers: ${cust ?? 'N/A'}${custTail ? ` (${custTail})` : ''}`)
  const pipeAmt = fmtCurrency(w.pipeline_amount)
  const pipeCount = w.pipeline_count != null ? fmtCount(w.pipeline_count) : null
  out.push(`• Pipeline: ${pipeAmt ?? 'N/A'} across ${pipeCount ?? 'N/A'} opps`)
  const cash = fmtCurrency(w.cash_on_hand)
  const runway = w.runway_months != null ? `${Math.round(Number(w.runway_months) * 10) / 10}` : 'N/A'
  out.push(`• Cash on hand: ${cash ?? 'N/A'} — runway ~${runway} months`)

  // ----- derived (this week) -----
  const derivedLines = []
  for (const d of DERIVED_METRICS) {
    const ratio = derivedFor(d, thisWk)
    if (!ratio) continue
    const target = targets?.[d.key]
    const tail = target == null ? '' : ` — target ${Math.round(target)}% ${derivedEmoji(ratio.pct, target)}`
    derivedLines.push(`• ${d.label}: ${ratio.pct}% (${ratio.num}/${ratio.den})${tail}`)
  }
  if (derivedLines.length) {
    out.push('')
    out.push('*Derived (this week)*')
    out.push(...derivedLines)
  }

  // ----- focus / plan -----
  out.push('')
  out.push(`*Focus metric:* ${w.focus_metric || '?'}`)
  out.push(`*Plan to improve:* ${w.plan_to_improve || '?'}`)
  out.push('')
  out.push(`*Key learning:* ${w.key_learning || '?'}`)
  out.push(`*Blocker:* ${w.blocker || 'none'}`)

  // ----- core rocks -----
  const rockLine = (t) => { const b = bullets(t); return b.length ? b.join('; ') : 'none' }
  out.push('')
  out.push('*Core Rocks*')
  out.push(`• Product: ${rockLine(w.rocks_product)}`)
  out.push(`• Team: ${rockLine(w.rocks_team)}`)
  out.push(`• General: ${rockLine(w.rocks_general)}`)

  // ----- asks (omit section if empty) -----
  const askList = bullets(w.asks)
  if (askList.length) {
    out.push('')
    out.push('*Asks*')
    for (const a of askList) out.push(`• ${a}`)
  }

  // ----- links -----
  const link = (url) => (url ? `<${url}|link>` : '?')
  out.push('')
  out.push(`*Plan:* ${link(w.plan_url)}`)
  out.push(`*Scorecard:* ${link(w.scorecard_url)}`)

  // ----- bot notes -----
  if (!w.plan_to_improve || String(w.plan_to_improve).trim().toUpperCase() === 'N/A') {
    out.push('')
    out.push('_Bot note: plan_to_improve missing — required every post_')
  }
  if (w.updated_at) {
    const ageDays = (now.getTime() - new Date(w.updated_at).getTime()) / 86_400_000
    if (ageDays > 7) { out.push(''); out.push(`_Bot note: spreadsheet stale (${Math.round(ageDays)}d old)_`) }
  }

  return out.join('\n')
}
