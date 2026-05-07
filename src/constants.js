export const BLANK_WEEK = () => ({
  meetings: {
    onboarding1:     [0, 0, 0, 0, 0],
    onboarding2:     [0, 0, 0, 0, 0],
    extraOnboarding: [0, 0, 0, 0, 0],
    launch:          [0, 0, 0, 0, 0],
    followup:        [0, 0, 0, 0, 0],
    support:         [0, 0, 0, 0, 0],
  },
  pipeline: {
    preOnboarding: 0,
    kickoffScheduled: 0,
    inContact: 0,
    obInProgress: 0,
    implementationBacklog: 0,
    implementation: 0,
    implementationReview: 0,
    launch: 0,
    paused: 0,
    cancelled: 0,
  },
  launchedThisWeek: 0,
  customersToLaunch: 0,
  backlogDays: 0,
  cancelledThisWeek: 0,
  stillOnHold: 0,
  notes: '',
  ttfvCustomers: [],
  retention: { churnRate: '', nrr: '', nps: '', healthScore: '' },
})

export const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0)
export const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0)

export const fmt = (n, digits = 1) => {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '—'
  const num = Number(n)
  return Number.isInteger(num) ? num.toString() : num.toFixed(digits)
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export const MEETING_CATEGORIES = [
  { key: 'onboarding1',     label: 'Onboarding 1' },
  { key: 'onboarding2',     label: 'Onboarding 2' },
  { key: 'extraOnboarding', label: 'Extra Onboarding' },
  { key: 'launch',          label: 'Launch' },
  { key: 'followup',        label: 'Follow-up' },
  { key: 'support',         label: 'Support' },
]

export const PIPELINE_STAGES = [
  { key: 'preOnboarding',          label: 'Pre-Onboarding' },
  { key: 'kickoffScheduled',       label: 'Kickoff Scheduled' },
  { key: 'inContact',              label: 'In Contact' },
  { key: 'obInProgress',           label: 'OB In Progress' },
  { key: 'implementationBacklog',  label: 'Implementation Backlog' },
  { key: 'implementation',         label: 'Implementation' },
  { key: 'implementationReview',   label: 'Implementation Review' },
  { key: 'launch',                 label: 'Launch' },
  { key: 'paused',                 label: 'Paused' },
  { key: 'cancelled',              label: 'Cancelled' },
]

export const customerTtfv = (c) => (Number(c.stage1) || 0) + (Number(c.stage2) || 0) + (Number(c.stage3) || 0)

export const avgTtfv = (customers) => {
  const valid = (customers || []).filter(c => c.name && c.name.trim() && customerTtfv(c) > 0)
  if (!valid.length) return 0
  const total = valid.reduce((s, c) => s + customerTtfv(c), 0)
  return Math.round((total / valid.length) * 10) / 10
}

// Helper to make a fresh customer entry
export const newCustomer = () => ({
  id: 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
  name: '',
  stage1: 0,
  stage2: 0,
  stage3: 0,
  healthScore: '',  // 'green' | 'yellow' | 'red' | ''
  channelPartner: false,  // priority flag — flows through TTFV / Health / Pipeline / Retention
})

// =============================================================================
//  Feature Requests
// =============================================================================
export const FEATURE_REQUEST_STATUSES = [
  { key: 'submitted',     label: 'Submitted',    color: '#A8A29E', textColor: '#57534E' },
  { key: 'under_review',  label: 'Under Review', color: '#3B82F6', textColor: '#1E40AF' },
  { key: 'planned',       label: 'Planned',      color: '#7C3AED', textColor: '#6D28D9' },
  { key: 'shipped',       label: 'Shipped',      color: '#10B981', textColor: '#047857' },
  { key: 'declined',      label: 'Declined',     color: '#EF4444', textColor: '#B91C1C' },
]

export const FEATURE_REQUEST_PRIORITIES = [
  { key: 'low',    label: 'Low',    color: '#A8A29E', textColor: '#57534E' },
  { key: 'medium', label: 'Medium', color: '#F59E0B', textColor: '#A16207' },
  { key: 'high',   label: 'High',   color: '#EF4444', textColor: '#B91C1C' },
]

// =============================================================================
//  Cancellations
// =============================================================================
export const CANCELLATION_CATEGORIES = [
  { key: 'price',                label: 'Price' },
  { key: 'missing_feature',      label: 'Missing Feature' },
  { key: 'switched_competitor',  label: 'Switched to Competitor' },
  { key: 'no_longer_needed',     label: 'No Longer Needed' },
  { key: 'poor_fit',             label: 'Poor Fit' },
  { key: 'other',                label: 'Other' },
]

// Pretty label lookup (used in tables, manager view, etc.)
export const cancellationCategoryLabel = (key) =>
  CANCELLATION_CATEGORIES.find(c => c.key === key)?.label || 'Other'
