import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, X, ChevronDown, ChevronRight, LayoutDashboard, Columns3,
  Table2, Trash2, GripVertical, AlertTriangle, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LabelList, AreaChart, Area, Sector,
} from "recharts";

/* ────────────────────────────── theme & taxonomy ───────────────────────── */

const BRAND = "#6639a6";
const ACCENT = "#9a6cf0";

const AtlasLogo = ({ height = 28 }) => (
  <svg
    viewBox="0 0 3163 973"
    height={height}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Atlas"
    style={{ display: "block" }}
  >
    <g transform="scale(8.108108108108109) translate(10, 10)">
      <g transform="matrix(1.0554089709762533,0,0,1.0554089709762533,-2.770448548812665,-2.770448548812665)" fill={BRAND}>
        <path d="M16.5,16.5C-2,35-2,65,16.5,83.5C35,102,65,102,83.5,83.5C102,65,102,35,83.5,16.5C65-2,35-2,16.5,16.5z M75.9,75.9c-14.3,14.3-37.6,14.3-51.9,0c-14.3-14.3-14.3-37.6,0-51.9c14.3-14.3,37.6-14.3,51.9,0S90.3,61.6,75.9,75.9z M62.8,47.9c-5.2,9-10.4,17.9-15.5,26.9c0,0,0,0.1-0.1,0.1c-0.4,0.7-0.8,1.3-1.6,1c-0.9-0.3-0.7-1.1-0.6-1.8c0.4-2.3,0.8-4.5,1.3-6.8c0.7-4,1.5-7.9,2.2-11.9c0.1-0.3,0.1-0.7,0.1-1.2c-0.5,0-0.9-0.1-1.3-0.1c-2.9,0-5.9,0-8.8,0c-1.7,0-2.1-0.7-1.3-2.2c5.2-9,10.4-17.9,15.5-26.9c0,0,0-0.1,0.1-0.1c0.4-0.7,0.8-1.3,1.6-1c0.9,0.3,0.7,1.1,0.6,1.8c-0.4,2.3-0.8,4.5-1.3,6.8c-0.7,4-1.5,7.9-2.2,11.9c-0.1,0.3-0.1,0.7-0.1,1.2c0.5,0,0.9,0.1,1.3,0.1c2.9,0,5.9,0,8.8,0C63.2,45.7,63.6,46.4,62.8,47.9z" />
      </g>
      <g transform="matrix(2.7473278363300904,0,0,2.7473278363300904,117.99664623400278,11.81535514838069)" fill={BRAND}>
        <path d="M9.8354 7.711 l9.1766 12.19 l-2.9508 0 l-2.566 -3.3974 l-7.3197 0 l-2.5286 3.3974 l-2.9177 0 z M7.9362 14.1556 l3.7983 0 l-1.8992 -2.5322 z M17.4292 8.475 l15.938 0 l0 2.3477 l-6.7954 0 l0 9.0932 l-2.3476 0 l0 -9.0932 l-6.7946 0 l0 -2.3477 z M39.077000000000005 17.619 l13.59 0 l0 2.3477 l-15.938 0 l0 -11.407 l2.3477 0 l0 9.0597 z M64.1954 7.711 l9.1766 12.19 l-2.9508 0 l-2.566 -3.3974 l-7.3197 0 l-2.5286 3.3974 l-2.9177 0 z M62.2962 14.1556 l3.7983 0 l-1.8992 -2.5322 z M78.578 11.0046 c-0.21816 0.12059 -0.44118 0.32306 -0.44118 0.90966 c0 0.45724 0.14779 0.70718 0.52734 0.89108 c0.38386 0.18598 0.81196 0.19957 0.83354 0.2001 l8.5334 0.03336 c1.4828 0 3.6956 0.9158 3.6956 3.4388 s-2.0564 3.4388 -3.4388 3.4388 l-12.499 0 l0 -2.3477 l12.488 0 c0.1024 -0.0035352 0.40818 -0.04211 0.66022 -0.18152 c0.21828 -0.12072 0.44128 -0.32318 0.44128 -0.90964 c0 -0.45724 -0.14779 -0.70718 -0.52734 -0.89108 c-0.3827 -0.18547 -0.81038 -0.19947 -0.8343 -0.20012 l-8.5278 -0.03793 l0 0.0045703 c-1.4875 0 -3.7004 -0.9158 -3.7004 -3.4388 s2.0564 -3.4388 3.4388 -3.4388 l12.499 0 l0 2.3477 l-12.488 0 c-0.10229 0.0035352 -0.40834 0.04211 -0.6605 0.18152 z" />
      </g>
    </g>
  </svg>
);

const STAGES = [
  { id: "pre",        label: "Pre-Onboarding",           color: "#c7c9d1" },
  { id: "contact",    label: "In Contact",               color: "#7fd9f5" },
  { id: "kickoff",    label: "OB - Kickoff Scheduled",   color: "#f6dd5e" },
  { id: "obprog",     label: "OB - In Progress",         color: "#6ee7c8" },
  { id: "backlog",    label: "Backlog - Implementation", color: "#8fd0fb" },
  { id: "imp",        label: "Implementation",           color: "#9db4fd" },
  { id: "review",     label: "IMP - Review",             color: "#f7a8cd" },
  { id: "launch",     label: "Launch",                   color: "#d9a8f7" },
  { id: "postlaunch", label: "Post-Launch",              color: "#c8ee7f" },
  { id: "ongoing",    label: "Ongoing Support",          color: "#8ce8a8" },
  { id: "hold",       label: "Hold",                     color: "#fbbb74" },
  { id: "cancelled",  label: "Cancelled",                color: "#fb9d92" },
];
const stageById = (id) => STAGES.find((s) => s.id === id);

const PEOPLE = {
  "Noah Malcolm":    "#8fb7fd",
  "Mark Patterson":  "#f6c268",
  "Haley Folsom":    "#f2a2e0",
  "Andrew Park":     "#7ce3a1",
  "Ahmed Khan":      "#f9b163",
  "Ahmed Shawar":    "#8fd8f7",
};
/* CSM / FDE roster — Haley Folsom and Andrew Park are Forward Deployed Engineers */
const CSMS = ["Noah Malcolm", "Mark Patterson", "Haley Folsom", "Andrew Park"];
const IMPS = ["Ahmed Khan", "Ahmed Shawar"];

const STATUSES = {
  ontrack:  { label: "On track",           dot: "#2eaf66" },
  atrisk:   { label: "At risk",            dot: "#e0a411" },
  offtrack: { label: "Off track",          dot: "#e5544b" },
  none:     { label: "No recent updates",  dot: "#6b6b78" },
};

const PRIORITY_COLORS = { Low: "#9fd0f7", Medium: "#f9b163", High: "#f2695c" };
const SUB_COLORS = { Starter: "#f9b163", "White Label": "#c9a8f7", Pro: "#8fd8f7" };
const TSHIRT_COLORS = { Small: "#c7c9d1", Medium: "#a7e8a1", Large: "#9db4fd" };
const TEMP_COLORS = { Happy: "#a7e8a1", Neutral: "#f6dd5e", Frustrated: "#fb9d92" };

/* Fields auto-stamped when a client enters a stage */
const STAGE_STAMP = {
  kickoff: "obKsStart",
  obprog: "obIpStart",
  imp: "impStart",
  review: "impReviewStart",
  postlaunch: "postLaunchStart",
  ongoing: "ongoingStart",
  hold: "holdStart",
};

/* ────────────────────────────── date helpers ───────────────────────────── */

const todayISO = () => new Date().toISOString().slice(0, 10);
const D = (s) => (s ? new Date(s + "T00:00:00") : null);
const diffDays = (a, b) => {
  const da = D(a), db = D(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
};
const fmtDate = (s) => {
  const d = D(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
};
const fmtDur = (v, dec = 0) => {
  if (v == null || Number.isNaN(v)) return "—";
  const neg = v < 0;
  const a = Math.abs(v);
  if (a >= 7) {
    const w = Math.floor(a / 7);
    const r = Math.round(a % 7);
    return `${neg ? "-" : ""}${w}wk${r ? `, ${r}d` : ""}`;
  }
  return `${neg ? "-" : ""}${dec ? a.toFixed(dec) : Math.round(a)}d`;
};
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const clientMetrics = (c) => {
  const d = c.dates;
  return {
    timeTillKO:       diffDays(d.payment, d.kickoff),
    koVsSched:        diffDays(d.koScheduling, d.kickoff),
    koOverdue:        diffDays(d.koDue, d.kickoff),
    timeToLaunch:     diffDays(d.kickoff, d.launch),
    impTimeline:      diffDays(d.impStart, d.launch),
    impReviewOverdue: diffDays(d.impReviewDue, d.impReviewStart),
    launchOverdue:    diffDays(d.launchDue, d.launch),
    holdDuration:     d.holdStart ? diffDays(d.holdStart, d.holdEnd || todayISO()) : null,
  };
};

/* ────────────────────────────── seed data ──────────────────────────────── */

let _uid = 1;
const mk = (name, stage, csm, o = {}) => ({
  id: _uid++,
  name,
  stage,
  csm,
  atlasUsername: o.u || "",
  pocEmail: o.e || "",
  status: o.st || "none",
  statusDate: o.sd || null,
  taskProgress: o.p ?? 0,
  imp: o.imp || "",
  csa: o.csa || "",
  priority: o.pr || "Medium",
  subscription: o.sub || "Starter",
  tShirt: o.ts || "Medium",
  temperament: o.tm || "Neutral",
  touchpoints: o.tp ?? 0,
  revisionCount: o.rc ?? 0,
  obCompletionTime: o.ob ?? null,
  impEscalation: o.esc || false,
  notes: o.n || "",
  dates: {
    payment: null, koScheduling: null, koDue: null, kickoff: null,
    csmMeeting2: null, impBacklog: null, obKsStart: null, obIpStart: null,
    impStart: null, impReviewStart: null, impReviewDue: null,
    launchDue: null, launch: null, postLaunchStart: null, ongoingStart: null,
    supportCall: null, cancellation: null, holdStart: null, holdEnd: null,
    ...(o.d || {}),
  },
  wl: {
    appUrl: "", adminUrl: "", password: "", company: "", website: "",
    brandColors: "", dnsApp: "", dnsAdmin: "", twilioSid: "", twilioToken: "",
    emailAdmin: "", emailSupport: "", emailApp: "",
    ...(o.wl || {}),
  },
});

const SEED = [
  /* Pre-Onboarding */
  mk("Mark Amarant", "pre", "Noah Malcolm", { u: "buyer@aamintcards.com", e: "buyer@aamintcards.com", st: "ontrack", sd: "2026-07-12", d: { payment: "2026-07-02", koDue: "2026-07-16" } }),
  mk("Josh", "pre", "Noah Malcolm", { u: "josh@risen-ai.com", e: "josh@risen-ai.com", st: "ontrack", sd: "2026-07-12", sub: "White Label", d: { payment: "2026-07-04", koDue: "2026-07-18" } }),
  mk("TLD (The Leads Warehouse)", "pre", "Noah Malcolm", { u: "jim@tlw.media", e: "jim@tlw.media", st: "ontrack", sd: "2026-07-13", d: { payment: "2026-07-06", koDue: "2026-07-20" } }),
  mk("WittCPA Inc.", "pre", "Noah Malcolm", { u: "theresa@wittcpa.ca", e: "theresa@wittcpa.ca", st: "ontrack", sd: "2026-07-13", d: { payment: "2026-07-08", koDue: "2026-07-22" } }),

  /* In Contact */
  mk("Paul Downer", "contact", "Haley Folsom", { tp: 2 }),
  mk("Lucky Rabbit LLC", "contact", "Haley Folsom", { e: "shaun@luckyrabbit.tech", tp: 3 }),
  mk("Brandon Schwab", "contact", "Andrew Park", { u: "brandon@shepherdpremier.com", e: "brandon@shepherdpremier.com", tp: 1 }),

  /* OB - Kickoff Scheduled */
  mk("Husek Brothers Fencing", "kickoff", "Andrew Park", { u: "chris@husekfence.com", e: "kylie@husekfence.com", st: "ontrack", sd: "2026-07-09", tp: 4, d: { payment: "2026-06-30", koScheduling: "2026-07-02", koDue: "2026-07-16", obKsStart: "2026-07-02" } }),
  mk("Amicus Settlement Planners", "kickoff", "Haley Folsom", { u: "daniel@amicusplanners.com", e: "daniel@amicusplanners.com", st: "ontrack", sd: "2026-07-10", tp: 3, d: { payment: "2026-07-01", koScheduling: "2026-07-03", koDue: "2026-07-17", obKsStart: "2026-07-03" } }),
  mk("Prestige Auto Sales", "kickoff", "Haley Folsom", { u: "chrisspears352@gmail.com", e: "chrisspears352@gmail.com", st: "ontrack", sd: "2026-07-11", tp: 3, d: { payment: "2026-07-03", koScheduling: "2026-07-06", koDue: "2026-07-20", obKsStart: "2026-07-06" } }),

  /* OB - In Progress */
  mk("Pacific Pavers", "obprog", "Haley Folsom", { u: "jeff@pacificpavers.com", e: "jeff@pacificpavers.com", tp: 6, d: { payment: "2026-06-18", koScheduling: "2026-06-20", koDue: "2026-07-02", kickoff: "2026-06-30", obKsStart: "2026-06-20", obIpStart: "2026-06-30" } }),
  mk("StretchLab", "obprog", "Mark Patterson", { u: "taylor.ethans@stretchlab.com", e: "taylor.ethans@stretchlab.com", tp: 5, d: { payment: "2026-06-20", koScheduling: "2026-06-22", koDue: "2026-07-04", kickoff: "2026-07-02", obKsStart: "2026-06-22", obIpStart: "2026-07-02" } }),
  mk("JOY-PER'S SHOES", "obprog", "Noah Malcolm", { u: "jonparola@gmail.com", e: "jonathon@joypers.com", tp: 5, d: { payment: "2026-06-22", koScheduling: "2026-06-24", koDue: "2026-07-06", kickoff: "2026-07-06", obKsStart: "2026-06-24", obIpStart: "2026-07-06" } }),
  mk("The Ad Agency Inc.", "obprog", "Haley Folsom", { e: "nicole@theadpros.com", st: "ontrack", sd: "2026-07-10", tp: 7, d: { payment: "2026-06-24", koScheduling: "2026-06-26", koDue: "2026-07-08", kickoff: "2026-07-07", obKsStart: "2026-06-26", obIpStart: "2026-07-07" } }),

  /* Backlog - Implementation */
  mk("Kevin Mills", "backlog", "Haley Folsom", { e: "kevin@themillsgroup.com", tp: 8, d: { payment: "2026-06-12", koScheduling: "2026-06-15", koDue: "2026-06-26", kickoff: "2026-06-25", impBacklog: "2026-07-01" } }),
  mk("Rolling Adz", "backlog", "Andrew Park", { u: "jeff@rollingadz.com", e: "jeff@rollingadz.com", tp: 7, d: { payment: "2026-06-15", koScheduling: "2026-06-17", koDue: "2026-06-29", kickoff: "2026-06-30", impBacklog: "2026-07-06" } }),

  /* Implementation */
  mk("Luke Parker", "imp", "Haley Folsom", { u: "dr.007@me.com", imp: "Ahmed Khan", tp: 11, d: { payment: "2026-06-01", koScheduling: "2026-06-03", koDue: "2026-06-15", kickoff: "2026-06-12", impStart: "2026-06-19", impReviewDue: "2026-07-10", launchDue: "2026-07-31" } }),
  mk("Brett King", "imp", "Andrew Park", { u: "b.king@gatewaylandsurveying.com", e: "b.king@gatewaylandsurveying.com", tp: 9, d: { payment: "2026-06-03", koScheduling: "2026-06-05", koDue: "2026-06-17", kickoff: "2026-06-16", impStart: "2026-06-23", impReviewDue: "2026-07-14", launchDue: "2026-08-04" } }),
  mk("Brad", "imp", "Noah Malcolm", { u: "bdavis38572@gmail.com", e: "bdavis38572@gmail.com", imp: "Ahmed Khan", st: "ontrack", sd: "2026-07-12", tp: 12, d: { payment: "2026-06-08", koScheduling: "2026-06-10", koDue: "2026-06-22", kickoff: "2026-06-19", impStart: "2026-06-26", impReviewDue: "2026-07-17", launchDue: "2026-08-07" } }),
  mk("Harry Elmes", "imp", "Noah Malcolm", { u: "kamaljit@premier-ssl.com", e: "lewis.sinclair@premier-ssl.com", imp: "Ahmed Khan", st: "ontrack", sd: "2026-07-13", tp: 10, d: { payment: "2026-06-10", koScheduling: "2026-06-12", koDue: "2026-06-24", kickoff: "2026-06-23", impStart: "2026-06-30", impReviewDue: "2026-07-21", launchDue: "2026-08-11" } }),

  /* IMP - Review */
  mk("Kuldip Bhandal", "review", "Mark Patterson", { u: "admin@procostsoftware.com", imp: "Ahmed Khan", p: 18, esc: true, tp: 16, rc: 2, d: { payment: "2026-05-18", koScheduling: "2026-05-20", koDue: "2026-06-01", kickoff: "2026-05-29", impStart: "2026-06-05", impReviewStart: "2026-07-06", impReviewDue: "2026-06-26", launchDue: "2026-07-17" } }),
  mk("Eric Kwon", "review", "Mark Patterson", { u: "erin.cline@kellylawteam.com", imp: "Ahmed Khan", p: 18, tp: 14, rc: 1, d: { payment: "2026-05-20", koScheduling: "2026-05-22", koDue: "2026-06-03", kickoff: "2026-06-02", impStart: "2026-06-09", impReviewStart: "2026-07-08", impReviewDue: "2026-07-01", launchDue: "2026-07-21" } }),
  mk("Talai Law Offices", "review", "Andrew Park", { u: "ali@talailaw.com", e: "ali@talailaw.com", imp: "Ahmed Khan", tp: 15, rc: 1, d: { payment: "2026-05-11", koScheduling: "2026-05-13", koDue: "2026-05-25", kickoff: "2026-05-22", impStart: "2026-05-29", impReviewStart: "2026-06-29", impReviewDue: "2026-06-19", launchDue: "2026-07-10" } }),
  mk("Alaska Wild Lights", "review", "Noah Malcolm", { u: "josh@alaskawildlights.com", e: "info@alaskawildlights.com", imp: "Ahmed Khan", tp: 13, d: { payment: "2026-05-06", koScheduling: "2026-05-08", koDue: "2026-05-20", kickoff: "2026-05-19", impStart: "2026-05-26", impReviewStart: "2026-06-24", impReviewDue: "2026-06-16", launchDue: "2026-07-07" } }),
  mk("Peter", "review", "Noah Malcolm", { u: "pdimmick@maslabor.com", e: "pdimmick@maslabor.com", imp: "Ahmed Shawar", tp: 12, d: { payment: "2026-05-25", koScheduling: "2026-05-27", koDue: "2026-06-08", kickoff: "2026-06-05", impStart: "2026-06-12", impReviewStart: "2026-07-10", impReviewDue: "2026-07-03", launchDue: "2026-07-24" } }),

  /* Launch */
  mk("Lyon Landscaping", "launch", "Mark Patterson", { u: "accounting@lyonslandscaping.com", e: "hannah@lyonlandscaping.com", tp: 32, ob: 15, d: { payment: "2026-04-06", koScheduling: "2026-04-08", koDue: "2026-04-20", kickoff: "2026-04-17", csmMeeting2: "2026-05-06", impStart: "2026-04-24", impReviewStart: "2026-05-19", impReviewDue: "2026-05-15", launchDue: "2026-05-29", launch: "2026-06-12" } }),
  mk("Elizabeth Renee Batchelor", "launch", "Haley Folsom", { e: "elizabeth@businesstaxconsultants.com", tp: 28, d: { payment: "2026-04-14", koScheduling: "2026-04-16", koDue: "2026-04-28", kickoff: "2026-04-27", csmMeeting2: "2026-05-15", impStart: "2026-05-04", impReviewStart: "2026-06-01", impReviewDue: "2026-05-25", launchDue: "2026-06-08", launch: "2026-06-24" } }),
  mk("Jack Pires", "launch", "Haley Folsom", { u: "jack@socialjackmedia.com", imp: "Ahmed Khan", p: 45, tp: 30, rc: 2, d: { payment: "2026-04-20", koScheduling: "2026-04-22", koDue: "2026-05-04", kickoff: "2026-05-01", impStart: "2026-05-08", impReviewStart: "2026-06-08", impReviewDue: "2026-05-29", launchDue: "2026-06-12", launch: "2026-06-18" } }),
  mk("Scott Waddell", "launch", "Haley Folsom", { u: "swaddelldc@gmail.com", imp: "Ahmed Khan", p: 45, esc: true, tp: 44, rc: 3, sub: "White Label", wl: { company: "Waddell Digital", website: "waddelldigital.com", brandColors: "#0e3a5f, #f2b23e", appUrl: "app.waddelldigital.com" }, d: { payment: "2026-04-02", koScheduling: "2026-04-04", koDue: "2026-04-16", kickoff: "2026-04-15", csmMeeting2: "2026-05-04", impStart: "2026-04-22", impReviewStart: "2026-05-27", impReviewDue: "2026-05-13", launchDue: "2026-05-27", launch: "2026-07-01", holdStart: "2026-05-13", holdEnd: "2026-06-17" } }),
  mk("Willis College", "launch", "Haley Folsom", { u: "robpenner@redirections.ca", e: "jordan@summit2.ca", imp: "Ahmed Khan", tp: 24, sub: "White Label", wl: { company: "Willis College", website: "williscollege.com", brandColors: "#8a1f2d, #d8b458" }, d: { payment: "2026-05-05", koScheduling: "2026-05-07", koDue: "2026-05-19", kickoff: "2026-05-21", impStart: "2026-05-28", impReviewStart: "2026-06-25", impReviewDue: "2026-06-18", launchDue: "2026-07-02" } }),
  mk("Dealer Geek Ai", "launch", "Andrew Park", { u: "getzyenterprises@gmail.com", e: "info@dealergeekai.com", tp: 27, d: { payment: "2026-04-28", koScheduling: "2026-04-30", koDue: "2026-05-12", kickoff: "2026-05-11", impStart: "2026-05-18", impReviewStart: "2026-06-15", impReviewDue: "2026-06-08", launchDue: "2026-06-22", launch: "2026-07-08" } }),
  mk("Eric Lin", "launch", "Noah Malcolm", { u: "admin@calltoleap.com", e: "admin@calltoleap.com", imp: "Ahmed Khan", st: "ontrack", sd: "2026-07-10", tp: 41, ob: 16, rc: 1, d: { payment: "2026-04-01", koScheduling: "2026-04-03", koDue: "2026-04-15", kickoff: "2026-04-10", csmMeeting2: "2026-05-01", impStart: "2026-04-17", impReviewStart: "2026-05-12", impReviewDue: "2026-05-08", launchDue: "2026-05-22", launch: "2026-06-05" } }),

  /* Post-Launch */
  mk("Marketing@fpg.com", "postlaunch", "Noah Malcolm", { u: "marketing@fpg.com", e: "melba.otero@fpg.com", imp: "Ahmed Khan", st: "ontrack", sd: "2026-07-06", tp: 38, ob: 14, d: { payment: "2026-03-09", koScheduling: "2026-03-11", koDue: "2026-03-23", kickoff: "2026-03-20", csmMeeting2: "2026-04-08", impStart: "2026-03-27", impReviewStart: "2026-04-20", impReviewDue: "2026-04-17", launchDue: "2026-05-01", launch: "2026-05-08", postLaunchStart: "2026-05-08", supportCall: "2026-07-02" } }),
  mk("TelcoWorks", "postlaunch", "Haley Folsom", { u: "val@telcoworks.com", e: "val@telcoworks.com", st: "ontrack", sd: "2026-07-08", tp: 35, ob: 15, d: { payment: "2026-03-16", koScheduling: "2026-03-18", koDue: "2026-03-30", kickoff: "2026-03-27", csmMeeting2: "2026-04-15", impStart: "2026-04-03", impReviewStart: "2026-04-29", impReviewDue: "2026-04-24", launchDue: "2026-05-08", launch: "2026-05-15", postLaunchStart: "2026-05-15", supportCall: "2026-06-28" } }),

  /* Ongoing Support */
  mk("Gayani Edmond", "ongoing", "Noah Malcolm", { u: "gedmond@expediagroup.com", e: "gedmond@expediagroup.com", imp: "Ahmed Khan", st: "ontrack", sd: "2026-07-09", tp: 52, ob: 13, tm: "Happy", d: { payment: "2026-01-12", koScheduling: "2026-01-14", koDue: "2026-01-26", kickoff: "2026-01-23", csmMeeting2: "2026-02-11", impStart: "2026-01-30", impReviewStart: "2026-02-24", impReviewDue: "2026-02-20", launchDue: "2026-03-06", launch: "2026-03-13", postLaunchStart: "2026-03-13", ongoingStart: "2026-05-01", supportCall: "2026-07-09" } }),
  mk("Peter Montes De Oca", "ongoing", "Noah Malcolm", { u: "peter@kleenhome.com", e: "peter@kleenhome.com", imp: "Ahmed Shawar", st: "ontrack", sd: "2026-07-11", tp: 47, ob: 17, tm: "Happy", d: { payment: "2026-02-02", koScheduling: "2026-02-04", koDue: "2026-02-16", kickoff: "2026-02-13", csmMeeting2: "2026-03-04", impStart: "2026-02-20", impReviewStart: "2026-03-16", impReviewDue: "2026-03-12", launchDue: "2026-03-27", launch: "2026-04-03", postLaunchStart: "2026-04-03", ongoingStart: "2026-05-20", supportCall: "2026-07-11" } }),

  /* Hold */
  mk("Kelowna Medical Aesthetics", "hold", "Haley Folsom", { u: "suzettesandrin@gmail.com", e: "suzettesandrin@gmail.com", imp: "Ahmed Khan", tp: 18, tm: "Frustrated", d: { payment: "2026-04-18", koScheduling: "2026-04-20", koDue: "2026-05-02", kickoff: "2026-04-30", impStart: "2026-05-07", holdStart: "2026-05-20" } }),
  mk("Kent Galley", "hold", "Haley Folsom", { u: "kent@bdollarsmart.com", e: "kent@bdollarsmart.com", tp: 9, d: { payment: "2026-05-01", koScheduling: "2026-05-03", koDue: "2026-05-15", kickoff: "2026-05-14", holdStart: "2026-06-01" } }),

  /* Cancelled */
  mk("Generic Meds LLC", "cancelled", "Noah Malcolm", { u: "john@genericmedicine.com", e: "admin@genericmedicine.com", imp: "Ahmed Khan", tp: 11, d: { payment: "2026-05-02", koScheduling: "2026-05-04", koDue: "2026-05-16", kickoff: "2026-05-15", cancellation: "2026-06-30" } }),
  mk("Dalton Insurance", "cancelled", "", { u: "tdalton508@gmail.com", e: "tyler@daltoninsurance.biz", tp: 6, d: { payment: "2026-04-10", cancellation: "2026-05-22" } }),
];

/* ────────────────────────────── UI atoms ───────────────────────────────── */

const Chip = ({ color, children, title }) => (
  <span
    title={title}
    className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs font-medium"
    style={{ background: color, color: "#1b1c22" }}
  >
    {children}
  </span>
);

const PersonChip = ({ name }) =>
  name ? <Chip color={PEOPLE[name] || "#c7c9d1"}>{name}</Chip> : <span className="text-zinc-400">—</span>;

const StageChip = ({ stageId }) => {
  const s = stageById(stageId);
  return s ? <Chip color={s.color}>{s.label}</Chip> : null;
};

const StatusPill = ({ c }) => {
  const s = STATUSES[c.status] || STATUSES.none;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-600">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} />
      <span>{s.label}</span>
      {c.statusDate && <span className="text-zinc-500">{fmtDate(c.statusDate)}</span>}
    </span>
  );
};

const ProgressBar = ({ v }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${v}%`, background: v > 0 ? ACCENT : "transparent" }}
      />
    </div>
    <span className="w-8 text-xs text-zinc-500">{v}%</span>
  </div>
);

const Field = ({ label, children, full }) => (
  <label className={(full ? "col-span-2 " : "") + "flex min-w-0 flex-col gap-1"}>
    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
    {children}
  </label>
);

const TextInput = (props) => <input type="text" className="ainput" {...props} />;
const DateInput = (props) => (
  <input type="date" className="ainput" {...props} />
);
const SelectInput = ({ options, blank, ...rest }) => (
  <select className="ainput" {...rest}>
    {blank && <option value="">—</option>}
    {options.map((o) => (
      <option key={o} value={o}>{o}</option>
    ))}
  </select>
);

const SectionTitle = ({ children }) => (
  <div className="mt-6 mb-2 flex items-center gap-2">
    <span className="h-1 w-1 rounded-full" style={{ background: ACCENT }} />
    <span className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </span>
    <span className="h-px flex-1 bg-zinc-100" />
  </div>
);

const ChartTip = ({ active, payload }) =>
  active && payload && payload.length ? (
    <div className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-xl">
      {payload[0].payload.full || payload[0].name}: <b>{payload[0].value}</b>
    </div>
  ) : null;

/* ────────────────────────────── Dashboard (Visual DB) ───────────────────── */

const useReducedMotion = () => {
  const [pref, setPref] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPref(mq.matches);
    const fn = (e) => setPref(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else mq.addListener(fn);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", fn);
      else mq.removeListener(fn);
    };
  }, []);
  return pref;
};

/* Eased count-up for KPI numbers; re-runs whenever the target changes (e.g. filters) */
const useCountUp = (target, { duration = 900, delay = 0, disabled = false } = {}) => {
  const [val, setVal] = useState(disabled ? target : 0);
  useEffect(() => {
    if (disabled || target == null) {
      setVal(target);
      return;
    }
    let raf;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      if (now < t0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, disabled, duration, delay]);
  return val;
};

const DeltaChip = ({ delta, lowerIsBetter, unit }) => {
  if (delta == null) return null;
  const flat = Math.abs(delta) < 0.05;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const color = flat ? "#8f8f9c" : improved ? "#1f9d5b" : "#d6453a";
  const bg = flat ? "#f1f1f4" : improved ? "#e9f7ef" : "#fdeeec";
  const Icon = flat ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const label = unit === "d" ? `${Math.abs(delta).toFixed(1)}d` : String(Math.round(Math.abs(delta)));
  return (
    <span
      title="Change vs prior month"
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: bg }}
    >
      <Icon size={11} />
      {label}
    </span>
  );
};

const Spark = ({ data, id, animate }) => (
  <div className="mt-2 h-9">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={ACCENT}
          strokeWidth={1.6}
          fill={`url(#${id})`}
          connectNulls
          dot={false}
          isAnimationActive={animate}
          animationDuration={1100}
          animationEasing="ease-out"
          animationBegin={250}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const KpiCard = ({ label, raw, fmt, sub, spark, delta, lowerIsBetter, unit, i, animate }) => {
  const shown = useCountUp(raw, { delay: 120 + i * 40, disabled: !animate });
  const hasSpark = spark && spark.filter((p) => p.v != null).length >= 2;
  return (
    <div
      className="fade-up rounded-xl border border-zinc-200 bg-white shadow-sm p-4 transition-colors hover:border-zinc-300"
      style={{ animationDelay: `${i * 35}ms` }}
    >
      <div className="min-h-8 text-[11px] font-medium uppercase leading-snug tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="font-display text-3xl font-semibold text-zinc-900">
          {raw == null ? "—" : fmt(shown)}
        </div>
        <DeltaChip delta={delta} lowerIsBetter={lowerIsBetter} unit={unit} />
      </div>
      {hasSpark ? <Spark data={spark} id={`spark-${i}`} animate={animate} /> : <div className="mt-2 h-9" />}
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
};

/* Hovered donut segment lifts out with a soft halo ring */
const ActiveSlice = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 5} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 8} outerRadius={outerRadius + 11} startAngle={startAngle} endAngle={endAngle} fill={fill} fillOpacity={0.25} />
    </g>
  );
};

function DashboardView({ list }) {
  const reduced = useReducedMotion();
  const animate = !reduced;
  const [hoverBar, setHoverBar] = useState(null);
  const [activeSlice, setActiveSlice] = useState(null);

  const m = list.map((c) => ({ c, ...clientMetrics(c) }));
  const pick = (k) => m.map((x) => x[k]).filter((v) => v != null);

  /* Last-6-months buckets that power the KPI sparklines */
  const monthKeys = useMemo(() => {
    const keys = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      keys.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }, []);
  const mo = (s) => (s ? s.slice(0, 7) : null);
  const series = (pairs) =>
    monthKeys.map((k) => {
      const vs = pairs.filter((p) => p.m === k).map((p) => p.v);
      return { m: k, v: vs.length ? avg(vs) : null };
    });
  const byMonth = (anchorKey, metricKey) =>
    series(
      m
        .filter((x) => x[metricKey] != null && x.c.dates[anchorKey])
        .map((x) => ({ m: mo(x.c.dates[anchorKey]), v: x[metricKey] }))
    );
  const lastDelta = (sp) => {
    const pts = sp.filter((p) => p.v != null);
    return pts.length >= 2 ? pts[pts.length - 1].v - pts[pts.length - 2].v : null;
  };

  const tillKO = pick("timeTillKO");
  const koSched = pick("koVsSched");
  const koOD = pick("koOverdue");
  const toLaunch = pick("timeToLaunch");
  const impTL = pick("impTimeline");
  const revOD = pick("impReviewOverdue");
  const launchOD = pick("launchOverdue");
  const holdDur = pick("holdDuration");
  const tps = list.map((c) => c.touchpoints).filter((v) => v != null);
  const obs = list.map((c) => c.obCompletionTime).filter((v) => v != null);

  const sparkPipeline = monthKeys.map((k) => ({
    m: k,
    v: list.filter((c) => mo(c.dates.payment) === k).length,
  }));
  const sparkTillKO = byMonth("kickoff", "timeTillKO");
  const sparkKoSched = byMonth("kickoff", "koVsSched");
  const sparkKoOD = byMonth("kickoff", "koOverdue");
  const sparkLaunch = byMonth("launch", "timeToLaunch");
  const sparkImpTL = byMonth("launch", "impTimeline");
  const sparkRevOD = byMonth("impReviewStart", "impReviewOverdue");
  const sparkLnchOD = byMonth("launch", "launchOverdue");
  const sparkHold = byMonth("holdStart", "holdDuration");
  const sparkTP = series(
    list.filter((c) => c.dates.payment).map((c) => ({ m: mo(c.dates.payment), v: c.touchpoints }))
  );
  const sparkOB = series(
    list
      .filter((c) => c.obCompletionTime != null && c.dates.launch)
      .map((c) => ({ m: mo(c.dates.launch), v: c.obCompletionTime }))
  );

  const kpis = [
    { label: "Current Clients in Pipeline", raw: list.length, fmt: (v) => String(Math.round(v)), unit: "n", sub: "All stages · trend = new clients/mo", spark: sparkPipeline, delta: lastDelta(sparkPipeline), lowerIsBetter: false },
    { label: "Average Time till KO Call", raw: avg(tillKO), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `Payment → Kickoff · n=${tillKO.length}`, spark: sparkTillKO, delta: lastDelta(sparkTillKO), lowerIsBetter: true },
    { label: "KO Call vs KO Scheduling Date", raw: avg(koSched), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `Scheduled → Kickoff · n=${koSched.length}`, spark: sparkKoSched, delta: lastDelta(sparkKoSched), lowerIsBetter: true },
    { label: "Average Kickoff Call Overdue", raw: avg(koOD), fmt: (v) => fmtDur(v, 2), unit: "d", sub: `Kickoff vs KO due date · n=${koOD.length}`, spark: sparkKoOD, delta: lastDelta(sparkKoOD), lowerIsBetter: true },
    { label: "Time till Launch after KO Call", raw: avg(toLaunch), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `Kickoff → Launch · n=${toLaunch.length}`, spark: sparkLaunch, delta: lastDelta(sparkLaunch), lowerIsBetter: true },
    { label: "Average IMP Timeline", raw: avg(impTL), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `IMP start → Launch · n=${impTL.length}`, spark: sparkImpTL, delta: lastDelta(sparkImpTL), lowerIsBetter: true },
    { label: "Average IMP Review Overdue", raw: avg(revOD), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `Review start vs due date · n=${revOD.length}`, spark: sparkRevOD, delta: lastDelta(sparkRevOD), lowerIsBetter: true },
    { label: "Average Launch Call Overdue", raw: avg(launchOD), fmt: (v) => fmtDur(v, 2), unit: "d", sub: `Launch vs launch due · n=${launchOD.length}`, spark: sparkLnchOD, delta: lastDelta(sparkLnchOD), lowerIsBetter: true },
    { label: "Average Hold Duration", raw: avg(holdDur), fmt: (v) => fmtDur(v, 1), unit: "d", sub: `Time spent in Hold · n=${holdDur.length}`, spark: sparkHold, delta: lastDelta(sparkHold), lowerIsBetter: true },
    { label: "Average Touchpoints per Project", raw: avg(tps), fmt: (v) => String(Math.round(v)), unit: "n", sub: `Across ${tps.length} clients`, spark: sparkTP, delta: lastDelta(sparkTP), lowerIsBetter: false },
    { label: "Average OB Completion Time", raw: avg(obs), fmt: (v) => fmtDur(v, 1), unit: "d", sub: "Manual update", spark: sparkOB, delta: lastDelta(sparkOB), lowerIsBetter: true },
  ];

  const stageData = STAGES.map((s) => ({
    short: s.label.length > 11 ? s.label.slice(0, 10) + "…" : s.label,
    full: s.label,
    count: list.filter((c) => c.stage === s.id).length,
    color: s.color,
  }));

  const statusData = Object.entries(STATUSES)
    .map(([k, v]) => ({ name: v.label, value: list.filter((c) => c.status === k).length, color: v.dot }))
    .filter((d) => d.value > 0);

  const totalShown = useCountUp(list.length, { delay: 300, disabled: !animate });
  const active = activeSlice != null ? statusData[activeSlice] : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} {...k} i={i} animate={animate} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="fade-up rounded-xl border border-zinc-200 bg-white shadow-sm p-4 lg:col-span-3" style={{ animationDelay: "380ms" }}>
          <div className="mb-3 text-sm font-medium text-zinc-800">Total Projects by Stage</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 16, right: 8, left: -18, bottom: 4 }} onMouseLeave={() => setHoverBar(null)}>
                <defs>
                  {stageData.map((d, i) => (
                    <linearGradient key={d.full} id={`stage-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                      <stop offset="100%" stopColor={d.color} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="#e9e9ef" />
                <XAxis
                  dataKey="short"
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={64}
                  tick={{ fill: "#71717d", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#d8d8e0" }}
                />
                <YAxis tick={{ fill: "#71717d", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(30,30,45,0.05)" }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={animate}
                  animationDuration={850}
                  animationEasing="ease-out"
                  animationBegin={150}
                  onMouseEnter={(_, i) => setHoverBar(i)}
                >
                  <LabelList dataKey="count" position="top" fill="#6b6b78" fontSize={10} />
                  {stageData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={`url(#stage-grad-${i})`}
                      stroke={d.color}
                      strokeWidth={hoverBar === i ? 1.5 : 0}
                      fillOpacity={hoverBar == null || hoverBar === i ? 1 : 0.35}
                      style={{ transition: "fill-opacity .18s ease" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fade-up rounded-xl border border-zinc-200 bg-white shadow-sm p-4 lg:col-span-2" style={{ animationDelay: "420ms" }}>
          <div className="mb-3 text-sm font-medium text-zinc-800">Total Projects by Project Status</div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="64%"
                    outerRadius="86%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={animate}
                    animationDuration={1000}
                    animationEasing="ease-out"
                    animationBegin={200}
                    activeIndex={activeSlice == null ? -1 : activeSlice}
                    activeShape={<ActiveSlice />}
                    onMouseEnter={(_, i) => setActiveSlice(i)}
                    onMouseLeave={() => setActiveSlice(null)}
                  >
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} style={{ outline: "none" }} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  {active ? (
                    <>
                      <div className="font-display text-3xl font-semibold" style={{ color: active.color }}>
                        {active.value}
                      </div>
                      <div className="mx-auto max-w-24 text-[10px] uppercase tracking-wide text-zinc-500">{active.name}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-display text-3xl font-semibold text-zinc-900">{Math.round(totalShown)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">clients</div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {statusData.map((d, i) => (
                <div
                  key={d.name}
                  onMouseEnter={() => setActiveSlice(i)}
                  onMouseLeave={() => setActiveSlice(null)}
                  className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-xs text-zinc-600 transition-colors"
                  style={{ background: activeSlice === i ? "#f4f2fb" : "transparent" }}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                  <span>{d.name}</span>
                  <span className="text-zinc-500">· {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Board view ─────────────────────────────── */

function BoardCard({ c, onOpen, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, c.id)}
      onClick={() => onOpen(c.id)}
      className="group cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-400"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-zinc-900">{c.name}</span>
            {c.impEscalation && <AlertTriangle size={13} className="shrink-0 text-red-500" />}
          </div>
          {c.pocEmail && <div className="mt-0.5 truncate text-xs text-zinc-500">{c.pocEmail}</div>}
        </div>
        <GripVertical size={14} className="mt-0.5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PersonChip name={c.csm} />
        {c.subscription === "White Label" && <Chip color={SUB_COLORS["White Label"]}>WL</Chip>}
        {c.priority !== "Medium" && <Chip color={PRIORITY_COLORS[c.priority]}>{c.priority}</Chip>}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusPill c={c} />
        {c.taskProgress > 0 && <span className="text-xs text-zinc-500">{c.taskProgress}%</span>}
      </div>
    </div>
  );
}

function BoardView({ list, onOpen, onMove, dragOver, setDragOver }) {
  const onDragStart = (e, id) => e.dataTransfer.setData("text/plain", String(id));
  const onDrop = (e, stageId) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (id) onMove(id, stageId);
    setDragOver(null);
  };
  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-4">
      {STAGES.map((s) => {
        const cards = list.filter((c) => c.stage === s.id);
        const over = dragOver === s.id;
        return (
          <div
            key={s.id}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, s.id)}
            className="flex w-72 shrink-0 flex-col rounded-xl border bg-zinc-100/60 transition-colors"
            style={{ borderColor: over ? ACCENT : "#e5e5ec" }}
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 p-2.5">
              <Chip color={s.color}>{s.label}</Chip>
              <span className="text-xs text-zinc-500">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 300px)", minHeight: 80 }}>
              {cards.map((c) => (
                <BoardCard key={c.id} c={c} onOpen={onOpen} onDragStart={onDragStart} />
              ))}
              {cards.length === 0 && (
                <div className="grid h-16 place-items-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500">
                  Drop clients here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────── Table view (Master Dashboard) ──────────── */

const COLS = [
  { k: "name", label: "Name", w: 230, sticky: true },
  { k: "user", label: "ATLAS Username", w: 180 },
  { k: "email", label: "POC Email", w: 200 },
  { k: "status", label: "Status", w: 180 },
  { k: "progress", label: "Task progress", w: 130 },
  { k: "stage", label: "Stage", w: 190 },
  { k: "csm", label: "CSM / FDE", w: 160 },
  { k: "imp", label: "Implementation Specialist", w: 170 },
  { k: "priority", label: "Priority", w: 90 },
  { k: "sub", label: "Subscription", w: 115 },
  { k: "tshirt", label: "T-Shirt Size", w: 100 },
  { k: "temp", label: "Temperament", w: 110 },
  { k: "payment", label: "Payment Date", w: 110 },
  { k: "kickoff", label: "Kickoff Call", w: 110 },
  { k: "launch", label: "Launch Date", w: 110 },
];

function cellContent(col, c) {
  switch (col.k) {
    case "name":
      return (
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-zinc-900">{c.name}</span>
          {c.impEscalation && <AlertTriangle size={13} className="shrink-0 text-red-500" />}
        </div>
      );
    case "user": return <span className="truncate text-zinc-500">{c.atlasUsername || "null"}</span>;
    case "email": return <span className="truncate text-zinc-500">{c.pocEmail || ""}</span>;
    case "status": return <StatusPill c={c} />;
    case "progress": return <ProgressBar v={c.taskProgress} />;
    case "stage": return <StageChip stageId={c.stage} />;
    case "csm": return <PersonChip name={c.csm} />;
    case "imp": return <PersonChip name={c.imp} />;
    case "priority": return <Chip color={PRIORITY_COLORS[c.priority]}>{c.priority}</Chip>;
    case "sub": return c.subscription ? <Chip color={SUB_COLORS[c.subscription] || "#c7c9d1"}>{c.subscription}</Chip> : null;
    case "tshirt": return <Chip color={TSHIRT_COLORS[c.tShirt] || "#c7c9d1"}>{c.tShirt}</Chip>;
    case "temp": return <Chip color={TEMP_COLORS[c.temperament] || "#c7c9d1"}>{c.temperament}</Chip>;
    case "payment": return <span className="text-zinc-600">{fmtDate(c.dates.payment)}</span>;
    case "kickoff": return <span className="text-zinc-600">{fmtDate(c.dates.kickoff)}</span>;
    case "launch": return <span className="text-zinc-600">{fmtDate(c.dates.launch)}</span>;
    default: return null;
  }
}

function TableView({ list, onOpen, collapsed, toggleGroup, stageFilter }) {
  const groups = STAGES.filter((s) => stageFilter === "all" || s.id === stageFilter);
  return (
    <div className="overflow-auto rounded-xl border border-zinc-200" style={{ maxHeight: "calc(100vh - 250px)" }}>
      <table className="atable w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {COLS.map((col) => (
              <th
                key={col.k}
                className={"border-b border-r border-zinc-200 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500" + (col.sticky ? " sticky-col" : "")}
                style={{ minWidth: col.w }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((s) => {
            const rows = list.filter((c) => c.stage === s.id);
            if (rows.length === 0 && stageFilter === "all") return null;
            const isCollapsed = collapsed[s.id];
            return (
              <React.Fragment key={s.id}>
                <tr>
                  <td colSpan={COLS.length} className="group-row border-b border-zinc-200 px-2 py-1.5">
                    <button
                      onClick={() => toggleGroup(s.id)}
                      className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-zinc-200/70"
                    >
                      {isCollapsed ? (
                        <ChevronRight size={14} className="text-zinc-500" />
                      ) : (
                        <ChevronDown size={14} className="text-zinc-500" />
                      )}
                      <Chip color={s.color}>{s.label}</Chip>
                      <span className="text-xs text-zinc-500">{rows.length}</span>
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  rows.map((c) => (
                    <tr key={c.id} className="arow cursor-pointer" onClick={() => onOpen(c.id)}>
                      {COLS.map((col) => (
                        <td
                          key={col.k}
                          className={"border-b border-r border-zinc-200/80 px-3 py-2 text-sm" + (col.sticky ? " sticky-col" : "")}
                          style={{ minWidth: col.w, maxWidth: col.w + 60 }}
                        >
                          {cellContent(col, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                {!isCollapsed && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="border-b border-zinc-200/80 px-4 py-3 text-sm text-zinc-400">
                      No clients in this stage yet.
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────── Client drawer ──────────────────────────── */

const DATE_FIELDS = [
  ["payment", "Payment Date"], ["koScheduling", "KO Scheduling Date"],
  ["koDue", "KO Call Due Date"], ["kickoff", "Kickoff Call"],
  ["csmMeeting2", "CSM Meeting 2"], ["impBacklog", "IMP Backlog Date"],
  ["obKsStart", "OB-KS Start Date"], ["obIpStart", "OB-IP Start Date"],
  ["impStart", "IMP Start Date"], ["impReviewStart", "IMP Review Start"],
  ["impReviewDue", "IMP Review Due"], ["launchDue", "Launch Due Date"],
  ["launch", "Launch Date"], ["postLaunchStart", "Post-Launch Start"],
  ["ongoingStart", "Ongoing Support Start"], ["supportCall", "Support Call (Latest)"],
  ["holdStart", "Hold Start Date"], ["holdEnd", "Hold End Date"],
  ["cancellation", "Cancellation Date"],
];

const WL_FIELDS = [
  ["company", "WL Company Name"], ["website", "WL Website"],
  ["appUrl", "WL - APP URL"], ["adminUrl", "WL Admin URL"],
  ["brandColors", "WL Brand Colors"], ["password", "WL Password"],
  ["dnsApp", "WL DNS Records APP"], ["dnsAdmin", "WL DNS Records Admin"],
  ["twilioSid", "WL Twilio SID"], ["twilioToken", "WL Twilio Auth Token"],
  ["emailAdmin", "WL Email for Admin"], ["emailSupport", "WL Email for Support"],
  ["emailApp", "WL Email for App"],
];

const MetricTile = ({ label, value, tone }) => (
  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    <div
      className="font-display mt-0.5 text-sm font-semibold"
      style={{ color: tone === "bad" ? "#d6453a" : tone === "good" ? "#1f9d5b" : "#27272f" }}
    >
      {value}
    </div>
  </div>
);

function Drawer({ c, onClose, onPatch, onDates, onWL, onStage, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wlOpen, setWlOpen] = useState(c.subscription === "White Label");
  const m = clientMetrics(c);
  const overdueTone = (v) => (v == null ? undefined : v > 0 ? "bad" : "good");

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-zinc-900/25 backdrop-blur-sm" onClick={onClose} />
      <div className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white">
        <div className="flex items-start gap-3 border-b border-zinc-200 p-4">
          <div className="min-w-0 flex-1">
            <input
              className="w-full bg-transparent font-display text-lg font-semibold text-zinc-900 outline-none placeholder:text-zinc-400"
              value={c.name}
              placeholder="Client name"
              onChange={(e) => onPatch({ name: e.target.value })}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StageChip stageId={c.stage} />
              <StatusPill c={c} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-10">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage" full>
              <select className="ainput" value={c.stage} onChange={(e) => onStage(e.target.value)}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="ainput"
                value={c.status}
                onChange={(e) => {
                  const v = e.target.value;
                  onPatch({ status: v, statusDate: v === "none" ? null : todayISO() });
                }}
              >
                {Object.entries(STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <SelectInput options={["Low", "Medium", "High"]} value={c.priority} onChange={(e) => onPatch({ priority: e.target.value })} />
            </Field>
          </div>

          <SectionTitle>Client</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ATLAS Username">
              <TextInput value={c.atlasUsername} onChange={(e) => onPatch({ atlasUsername: e.target.value })} />
            </Field>
            <Field label="POC Email">
              <TextInput value={c.pocEmail} onChange={(e) => onPatch({ pocEmail: e.target.value })} />
            </Field>
            <Field label="Subscription">
              <SelectInput options={["Starter", "Pro", "White Label"]} value={c.subscription} onChange={(e) => onPatch({ subscription: e.target.value })} />
            </Field>
            <Field label="T-Shirt Size">
              <SelectInput options={["Small", "Medium", "Large"]} value={c.tShirt} onChange={(e) => onPatch({ tShirt: e.target.value })} />
            </Field>
            <Field label="Temperament">
              <SelectInput options={["Happy", "Neutral", "Frustrated"]} value={c.temperament} onChange={(e) => onPatch({ temperament: e.target.value })} />
            </Field>
            <Field label={`Task progress · ${c.taskProgress}%`}>
              <input
                type="range" min="0" max="100" value={c.taskProgress}
                onChange={(e) => onPatch({ taskProgress: Number(e.target.value) })}
                className="mt-2 w-full accent-[#9a6cf0]"
                style={{ accentColor: ACCENT }}
              />
            </Field>
            <Field label="Touchpoints">
              <input type="number" className="ainput" value={c.touchpoints} onChange={(e) => onPatch({ touchpoints: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Revision Count">
              <input type="number" className="ainput" value={c.revisionCount} onChange={(e) => onPatch({ revisionCount: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="OB Completion Time (days)">
              <input
                type="number" className="ainput"
                value={c.obCompletionTime ?? ""}
                placeholder="—"
                onChange={(e) => onPatch({ obCompletionTime: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <div className="flex items-end gap-4 pb-1.5">
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input type="checkbox" checked={c.impEscalation} onChange={(e) => onPatch({ impEscalation: e.target.checked })} style={{ accentColor: "#f2695c" }} />
                IMP Escalation
              </label>
            </div>
          </div>

          <SectionTitle>Team</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CSM / FDE">
              <SelectInput blank options={CSMS} value={c.csm} onChange={(e) => onPatch({ csm: e.target.value })} />
            </Field>
            <Field label="Implementation Specialist">
              <SelectInput blank options={IMPS} value={c.imp} onChange={(e) => onPatch({ imp: e.target.value })} />
            </Field>
            <Field label="CSA">
              <SelectInput blank options={CSMS} value={c.csa} onChange={(e) => onPatch({ csa: e.target.value })} />
            </Field>
          </div>

          <SectionTitle>Timeline metrics</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile label="Time till KO" value={fmtDur(m.timeTillKO)} />
            <MetricTile label="KO vs Scheduling" value={fmtDur(m.koVsSched)} />
            <MetricTile label="KO Overdue" value={fmtDur(m.koOverdue)} tone={overdueTone(m.koOverdue)} />
            <MetricTile label="KO → Launch" value={fmtDur(m.timeToLaunch)} />
            <MetricTile label="IMP Timeline" value={fmtDur(m.impTimeline)} />
            <MetricTile label="IMP Review Overdue" value={fmtDur(m.impReviewOverdue)} tone={overdueTone(m.impReviewOverdue)} />
            <MetricTile label="Launch Overdue" value={fmtDur(m.launchOverdue)} tone={overdueTone(m.launchOverdue)} />
            <MetricTile label="Hold Duration" value={fmtDur(m.holdDuration)} />
          </div>

          <SectionTitle>Dates &amp; timeline</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {DATE_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <DateInput value={c.dates[k] || ""} onChange={(e) => onDates({ [k]: e.target.value || null })} />
              </Field>
            ))}
          </div>

          <SectionTitle>White Label</SectionTitle>
          <button
            onClick={() => setWlOpen((v) => !v)}
            className="mb-2 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-800"
          >
            {wlOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {wlOpen ? "Hide" : "Show"} white-label configuration
          </button>
          {wlOpen && (
            <div className="grid grid-cols-2 gap-3">
              {WL_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <TextInput value={c.wl[k]} onChange={(e) => onWL({ [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          )}

          <SectionTitle>Notes</SectionTitle>
          <textarea
            rows={3}
            className="ainput resize-y"
            placeholder="Internal notes for the team…"
            value={c.notes}
            onChange={(e) => onPatch({ notes: e.target.value })}
          />

          <div className="mt-8 border-t border-zinc-200 pt-4">
            <button
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 size={15} />
              {confirmDelete ? "Click again to confirm removal" : "Remove client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Add client modal ───────────────────────── */

function AddModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [user, setUser] = useState("");
  const [stage, setStage] = useState("pre");
  const [csm, setCsm] = useState(CSMS[0]);
  const [sub, setSub] = useState("Starter");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="fade-up w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-base font-semibold text-zinc-900">Add client</div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
            <X size={17} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client name" full>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lyon Landscaping" autoFocus />
          </Field>
          <Field label="POC Email">
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="ATLAS Username">
            <TextInput value={user} onChange={(e) => setUser(e.target.value)} />
          </Field>
          <Field label="Stage">
            <select className="ainput" value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="CSM / FDE">
            <SelectInput blank options={CSMS} value={csm} onChange={(e) => setCsm(e.target.value)} />
          </Field>
          <Field label="Subscription" full>
            <SelectInput options={["Starter", "Pro", "White Label"]} value={sub} onChange={(e) => setSub(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
            Cancel
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => onAdd({ name: name.trim(), email, user, stage, csm, sub })}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${BRAND}, ${ACCENT})` }}
          >
            Add client
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── App ────────────────────────────────────── */

const VIEWS = [
  { id: "dashboard", label: "Visual DB", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "table", label: "Master Dashboard", icon: Table2 },
];

export default function AtlasFulfillmentTracker() {
  const [clients, setClients] = useState(SEED);
  const [view, setView] = useState("dashboard");
  const [q, setQ] = useState("");
  const [csmF, setCsmF] = useState("all");
  const [stageF, setStageF] = useState("all");
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [dragOver, setDragOver] = useState(null);

  const patch = (id, p) => setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const patchDates = (id, p) => setClients((cs) => cs.map((c) => (c.id === id ? { ...c, dates: { ...c.dates, ...p } } : c)));
  const patchWL = (id, p) => setClients((cs) => cs.map((c) => (c.id === id ? { ...c, wl: { ...c.wl, ...p } } : c)));

  const changeStage = (id, stageId) =>
    setClients((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c;
        const dates = { ...c.dates };
        const stamp = STAGE_STAMP[stageId];
        if (stamp && !dates[stamp]) dates[stamp] = todayISO();
        if (c.stage === "hold" && stageId !== "hold" && dates.holdStart && !dates.holdEnd) dates.holdEnd = todayISO();
        if (stageId === "cancelled" && !dates.cancellation) dates.cancellation = todayISO();
        return { ...c, stage: stageId, dates };
      })
    );

  const removeClient = (id) => {
    setClients((cs) => cs.filter((c) => c.id !== id));
    setSel(null);
  };

  const addClient = ({ name, email, user, stage, csm, sub }) => {
    const c = mk(name, stage, csm, { e: email, u: user, sub, st: "ontrack", sd: todayISO() });
    c.id = Date.now();
    setClients((cs) => [c, ...cs]);
    setAdding(false);
    setSel(c.id);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (csmF === "all" || c.csm === csmF) &&
        (stageF === "all" || c.stage === stageF) &&
        (!needle || [c.name, c.pocEmail, c.atlasUsername].join(" ").toLowerCase().includes(needle))
    );
  }, [clients, q, csmF, stageF]);

  const selClient = clients.find((c) => c.id === sel);
  const hasFilters = q || csmF !== "all" || stageF !== "all";

  return (
    <div className="atlas min-h-screen bg-zinc-50 text-zinc-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        .atlas { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .atlas .font-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; letter-spacing: -0.01em; }
        .atlas .ainput {
          background: #ffffff; border: 1px solid #dcdce4; border-radius: 8px;
          padding: 7px 10px; font-size: 13px; color: #27272f; outline: none;
          width: 100%; transition: border-color .15s, box-shadow .15s; font-family: inherit;
        }
        .atlas .ainput:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 3px rgba(102,57,166,.13); }
        .atlas .ainput::placeholder { color: #a3a3ae; }
        .atlas ::-webkit-scrollbar { height: 10px; width: 10px; }
        .atlas ::-webkit-scrollbar-thumb { background: #cfcfda; border-radius: 8px; border: 2px solid #fafafa; }
        .atlas ::-webkit-scrollbar-track { background: transparent; }
        .atable td { background: #ffffff; }
        .atable .group-row { background: #f7f7fa; }
        .arow td { transition: background .12s; }
        .arow:hover td { background: #f6f4fc; }
        .atable th { position: sticky; top: 0; z-index: 10; background: #fbfbfd; }
        .atable td.sticky-col { position: sticky; left: 0; z-index: 5; }
        .atable th.sticky-col { position: sticky; left: 0; z-index: 15; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp .35s ease both; }
        @keyframes slideIn { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
        .drawer-in { animation: slideIn .25s cubic-bezier(.2,.8,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .fade-up, .drawer-in { animation: none; }
        }
      `}</style>

      {/* Header */}
      <div className="border-b border-zinc-200 bg-white/90 px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <AtlasLogo height={30} />
            <div className="h-7 w-px bg-zinc-200" />
            <div>
              <div className="font-display text-base font-semibold leading-tight text-zinc-900">
                Customer Fulfillment
              </div>
              <div className="text-[11px] text-zinc-500">Onboarding pipeline</div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className="ainput"
                style={{ paddingLeft: 30, width: 210 }}
                placeholder="Search clients…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="ainput" style={{ width: 170 }} value={csmF} onChange={(e) => setCsmF(e.target.value)}>
              <option value="all">All CSMs / FDEs</option>
              {CSMS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select className="ainput" style={{ width: 190 }} value={stageF} onChange={(e) => setStageF(e.target.value)}>
              <option value="all">All stages</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:-translate-y-px"
              style={{ background: `linear-gradient(135deg, ${BRAND}, ${ACCENT})` }}
            >
              <Plus size={15} /> Add client
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="mt-3 flex items-center gap-1">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors " +
                  (active ? "font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-600")
                }
                style={{ borderColor: active ? ACCENT : "transparent" }}
              >
                <Icon size={15} />
                {v.label}
              </button>
            );
          })}
          <span className="ml-auto pb-1 text-xs text-zinc-500">
            {filtered.length} client{filtered.length === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 sm:px-6">
        {filtered.length === 0 ? (
          <div className="fade-up mx-auto mt-16 max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <div className="font-display text-lg font-semibold text-zinc-900">No clients found</div>
            <p className="mt-2 text-sm text-zinc-500">
              {hasFilters
                ? "Nothing matches the current search or filters."
                : "The pipeline is empty. Add your first client to get started."}
            </p>
            {hasFilters ? (
              <button
                onClick={() => { setQ(""); setCsmF("all"); setStageF("all"); }}
                className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND}, ${ACCENT})` }}
              >
                Add client
              </button>
            )}
          </div>
        ) : view === "dashboard" ? (
          <DashboardView list={filtered} />
        ) : view === "board" ? (
          <BoardView
            list={filtered}
            onOpen={setSel}
            onMove={changeStage}
            dragOver={dragOver}
            setDragOver={setDragOver}
          />
        ) : (
          <TableView
            list={filtered}
            onOpen={setSel}
            collapsed={collapsed}
            toggleGroup={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
            stageFilter={stageF}
          />
        )}
      </div>

      {selClient && (
        <Drawer
          key={selClient.id}
          c={selClient}
          onClose={() => setSel(null)}
          onPatch={(p) => patch(selClient.id, p)}
          onDates={(p) => patchDates(selClient.id, p)}
          onWL={(p) => patchWL(selClient.id, p)}
          onStage={(s) => changeStage(selClient.id, s)}
          onDelete={() => removeClient(selClient.id)}
        />
      )}

      {adding && <AddModal onAdd={addClient} onClose={() => setAdding(false)} />}
    </div>
  );
}
