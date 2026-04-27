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
  const d = new Date(weekKey)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
