// Channel-partner deal status helpers + the "open partner pipeline" calculation.
//
// This is the SINGLE CLIENT DEFINITION of open/won/lost for channel_deals — reused by
// Heather's Channel Partner Deals tiles AND the Open Pipeline stat, so they can't drift.
//
// ⚠️ MIRROR of open_partner_pipeline() in src/20-open-partner-pipeline.sql. The server
// computes the investor-facing value from channel_deals with the IDENTICAL open-status
// rule. If you change the predicate here, change it there too (and vice-versa).

export const isWonChannelDeal = (status) => status === 'Closed won'

export const isLostChannelDeal = (status) =>
  status === 'Closed lost' || status === 'Closed - Churned' || status === 'declined'

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
