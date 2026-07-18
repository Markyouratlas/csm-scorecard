// Channel-partner deal status helpers + the "open partner pipeline" calculation.
//
// This is the SINGLE CLIENT DEFINITION of open/won/lost for channel_deals — reused by
// Heather's Channel Partner Deals tiles AND the Open Pipeline stat, so they can't drift.
//
// ⚠️ MIRROR of open_partner_pipeline() in src/20-open-partner-pipeline.sql. The server
// computes the investor-facing value from channel_deals with the IDENTICAL open-status
// rule. If you change the predicate here, change it there too (and vice-versa).

// Normalize a status so Attio display strings and portal slugs collapse to one form:
// lowercase, and turn any run of space/underscore/hyphen/slash into a single space.
// So 'Closed won', 'closed_won', 'Closed - Churned', 'closed_churned' all normalize
// cleanly. MUST match the SQL normalization in open_partner_pipeline().
const normStatus = (s) => String(s ?? '').toLowerCase().replace(/[\s_/-]+/g, ' ').trim()

export const isWonChannelDeal = (status) => normStatus(status) === 'closed won'

export const isLostChannelDeal = (status) => {
  const n = normStatus(status)
  return n === 'closed lost' || n === 'closed churned' || n === 'declined'
}

export const isOpenChannelDeal = (status) =>
  !isWonChannelDeal(status) && !isLostChannelDeal(status)

// Parse a deal's avg_value (text like "$5,000") to a number; 0 if unparseable.
// Mirrors parse_channel_value() in SQL.
export const parseChannelValue = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

// Sum of avg_value across OPEN channel deals — the "open partner pipeline" metric.
export const openPartnerPipeline = (deals = []) =>
  deals.reduce((sum, d) => sum + (isOpenChannelDeal(d.status) ? parseChannelValue(d.avg_value) : 0), 0)
