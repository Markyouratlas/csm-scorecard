import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// Friendly labels for known event-type slugs; unknown slugs fall back to the slug itself.
const EVENT_TYPE_LABELS = {
  'intro-to-atlas': 'Intro / Demo',
  'atlas-blue-action-call': 'Atlas Blue Action',
  'channel-partner-intro-call': 'Channel Partner',
  'follow-up-call': 'Follow Up',
}

function labelForSlug(slug) {
  return EVENT_TYPE_LABELS[slug] || slug || 'Unknown'
}

// Returns the UTC Date corresponding to midnight in America/Toronto, `daysAgo`
// calendar days before today (Toronto). Used so the dashboard window matches the
// business day regardless of the viewer's browser timezone.
function torontoMidnightDaysAgo(daysAgo) {
  const TZ = 'America/Toronto'
  // Today's Toronto calendar date as parts.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(new Date())
  // Build a UTC date for that Toronto calendar date, step back daysAgo days.
  const base = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  base.setUTCDate(base.getUTCDate() - daysAgo)
  // Now find what UTC instant equals 00:00 Toronto on base's date. Toronto's
  // offset (in minutes) at that date: format the base instant in Toronto and
  // compare to UTC wall-clock.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(base).reduce((a, p) => (a[p.type] = p.value, a), {})
  // The wall-clock Toronto time of the `base` UTC-midnight instant tells us the offset.
  const asTorontoMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second)
  )
  const offsetMs = base.getTime() - asTorontoMs
  // Toronto midnight expressed as a UTC instant.
  return new Date(base.getTime() + offsetMs)
}

// Returns the UTC Date for midnight America/Toronto on the given YYYY-MM-DD.
// Used to anchor a week-aligned window to the scorecard's Monday.
function torontoMidnightOfDateStr(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const TZ = 'America/Toronto'
  const base = new Date(Date.UTC(y, m - 1, d))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(base).reduce((a, p) => (a[p.type] = p.value, a), {})
  const asTorontoMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second)
  )
  const offsetMs = base.getTime() - asTorontoMs
  return new Date(base.getTime() + offsetMs)
}

// Exclusive upper bound = Monday 00:00 Toronto of the FOLLOWING week (i.e. start
// Monday + 7 days). Used to bound a full Mon–Sun scheduled window.
function torontoNextMondayOfDateStr(dateStr) {
  const mon = torontoMidnightOfDateStr(dateStr)
  if (!mon) return null
  return new Date(mon.getTime() + 7 * 24 * 60 * 60 * 1000)
}

// Toronto-anchored start of the current calendar quarter ('qtd') or year ('ytd'),
// returned as the UTC instant of that Toronto-local midnight. Used to match
// Meta's this_quarter / this_year presets for cost-per-meeting windows.
function torontoPeriodStart(period) {
  // Get today's date AS OBSERVED IN Toronto.
  const TZ = 'America/Toronto'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {})
  const y = Number(parts.year)
  const m = Number(parts.month) // 1-12
  let startStr
  if (period === 'ytd') {
    startStr = `${y}-01-01`
  } else { // 'qtd'
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1 // 1,4,7,10
    startStr = `${y}-${String(qStartMonth).padStart(2, '0')}-01`
  }
  return torontoMidnightOfDateStr(startStr)
}

// Returns the America/Toronto calendar date (YYYY-MM-DD) for an ISO timestamp,
// so per-day buckets align with the Toronto business day (matching the window).
function torontoDateStr(iso) {
  if (!iso) return null
  // en-CA formats as YYYY-MM-DD; timeZone shifts to Toronto wall-clock first.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

const EMPTY_CAL = {
  bookedCalls: 0,
  paidCount: 0,
  organicCount: 0,
  byEventType: [],
  series: [],
  paidSeries: [],
  cancelledCount: 0,
  untaggedSlugs: [],
  adDrivenSlugs: [],
}

async function fetchCalBookings({ days, weekKey, period, dateField }) {
  // Anchor the window to Toronto midnight (the business day), not the viewer's
  // browser timezone — otherwise "Today" shifts per-viewer and misses bookings.
  // 'created' (default): window by created_at_cal, Monday→now (or rolling N days).
  // 'scheduled': window by start_time across the FULL Mon–Sun week.
  const scheduled = dateField === 'scheduled'
  const filterCol = scheduled ? 'start_time' : 'created_at_cal'
  // Window precedence: period (calendar QTD/YTD) > weekKey > rolling days.
  const since = period
    ? torontoPeriodStart(period)
    : weekKey
      ? torontoMidnightOfDateStr(weekKey)
      : torontoMidnightDaysAgo(days)
  const sinceISO = since.toISOString()
  // Upper bound only in scheduled+weekKey mode (end of Sunday = next Monday 00:00).
  // Calendar periods (qtd/ytd) and rolling days run open-ended up to now.
  const untilISO = (scheduled && weekKey)
    ? torontoNextMondayOfDateStr(weekKey).toISOString()
    : null

  // Classify ad-driven vs organic from the cal_event_type_config table
  // (not a hardcoded slug), so new event types can be tagged by Nick.
  const { data: cfgData, error: cfgError } = await supabase
    .from('cal_event_type_config')
    .select('slug, label, is_ad_driven')
  if (cfgError) throw cfgError
  const cfg = cfgData || []
  // Set of slugs marked ad-driven, and a label override map, from the config.
  const adDrivenSet = new Set(cfg.filter(c => c.is_ad_driven).map(c => c.slug))
  const configuredSlugs = new Set(cfg.map(c => c.slug))
  const cfgLabel = new Map(cfg.map(c => [c.slug, c.label]))

  let q = supabase
    .from('cal_bookings')
    .select('uid, status, event_type_slug, created_at_cal, start_time')
    .gte(filterCol, sinceISO)
  if (untilISO) q = q.lt(filterCol, untilISO)
  q = q.order('created_at_cal', { ascending: false }).limit(2000)
  const { data, error } = await q

  if (error) throw error

  const rows = data || []

  // 1. Total booked calls made in the window.
  const bookedCalls = rows.length

  // 2. Count by event type (friendly label), sorted desc.
  const bySlug = new Map()
  // 3. Count by day (date portion of created_at_cal).
  const byDay = new Map()
  // 3b. Count by day for AD-DRIVEN (paid) rows only — pairs with ad spend.
  const paidByDay = new Map()
  // 4. Cancelled count (informational).
  let cancelledCount = 0
  // 5. Paid (ad-driven) count; organic is the remainder.
  let paidCount = 0

  for (const row of rows) {
    const slug = row.event_type_slug || null
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, label: (cfgLabel.get(slug) || labelForSlug(slug)), count: 0, isAdDriven: adDrivenSet.has(slug) })
    }
    bySlug.get(slug).count++

    const bucketSource = scheduled ? row.start_time : row.created_at_cal
    const day = torontoDateStr(bucketSource)
    if (day) byDay.set(day, (byDay.get(day) || 0) + 1)

    // Ad-driven status comes from cal_event_type_config; everything else is organic.
    if (adDrivenSet.has(slug)) {
      paidCount++
      if (day) paidByDay.set(day, (paidByDay.get(day) || 0) + 1)
    }

    if (row.status === 'cancelled') cancelledCount++
  }

  const organicCount = bookedCalls - paidCount

  const byEventType = [...bySlug.values()].sort((a, b) => b.count - a.count)

  // Slugs present in bookings but NOT in the config — new event types Nick
  // should classify. Exclude null (a null slug can't be tagged by slug).
  const untaggedSlugs = [...bySlug.keys()].filter(s => s !== null && !configuredSlugs.has(s))
  const adDrivenSlugs = [...adDrivenSet]

  const series = [...byDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const paidSeries = [...paidByDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { bookedCalls, paidCount, organicCount, byEventType, series, paidSeries, cancelledCount, untaggedSlugs, adDrivenSlugs }
}

// Reads cal_bookings over a window (by when the booking was MADE) and aggregates
// booked-call counts for the dashboard. Cached per window via React Query.
export function useCalBookings({ days = 30, weekKey = null, period = null, dateField = 'created', refreshKey = 0 } = {}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['cal-bookings', days, weekKey, period, dateField, refreshKey],
    queryFn: () => fetchCalBookings({ days, weekKey, period, dateField }),
  })
  return { ...(data ?? EMPTY_CAL), loading: isPending, error: error ?? null, refresh: refetch }
}
