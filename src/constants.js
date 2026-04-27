export const BLANK_WEEK = () => ({
  calls: {
    onboarding: [0, 0, 0, 0, 0],
    checkin: [0, 0, 0, 0, 0],
    support: [0, 0, 0, 0, 0],
    training: [0, 0, 0, 0, 0],
    followup: [0, 0, 0, 0, 0],
  },
  pipeline: {
    preOnboarding: 0,
    onboardingScheduled: 0,
    onboardingInProgress: 0,
    onboardingComplete: 0,
    readyToLaunch: 0,
    launched: 0,
    postLaunch: 0,
    onHold: 0,
    cancelled: 0,
  },
  launchedThisWeek: 0,
  customersToLaunch: 0,
  backlog: 0,
  cancelledThisWeek: 0,
  stillOnHold: 0,
  notes: '',
  ttfv: { stage1: 0, stage2: 0, stage3: 0 },
  testimonialsThisWeek: 0,
  testimonialsThisMonth: 0,
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

export const CALL_CATEGORIES = [
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'support', label: 'Support' },
  { key: 'training', label: 'Training' },
  { key: 'followup', label: 'Follow-up' },
]

export const PIPELINE_STAGES = [
  { key: 'preOnboarding', label: 'Pre-Onboarding', group: 'pre' },
  { key: 'onboardingScheduled', label: 'Onboarding Scheduled', group: 'pre' },
  { key: 'onboardingInProgress', label: 'Onboarding In Progress', group: 'pre' },
  { key: 'onboardingComplete', label: 'Onboarding Complete', group: 'pre' },
  { key: 'readyToLaunch', label: 'Ready to Launch', group: 'launch' },
  { key: 'launched', label: 'Launched', group: 'launch' },
  { key: 'postLaunch', label: 'Post-Launch', group: 'post' },
  { key: 'onHold', label: 'On Hold', group: 'risk' },
  { key: 'cancelled', label: 'Cancelled', group: 'risk' },
]
