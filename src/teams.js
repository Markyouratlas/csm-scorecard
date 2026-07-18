// Single source of truth for teams, roles, and their relationships.
// Adding a new role: add it to the team's roles array here, add a view
// component, and route to it in App.jsx.

export const TEAMS = [
  {
    key: 'leadership',
    label: 'Leadership',
    color: '#6639a6',
    isLeadership: true,  // marker — leadership team has no scorecards
    roles: [
      { key: 'ceo',     label: 'CEO',                            status: 'leadership' },
      { key: 'coo',     label: 'COO',                            status: 'leadership' },
      { key: 'cto',     label: 'CTO',                            status: 'leadership' },
      { key: 'cfo',     label: 'CFO',                            status: 'leadership' },
      { key: 'vp',      label: 'VP',                             status: 'leadership' },
      { key: 'other',   label: 'Other (Leadership)',             status: 'leadership' },
    ],
  },
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
      { key: 'channel_sales',        label: 'Channel Sales',                status: 'live' },
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
  {
    key: 'forward_deployed',
    label: 'Forward Deployment',
    color: '#4338CA',
    roles: [
      { key: 'forward_deployed_engineer',       label: 'Forward Deployed Engineer',        status: 'live' },
      { key: 'forward_deployed_engineer_lead',  label: 'Forward Deployed Engineer Lead',   status: 'live' },
    ],
  },
]

// Quick check: is this team a leadership team (no scorecard)?
export const isLeadershipTeam = (teamKey) => getTeam(teamKey)?.isLeadership === true

// Quick check: is this role a leadership role (no scorecard)?
export const isLeadershipRole = (roleType) => {
  return ['ceo', 'coo', 'cto', 'cfo', 'vp', 'other'].includes(roleType)
}

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
  { key: 'investor',   label: 'Investor',   description: 'Sees the investor dashboard only' },
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
  // Investors are external, read-only viewers of the gold Investor dashboard.
  // Checked after executive (an exec is never an investor) and before the
  // staff tiers, so investors fail every team/manager/scorecard gate.
  // A pending investor signed up but hasn't been granted access by an exec yet —
  // they see the cinematic "awaiting access" screen, not the gold view.
  if (profile.role_type === 'investor_pending') return 'investor_pending'
  if (profile.role_type === 'investor') return 'investor'
  if (profile.is_team_lead) return 'team_lead'
  return 'member'
}

// Team keys a lead sees in the manager view. Execs are handled separately (all
// teams); returns [] for non-leads. When managed_teams is set it OVERRIDES the
// lead's own team (so a Marketing person can be granted Sales-only, exactly as
// requested); otherwise a lead defaults to their own team (unchanged behavior).
export const leadTeamKeys = (profile) => {
  if (!profile?.is_team_lead) return []
  const managed = (profile.managed_teams || []).filter(Boolean)
  if (managed.length) return [...new Set(managed)]
  return profile.team ? [profile.team] : []
}

// Is this profile an external investor (gold-view-only, read-only)?
export const isInvestor = (profile) => profile?.role_type === 'investor'
// Has an investor signed up but not yet been granted access?
export const isInvestorPending = (profile) => profile?.role_type === 'investor_pending'

// Department options shown on the signup screen: staff teams first (sensible
// default), then Leadership, then the external Investor option. Kept separate
// from TEAMS so the synthetic "Investor" department doesn't leak into roster
// groupings, scorecard routing, etc.
export const SIGNUP_DEPARTMENTS = [
  ...TEAMS.filter(t => !t.isLeadership),
  ...TEAMS.filter(t => t.isLeadership),
  { key: 'investor', label: 'Investor', color: '#B8860B', isInvestor: true, roles: [] },
]

// Default day-of-week config (Mon-Fri)
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] // 0=Sun, 1=Mon, ..., 6=Sat
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Returns the user's working day labels in order (e.g. ['Mon','Tue','Wed','Thu','Fri'])
export const workDayLabels = (workDays) => {
  const days = (workDays && workDays.length) ? workDays : DEFAULT_WORK_DAYS
  return days.map(d => DAY_NAMES[d])
}
