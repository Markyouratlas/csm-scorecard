// Returns the start-of-week date string (Monday) for a given date.
// Used as the unique key for weekly scorecard entries.
export function getWeekKey(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sun, 1 = Mon ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust to Monday
  const monday = new Date(d.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10) // YYYY-MM-DD
}

export function formatWeekLabel(weekKey) {
  const d = new Date(weekKey + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Returns weekKey for the week N weeks before/after the given week.
// stepWeek('2026-04-27', -1) → '2026-04-20'
export function stepWeek(weekKey, n) {
  const d = new Date(weekKey + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
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
