const COMPANY_TZ = 'America/Toronto'
const WEEKDAY_TO_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

// year/month/day + weekday of `date` AS OBSERVED IN COMPANY_TZ (DST-safe via Intl).
function companyTzParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COMPANY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  }
}

// Start-of-week (Monday) date string for a given date, computed in COMPANY_TZ.
export function getWeekKey(date = new Date()) {
  const { year, month, day, weekday } = companyTzParts(date)
  const back = (WEEKDAY_TO_ISO[weekday] || 1) - 1 // days since Monday
  const dt = new Date(Date.UTC(year, month - 1, day))
  dt.setUTCDate(dt.getUTCDate() - back)
  return dt.toISOString().slice(0, 10) // YYYY-MM-DD (Monday)
}

export function formatWeekLabel(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

// weekKey N weeks before/after — pure UTC calendar math, never drifts.
export function stepWeek(weekKey, n) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n * 7)
  return dt.toISOString().slice(0, 10)
}

// Generate the last N week keys, ending at the current week (inclusive).
// recentWeekKeys(8) → ['2026-03-09', '2026-03-16', ..., '2026-04-27']
export function recentWeekKeys(n = 12) {
  const current = getWeekKey()
  const keys = []
  for (let i = n - 1; i >= 0; i--) {
    keys.push(stepWeek(current, -i))
  }
  return keys
}

// Count Mon–Fri weekdays elapsed from `startStr` to `endStr` (both 'YYYY-MM-DD').
// Start day is excluded, end day is included. Same day → 0.
//   Mon → Mon = 0,  Mon → Tue = 1,  Mon → Wed = 2,  Fri → Mon = 1
// Returns null when either date is missing/invalid or end < start.
// Note: doesn't account for public holidays — Mark can refine later if needed.
export function businessDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return null
  const start = new Date(startStr + 'T00:00:00')
  const end = new Date(endStr + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  if (end < start) return null
  let count = 0
  const cur = new Date(start)
  cur.setDate(cur.getDate() + 1) // start exclusive
  while (cur <= end) {
    const day = cur.getDay() // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// Format a timestamp like "Nov 14, 2025 · 3:42 PM"
export function formatNoteTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}
