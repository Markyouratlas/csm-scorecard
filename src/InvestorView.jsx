import React, { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { useExecutiveStats } from './hooks/useExecutiveStats.js';
import LiveLED from './LiveLED.jsx';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Target, Users, DollarSign,
  Activity, Headphones, Code, Calendar, Clock,
  ArrowUpRight, ArrowDownRight, CheckCircle2, AlertCircle,
  HeartHandshake, Rocket, Megaphone, ChevronRight,
  Sparkles, Globe, Phone, GitPullRequest,
  FileSpreadsheet, BarChart3, ArrowRight,
  CircleDot, Timer, Briefcase, Info,
  PencilLine, Save, Check, X,
} from 'lucide-react';

/* ============================================================
   ATLAS ODYSSEY — MASTER SCORECARD (light theme)
   Brand purple #6639A6 · Logomark inlined as SVG
   ============================================================ */

const FONT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

.atlas-prototype-scope {
  --bg:           #E2DFEC;
  --bg-deep:      #D6D2E2;
  --surface:      #FFFFFF;
  --surface-2:    #F8F7FB;
  --border:       rgba(26, 15, 46, 0.16);
  --border-soft:  rgba(26, 15, 46, 0.09);
  --text:         #0F0825;
  --text-2:       #3A3147;
  --text-3:       #56506A;
  --text-4:       #6F6884;
  --brand:        #6639A6;
  --brand-bright: #8B5CD0;
  --brand-deep:   #4A2980;
  --brand-soft:   rgba(102, 57, 166, 0.08);
  --brand-line:   rgba(102, 57, 166, 0.22);

  --shadow-sm:    0 1px 2px rgba(26,15,46,0.06), 0 1px 0 rgba(255,255,255,0.9) inset;
  --shadow-md:    0 2px 4px rgba(26,15,46,0.06), 0 12px 32px -8px rgba(26,15,46,0.14), 0 1px 0 rgba(255,255,255,0.9) inset;
  --shadow-glass: 0 1px 0 rgba(255,255,255,0.95) inset, 0 0 0 1px rgba(102,57,166,0.06), 0 20px 56px -16px rgba(102,57,166,0.32), 0 4px 12px rgba(26,15,46,0.06);

  /* Light tinted background only for the prototype subtree, not the whole page */
  background: var(--bg);
  min-height: 70vh;
  border-radius: 16px;
}

.font-display   { font-family: 'Instrument Serif', serif; font-weight: 400; letter-spacing: -0.01em; font-feature-settings: 'tnum'; }
.font-display-i { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; }
.font-body      { font-family: 'Manrope', sans-serif; }
.font-mono      { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum'; }

.bg-paper-grid {
  background-image:
    linear-gradient(rgba(26,15,46,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(26,15,46,0.04) 1px, transparent 1px);
  background-size: 56px 56px;
}
.bg-noise {
  background-image: radial-gradient(rgba(26,15,46,0.05) 1px, transparent 1px);
  background-size: 3px 3px;
}

/* Standard card — solid white panel with crisp edges and inner specular */
.card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease, transform 220ms cubic-bezier(.2,.8,.2,1);
}
.card:hover {
  box-shadow: var(--shadow-md);
  border-color: rgba(26, 15, 46, 0.22);
  transform: translateY(-1px);
}
.card-flat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

/* Glass — translucent surface, blurred backdrop, specular sheen, brand-tinted bounce light */
.glass {
  position: relative;
  background: linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.74) 100%);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.9);
  border-radius: 20px;
  box-shadow: var(--shadow-glass);
}
.glass::before {
  /* horizontal specular highlight along top edge */
  content: '';
  position: absolute;
  top: 0;
  left: 14%;
  right: 14%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,1) 50%, transparent);
  pointer-events: none;
  border-radius: 20px 20px 0 0;
}

/* Glow halo around the live indicator dot */
.live-dot {
  position: relative;
  display: inline-flex;
  height: 8px;
  width: 8px;
}
.live-dot::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 9999px;
  background: var(--brand);
  filter: blur(5px);
  opacity: 0.5;
  animation: pulse-soft 2s ease-in-out infinite;
}
.live-dot::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 9999px;
  background: var(--brand);
}

/* Active tab indicator — gradient with soft glow */
.tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(90deg, rgba(102,57,166,0.2), #6639A6 25%, #8B5CD0 50%, #6639A6 75%, rgba(102,57,166,0.2));
  box-shadow: 0 0 10px rgba(102,57,166,0.5), 0 -1px 0 rgba(255,255,255,0.4) inset;
}

@keyframes fadeUp { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
.fade-up { animation: fadeUp 500ms cubic-bezier(.2,.8,.2,1) both; }

@keyframes pulse-soft { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
.pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* ===== Liquid Glass tooltip — iPhone-style raised bubble ===== */
/* Three-layer composition: illumination (frosted material), highlight (::before),
   inner curvature glow (::after). Centering transform preserved at all times — no jump. */
.glass-tooltip {
  position: relative;
  background:
    linear-gradient(180deg,
      rgba(255,255,255,0.86) 0%,
      rgba(255,255,255,0.72) 100%
    );
  backdrop-filter: blur(40px) saturate(180%) brightness(1.04);
  -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.04);
  border: 0.5px solid rgba(255,255,255,0.85);
  border-radius: 18px;
  box-shadow:
    /* layer 1: top inner spec line */
    0 1px 0 rgba(255,255,255,0.95) inset,
    /* layer 2: bottom inner shadow for depth */
    0 -0.5px 0 rgba(26,15,46,0.05) inset,
    /* layer 3: hairline edge definition */
    0 0 0 0.5px rgba(26,15,46,0.04),
    /* layer 4: brand-tinted ambient bounce */
    0 24px 56px -16px rgba(102,57,166,0.40),
    /* layer 5: close shadow for elevation */
    0 6px 18px rgba(26,15,46,0.10);
  /* Centering preserved through all states — tooltip never jumps */
  /* translateX(-50%) centers horizontally on the icon (left = icon center) */
  /* translateY(-100%) lifts the tooltip above the icon (top = icon top) */
  transform: translateX(-50%) translateY(calc(-100% + 6px)) scale(0.94);
  opacity: 0;
  transform-origin: 50% 100%;
  transition:
    opacity 220ms cubic-bezier(.16,1,.3,1),
    transform 340ms cubic-bezier(.16,1.2,.3,1);
  will-change: transform, opacity;
  pointer-events: none;
}
.glass-tooltip.is-visible {
  transform: translateX(-50%) translateY(-100%) scale(1);
  opacity: 1;
  pointer-events: auto;
}
/* Top-edge specular highlight — the "wet" line that catches the light */
.glass-tooltip::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16%;
  right: 16%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,1) 50%, transparent);
  border-radius: inherit;
  pointer-events: none;
}
/* Inner curvature highlight — radial glow suggesting glass thickness from above */
.glass-tooltip::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(255,255,255,0.35), transparent 65%);
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}

/* ===== Magnifier portal — Rolex Cyclops effect ===== */
@keyframes backdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.magnifier-backdrop { animation: backdropIn 320ms ease-out; }

@keyframes lensIn {
  0%   { opacity: 0; transform: scale(0.78) translateY(8px); filter: blur(8px); }
  60%  { opacity: 1; transform: scale(1.025) translateY(0);  filter: blur(0); }
  100% { opacity: 1; transform: scale(1) translateY(0);      filter: blur(0); }
}
.magnifier-lens {
  position: relative;
  background:
    linear-gradient(180deg,
      rgba(255,255,255,0.88) 0%,
      rgba(255,255,255,0.74) 100%
    );
  backdrop-filter: blur(48px) saturate(180%) brightness(1.05);
  -webkit-backdrop-filter: blur(48px) saturate(180%) brightness(1.05);
  border: 0.5px solid rgba(255,255,255,0.85);
  border-radius: 24px;
  box-shadow:
    /* top spec inner highlight */
    0 1px 0 rgba(255,255,255,0.98) inset,
    /* bottom inner depth */
    0 -0.5px 0 rgba(26,15,46,0.06) inset,
    /* edge hairline */
    0 0 0 0.5px rgba(102,57,166,0.10),
    /* brand-tinted ambient — suggests the lens is purple-glassed */
    0 40px 96px -20px rgba(102,57,166,0.55),
    /* close shadow for grounding */
    0 12px 32px rgba(26,15,46,0.20);
  animation: lensIn 520ms cubic-bezier(.16,1.2,.3,1) both;
  transform-origin: 50% 50%;
}
/* Top-edge specular line — the wet glass highlight */
.magnifier-lens::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 14%;
  right: 14%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,1) 50%, transparent);
  pointer-events: none;
  border-radius: inherit;
}
/* Inner curvature glow — like light catching the dome of the Cyclops */
.magnifier-lens::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.45), transparent 60%);
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}`;

/* ---------- ATLAS LOGOMARK (inlined SVG) ---------- */
function AtlasLogo({ className = 'w-9 h-9', color = '#6639A6' }) {
  return (
    <svg viewBox="-3 -3 106 106" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Atlas">
      <path
        fill={color}
        d="M16.5,16.5C-2,35-2,65,16.5,83.5C35,102,65,102,83.5,83.5C102,65,102,35,83.5,16.5C65-2,35-2,16.5,16.5z M75.9,75.9c-14.3,14.3-37.6,14.3-51.9,0c-14.3-14.3-14.3-37.6,0-51.9c14.3-14.3,37.6-14.3,51.9,0S90.3,61.6,75.9,75.9z M62.8,47.9c-5.2,9-10.4,17.9-15.5,26.9c0,0,0,0.1-0.1,0.1c-0.4,0.7-0.8,1.3-1.6,1c-0.9-0.3-0.7-1.1-0.6-1.8c0.4-2.3,0.8-4.5,1.3-6.8c0.7-4,1.5-7.9,2.2-11.9c0.1-0.3,0.1-0.7,0.1-1.2c-0.5,0-0.9-0.1-1.3-0.1c-2.9,0-5.9,0-8.8,0c-1.7,0-2.1-0.7-1.3-2.2c5.2-9,10.4-17.9,15.5-26.9c0,0,0-0.1,0.1-0.1c0.4-0.7,0.8-1.3,1.6-1c0.9,0.3,0.7,1.1,0.6,1.8c-0.4,2.3-0.8,4.5-1.3,6.8c-0.7,4-1.5,7.9-2.2,11.9c-0.1,0.3-0.1,0.7-0.1,1.2c0.5,0,0.9,0.1,1.3,0.1c2.9,0,5.9,0,8.8,0C63.2,45.7,63.6,46.4,62.8,47.9z"
      />
    </svg>
  );
}

/* ---------- DEPARTMENT THEME (deepened for light bg contrast) ---------- */
const DEPTS = {
  marketing: { name: 'Marketing',             color: '#DC2649', soft: 'rgba(220,38,73,0.08)',  icon: Megaphone },
  sales:     { name: 'Sales',                 color: '#15803D', soft: 'rgba(21,128,61,0.08)',  icon: TrendingUp },
  cs:        { name: 'Customer Success',      color: '#1D4ED8', soft: 'rgba(29,78,216,0.08)',  icon: HeartHandshake },
  product:   { name: 'Product & Engineering', color: '#7C3AED', soft: 'rgba(124,58,237,0.08)', icon: Code },
  growth:    { name: 'Growth & Ops',          color: '#B45309', soft: 'rgba(180,83,9,0.08)',   icon: Rocket },
  exec:      { name: 'Executive',             color: '#6639A6', soft: 'rgba(102,57,166,0.08)', icon: Sparkles },
};

const BRAND = '#6639A6';

/* ---------- INITIAL DATA (seeds the live state) ---------- */
const INITIAL_TRENDS = {
  organicLeads:    [42, 38, 51, 47, 55, 62, 58, 67],
  paidLeads:       [54, 61, 58, 67, 72, 78, 81, 89],
  websiteVisitors: [12400, 11800, 13200, 12900, 14100, 15300, 14800, 16200],
  optInRate:       [16.2, 17.1, 18.3, 17.8, 19.2, 20.4, 19.8, 21.3],
  costPerDemo:     [142, 156, 138, 145, 128, 119, 124, 112],
  CAC:             [890, 920, 845, 870, 810, 765, 790, 720],
  costPerLead:     [38, 42, 36, 39, 34, 31, 33, 29],
  totalAdSpend:    [12400, 13800, 12900, 14200, 13600, 14800, 14100, 15400],

  demosBooked:     [28, 32, 35, 31, 38, 42, 39, 45],
  showRate:        [72, 68, 75, 71, 78, 82, 79, 84],
  demosCompleted:  [20, 22, 26, 22, 30, 34, 31, 38],
  closeRate:       [22, 18, 24, 20, 26, 28, 25, 30],
  avgDealSize:     [945, 870, 980, 1020, 1030, 1075, 1095, 1115],
  newMRR:          [4200, 3800, 5400, 4600, 6200, 7400, 6800, 8500],

  churnRate:       [3.2, 2.8, 3.5, 2.9, 2.4, 2.1, 2.6, 1.9],
  NRR:             [104, 106, 103, 107, 109, 111, 110, 112],
  onTimeActivation:[62, 65, 68, 71, 73, 75, 76, 78],
  ticketsResolved: [42, 38, 45, 41, 48, 52, 49, 56],
  implementations: [8, 11, 9, 13, 12, 15, 14, 17],
  timeToValue:     [11.2, 10.8, 10.4, 9.8, 9.5, 9.1, 8.9, 8.4],

  prsDeployed:     [23, 28, 25, 31, 27, 34, 30, 37],
  newBugs:         [12, 9, 14, 8, 11, 7, 9, 6],
  userAdoption:    [54, 56, 58, 61, 63, 65, 67, 69],

  trialsStarted:   [85, 92, 88, 95, 102, 110, 105, 118],
  trialToPaid:     [11, 12, 10, 13, 14, 15, 14, 16],
  activationRate:  [42, 44, 45, 47, 49, 51, 52, 54],

  totalMRR:        [142000, 148000, 154000, 161000, 169000, 178000, 184000, 192500],
  totalCustomers:  [318, 332, 348, 361, 378, 391, 402, 417],
};

const ANNUAL = {
  totalMRR:        { current: 192500, target: 300000, label: 'Total MRR', prefix: '$' },
  totalCustomers:  { current: 417,    target: 600,    label: 'Total Customers' },
  ltvCac:          { current: 4.6,    target: 5.0,    label: 'LTV : CAC',     suffix: ':1' },
  grossMargin:     { current: 78,     target: 82,     label: 'Gross Margin',  suffix: '%' },
  netRevRetention: { current: 112,    target: 115,    label: 'Net Rev Retention', suffix: '%' },
};

const OKRS = [
  { dept: 'sales',     title: 'Reach $250K MRR by end of Q',           progress: 77, owner: 'Sarah K.' },
  { dept: 'marketing', title: 'Drive CAC under $750',                  progress: 96, owner: 'Devon M.' },
  { dept: 'cs',        title: '70% on-time activation within 14 days', progress: 89, owner: 'Priya R.' },
  { dept: 'product',   title: 'Ship 30+ PRs/wk with <8 new bugs',      progress: 84, owner: 'Jamal T.' },
  { dept: 'growth',    title: '15% trial-to-paid conversion',          progress: 72, owner: 'Lin H.' },
  { dept: 'exec',      title: 'Net revenue retention ≥ 115%',          progress: 81, owner: 'Omer J.' },
];

const STRATEGIC_INITIATIVES = [
  { name: 'Paid Acquisition',     status: 'on-track', metric: 'CAC',          value: '$720',   delta: '-8.9%',  deptKey: 'marketing', info: 'Total Sales & Marketing spend ÷ New customers acquired in the same period. Lower is better.' },
  { name: 'Customer Activation',  status: 'on-track', metric: 'On-time %',    value: '78%',    delta: '+2.6%',  deptKey: 'cs',        info: 'Customers activated within 14 days (30 for enterprise) ÷ Total new customers × 100. Target: 70%.' },
  { name: 'Channel Partnerships', status: 'at-risk',  metric: 'Pipeline',     value: '$48K',   delta: '+3.1%',  deptKey: 'growth',    info: 'Sum of open partner-sourced deal values currently in pipeline.' },
  { name: 'Affiliates',           status: 'on-track', metric: 'Partner MRR',  value: '$11.2K', delta: '+14.4%', deptKey: 'product',   info: 'Active monthly recurring revenue attributed to affiliate-driven sign-ups.' },
];

const INITIAL_TODAY = {
  // === Executive (rolled up) ===
  mrrCurrent: 192500,
  mrrTarget:  198000,
  arpu:       461,

  // === Sales · Account Executive ===
  callsHeldToday: 7,
  noShowsToday: 2,
  customersClosedToday: 3,
  newMRRToday: 1850,

  // === Sales · SDR ===
  demosBookedToday: 6,
  callsBookedToday: 9,

  // === Marketing Manager ===
  adSpendToday: 2180,
  cpcToday: 3.42,
  paidLeadsToday: 14,
  organicLeadsToday: 11,
  websiteVisitorsToday: 2480,

  // === CS Manager ===
  onTimeActivationsToday: 2,
  lateActivationsToday: 0,
  implementationsToday: 1,
  churnEventsToday: 0,
  churnMRRToday: 0,

  // === Support Lead ===
  ticketsResolvedToday: 8,

  // === Engineering Lead ===
  prsDeployedToday: 5,
  newBugsToday: 1,

  // === Growth / Ops ===
  trialsStartedToday: 17,
  trialActivationsToday: 9,

  // === Channel Partnership Manager ===
  partnerOppsToday: 2,
  partnerCallsToday: 1,
  partnerPipelineAdded: 8400,
  partnerPipeline: 47800,

  // === Auto-pulled (Stripe etc.) ===
  cashCollectedToday: 14200,
  positiveCashToday: 9800,
};

/* Live state context — every view reads through this so logged values propagate. */
const DataContext = createContext(null);

/* Monthly operational snapshots — drive the calculated metrics (ARPU, CAC, margin, etc.). */
const INITIAL_MONTHLY = {
  totalMRR:               192500,   // auto from Stripe
  totalCustomers:         417,      // auto from Stripe
  newCustomersMo:         24,       // sum of customersClosedToday over month
  expansionMRRMo:         8400,     // upsells this month, from Stripe
  contractionMRRMo:       1200,     // downgrades this month, from Stripe
  churnedMRRMo:           2800,     // from ProfitWell
  startingMRRMo:          178200,   // MRR at start of month, from ProfitWell
  salesMarketingCostMo:   38500,    // S&M salaries + ad spend for the month
  csTeamCostMo:           18200,    // CS salaries + tools
  infraCostMo:            4800,     // cloud bill + tooling
};

/* Derived helpers — compute values that aren't directly logged. */
function deriveDailyMetrics(today) {
  const showRateToday = today.callsBookedToday > 0
    ? Math.round((today.callsHeldToday / today.callsBookedToday) * 100)
    : 0;
  const closeRateToday = today.callsHeldToday > 0
    ? Math.round((today.customersClosedToday / today.callsHeldToday) * 100)
    : 0;
  return { ...today, showRateToday, closeRateToday };
}

/* Derive executive-level metrics from monthly snapshots. */
function deriveExecMetrics(monthly) {
  const m = monthly;
  const arpu = m.totalCustomers > 0 ? m.totalMRR / m.totalCustomers : 0;
  const revenueMo = m.totalMRR;
  const cogsMo = m.csTeamCostMo + m.infraCostMo;
  const grossMargin = revenueMo > 0 ? ((revenueMo - cogsMo) / revenueMo) * 100 : 0;
  const cac = m.newCustomersMo > 0 ? m.salesMarketingCostMo / m.newCustomersMo : 0;
  const costPerService = m.totalCustomers > 0 ? cogsMo / m.totalCustomers : 0;
  const cacPayback = arpu * (grossMargin / 100) > 0 ? cac / (arpu * (grossMargin / 100)) : 0;
  // Simplified LTV using months-of-life from churn approximation (assume 2.5% monthly churn baseline)
  const churnRateMo = m.startingMRRMo > 0 ? (m.churnedMRRMo / m.startingMRRMo) * 100 : 2.5;
  const ltv = churnRateMo > 0 ? (arpu * (grossMargin / 100)) / (churnRateMo / 100) : 0;
  const ltvCac = cac > 0 ? ltv / cac : 0;
  const nrr = m.startingMRRMo > 0
    ? ((m.startingMRRMo + m.expansionMRRMo - m.churnedMRRMo - m.contractionMRRMo) / m.startingMRRMo) * 100
    : 0;
  return { arpu, grossMargin, cac, costPerService, cacPayback, ltvCac, nrr, churnRateMo };
}

/* ---------- METRIC FORMULAS (drive the hover tooltips) ---------- */
const FORMULAS = {
  'Total MRR':            'Sum of all active monthly recurring revenue across all paying customers.',
  'Customers':            'Total count of active paying customers (active subscriptions).',
  'LTV : CAC':            'Customer Lifetime Value ÷ Customer Acquisition Cost. Healthy SaaS target is ≥ 3:1.',
  'Gross Margin':         '(Revenue − Cost of Service) ÷ Revenue × 100.',
  'Net Rev Retention':    '(Starting MRR + Expansion − Churn − Contraction) ÷ Starting MRR × 100. Measured annually.',
  'ARPU':                 'Total MRR ÷ Total Customers. Average Revenue Per User.',
  'Cost / Service':       'Total Customer Success + infrastructure costs ÷ Total active customers.',
  'CAC':                  'Total Sales & Marketing spend ÷ Number of new customers acquired in the same period.',
  'CAC Payback':          'CAC ÷ (ARPU × Gross Margin %). The number of months until acquisition cost is recouped.',

  'Organic Leads':        'Form submissions where UTM source = organic (search, direct, referral, social-organic).',
  'Paid Ad Leads':        'Form submissions where UTM source = paid (Meta, Google Ads, LinkedIn, etc.).',
  'Website Visitors':     'Unique weekly visitors per GA4.',
  'Opt-In Rate':          '(Total opt-ins ÷ Total website visitors) × 100. Target: 20%.',
  'Cost / Lead':          'Total ad spend ÷ Total paid leads.',
  'Cost / Booked Demo':   'Total ad spend ÷ Demos booked from paid sources.',
  'Total Ad Spend':       'Sum of paid media spend across all channels (Meta, Google, LinkedIn, etc.).',

  'Demos Booked':         'Count of demo calendar invites accepted by prospects in the period.',
  'Show-Up Rate':         '(Demos held ÷ Demos booked) × 100.',
  'Demos Completed':      'Count of demos that actually occurred (excludes no-shows and reschedules).',
  'Close Rate':           '(Deals closed-won ÷ Demos completed) × 100.',
  'Avg Deal Size':        'Total new MRR closed ÷ Number of deals closed-won.',
  'New MRR Closed':       'Sum of MRR from deals closed-won in the period.',

  'Churn Rate':           '(Customers lost in period ÷ Total customers at start of period) × 100. Pulled monthly from ProfitWell.',
  'On-Time Activation':   '(Customers activated within 14 days standard / 30 days enterprise ÷ Total new customers) × 100. Target: 70%.',
  'Time-to-First-Value':  'Average days from signup to the first key activation event.',
  'Implementations':      'Count of full customer implementations marked complete in the period.',
  'Tickets Resolved':     'Count of support tickets moved to resolved status in the period.',

  'PRs Deployed':         'Pull requests merged to production. Auto-pulled from GitHub + CI.',
  'New Bugs Reported':    'Bugs filed via log monitoring (Sentry) or user reports.',
  'User Adoption Rate':   'Percentage of users who triggered key activation events. Pulled from Amplitude.',

  'Trials Started':       'Count of free trial sign-ups in the period.',
  'Trial → Paid':         '(Trials converted to paid ÷ Total trials in cohort) × 100.',
  'User Activation Rate': 'Percentage of users who completed key activation milestones. Pulled from Amplitude.',

  'Closes Today':         'Deals closed-won today.',
  'Closes':               'Deals closed-won today.',
  'Calls Booked':         'Demos scheduled today.',
  'Calls Held':           'Demos that actually occurred today.',
  'No-Shows':             'Demos booked but the prospect did not attend.',
  'Show Rate':            '(Calls held ÷ Calls booked) × 100.',
  'Cost per Click':       'Total ad spend ÷ Total clicks across paid channels.',
  'Cash Collected':       'Actual cash receipts today. Pulled from Stripe.',
  'Positive Cash':        'Cash collected − refunds & chargebacks.',
  'Ad Spend':             'Paid media spend today across all channels.',
  'Opportunities Registered': 'Partner-sourced opportunities logged today.',
  'Partner Calls':        'Sales calls held today with partner-sourced prospects.',
  'Pipeline Value':       'Sum of open partner-sourced deal value currently in pipeline.',
};

/* ---------- DRILL-DOWN MAP ---------- */
/* Every metric → the role(s) whose inputs feed it. Used by the magnifier portal. */
const DRILL_DOWN_MAP = {
  // Executive — calculated from monthly snapshots
  'ARPU':              [{ label: 'MRR & customer count',        roleName: 'Finance Operations' }],
  'CAC':               [
    { label: 'S&M monthly cost',         roleName: 'Operations Lead' },
    { label: 'New customers (this month)', roleName: 'Finance Operations' },
  ],
  'Gross Margin':      [
    { label: 'Revenue (MRR)',            roleName: 'Finance Operations' },
    { label: 'CS team & infra costs',    roleName: 'Operations Lead' },
  ],
  'Cost / Service':    [
    { label: 'CS & infrastructure cost', roleName: 'Operations Lead' },
    { label: 'Customer count',           roleName: 'Finance Operations' },
  ],
  'CAC Payback':       [
    { label: 'S&M cost & new customers', roleName: 'Operations Lead' },
    { label: 'MRR & customers (ARPU)',   roleName: 'Finance Operations' },
  ],
  'LTV : CAC':         [
    { label: 'MRR, customers & churn',   roleName: 'Finance Operations' },
    { label: 'S&M monthly cost',         roleName: 'Operations Lead' },
  ],
  'Net Rev Retention': [{ label: 'Expansion / churn / contraction MRR', roleName: 'Finance Operations' }],
  'Total MRR':         [{ label: 'Stripe MRR snapshot',          roleName: 'Finance Operations' }],
  'Customers':         [{ label: 'Active customer count',        roleName: 'Finance Operations' }],
  'Churn Rate':        [
    { label: 'Daily churn events',       roleName: 'CS Manager' },
    { label: 'Monthly churned MRR',      roleName: 'Finance Operations' },
  ],

  // Marketing
  'Opt-In Rate':       [{ label: 'Visitors & paid leads', roleName: 'Marketing Manager' }],
  'Cost / Lead':       [{ label: 'Ad spend & paid leads', roleName: 'Marketing Manager' }],
  'Cost / Booked Demo':[
    { label: 'Ad spend (Marketing)',     roleName: 'Marketing Manager' },
    { label: 'Demos booked (SDR)',       roleName: 'Sales Development Rep' },
  ],
  'Total Ad Spend':    [{ label: 'Daily ad spend entries',         roleName: 'Marketing Manager' }],
  'Organic Leads':     [{ label: 'Daily organic lead count',       roleName: 'Marketing Manager' }],
  'Paid Ad Leads':     [{ label: 'Daily paid lead count',          roleName: 'Marketing Manager' }],
  'Website Visitors':  [{ label: 'Daily GA4 visitor count',        roleName: 'Marketing Manager' }],
  'Cost per Click':    [{ label: 'Daily CPC from ad platforms',    roleName: 'Marketing Manager' }],
  'Ad Spend':          [{ label: 'Daily ad spend',                  roleName: 'Marketing Manager' }],

  // Sales
  'Show-Up Rate':      [
    { label: 'Calls booked (SDR)',      roleName: 'Sales Development Rep' },
    { label: 'Demos held (AE)',         roleName: 'Account Executive' },
  ],
  'Show Rate':         [
    { label: 'Calls booked (SDR)',      roleName: 'Sales Development Rep' },
    { label: 'Demos held (AE)',         roleName: 'Account Executive' },
  ],
  'Close Rate':        [{ label: 'Demos held & deals closed',     roleName: 'Account Executive' }],
  'Demos Booked':      [{ label: 'SDR daily input',                roleName: 'Sales Development Rep' }],
  'Demos Completed':   [{ label: 'AE daily demos held',            roleName: 'Account Executive' }],
  'New MRR Closed':    [{ label: 'AE daily MRR entry',             roleName: 'Account Executive' }],
  'Avg Deal Size':     [{ label: 'AE daily MRR & closes',          roleName: 'Account Executive' }],
  'Closes':            [{ label: 'AE daily deals closed',          roleName: 'Account Executive' }],
  'Closes Today':      [{ label: 'AE daily deals closed',          roleName: 'Account Executive' }],
  'Calls Booked':      [{ label: 'SDR daily input',                roleName: 'Sales Development Rep' }],
  'Calls Held':        [{ label: 'AE daily input',                 roleName: 'Account Executive' }],
  'No-Shows':          [{ label: 'AE daily input',                 roleName: 'Account Executive' }],

  // Customer Success
  'On-Time Activation':[{ label: 'CS Manager activations',        roleName: 'CS Manager' }],
  'Time-to-First-Value':[{ label: 'CS Manager activation timing', roleName: 'CS Manager' }],
  'Implementations':   [{ label: 'CS Manager daily input',         roleName: 'CS Manager' }],
  'Tickets Resolved':  [{ label: 'Support Lead daily input',       roleName: 'Support Lead' }],

  // Product & Engineering
  'PRs Deployed':      [{ label: 'Engineering Lead daily input',   roleName: 'Engineering Lead' }],
  'New Bugs Reported': [{ label: 'Engineering Lead daily input',   roleName: 'Engineering Lead' }],
  'User Adoption Rate':[{ label: 'Growth/Ops trial activations',   roleName: 'Growth / Ops' }],

  // Growth & Channel
  'Trials Started':    [{ label: 'Growth/Ops daily input',         roleName: 'Growth / Ops' }],
  'Trial → Paid':      [{ label: 'Growth/Ops trial activations',   roleName: 'Growth / Ops' }],
  'Pipeline Value':    [{ label: 'Channel Partnership input',      roleName: 'Channel Partnership Manager' }],
  'Opportunities Registered': [{ label: 'Channel Partnership input', roleName: 'Channel Partnership Manager' }],
  'Partner Calls':     [{ label: 'Channel Partnership input',      roleName: 'Channel Partnership Manager' }],
};

/* ---------- PRIMITIVES ---------- */

function Sparkline({ data, color, height = 42 }) {
  const series = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace('#','')}`;
  // Tight Y-axis domain with small padding so even small variations are clearly visible
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const range = maxV - minV;
  const pad = range > 0 ? range * 0.18 : Math.max(1, maxV * 0.05);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.38} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[minV - pad, maxV + pad]} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* Hover/tap tooltip that surfaces the calculation behind a metric label.
   Hover on desktop, tap-to-toggle on touch devices, focus-visible for keyboards. */
function InfoTooltip({ content, label }) {
  const [open, setOpen] = useState(false);      // user intent
  const [mounted, setMounted] = useState(false); // is the tooltip in the DOM
  const [visible, setVisible] = useState(false); // applies the .is-visible class
  const [coords, setCoords] = useState({ top: 0, left: 0 }); // viewport coords of icon
  const triggerRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const ctx = useContext(DataContext);

  // Measure trigger position and store in viewport coords (used by the portaled tooltip).
  const measure = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: r.top + window.scrollY,        // top edge of icon, in document coords
      left: r.left + r.width / 2 + window.scrollX, // horizontal center of icon
    });
  };

  // Two-stage mount/unmount for smooth enter+exit transitions.
  useEffect(() => {
    if (open) {
      measure();
      setMounted(true);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 360);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Re-measure on scroll/resize so the tooltip stays attached to the icon.
  useEffect(() => {
    if (!open) return;
    const handler = () => measure();
    window.addEventListener('scroll', handler, true); // capture so we catch nested scroll
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  if (!content) return null;

  const drillOptions = label ? DRILL_DOWN_MAP[label] : null;
  const hasDrill = !!(drillOptions && drillOptions.length);

  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  const handleDrill = (option) => {
    cancelClose();
    setOpen(false);
    if (ctx?.setDrill) {
      ctx.setDrill({ ...option, metricLabel: label });
    }
  };

  // The actual tooltip element — rendered via portal into document.body so
  // it escapes any parent overflow/transform/contain that would clip it.
  // Wrapped in atlas-prototype-scope so the CSS variables resolve (the
  // portal target is document.body, outside the parent scope).
  const tooltipNode = mounted ? (
    <span className="atlas-prototype-scope" style={{ display: 'contents' }}>
    <span
      role="tooltip"
      className={`glass-tooltip ${visible ? 'is-visible' : ''}`}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        marginTop: '-12px',  // gap between icon and tooltip
        width: '300px',
        zIndex: 9999,
      }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <span className="block px-4 pt-3.5 pb-3 relative" style={{ zIndex: 1 }}>
        <span className="block text-[9.5px] uppercase tracking-[0.18em] font-body font-semibold mb-1.5" style={{ color: BRAND }}>
          Calculation
        </span>
        <span className="block text-[12.5px] font-body font-normal leading-[1.5] normal-case tracking-normal" style={{ color: 'var(--text)' }}>
          {content}
        </span>
      </span>

      {hasDrill && (
        <span className="block relative" style={{ zIndex: 1 }}>
          <span
            className="block mx-4"
            style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(26,15,46,0.10) 20%, rgba(26,15,46,0.10) 80%, transparent)' }}
          />
          <span className="block px-4 pt-2.5 pb-3">
            <span className="block text-[9.5px] uppercase tracking-[0.18em] font-body font-semibold mb-1.5" style={{ color: BRAND }}>
              Drill down?
            </span>
            <span className="block space-y-0.5">
              {drillOptions.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDrill(opt); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md flex items-start gap-2 transition-colors group"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(102,57,166,0.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <ChevronRight
                    className="w-3 h-3 mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                    style={{ color: BRAND }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-body font-medium leading-tight" style={{ color: 'var(--text)' }}>
                      {opt.label}
                    </span>
                    <span className="block text-[10.5px] font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>
                      from {opt.roleName}
                    </span>
                  </span>
                </button>
              ))}
            </span>
          </span>
        </span>
      )}

      {/* Tooltip arrow — matches glass material */}
      <span
        className="absolute top-full left-1/2 w-3 h-3"
        style={{
          transform: 'translateX(-50%) translateY(-50%) rotate(45deg)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.86), rgba(255,255,255,0.72))',
          borderRight: '0.5px solid rgba(255,255,255,0.85)',
          borderBottom: '0.5px solid rgba(255,255,255,0.85)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          boxShadow: '2px 2px 6px -2px rgba(102,57,166,0.20)',
          zIndex: 0,
        }}
      />
    </span>
    </span>
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex shrink-0"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cancelClose(); setOpen((o) => !o); }}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
        className="cursor-help outline-none rounded-full focus-visible:ring-1"
        style={{ '--tw-ring-color': 'rgba(102,57,166,0.4)' }}
        aria-label={`Show calculation: ${content}`}
      >
        <Info className="w-3 h-3 transition-colors" style={{ color: open ? BRAND : '#8B8497' }} />
      </button>
      {tooltipNode && typeof document !== 'undefined' && createPortal(tooltipNode, document.body)}
    </span>
  );
}

function deltaPct(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const prev = arr[n - 2], cur = arr[n - 1];
  if (!prev) return 0;
  return ((cur - prev) / prev) * 100;
}

function fmt(n) {
  if (typeof n !== 'number') return n;
  if (Math.abs(n) >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000)    return `${Math.round(n/1000).toLocaleString()}K`;
  if (Math.abs(n) >= 1000)      return `${(n/1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MetricCard({
  label, value, target, suffix = '', prefix = '',
  trend, color = BRAND, invertDelta = false, hint, info, led,
}) {
  const change = trend ? deltaPct(trend) : 0;
  const positive = invertDelta ? change < 0 : change > 0;
  const onTarget = target ? (invertDelta ? value <= target : value >= target) : null;
  const formula = info || FORMULAS[label];

  return (
    <div className="card group relative p-5 fade-up flex flex-col" style={{ minHeight: '170px' }}>
      {led && <LiveLED status={led.status} reason={led.reason} />}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>{label}</div>
            <InfoTooltip content={formula} label={label} />
          </div>
          {hint && <div className="text-[11px] mt-0.5 font-body" style={{ color: 'var(--text-4)' }}>{hint}</div>}
        </div>
        {onTarget !== null && (
          <span
            className="shrink-0 flex h-2 w-2 rounded-full pulse-soft"
            style={{ background: onTarget ? '#16A34A' : '#D97706' }}
          />
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="font-display text-[44px] leading-none tracking-tight" style={{ color }}>
          {prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}
        </div>
        {trend && Math.abs(change) > 0.05 && <DeltaPill change={change} positive={positive} />}
      </div>

      {target !== undefined && (
        <div className="mt-2 flex items-center gap-2 text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>
          <span>target</span>
          <span style={{ color: 'var(--text-2)' }}>{prefix}{typeof target === 'number' ? target.toLocaleString() : target}{suffix}</span>
        </div>
      )}

      {trend && (
        <div className="mt-auto pt-3 -mx-1">
          <Sparkline data={trend} color={color} />
        </div>
      )}
    </div>
  );
}

/* Colored delta pill — Databox style. Used by all viz types. */
function DeltaPill({ change, positive, comparison }) {
  if (!change || Math.abs(change) < 0.05) return null;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className="flex items-center gap-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded font-semibold"
        style={{
          background: positive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
          color: positive ? '#15803D' : '#DC2626',
        }}
      >
        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(change).toFixed(1)}%
      </div>
      {comparison && <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-4)' }}>{comparison}</span>}
    </div>
  );
}

/* NUMBER BLOCK — pure number focus, no chart, prominent comparison badge.
   Designed as a Databox 1x1 — dense, visually balanced, never empty. */
function NumberBlock({ label, value, prefix='', suffix='', trend, color=BRAND, info, hint, invertDelta=false, comparison='vs last week' }) {
  const formula = info || FORMULAS[label];
  const change = trend ? deltaPct(trend) : 0;
  const positive = invertDelta ? change < 0 : change > 0;
  const showDelta = trend && Math.abs(change) > 0.05;

  return (
    <div className="card p-5 fade-up flex flex-col" style={{ minHeight: '170px' }}>
      <div className="flex items-center gap-1.5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>{label}</div>
        <InfoTooltip content={formula} label={label} />
      </div>

      <div className="flex-1 flex items-center">
        <div className="font-display leading-[0.9] tracking-tight" style={{ color, fontSize: 'clamp(40px, 4vw, 56px)' }}>
          {prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {showDelta && <DeltaPill change={change} positive={positive} />}
        {comparison && (
          <span
            className="text-[10px] font-mono uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(26,15,46,0.05)', color: 'var(--text-3)' }}
          >
            {comparison}
          </span>
        )}
        {hint && !showDelta && !comparison && (
          <span className="text-[11px] font-body" style={{ color: 'var(--text-4)' }}>{hint}</span>
        )}
      </div>
    </div>
  );
}

/* GAUGE CARD — semicircular gauge built with custom SVG.
   Predictable rendering, integrated number, color-coded by goal achievement. */
function GaugeCard({ label, value, target, prefix='', suffix='', color=BRAND, info, hint, invertDelta=false, trend, led }) {
  const formula = info || FORMULAS[label];
  const rawProgress = invertDelta ? target / value : value / target;
  const progress = Math.max(0, Math.min(1, rawProgress));

  let stateColor;
  if (rawProgress >= 1)        stateColor = '#16A34A';
  else if (rawProgress >= 0.7) stateColor = '#D97706';
  else                          stateColor = '#DC2626';

  const change = trend ? deltaPct(trend) : 0;
  const positive = invertDelta ? change < 0 : change > 0;

  // Custom SVG gauge geometry
  const RADIUS = 72;
  const STROKE = 12;
  const CX = 100;
  const CY = 92;
  const ARC_LENGTH = Math.PI * RADIUS;
  const filledLength = progress * ARC_LENGTH;
  const arcPath = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`;
  const gradId = `gg-${label.replace(/\W/g, '')}-${stateColor.slice(1)}`;

  // Display the formatted value
  const displayValue = `${prefix}${typeof value === 'number' ? fmt(value) : value}${suffix}`;

  return (
    <div className="card relative p-5 fade-up flex flex-col" style={{ minHeight: '170px' }}>
      {led && <LiveLED status={led.status} reason={led.reason} />}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>{label}</div>
        <InfoTooltip content={formula} label={label} />
      </div>

      <div className="relative flex-1 flex items-center justify-center">
        <svg viewBox="0 0 200 110" className="block w-full max-w-[260px]" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={stateColor} stopOpacity={0.7} />
              <stop offset="100%" stopColor={stateColor} stopOpacity={1} />
            </linearGradient>
          </defs>
          {/* Background track */}
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(26,15,46,0.08)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d={arcPath}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filledLength} ${ARC_LENGTH}`}
            style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)' }}
          />
          {/* Goal marker tick at right end (100%) */}
          <line
            x1={CX + RADIUS}
            y1={CY - STROKE/2 - 3}
            x2={CX + RADIUS}
            y2={CY - STROKE/2 - 9}
            stroke="rgba(26,15,46,0.4)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Big value text — centered, sits inside the gauge curve */}
          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: '32px', fill: color, letterSpacing: '-0.01em', fontFeatureSettings: "'tnum'" }}
          >
            {displayValue}
          </text>
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10.5px] font-mono">
        <span style={{ color: 'var(--text-4)' }}>
          target <span style={{ color: 'var(--text-2)' }}>{prefix}{target}{suffix}</span>
        </span>
        {trend && Math.abs(change) > 0.05 && <DeltaPill change={change} positive={positive} />}
      </div>
      {hint && <div className="text-[11px] mt-1 font-body" style={{ color: 'var(--text-4)' }}>{hint}</div>}
    </div>
  );
}

/* BAR CHART CARD — weekly bars with the current week highlighted. Best for volume/cadence. */
function BarChartCard({ label, value, target, prefix='', suffix='', trend, color=BRAND, info, hint, invertDelta=false }) {
  const formula = info || FORMULAS[label];
  const change = trend ? deltaPct(trend) : 0;
  const positive = invertDelta ? change < 0 : change > 0;
  const onTarget = target ? (invertDelta ? value <= target : value >= target) : null;

  const data = (trend || []).map((v, i, arr) => ({
    name: `W${i + 1 - (arr.length - 8)}`,
    value: v,
    isLast: i === arr.length - 1,
  }));

  return (
    <div className="card p-5 fade-up flex flex-col" style={{ minHeight: '170px' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>{label}</div>
            <InfoTooltip content={formula} label={label} />
          </div>
          {hint && <div className="text-[11px] mt-0.5 font-body" style={{ color: 'var(--text-4)' }}>{hint}</div>}
        </div>
        {onTarget !== null && (
          <span
            className="shrink-0 flex h-2 w-2 rounded-full pulse-soft"
            style={{ background: onTarget ? '#16A34A' : '#D97706' }}
          />
        )}
      </div>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="font-display text-[40px] leading-none tracking-tight" style={{ color }}>
          {prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}
        </div>
        {trend && <DeltaPill change={change} positive={positive} />}
      </div>

      <div className="flex-1 flex items-end" style={{ minHeight: '50px' }}>
        <div style={{ height: '54px', width: '100%' }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                cursor={{ fill: 'rgba(26,15,46,0.04)' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: '#56506A', fontSize: 11 }}
                formatter={(v) => [`${prefix}${v.toLocaleString()}${suffix}`, label]}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.isLast ? color : `${color}33`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {target !== undefined && (
        <div className="mt-2 text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>
          target <span style={{ color: 'var(--text-2)' }}>{prefix}{typeof target === 'number' ? target.toLocaleString() : target}{suffix}</span>
        </div>
      )}
    </div>
  );
}

/* FUNNEL CARD — sales funnel with stage values and conversion rates. */
function FunnelCard({ title, stages, color = '#15803D', summary }) {
  const max = stages[0].value;
  return (
    <div className="card p-6 fade-up">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color }}>{title}</div>
        {summary && <div className="font-mono text-[11.5px]" style={{ color: 'var(--text-3)' }}>{summary}</div>}
      </div>
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const widthPct = (s.value / max) * 100;
          const isLast = i === stages.length - 1;
          return (
            <div key={s.label} className="flex items-center gap-4">
              <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold w-28 sm:w-32 shrink-0" style={{ color: 'var(--text-3)' }}>
                {s.label}
              </div>
              <div className="flex-1">
                <div
                  className="h-12 rounded-lg flex items-center px-4 relative overflow-hidden"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${color}D9, ${color})`,
                    boxShadow: `0 4px 14px -4px ${color}55, 0 1px 0 rgba(255,255,255,0.4) inset`,
                    transition: 'width 700ms cubic-bezier(.2,.8,.2,1)',
                    minWidth: '80px',
                  }}
                >
                  <span className="font-display text-[26px] leading-none tracking-tight text-white">
                    {s.prefix || ''}{s.value.toLocaleString()}{s.suffix || ''}
                  </span>
                </div>
              </div>
              <div className="w-20 text-right shrink-0">
                {s.conversion ? (
                  <div className="font-mono text-xs" style={{ color: 'var(--text-2)' }}>
                    <div className="font-semibold" style={{ color: 'var(--text)' }}>{s.conversion}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-4)' }}>{s.conversionLabel || 'conversion'}</div>
                  </div>
                ) : isLast ? null : (
                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-4)' }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ deptKey, eyebrow, title, description }) {
  const D = DEPTS[deptKey];
  const Icon = D.icon;
  return (
    <div className="flex items-end justify-between gap-6 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-4">
        <div
          className="h-11 w-11 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: D.soft, border: `1px solid ${D.color}33` }}
        >
          <Icon className="w-5 h-5" style={{ color: D.color }} />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: D.color }}>
            {eyebrow}
          </div>
          <h2 className="font-display text-3xl mt-0.5" style={{ color: 'var(--text)' }}>{title}</h2>
          {description && <div className="text-sm mt-1 max-w-2xl font-body" style={{ color: 'var(--text-2)' }}>{description}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- HEADER ---------- */
function Header({ view, setView }) {
  const tabs = [
    { id: 'executive', label: 'Executive',     sub: 'Annual + Quarterly' },
    { id: 'weekly',    label: 'Atlas Odyssey', sub: 'Weekly Scorecard' },
    { id: 'daily',     label: 'Daily Pulse',   sub: 'Today' },
    { id: 'log',       label: 'Quick Log',     sub: 'Enter today\'s data' },
    { id: 'tracking',  label: 'Tracking Guide', sub: 'What each role logs' },
  ];
  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        background: 'rgba(235,233,242,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3.5">
            <AtlasLogo className="w-10 h-10" color={BRAND} />
            <div>
              <div className="font-display text-[28px] leading-none" style={{ color: 'var(--text)' }}>
                Atlas <span className="font-display-i" style={{ color: BRAND }}>Odyssey</span>
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.2em] mt-1.5 font-body font-semibold" style={{ color: 'var(--text-3)' }}>
                Master Scorecard · {now}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2.5 text-xs font-mono" style={{ color: 'var(--text-3)' }}>
            <span className="live-dot" />
            live · auto-pulled hourly
          </div>
        </div>

        <nav className="mt-6 -mb-1 flex items-end gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="relative px-4 pt-2 pb-3 text-left transition-all duration-200 whitespace-nowrap"
                style={{ color: active ? 'var(--text)' : 'var(--text-3)' }}
              >
                <div className="font-body text-sm font-semibold">{t.label}</div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] mt-0.5 font-body" style={{ color: 'var(--text-4)' }}>{t.sub}</div>
                {active && <span className="tab-indicator" />}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/* ---------- chart styling shared ---------- */
const CHART_TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid rgba(26,15,46,0.1)',
  borderRadius: 8,
  fontSize: 12,
  color: '#1A0F2E',
  boxShadow: '0 8px 24px -8px rgba(26,15,46,0.12)',
};

/* ===================== EXECUTIVE VIEW ===================== */
function ExecutiveView() {
  const { monthly } = useContext(DataContext);
  const exec = deriveExecMetrics(monthly);
  // includeLive:false — the Investor view resolves MRR from atlas_targets aggregates
  // only; it must never query the per-customer commission tables.
  const stats = useExecutiveStats({ includeLive: false });

  // Piped from the shared executive source (same as the Odyssey hero) — edits propagate.
  const realMrr = stats.mrr.value;                  // live Stripe / manual / stored
  const realCustomers = stats.customers.value;
  const realArpu = stats.arpu.value;
  const annualMrrTarget = stats.mrrAnnualTarget ?? ANNUAL.totalMRR.target;
  const annualPct = (realMrr != null && annualMrrTarget) ? (realMrr / annualMrrTarget) * 100 : 0;
  const mrrSeries = stats.weeklyMrr.series.map((s) => ({ label: s.label, mrr: s.mrr }));

  // Yellow tiles fall back to the illustrative value until a real figure exists.
  const ltvCacVal = stats.econ.ltvCac?.actual ?? exec.ltvCac;
  const grossMarginVal = stats.econ.grossMargin?.actual ?? exec.grossMargin;
  const arpuVal = realArpu != null ? realArpu : exec.arpu;

  const subStats = [
    { label: 'Customers', v: realCustomers != null ? Math.round(realCustomers).toLocaleString() : '—',
      t: stats.customersAnnualTarget ?? ANNUAL.totalCustomers.target,
      led: { status: 'green', reason: 'Live from Stripe — distinct customers with a committed subscription.' } },
    { label: 'LTV : CAC', v: `${ltvCacVal.toFixed(1)}:1`, t: `${ANNUAL.ltvCac.target}:1`,
      led: { status: 'yellow', reason: 'Needs CAC (sales & marketing cost ÷ new customers). Showing a manually-entered figure until cost data is wired.' } },
    { label: 'Gross Margin', v: `${Math.round(grossMarginVal)}%`, t: `${ANNUAL.grossMargin.target}%`,
      led: { status: 'yellow', reason: 'Needs cost of service (CS team + infra). Showing a manually-entered figure until cost data is wired.' } },
  ];

  const INITIATIVE_LED = {
    'Paid Acquisition':     { status: 'red',    reason: 'Needs structured sales & marketing cost (salaries + ad spend) to compute CAC.' },
    'Customer Activation':  { status: 'yellow', reason: 'Comes from CSM scorecards; partial until activation tracking is formalized.' },
    'Channel Partnerships': { status: 'red',    reason: 'Needs CRM (GHL / Attio) integration for partner pipeline.' },
    'Affiliates':           { status: 'red',    reason: 'Needs an affiliate / partner revenue source.' },
  };

  return (
    <div className="space-y-12">
      {/* HERO */}
      <section
        className="glass relative overflow-hidden fade-up"
        style={{ padding: '40px' }}
      >
        <div className="absolute inset-0 bg-paper-grid opacity-40 pointer-events-none" />
        <div
          className="absolute -top-32 -right-24 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.18), transparent 70%)' }}
        />
        <LiveLED status="green" reason="Total MRR is live from Stripe (committed recurring). The weekly trajectory interpolates between monthly actuals and can be manually adjusted as real weekly figures come in." />

        <div className="relative grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold mb-3" style={{ color: BRAND }}>
              <Sparkles className="w-3 h-3" /> Annual Target — Atlas Goals
            </div>
            <div className="font-display text-7xl lg:text-8xl leading-[0.9] tracking-tighter" style={{ color: BRAND }}>
              {realMrr != null
                ? <>${(realMrr / 1000).toFixed(1)}<span style={{ color: 'rgba(102,57,166,0.55)' }}>K</span></>
                : <span style={{ color: 'var(--text-3)' }}>—</span>}
            </div>
            <div className="font-display-i text-2xl mt-2" style={{ color: 'var(--text-2)' }}>
              of ${Math.round(annualMrrTarget / 1000)}K MRR
            </div>
            <div className="mt-6 max-w-md">
              <div className="flex items-center justify-between text-xs font-mono mb-2" style={{ color: 'var(--text-2)' }}>
                <span>{annualPct.toFixed(1)}% to goal</span>
                <span>{(100 - annualPct).toFixed(1)}% remaining</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(102,57,166,0.12)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #6639A6, #9B6EE0)', width: `${annualPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-8">
              {subStats.map((s) => (
                <div key={s.label} className="relative pr-4">
                  <LiveLED status={s.led.status} reason={s.led.reason} style={{ top: 0, right: 0 }} />
                  <div className="flex items-center gap-1.5">
                    <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>{s.label}</div>
                    <InfoTooltip content={FORMULAS[s.label]} label={s.label} />
                  </div>
                  <div className="font-display text-2xl mt-1" style={{ color: 'var(--text)' }}>{s.v}</div>
                  <div className="text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>target {s.t}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold mb-3" style={{ color: 'var(--text-3)' }}>
              MRR Trajectory · Last 8 Weeks
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={mrrSeries}>
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(26,15,46,0.1)" vertical={false} />
                  <XAxis dataKey="label" stroke="#56506A" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#56506A" fontSize={11} tickLine={false} axisLine={false}
                         tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v) => [`$${v.toLocaleString()}`, 'MRR']}
                  />
                  <Area type="monotone" dataKey="mrr" stroke={BRAND} strokeWidth={2.4} fill="url(#mrrGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* STRATEGIC INITIATIVES */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>Strategic Initiatives</div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>Where the executive team is leaning in</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STRATEGIC_INITIATIVES.map((s) => {
            const D = DEPTS[s.deptKey];
            return (
              <div key={s.name} className="card relative p-5">
                {INITIATIVE_LED[s.name] && <LiveLED status={INITIATIVE_LED[s.name].status} reason={INITIATIVE_LED[s.name].reason} />}
                <div className="flex items-start justify-between mb-4 gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: D.color }}>
                      {s.name}
                    </div>
                    <InfoTooltip content={s.info} label={s.name} />
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-body font-semibold whitespace-nowrap"
                    style={{
                      background: s.status === 'on-track' ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.12)',
                      color:      s.status === 'on-track' ? '#15803D'             : '#B45309',
                    }}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="font-display text-4xl" style={{ color: 'var(--text)' }}>{s.value}</div>
                <div className="flex items-center justify-between mt-3 text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                  <span>{s.metric}</span>
                  <span style={{ color: s.delta.startsWith('+') ? '#15803D' : '#DC2626' }}>{s.delta} WoW</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* QUARTERLY OKRs */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>Quarterly OKRs</div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>How the quarter is shaping up</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-3)' }}>
            <LiveLED status="red" reason="Needs an OKR source — a dedicated table or integration. None is connected yet, so these are illustrative." style={{ position: 'static' }} />
            Q4 · Week 8 of 13
          </div>
        </div>

        <div className="card-flat divide-y" style={{ borderColor: 'var(--border)' }}>
          {OKRS.map((o, i) => {
            const D = DEPTS[o.dept];
            return (
              <div
                key={o.title}
                className="grid grid-cols-12 gap-4 items-center px-5 py-4 transition-colors hover:bg-[var(--surface-2)]"
                style={i === 0 ? {} : { borderTop: '1px solid var(--border)' }}
              >
                <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: D.color }} />
                  <span className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: D.color }}>
                    {D.name}
                  </span>
                </div>
                <div className="col-span-12 md:col-span-5 font-body text-[15px]" style={{ color: 'var(--text)' }}>{o.title}</div>
                <div className="col-span-9 md:col-span-3 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(26,15,46,0.06)' }}>
                    <div className="h-full rounded-full" style={{ background: D.color, width: `${o.progress}%` }} />
                  </div>
                  <span className="font-mono text-xs w-10 text-right" style={{ color: 'var(--text-2)' }}>{o.progress}%</span>
                </div>
                <div className="col-span-3 md:col-span-1 text-right text-xs font-body" style={{ color: 'var(--text-3)' }}>{o.owner}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* UNIT ECONOMICS */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>Unit Economics</div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>The numbers under the hood</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard  label="ARPU"           value={Math.round(arpuVal)} prefix="$" trend={[420,425,430,438,445,452,455, Math.round(arpuVal)]} color={BRAND}
            led={{ status: 'green', reason: 'Live from Stripe — Total MRR ÷ active customers.' }} />
          <GaugeCard   label="Gross Margin"   value={Math.round(grossMarginVal)}  suffix="%" target={82} trend={[74,75,75,76,77,77,78, Math.round(grossMarginVal)]} color="#15803D"
            led={{ status: 'yellow', reason: 'Needs cost of service (CS team + infra). Showing a manually-entered figure until cost data is wired.' }} />
          <MetricCard  label="Cost / Service" value={Math.round(exec.costPerService)} prefix="$" trend={[110,108,106,105,103,103,102, Math.round(exec.costPerService)]} color="#DC2649" invertDelta
            led={{ status: 'red', reason: 'Needs cost-of-service data (CS team salaries + infrastructure spend). Illustrative for now.' }} />
          <GaugeCard   label="CAC"            value={Math.round(exec.cac)} prefix="$" target={750} trend={[890,920,845,870,810,765,790, Math.round(exec.cac)]} color="#DC2649" invertDelta
            led={{ status: 'red', reason: 'Needs sales & marketing cost (salaries + ad spend) ÷ new customers. Illustrative for now.' }} />
          <MetricCard  label="CAC Payback"    value={Number(exec.cacPayback.toFixed(1))} suffix=" mo" trend={[5.4,5.2,5.0,4.9,4.8,4.7,4.7, Number(exec.cacPayback.toFixed(1))]} color="#1D4ED8" invertDelta
            led={{ status: 'red', reason: 'Derived from CAC and gross margin — needs the cost inputs above first.' }} />
          <GaugeCard   label="LTV : CAC"      value={Number(ltvCacVal.toFixed(1))} suffix=":1" target={5} trend={[3.8,3.9,4.1,4.2,4.4,4.5,4.5, Number(ltvCacVal.toFixed(1))]} color={BRAND}
            led={{ status: 'yellow', reason: 'Needs CAC. Showing a manually-entered / stored figure until cost data is wired.' }} />
        </div>
      </section>
    </div>
  );
}

/* ===================== WEEKLY VIEW (Atlas Odyssey) ===================== */
function WeeklyView() {
  const { trends } = useContext(DataContext);
  return (
    <div className="space-y-14">

      {/* MARKETING */}
      <section className="fade-up">
        <SectionHeader
          deptKey="marketing"
          eyebrow="Marketing Scorecard"
          title="Top of funnel & efficiency"
          description="Did our paid + organic engine produce qualified pipeline this week, and at what cost?"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <GaugeCard     label="Opt-In Rate"        value={trends.optInRate.at(-1)} target={20} suffix="%" trend={trends.optInRate} color="#DC2649" />
          <GaugeCard     label="CAC"                value={trends.CAC.at(-1)} target={750} prefix="$" trend={trends.CAC} color="#DC2649" invertDelta />
          <BarChartCard  label="Website Visitors"   value={trends.websiteVisitors.at(-1)} trend={trends.websiteVisitors} color="#DC2649" />
          <BarChartCard  label="Total Ad Spend"     value={trends.totalAdSpend.at(-1)} prefix="$" trend={trends.totalAdSpend} color="#DC2649" />
          <MetricCard    label="Organic Leads"      value={trends.organicLeads.at(-1)} trend={trends.organicLeads} color="#DC2649" />
          <MetricCard    label="Paid Ad Leads"      value={trends.paidLeads.at(-1)} trend={trends.paidLeads} color="#DC2649" />
          <MetricCard    label="Cost / Lead"        value={trends.costPerLead.at(-1)} prefix="$" trend={trends.costPerLead} color="#DC2649" invertDelta />
          <MetricCard    label="Cost / Booked Demo" value={trends.costPerDemo.at(-1)} prefix="$" trend={trends.costPerDemo} color="#DC2649" invertDelta />
        </div>
      </section>

      {/* SALES — funnel hero + 4 supporting cards */}
      <section className="fade-up">
        <SectionHeader
          deptKey="sales"
          eyebrow="Sales Scorecard"
          title="Pipeline → revenue"
          description="Leading indicators that turn into closed business: demos, show rates, and new MRR."
        />
        <FunnelCard
          title="Demo Funnel · This Week"
          color="#15803D"
          summary={`$${trends.newMRR.at(-1).toLocaleString()} new MRR closed`}
          stages={[
            { label: 'Demos Booked',  value: trends.demosBooked.at(-1) },
            { label: 'Demos Held',    value: trends.demosCompleted.at(-1), conversion: `${trends.showRate.at(-1)}%`, conversionLabel: 'show rate' },
            { label: 'Closed-Won',    value: Math.round(trends.demosCompleted.at(-1) * trends.closeRate.at(-1) / 100), conversion: `${trends.closeRate.at(-1)}%`, conversionLabel: 'close rate' },
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <GaugeCard    label="Show-Up Rate"     value={trends.showRate.at(-1)} target={80} suffix="%" trend={trends.showRate} color="#15803D" />
          <GaugeCard    label="Close Rate"       value={trends.closeRate.at(-1)} target={25} suffix="%" trend={trends.closeRate} color="#15803D" />
          <BarChartCard label="New MRR Closed"   value={trends.newMRR.at(-1)} prefix="$" target={7000} trend={trends.newMRR} color="#15803D" />
          <MetricCard   label="Avg Deal Size"    value={trends.avgDealSize.at(-1)} prefix="$" trend={trends.avgDealSize} color="#15803D" />
        </div>
      </section>

      {/* CUSTOMER SUCCESS — gauge-heavy (lots of goal-tracked metrics) */}
      <section className="fade-up">
        <SectionHeader
          deptKey="cs"
          eyebrow="Customer Success"
          title="Retain, activate, support"
          description="Churn, NRR, and the on-time activation bar — 70% of customers live within the 14-day mark."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <GaugeCard    label="On-Time Activation" value={trends.onTimeActivation.at(-1)} target={70} suffix="%" trend={trends.onTimeActivation} color="#1D4ED8" hint="14d standard · 30d enterprise" />
          <GaugeCard    label="Churn Rate"         value={trends.churnRate.at(-1)} target={2.5} suffix="%" trend={trends.churnRate} color="#1D4ED8" invertDelta hint="monthly · ProfitWell" />
          <GaugeCard    label="Net Rev Retention"  value={trends.NRR.at(-1)} target={110} suffix="%" trend={trends.NRR} color="#1D4ED8" hint="annualised" />
          <BarChartCard label="Implementations"    value={trends.implementations.at(-1)} trend={trends.implementations} color="#1D4ED8" />
          <BarChartCard label="Tickets Resolved"   value={trends.ticketsResolved.at(-1)} trend={trends.ticketsResolved} color="#1D4ED8" />
          <MetricCard   label="Time-to-First-Value" value={trends.timeToValue.at(-1)} suffix=" d" trend={trends.timeToValue} color="#1D4ED8" invertDelta />
        </div>
      </section>

      {/* PRODUCT & ENGINEERING */}
      <section className="fade-up">
        <SectionHeader
          deptKey="product"
          eyebrow="Product & Engineering"
          title="Velocity vs quality"
          description="Ship more, break less — and watch how users actually adopt what we build."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <BarChartCard label="PRs Deployed"        value={trends.prsDeployed.at(-1)} target={30} trend={trends.prsDeployed} color="#7C3AED" />
          <BarChartCard label="New Bugs Reported"   value={trends.newBugs.at(-1)} target={8} trend={trends.newBugs} color="#7C3AED" invertDelta hint="log monitoring · Sentry" />
          <GaugeCard    label="User Adoption Rate"  value={trends.userAdoption.at(-1)} target={70} suffix="%" trend={trends.userAdoption} color="#7C3AED" hint="Amplitude" />
        </div>
      </section>

      {/* GROWTH & OPS */}
      <section className="fade-up">
        <SectionHeader
          deptKey="growth"
          eyebrow="Growth & Ops"
          title="Self-serve activation engine"
          description="Trials in, paid out — and the activation loop in the middle that decides everything."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <BarChartCard label="Trials Started"        value={trends.trialsStarted.at(-1)} trend={trends.trialsStarted} color="#B45309" hint="monthly target: 480" />
          <GaugeCard    label="Trial → Paid"          value={trends.trialToPaid.at(-1)} target={15} suffix="%" trend={trends.trialToPaid} color="#B45309" />
          <GaugeCard    label="User Activation Rate"  value={trends.activationRate.at(-1)} target={55} suffix="%" trend={trends.activationRate} color="#B45309" hint="Amplitude" />
        </div>
      </section>

    </div>
  );
}

/* ===================== DAILY VIEW ===================== */
function DailyView() {
  const { today } = useContext(DataContext);
  const t = deriveDailyMetrics(today);
  const mrrDelta = t.mrrCurrent - t.mrrTarget;
  const mrrPct = (t.mrrCurrent / t.mrrTarget) * 100;

  return (
    <div className="space-y-12">
      {/* MRR ticker */}
      <section
        className="glass fade-up relative overflow-hidden"
        style={{ padding: '40px' }}
      >
        <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none" />
        <div
          className="absolute -top-24 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.14), transparent 70%)' }}
        />
        <div className="relative grid lg:grid-cols-3 gap-8 items-end">
          <div className="lg:col-span-2">
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold mb-3 flex items-center gap-2" style={{ color: BRAND }}>
              <CircleDot className="w-3 h-3 pulse-soft" style={{ color: BRAND }} /> Live · Today's MRR vs Target
            </div>
            <div className="flex items-end gap-6 flex-wrap">
              <div className="font-display text-7xl lg:text-8xl leading-[0.85] tracking-tighter" style={{ color: BRAND }}>
                ${(t.mrrCurrent / 1000).toFixed(1)}<span style={{ color: 'rgba(102,57,166,0.55)' }}>K</span>
              </div>
              <div>
                <div className="font-display-i text-2xl" style={{ color: 'var(--text-2)' }}>target</div>
                <div className="font-display text-3xl" style={{ color: 'var(--text)' }}>${(t.mrrTarget / 1000).toFixed(1)}K</div>
              </div>
              <div
                className="px-3 py-1.5 rounded-md font-mono text-sm"
                style={{
                  background: mrrDelta >= 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                  color:      mrrDelta >= 0 ? '#15803D'             : '#DC2626',
                }}
              >
                Δ {mrrDelta >= 0 ? '+' : ''}${(mrrDelta/1000).toFixed(1)}K
              </div>
            </div>
            <div className="mt-5 max-w-2xl">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(102,57,166,0.12)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #6639A6, #9B6EE0)', width: `${Math.min(100, mrrPct)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>
                <span>{mrrPct.toFixed(1)}% of today's pace</span>
                <span>ARPU ${t.arpu}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DailyTile label="Closes Today"  value={t.customersClosedToday}  color="#15803D" icon={CheckCircle2} />
            <DailyTile label="Close Rate"    value={`${t.closeRateToday}%`}  color="#15803D" icon={Target} />
            <DailyTile label="Calls Booked"  value={t.callsBookedToday}      color="#1D4ED8" icon={Calendar} />
            <DailyTile label="Calls Held"    value={t.callsHeldToday}        color="#1D4ED8" icon={Phone} />
          </div>
        </div>
      </section>

      <section className="fade-up">
        <SectionHeader deptKey="sales" eyebrow="Sales · Today" title="Daily sales pulse" description="The shape of today's pipeline activity." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <NumberBlock label="Demos Booked" value={t.demosBookedToday} color="#15803D" comparison="today" />
          <NumberBlock label="Calls Held"   value={t.callsHeldToday}    color="#15803D" comparison="today" />
          <NumberBlock label="No-Shows"     value={t.noShowsToday}      color="#15803D" invertDelta comparison="today" />
          <NumberBlock label="Show Rate"    value={t.showRateToday} suffix="%" color="#15803D" comparison="vs 80% goal" />
          <NumberBlock label="Closes"       value={t.customersClosedToday} color="#15803D" comparison="today" />
          <NumberBlock label="Close Rate"   value={t.closeRateToday} suffix="%" color="#15803D" comparison="vs 25% goal" />
        </div>
      </section>

      <section className="fade-up">
        <SectionHeader deptKey="marketing" eyebrow="Paid · Today" title="Ad performance" description="Spend efficiency and demo flow from paid channels today." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <NumberBlock label="Ad Spend"       value={t.adSpendToday} prefix="$" color="#DC2649" comparison="today" />
          <NumberBlock label="Cost per Click" value={t.cpcToday} prefix="$" color="#DC2649" invertDelta comparison="today" />
          <NumberBlock label="Demos Booked"   value={t.demosBookedToday} color="#DC2649" comparison="today" />
          <NumberBlock label="Cash Collected" value={t.cashCollectedToday} prefix="$" color="#DC2649" comparison="today" />
          <NumberBlock label="Positive Cash"  value={t.positiveCashToday} prefix="$" color="#DC2649" comparison="today" />
          <NumberBlock label="ARPU"           value={t.arpu} prefix="$" color="#DC2649" comparison="this month" />
        </div>
      </section>

      <section className="fade-up">
        <SectionHeader deptKey="growth" eyebrow="Channel · Today" title="Partnerships" description="Opportunities registered, partner-driven calls, and live pipeline." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumberBlock label="Opportunities Registered" value={t.partnerOppsToday} color="#B45309" comparison="today" />
          <NumberBlock label="Partner Calls"            value={t.partnerCallsToday} color="#B45309" comparison="today" />
          <NumberBlock label="Pipeline Value"           value={t.partnerPipeline} prefix="$" color="#B45309" comparison="open pipeline" />
        </div>
      </section>
    </div>
  );
}

function DailyTile({ label, value, color, icon: Icon, info }) {
  const formula = info || FORMULAS[label];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold truncate" style={{ color: 'var(--text-3)' }}>{label}</div>
          <InfoTooltip content={formula} label={label} />
        </div>
        <Icon className="w-4 h-4 shrink-0" style={{ color }} />
      </div>
      <div className="font-display text-3xl" style={{ color }}>{value}</div>
    </div>
  );
}

/* ===================== TRACKING GUIDE ===================== */

const ROLES = [
  {
    dept: 'sales', role: 'Account Executive', cadence: 'Daily · ~3 min', when: 'End of day',
    inputs: [
      { field: 'Demos held today',         example: '4',        type: 'count' },
      { field: 'No-shows',                 example: '1',        type: 'count' },
      { field: 'Deals closed (count)',     example: '1',        type: 'count' },
      { field: 'Deal sizes (MRR)',         example: '$1,200',   type: 'list' },
      { field: 'Stage moves in CRM',       example: 'auto',     type: 'auto', note: 'auto from HubSpot/Close' },
    ],
    feeds: ['Show-up rate (weekly)','Close rate (weekly)','New MRR closed (weekly)','Avg deal size (weekly)','CAC payback (monthly)'],
  },
  {
    dept: 'sales', role: 'Sales Development Rep', cadence: 'Daily · ~2 min', when: 'End of day',
    inputs: [
      { field: 'Demos booked today',       example: '6',        type: 'count' },
      { field: 'Source split (paid / organic / partner)', example: '3 / 2 / 1', type: 'split' },
      { field: 'Outbound activity',        example: 'auto',     type: 'auto', note: 'auto from sequencer' },
    ],
    feeds: ['Demos booked (weekly)','Cost per booked demo (weekly)','Lead → SQL conversion (weekly)'],
  },
  {
    dept: 'marketing', role: 'Marketing Manager', cadence: 'Daily · ~3 min', when: 'Morning, after ad platforms refresh',
    inputs: [
      { field: 'Ad spend (paid channels)',  example: 'auto',    type: 'auto', note: 'auto from Meta/Google Ads' },
      { field: 'Paid leads',                example: 'auto',    type: 'auto', note: 'auto from forms + UTM' },
      { field: 'Organic leads',             example: 'auto',    type: 'auto', note: 'auto from forms + UTM' },
      { field: 'Website visitors',          example: 'auto',    type: 'auto', note: 'auto from GA4' },
      { field: 'Opt-in rate',               example: 'auto',    type: 'auto', note: 'computed: opt-ins / visitors' },
      { field: 'Manual: campaign launches & content drops', example: '1 blog, 1 ad set', type: 'note' },
    ],
    feeds: ['Cost per lead (weekly)','Cost per booked demo (weekly)','CAC (weekly + quarterly)','Total ad spend (weekly)','Opt-in rate vs 20% target (weekly)'],
  },
  {
    dept: 'cs', role: 'CS Manager', cadence: 'Daily · ~4 min', when: 'End of day',
    inputs: [
      { field: 'Onboardings started today',         example: '2', type: 'count' },
      { field: 'Onboardings completed (with start date)', example: '1 (started 9 days ago)', type: 'date-pair' },
      { field: 'Implementations completed',         example: '3', type: 'count' },
      { field: 'Churn events (logo + MRR)',         example: '1 / $890', type: 'pair' },
      { field: 'Customer health score updates',     example: '4 customers reviewed', type: 'note' },
    ],
    feeds: ['On-time activation % (weekly + quarterly OKR)','Time-to-first-value (weekly)','Implementations completed (weekly)','Churn rate (monthly · ProfitWell-aligned)','NRR (annual)'],
  },
  {
    dept: 'cs', role: 'Support Lead', cadence: 'Daily · ~2 min · mostly automated', when: 'Auto, with end-of-day sanity check',
    inputs: [
      { field: 'Tickets opened',     example: 'auto', type: 'auto', note: 'auto from Intercom / Zendesk' },
      { field: 'Tickets resolved',   example: 'auto', type: 'auto', note: 'auto from Intercom / Zendesk' },
      { field: 'First-response time',example: 'auto', type: 'auto' },
      { field: 'Escalations to Eng', example: '2',    type: 'count' },
    ],
    feeds: ['Tickets resolved (weekly)','Bug-flag-rate to engineering (weekly)'],
  },
  {
    dept: 'product', role: 'Engineering Lead', cadence: 'Daily · ~0 min · fully automated', when: 'Auto-pulled at 11pm',
    inputs: [
      { field: 'PRs submitted',  example: 'auto', type: 'auto', note: 'auto from GitHub' },
      { field: 'PRs deployed',   example: 'auto', type: 'auto', note: 'auto from GitHub + CI' },
      { field: 'New bugs',       example: 'auto', type: 'auto', note: 'auto from log monitoring (Sentry)' },
      { field: 'Bugs resolved',  example: 'auto', type: 'auto', note: 'auto from issue tracker' },
    ],
    feeds: ['PRs deployed (weekly)','New bugs reported (weekly)','Engineering velocity (quarterly)'],
  },
  {
    dept: 'growth', role: 'Growth / Ops', cadence: 'Daily · ~0 min · fully automated', when: 'Auto, surfaced in dashboard',
    inputs: [
      { field: 'Trials started',          example: 'auto', type: 'auto', note: 'auto from Amplitude' },
      { field: 'Trial → paid conversions',example: 'auto', type: 'auto', note: 'auto from Stripe + Amplitude' },
      { field: 'Activation events',       example: 'auto', type: 'auto', note: 'auto from Amplitude (key events)' },
      { field: 'Active users',            example: 'auto', type: 'auto', note: 'auto from Amplitude' },
    ],
    feeds: ['Trials started (weekly · vs monthly target)','Trial → paid conversion (weekly)','User activation rate (weekly + quarterly)'],
  },
  {
    dept: 'growth', role: 'Channel Partnership Manager', cadence: 'Daily · ~3 min', when: 'End of day',
    inputs: [
      { field: 'Deal opportunities registered', example: '2',     type: 'count' },
      { field: 'Partner-driven calls',          example: '1',     type: 'count' },
      { field: 'Partnership pipeline value',    example: '$8.4K added', type: 'currency' },
    ],
    feeds: ['Channel pipeline (weekly)','Partner-attributed MRR (monthly)','Partnerships strategic-initiative metric (quarterly)'],
  },
];

function TrackingGuide() {
  const [expandedRole, setExpandedRole] = useState(null);

  return (
    <div className="space-y-12">
      {/* Intro */}
      <section
        className="glass fade-up relative overflow-hidden"
        style={{ padding: '40px' }}
      >
        <div
          className="absolute -top-20 -right-32 w-[460px] h-[460px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.16), transparent 70%)' }}
        />
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold mb-3 flex items-center gap-2" style={{ color: BRAND }}>
          <Timer className="w-3 h-3" /> The 5-Minute Promise
        </div>
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="font-display text-5xl lg:text-6xl leading-[0.95] tracking-tight" style={{ color: 'var(--text)' }}>
              Less data entry. <span className="font-display-i" style={{ color: BRAND }}>More signal.</span>
            </h1>
            <p className="mt-5 font-body text-[15px] leading-relaxed max-w-xl" style={{ color: 'var(--text-2)' }}>
              Every weekly, monthly, quarterly, and annual KPI on this scoreboard rolls up from a small set of daily inputs.
              The flow takes <span style={{ color: 'var(--text)', fontWeight: 600 }}>under 5 minutes a day</span> per person — most fields are automated;
              what remains is a tiny handful of numbers a human still needs to log.
            </p>
          </div>

          {/* Data flow diagram */}
          <div className="card-flat p-5">
            <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold mb-4" style={{ color: 'var(--text-3)' }}>How the data rolls up</div>
            <div className="space-y-3">
              {[
                { tier: 'Daily',     desc: 'Raw inputs: 1–4 fields per role',         color: '#B45309', icon: Clock },
                { tier: 'Weekly',    desc: 'Atlas Odyssey scoreboard by department',  color: '#1D4ED8', icon: Calendar },
                { tier: 'Monthly',   desc: 'Churn, NRR, cohort metrics (ProfitWell)', color: '#7C3AED', icon: BarChart3 },
                { tier: 'Quarterly', desc: 'OKR progress, strategic initiatives',     color: '#15803D', icon: Target },
                { tier: 'Annual',    desc: 'Martel goals — MRR, customers, margin',   color: BRAND,     icon: Sparkles },
              ].map((tier, i, arr) => {
                const Icon = tier.icon;
                return (
                  <div key={tier.tier}>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `${tier.color}14`, border: `1px solid ${tier.color}33` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[11px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: tier.color }}>{tier.tier}</div>
                        <div className="text-sm font-body" style={{ color: 'var(--text-2)' }}>{tier.desc}</div>
                      </div>
                    </div>
                    {i < arr.length - 1 && <div className="ml-4 h-3" style={{ borderLeft: '1px dashed var(--border)' }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Roles grid */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>By Role</div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>Who logs what, every day</h2>
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{ROLES.length} roles · click any to expand</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLES.map((r, idx) => {
            const D = DEPTS[r.dept];
            const Icon = D.icon;
            const isOpen = expandedRole === idx;
            const manualCount = r.inputs.filter((i) => i.type !== 'auto').length;
            return (
              <div
                key={r.role}
                className="card overflow-hidden fade-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <button
                  onClick={() => setExpandedRole(isOpen ? null : idx)}
                  className="w-full text-left p-5 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                         style={{ background: D.soft, border: `1px solid ${D.color}33` }}>
                      <Icon className="w-4 h-4" style={{ color: D.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: D.color }}>{D.name}</div>
                      <div className="font-display text-2xl mt-0.5" style={{ color: 'var(--text)' }}>{r.role}</div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] font-mono flex-wrap" style={{ color: 'var(--text-3)' }}>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.cadence}</span>
                        <span>·</span>
                        <span>{manualCount === 0 ? 'fully automated' : `${manualCount} manual field${manualCount > 1 ? 's' : ''}`}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 mt-2 transition-transform ${isOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--text-3)' }} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 grid md:grid-cols-2 gap-5 fade-up" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                        <FileSpreadsheet className="w-3 h-3" /> Daily inputs
                      </div>
                      <div className="space-y-2">
                        {r.inputs.map((inp) => (
                          <div
                            key={inp.field}
                            className="rounded-md px-3 py-2"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[13px] font-body" style={{ color: 'var(--text)' }}>{inp.field}</span>
                              <span
                                className="text-[10px] uppercase tracking-wider font-body font-semibold px-1.5 py-0.5 rounded"
                                style={{
                                  background: inp.type === 'auto' ? 'rgba(22,163,74,0.1)' : 'rgba(102,57,166,0.1)',
                                  color:      inp.type === 'auto' ? '#15803D'             : BRAND,
                                }}
                              >
                                {inp.type === 'auto' ? 'auto' : 'manual'}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] font-mono flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
                              <span>e.g. {inp.example}</span>
                              {inp.note && <span style={{ color: 'var(--text-4)' }}>· {inp.note}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>When: {r.when}</div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                        <ArrowRight className="w-3 h-3" /> Feeds into
                      </div>
                      <div className="space-y-1.5">
                        {r.feeds.map((f) => (
                          <div key={f} className="flex items-start gap-2 text-[13px] font-body" style={{ color: 'var(--text-2)' }}>
                            <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: D.color }} />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Tooling stack */}
      <section className="fade-up">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: 'var(--text-3)' }}>Sources of Truth</div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>Where each metric is pulled from</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { tool: 'ProfitWell',  metrics: ['Churn rate', 'NRR', 'MRR'], icon: DollarSign },
            { tool: 'Amplitude',   metrics: ['Trials started', 'Activation rate', 'User adoption', 'Trial → paid'], icon: Activity },
            { tool: 'GA4',         metrics: ['Website visitors', 'Opt-in rate'], icon: Globe },
            { tool: 'GitHub + Sentry', metrics: ['PRs deployed', 'New bugs'], icon: Code },
            { tool: 'HubSpot / CRM', metrics: ['Demos booked', 'Stage moves', 'Deal sizes'], icon: Briefcase },
            { tool: 'Stripe',      metrics: ['New MRR closed', 'Cash collected'], icon: DollarSign },
            { tool: 'Meta + Google Ads', metrics: ['Ad spend', 'CPC', 'Paid leads'], icon: Megaphone },
            { tool: 'Intercom / Zendesk', metrics: ['Tickets opened', 'Tickets resolved'], icon: Headphones },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.tool} className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4" style={{ color: BRAND }} />
                  <div className="font-body font-semibold text-sm" style={{ color: 'var(--text)' }}>{s.tool}</div>
                </div>
                <div className="space-y-1">
                  {s.metrics.map((m) => (
                    <div key={m} className="text-[12px] font-body" style={{ color: 'var(--text-2)' }}>— {m}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer principle */}
      <section className="card-flat p-6 lg:p-8 fade-up" style={{ background: 'linear-gradient(135deg, rgba(102,57,166,0.05), transparent 70%), var(--surface)' }}>
        <div className="flex items-start gap-4 max-w-3xl">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'rgba(102,57,166,0.1)', border: '1px solid rgba(102,57,166,0.25)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: BRAND }} />
          </div>
          <div>
            <div className="font-display text-2xl" style={{ color: 'var(--text)' }}>Less but more impactful KPIs.</div>
            <div className="font-body mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
              We deliberately don't track everything. Each metric on this scoreboard exists because it changes how we make decisions —
              if a number can't drive an action this week, it doesn't belong here. And nothing on this board should take a teammate
              more than five minutes a day to keep current.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ===================== QUICK LOG VIEW ===================== */

/* Numeric field with prefix/suffix support and clean focus state. */
function FieldInput({ label, value, onChange, prefix, suffix, hint, dirty }) {
  return (
    <div>
      <label className="text-[10.5px] uppercase tracking-[0.12em] font-body font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
        <span>{label}</span>
        {dirty && <span className="h-1 w-1 rounded-full" style={{ background: BRAND }} aria-label="unsaved" />}
      </label>
      <div className="mt-1.5 relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-mono pointer-events-none" style={{ color: 'var(--text-4)' }}>
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-full py-2.5 rounded-lg outline-none transition-all font-mono text-[15px]"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            paddingLeft: prefix ? '24px' : '12px',
            paddingRight: suffix ? '28px' : '12px',
            color: 'var(--text)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = BRAND;
            e.target.style.boxShadow = `0 0 0 3px rgba(102,57,166,0.12)`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border)';
            e.target.style.boxShadow = 'none';
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-mono pointer-events-none" style={{ color: 'var(--text-4)' }}>
            {suffix}
          </span>
        )}
      </div>
      {hint && <div className="text-[10.5px] mt-1 font-body" style={{ color: 'var(--text-4)' }}>{hint}</div>}
    </div>
  );
}

/* One role's log form card — local working state, save commits to global. */
function RoleLogCard({ role, dept, fields, currentValues, onSave }) {
  const D = DEPTS[dept];
  const Icon = D.icon;
  const [values, setValues] = useState(() =>
    fields.reduce((acc, f) => ({ ...acc, [f.key]: currentValues[f.key] ?? 0 }), {})
  );
  const [savedAt, setSavedAt] = useState(null);
  const [hideSavedTimer, setHideSavedTimer] = useState(null);

  const isDirty = fields.some((f) => values[f.key] !== currentValues[f.key]);

  const handleSave = () => {
    onSave(values);
    const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setSavedAt(ts);
    if (hideSavedTimer) clearTimeout(hideSavedTimer);
    setHideSavedTimer(setTimeout(() => setSavedAt(null), 4000));
  };

  return (
    <div className="card p-6 fade-up flex flex-col">
      <div className="flex items-start gap-3 mb-5">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: D.soft, border: `1px solid ${D.color}33` }}
        >
          <Icon className="w-4 h-4" style={{ color: D.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] font-body font-semibold" style={{ color: D.color }}>
            {D.name}
          </div>
          <div className="font-display text-2xl mt-0.5 leading-tight" style={{ color: 'var(--text)' }}>{role}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
        {fields.map((f) => (
          <FieldInput
            key={f.key}
            label={f.label}
            value={values[f.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            prefix={f.prefix}
            suffix={f.suffix}
            hint={f.hint}
            dirty={values[f.key] !== currentValues[f.key]}
          />
        ))}
      </div>

      <div className="mt-5 pt-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <div className="text-[11px] font-mono min-w-0 flex-1" style={{ color: 'var(--text-4)' }}>
          {savedAt ? (
            <span className="flex items-center gap-1.5" style={{ color: '#15803D' }}>
              <Check className="w-3 h-3" /> Saved at {savedAt}
            </span>
          ) : isDirty ? (
            <span style={{ color: BRAND }}>Unsaved changes</span>
          ) : (
            <span>All caught up</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty && !savedAt}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-body font-semibold text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isDirty ? D.color : 'rgba(26,15,46,0.06)',
            color: isDirty ? '#FFFFFF' : 'var(--text-3)',
            boxShadow: isDirty ? `0 1px 2px rgba(26,15,46,0.06), 0 6px 16px -6px ${D.color}66` : 'none',
          }}
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

/* Roles + their daily fields — drives the Quick Log layout. */
const ROLE_FORMS = [
  // === DAILY ENTRIES ===
  {
    role: 'Account Executive', dept: 'sales', cadence: 'daily',
    fields: [
      { key: 'callsHeldToday',       label: 'Demos held' },
      { key: 'noShowsToday',         label: 'No-shows' },
      { key: 'customersClosedToday', label: 'Deals closed' },
      { key: 'newMRRToday',          label: 'New MRR closed', prefix: '$' },
    ],
  },
  {
    role: 'Sales Development Rep', dept: 'sales', cadence: 'daily',
    fields: [
      { key: 'demosBookedToday',  label: 'Demos booked' },
      { key: 'callsBookedToday',  label: 'Calls booked', hint: 'all calendar invites incl. discovery' },
    ],
  },
  {
    role: 'Marketing Manager', dept: 'marketing', cadence: 'daily',
    fields: [
      { key: 'adSpendToday',         label: 'Ad spend',       prefix: '$' },
      { key: 'cpcToday',             label: 'Cost per click', prefix: '$' },
      { key: 'paidLeadsToday',       label: 'Paid leads' },
      { key: 'organicLeadsToday',    label: 'Organic leads' },
      { key: 'websiteVisitorsToday', label: 'Website visitors' },
    ],
  },
  {
    role: 'CS Manager', dept: 'cs', cadence: 'daily',
    fields: [
      { key: 'onTimeActivationsToday', label: 'On-time activations', hint: 'within 14d (30d ent)' },
      { key: 'lateActivationsToday',   label: 'Late activations',    hint: 'past the SLA' },
      { key: 'implementationsToday',   label: 'Implementations done' },
      { key: 'churnEventsToday',       label: 'Churn events' },
      { key: 'churnMRRToday',          label: 'Churn MRR', prefix: '$' },
    ],
  },
  {
    role: 'Support Lead', dept: 'cs', cadence: 'daily',
    fields: [
      { key: 'ticketsResolvedToday', label: 'Tickets resolved' },
    ],
  },
  {
    role: 'Engineering Lead', dept: 'product', cadence: 'daily',
    fields: [
      { key: 'prsDeployedToday', label: 'PRs deployed' },
      { key: 'newBugsToday',     label: 'New bugs reported' },
    ],
  },
  {
    role: 'Growth / Ops', dept: 'growth', cadence: 'daily',
    fields: [
      { key: 'trialsStartedToday',     label: 'Trials started' },
      { key: 'trialActivationsToday',  label: 'Trial activations' },
    ],
  },
  {
    role: 'Channel Partnership Manager', dept: 'growth', cadence: 'daily',
    fields: [
      { key: 'partnerOppsToday',         label: 'Opportunities registered' },
      { key: 'partnerCallsToday',        label: 'Partner calls' },
      { key: 'partnerPipelineAdded',     label: 'Pipeline value added', prefix: '$', hint: 'sum of new opportunity values' },
    ],
  },

  // === MONTHLY SNAPSHOTS — drive ARPU, CAC, margin, NRR calculations ===
  {
    role: 'Finance Operations', dept: 'exec', cadence: 'monthly', store: 'monthly',
    fields: [
      { key: 'totalMRR',         label: 'Total MRR',         prefix: '$', hint: 'auto from Stripe' },
      { key: 'totalCustomers',   label: 'Total customers',                hint: 'auto from Stripe' },
      { key: 'newCustomersMo',   label: 'New customers (this month)',     hint: 'sum of daily closes' },
      { key: 'startingMRRMo',    label: 'Starting MRR (1st of month)', prefix: '$', hint: 'auto from ProfitWell' },
      { key: 'expansionMRRMo',   label: 'Expansion MRR',     prefix: '$', hint: 'upsells this month' },
      { key: 'contractionMRRMo', label: 'Contraction MRR',   prefix: '$', hint: 'downgrades this month' },
      { key: 'churnedMRRMo',     label: 'Churned MRR',       prefix: '$', hint: 'this month, ProfitWell' },
    ],
  },
  {
    role: 'Operations Lead', dept: 'exec', cadence: 'monthly', store: 'monthly',
    fields: [
      { key: 'salesMarketingCostMo', label: 'S&M monthly cost',    prefix: '$', hint: 'salaries + ad spend + tools' },
      { key: 'csTeamCostMo',         label: 'CS team monthly cost', prefix: '$', hint: 'salaries + tools' },
      { key: 'infraCostMo',          label: 'Infrastructure cost',  prefix: '$', hint: 'cloud + dev tooling' },
    ],
  },
];

/* ===================== DRILL-DOWN PORTAL (the Cyclops lens) ===================== */
function DrillDownPortal() {
  const { drill, setDrill, today, setToday, monthly, setMonthly } = useContext(DataContext);

  // ESC-to-close — must be declared unconditionally before any early return
  useEffect(() => {
    if (!drill) return;
    const onKey = (e) => { if (e.key === 'Escape') setDrill(null); };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drill, setDrill]);

  if (!drill) return null;

  const role = ROLE_FORMS.find((r) => r.role === drill.roleName);
  if (!role) return null;

  const isMonthly = role.cadence === 'monthly';
  const currentValues = isMonthly ? monthly : today;
  const onSave = isMonthly
    ? (updates) => setMonthly((m) => ({ ...m, ...updates }))
    : (updates) => setToday((t)   => ({ ...t,   ...updates }));

  const close = () => setDrill(null);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Drill down: ${drill.metricLabel}`}
    >
      {/* Backdrop — semi-transparent purple-tinted, blurred, clickable to close */}
      <div
        className="absolute inset-0 magnifier-backdrop"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(102,57,166,0.22) 0%, rgba(15,8,37,0.55) 70%)',
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        }}
        onClick={close}
      />

      {/* The lens itself — the raised glass bubble */}
      <div
        className="relative max-w-xl w-full magnifier-lens"
        style={{ padding: '28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: drill metadata + close */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold" style={{ color: BRAND }}>
              <Sparkles className="w-3 h-3" /> Drill Down · {drill.metricLabel}
            </div>
            <div className="font-display text-[26px] leading-[1.1] tracking-tight mt-2" style={{ color: 'var(--text)' }}>
              The <span className="font-display-i" style={{ color: BRAND }}>source</span> of this number
            </div>
            <div className="text-[12.5px] mt-1.5 font-body leading-relaxed" style={{ color: 'var(--text-2)' }}>
              {drill.label}. Edit and save here — changes flow live to every dashboard.
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-lg p-2 transition outline-none focus-visible:ring-1"
            style={{
              background: 'rgba(26,15,46,0.06)',
              color: 'var(--text-2)',
              '--tw-ring-color': 'rgba(102,57,166,0.4)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(26,15,46,0.10)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(26,15,46,0.06)'; }}
            aria-label="Close drill-down"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The actual source card — fully live, editable */}
        <RoleLogCard
          role={role.role}
          dept={role.dept}
          fields={role.fields}
          currentValues={currentValues}
          onSave={onSave}
        />

        {/* Subtle footer hint */}
        <div className="mt-3.5 flex items-center justify-center gap-2 text-[10.5px] font-mono" style={{ color: 'var(--text-3)' }}>
          <span>esc</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>click outside to close</span>
        </div>
      </div>
    </div>
  );
}

function QuickLogView() {
  const { today, setToday, monthly, setMonthly } = useContext(DataContext);

  const updateToday   = (updates) => setToday((t)   => ({ ...t,   ...updates }));
  const updateMonthly = (updates) => setMonthly((m) => ({ ...m,   ...updates }));

  const dailyRoles   = ROLE_FORMS.filter((r) => r.cadence !== 'monthly');
  const monthlyRoles = ROLE_FORMS.filter((r) => r.cadence === 'monthly');

  const totalManualFields = ROLE_FORMS.reduce((sum, r) => sum + r.fields.length, 0);
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-10">
      {/* Hero intro */}
      <section
        className="glass fade-up relative overflow-hidden"
        style={{ padding: '40px' }}
      >
        <div
          className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(102,57,166,0.16), transparent 70%)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold mb-3" style={{ color: BRAND }}>
            <PencilLine className="w-3 h-3" /> Quick Log · {dateLabel}
          </div>
          <h1 className="font-display text-4xl lg:text-5xl leading-[1.05] tracking-tight" style={{ color: 'var(--text)' }}>
            Log today's numbers. <span className="font-display-i" style={{ color: BRAND }}>Live everywhere.</span>
          </h1>
          <p className="mt-4 font-body text-[15px] leading-relaxed max-w-3xl" style={{ color: 'var(--text-2)' }}>
            Each role enters the small handful of numbers they're responsible for. Saved entries flow immediately into the
            <span className="font-semibold" style={{ color: 'var(--text)' }}> Daily Pulse</span> view, and the monthly snapshots feed the calculated metrics on the
            <span className="font-semibold" style={{ color: 'var(--text)' }}> Executive</span> view (ARPU, CAC, gross margin, LTV:CAC, NRR).
          </p>
        </div>
      </section>

      {/* === DAILY ENTRIES === */}
      <div>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
              <Clock className="w-3 h-3" /> Daily entries
            </div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>End of day · what happened today</h2>
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{dailyRoles.length} roles</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {dailyRoles.map((r) => (
            <RoleLogCard
              key={r.role}
              role={r.role}
              dept={r.dept}
              fields={r.fields}
              currentValues={today}
              onSave={updateToday}
            />
          ))}
        </div>
      </div>

      {/* === MONTHLY SNAPSHOTS === */}
      <div>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-body font-semibold flex items-center gap-1.5" style={{ color: BRAND }}>
              <Calendar className="w-3 h-3" /> Monthly snapshots
            </div>
            <h2 className="font-display text-3xl mt-1" style={{ color: 'var(--text)' }}>The numbers that drive the calculations</h2>
            <p className="text-sm mt-1 max-w-2xl font-body" style={{ color: 'var(--text-2)' }}>
              These feed ARPU, CAC, gross margin, LTV:CAC, and NRR on the Executive view. Update on the 1st of the month.
            </p>
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{monthlyRoles.length} roles</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {monthlyRoles.map((r) => (
            <RoleLogCard
              key={r.role}
              role={r.role}
              dept={r.dept}
              fields={r.fields}
              currentValues={monthly}
              onSave={updateMonthly}
            />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <section className="card-flat p-5 lg:p-6 fade-up">
        <div className="flex items-start gap-3">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'rgba(102,57,166,0.1)', border: '1px solid rgba(102,57,166,0.25)' }}
          >
            <ArrowRight className="w-3.5 h-3.5" style={{ color: BRAND }} />
          </div>
          <div className="text-[13px] font-body leading-relaxed" style={{ color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Where the numbers come from.</span>{' '}
            Daily entries update the Daily Pulse view immediately. Monthly snapshots feed the calculated metrics on the
            Executive view: <span className="font-mono">ARPU = MRR ÷ Customers · CAC = S&M cost ÷ New customers · Gross Margin = (Revenue − COGS) ÷ Revenue ·
            NRR = (Starting MRR + Expansion − Churn − Contraction) ÷ Starting MRR</span>.
            Total of <span style={{ color: 'var(--text)', fontWeight: 600 }}>{totalManualFields} fields</span> across all roles.
          </div>
        </div>
      </section>
    </div>
  );
}

/* ===================== ROOT ===================== */
export default function InvestorView() {
  const [view, setView] = useState('executive');
  const [trends, setTrends] = useState(INITIAL_TRENDS);
  const [today, setToday] = useState(INITIAL_TODAY);
  const [monthly, setMonthly] = useState(INITIAL_MONTHLY);
  const [drill, setDrill] = useState(null);

  const ctx = useMemo(
    () => ({ trends, today, monthly, drill, setTrends, setToday, setMonthly, setDrill }),
    [trends, today, monthly, drill]
  );

  return (
    <DataContext.Provider value={ctx}>
      {/*
        Scoped wrapper — all CSS variables defined in FONT_STYLES under
        `.atlas-prototype-scope` instead of `:root`, so this prototype's
        --bg / --text / --brand don't override the parent app's globals.
      */}
      <div className="atlas-prototype-scope font-body" style={{ color: 'var(--text)' }}>
        <style>{FONT_STYLES}</style>

        {/* Inline tab nav — replaces the standalone Header.
            (No logo / sign-out — the parent Leadership view supplies those.) */}
        <ProtoTabs view={view} setView={setView} />

        <main className="relative max-w-[1400px] mx-auto px-2 sm:px-4 py-6 lg:py-10">
          {view === 'executive' && <ExecutiveView />}
          {view === 'weekly'    && <WeeklyView />}
          {view === 'daily'     && <DailyView />}
          {view === 'log'       && <QuickLogView />}
          {view === 'tracking'  && <TrackingGuide />}
        </main>

        {/* The Cyclops magnifier — opens whenever drill state is set */}
        <DrillDownPortal />
      </div>
    </DataContext.Provider>
  );
}

/* ===================== EMBEDDED TAB NAV ===================== */
/* A trimmed-down version of the prototype's standalone Header — no logo,
   no live indicator, no scorecard title (the Leadership chrome already
   supplies all of that). Just the five-tab navigation. */
function ProtoTabs({ view, setView }) {
  const tabs = [
    { id: 'executive', label: 'Executive',      sub: 'ANNUAL + QUARTERLY' },
    { id: 'weekly',    label: 'Atlas Odyssey',  sub: 'WEEKLY SCORECARD' },
    { id: 'daily',     label: 'Daily Pulse',    sub: 'TODAY' },
    { id: 'log',       label: 'Quick Log',      sub: "ENTER TODAY'S DATA" },
    { id: 'tracking',  label: 'Tracking Guide', sub: 'WHAT EACH ROLE LOGS' },
  ];
  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4 pt-6">
      <div className="flex items-end gap-8 overflow-x-auto scrollbar-hide pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="relative pb-3 text-left shrink-0 transition-colors"
              style={{ color: active ? 'var(--text)' : 'var(--text-3)' }}
            >
              <div className="font-body font-semibold text-[15px] leading-tight">{t.label}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: 'var(--text-4)' }}>
                {t.sub}
              </div>
              {active && (
                <div
                  className="absolute -bottom-px left-0 right-0 h-[2px] rounded-t"
                  style={{ background: BRAND, boxShadow: '0 0 12px rgba(102,57,166,0.5)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
