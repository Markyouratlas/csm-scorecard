// Pure helpers for computing derived metrics. Returns null when undefined.

const safeDiv = (n, d) => (Number(d) > 0 ? Number(n) / Number(d) : null)
const fmtPct = (v, digits = 2) => v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`
const fmtMoney = (v, digits = 2) => v === null || v === undefined ? '—' : `$${Number(v).toFixed(digits)}`
const fmtNum = (v, digits = 1) => v === null || v === undefined ? '—' : Number(v).toFixed(digits)

// Marketing/sales derived metrics
export const cpm = (spend, impressions) => safeDiv(spend * 1000, impressions)
export const ctr = (clicks, impressions) => safeDiv(clicks, impressions)
export const cpc = (spend, clicks) => safeDiv(spend, clicks)
export const cpl = (spend, leads) => safeDiv(spend, leads)
export const bookingRate = (booked, leads) => safeDiv(booked, leads)
export const cpbc = (spend, booked) => safeDiv(spend, booked)
export const showUpRate = (completed, booked) => safeDiv(completed, booked)
export const closeRate = (signups, completed) => safeDiv(signups, completed)
// New metrics for cofounder's spec:
export const optinRate = (optins, visitors) => safeDiv(optins, visitors)
export const leadToSql = (sqls, leads) => safeDiv(sqls, leads)
export const cac = (spend, customers) => safeDiv(spend, customers)
export const costPerDemo = (spend, demosBooked) => safeDiv(spend, demosBooked)

export { safeDiv, fmtPct, fmtMoney, fmtNum }

// Sum a property across an array of day objects
export const sumDays = (days, key) => days.reduce((s, d) => s + (Number(d[key]) || 0), 0)

// Average a property across an array of day objects (only days with > 0 in `whichKey`)
export const avgDays = (days, key, whichKey) => {
  const valid = days.filter(d => (Number(d[whichKey]) || 0) > 0)
  if (!valid.length) return null
  return valid.reduce((s, d) => s + (Number(d[key]) || 0), 0) / valid.length
}

// Average a sparse array of values (skipping null/0 if asked)
export const avgArray = (arr, options = {}) => {
  const { skipNullish = true, skipZero = true } = options
  const valid = arr.filter(v => {
    if (skipNullish && (v === null || v === undefined || v === '')) return false
    if (skipZero && Number(v) === 0) return false
    return !isNaN(Number(v))
  })
  if (!valid.length) return null
  return valid.reduce((s, v) => s + Number(v), 0) / valid.length
}
