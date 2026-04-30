// Single source of truth for teams, roles, and their relationships.
// Adding a new role: add it to the team's roles array here, add a view
// component, and route to it in App.jsx.

export const TEAMS = [
  {
    key: 'customer_success',
    label: 'Customer Success',
    color: '#0F766E',
    roles: [
      { key: 'csm',                  label: 'CSM',                          status: 'live' },
      { key: 'implementation',       label: 'Implementation Specialist',    status: 'live' },
      { key: 'support',              label: 'Customer Support Associate',   status: 'live' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    color: '#1E40AF',
    roles: [
      { key: 'account_executive',    label: 'Account Executive',            status: 'live' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    color: '#BE185D',
    roles: [
      { key: 'growth_manager',       label: 'Growth Manager',               status: 'live' },
      { key: 'ad_strategist',        label: 'Ad Strategist',                status: 'live' },
    ],
  },
  {
    key: 'product',
    label: 'Product',
    color: '#7C3AED',
    roles: [
      { key: 'engineer',             label: 'Engineer',                     status: 'live' },
    ],
  },
]

// Lookup helpers
export const getTeam = (teamKey) => TEAMS.find(t => t.key === teamKey)
export const getRole = (teamKey, roleKey) => {
  const team = getTeam(teamKey)
  return team?.roles.find(r => r.key === roleKey)
}
export const getRoleLabel = (teamKey, roleKey) => getRole(teamKey, roleKey)?.label || roleKey
export const getTeamLabel = (teamKey) => getTeam(teamKey)?.label || teamKey
export const getTeamColor = (teamKey) => getTeam(teamKey)?.color || '#1C1917'

// Access tiers
export const ACCESS_TIERS = [
  { key: 'executive',  label: 'Executive',  description: 'Sees all teams' },
  { key: 'team_lead',  label: 'Team Lead',  description: 'Sees own team' },
  { key: 'member',     label: 'Member',     description: 'Sees own scorecard only' },
]

// What access tier does a profile have?
// "Executive" overrides everything. We check both columns:
//   - `role` (legacy, set by AuthScreen for first user)
//   - `role_type` (Phase 1+, set by migration for renamed managers)
// Otherwise check is_team_lead. Otherwise member.
export const accessTier = (profile) => {
  if (!profile) return 'member'
  if (profile.role === 'executive') return 'executive'
  if (profile.role_type === 'executive') return 'executive'
  if (profile.is_team_lead) return 'team_lead'
  return 'member'
}

// Default day-of-week config (Mon-Fri)
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] // 0=Sun, 1=Mon, ..., 6=Sat
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Returns the user's working day labels in order (e.g. ['Mon','Tue','Wed','Thu','Fri'])
export const workDayLabels = (workDays) => {
  const days = (workDays && workDays.length) ? workDays : DEFAULT_WORK_DAYS
  return days.map(d => DAY_NAMES[d])
}
