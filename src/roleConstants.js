// Blank scorecard shapes per role. Each role's view file imports its own.

// ----- Implementation Specialist -----
// Mon-Fri daily tracker: new onboardings, follow-up requests, completed,
// ongoing clients, backlog, and partner (StitchOps) new/active/completed.
// partner* keys are partner-neutral so the displayed name can change w/o migration.
export const BLANK_IMPLEMENTATION_WEEK = () => ({
  daily: [
    blankImplDay(), blankImplDay(), blankImplDay(),
    blankImplDay(), blankImplDay(), blankImplDay(), blankImplDay(),
  ], // index 0 = Sun ... 6 = Sat (we render only the user's work_days)
  projects: [],   // [{ id, customer, status, daysInFlight, notes }]
  notes: '',
})
const blankImplDay = () => ({
  newOnboardings: 0,
  followUpRequests: 0,
  completed: 0,
  ongoingClients: 0,
  backlog: 0,
  partnerNew: 0,
  partnerActive: 0,
  partnerCompleted: 0,
})

// ----- Customer Support Associate -----
export const BLANK_SUPPORT_WEEK = () => ({
  daily: [
    blankSupportDay(), blankSupportDay(), blankSupportDay(),
    blankSupportDay(), blankSupportDay(), blankSupportDay(), blankSupportDay(),
  ],
  escalations: [],   // [{ id, customer, issue, escalatedTo, status }]
  csat: {
    daily: [null, null, null, null, null, null, null], // avg score per day (1-5)
    responses: [0, 0, 0, 0, 0, 0, 0],                  // # responses per day
  },
  notes: '',
})
const blankSupportDay = () => ({
  sodTickets: 0,
  newTickets: 0,
  eodTickets: 0,
  pending: 0,
  waitingCustomer: 0,
  resolvedNoNotification: 0,
  cancellations: 0,
  completed: 0,
})

// ----- Account Executive -----
export const BLANK_AE_WEEK = () => ({
  daily: [
    blankAeDay(), blankAeDay(), blankAeDay(),
    blankAeDay(), blankAeDay(), blankAeDay(), blankAeDay(),
  ],
  // Deals: each has both one-time `value` and recurring `mrr` (monthly value)
  deals: [],   // [{ id, company, stage, value, mrr, nextStep }]
  notes: '',
})
const blankAeDay = () => ({
  demosBooked: 0,
  demosCompleted: 0,
  trialSignups: 0,
})

export const AE_DEAL_STAGES = ['Discovery', 'Demo', 'Trial', 'Closing', 'Won', 'Lost']

// ----- Growth Manager -----
export const BLANK_GROWTH_WEEK = () => ({
  daily: [
    blankGrowthDay(), blankGrowthDay(), blankGrowthDay(),
    blankGrowthDay(), blankGrowthDay(), blankGrowthDay(), blankGrowthDay(),
  ],
  channels: {
    meta:     blankChannelTotals(),
    google:   blankChannelTotals(),
    linkedin: blankChannelTotals(),
    other:    blankChannelTotals(),
  },
  experiments: [], // [{ id, hypothesis, channel, status, result }]
  notes: '',
})
const blankGrowthDay = () => ({
  adSpend: 0,
  websiteVisitors: 0,    // NEW: total site visitors
  optins: 0,             // NEW: how many opted in (signed up for email/lead magnet)
  organicLeads: 0,       // NEW: leads from organic (non-paid) sources
  impressions: 0,
  clicks: 0,
  leads: 0,              // total leads (paid)
  sqls: 0,               // NEW: sales qualified leads
  demosBooked: 0,
  demosCompleted: 0,
  trialSignups: 0,
  newCustomers: 0,       // NEW: customers acquired (for CAC calc)
})
const blankChannelTotals = () => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  demosBooked: 0,
  trialSignups: 0,
})
export const EXPERIMENT_STATUSES = ['Planned', 'Running', 'Won', 'Lost', 'Inconclusive']

// ----- Ad Strategist -----
export const BLANK_AD_WEEK = () => ({
  daily: [
    blankAdDay(), blankAdDay(), blankAdDay(),
    blankAdDay(), blankAdDay(), blankAdDay(), blankAdDay(),
  ],
  campaigns: [],   // [{ id, name, channel, status, spend, leads }]
  creatives: [],   // [{ id, name, status, ctr, notes }]
  notes: '',
})
const blankAdDay = () => ({
  adSpend: 0,
  websiteVisitors: 0,    // NEW
  optins: 0,             // NEW
  impressions: 0,
  clicks: 0,
  leads: 0,
})
export const AD_CHANNELS = ['Meta', 'Google', 'LinkedIn', 'TikTok', 'Other']
export const CAMPAIGN_STATUSES = ['Active', 'Paused', 'Ended']
export const CREATIVE_STATUSES = ['Testing', 'Winner', 'Killed']

// ----- Engineer (Product) -----
// Engineers post structured weekly work — themes with bulleted outcomes —
// rather than daily numeric inputs. Metrics are derived from the themes.
export const BLANK_ENGINEER_WEEK = () => ({
  // End-of-week self-reports (all optional)
  prsMerged: '',
  prsDeployed: '',
  bugsIntroduced: '',
  codeReviewHours: '',
  userAdoptionRate: '',
  // Structured themed work
  themes: [],         // [{ id, title, category, bullets: [{ id, text, link }] }]
  inFlight: [],       // [{ id, text, link, status }]
  notes: '',
})

export const ENGINEER_CATEGORIES = [
  'Reliability',
  'Features',
  'Bug Fixes',
  'Performance',
  'Integrations',
  'Infrastructure',
  'Security & Privacy',
  'Tech Debt',
  'Tooling / DX',
]
export const IN_FLIGHT_STATUSES = ['New', 'In Progress', 'Stale', 'Blocked', 'Carry-over']

// ----- ID generators -----
export const newId = (prefix = 'r') =>
  prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
