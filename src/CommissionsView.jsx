// ============================================================
// CommissionsView — top-level view for the Commission Tracker
// ============================================================
// Phase 4.1.2 (this revision):
//   - Final naming convention locked in:
//       "Cash Collected" = the cash basis amount that arrived this month
//       "Initial CC"     = the 10% initial commission earned on first cash month
//   - Renames "Initial" → "Initial CC" across ByRep, Overview, Settings,
//     What-If, CSV export, and the sub-table column header.
//
// Phase 4.1:
//   - New "Cash" column on CustomerDrilldownRow shows the actual cash that
//     arrived this month. Makes the commission math transparent.
//   - Subscription IDs in the inner expansion are hyperlinks to Stripe.
//
// Phase 4:
//   - All commission calc is pure cash-based, computed in commissionEngine.js.
// ============================================================

import React, { useState, useMemo, useEffect } from "react";
import {
  TrendingUp, Users, DollarSign, AlertCircle, Settings, Download,
  GitCompare, Calendar, Zap, FileText, Check, X, Plus,
  RefreshCw, Search, Inbox, ChevronRight, ChevronDown, ExternalLink,
  Receipt,
} from "lucide-react";
import Papa from "papaparse";

import ScorecardShell from "./ScorecardShell";
import RocketLoader from "./RocketLoader";
import { useCommissions } from "./useCommissions";
import { useOneoffPayments } from "./useOneoffPayments";
import { supabase } from "./supabase";
import {
  ALL_REPS, REPS, isAE,
  calcRepCommission, calcRepCommissionByCustomer, calcRepCommissionByCustomerByMonth,
  calcOneoffCommissionByRep,
  detectFirstNameCollisions,
  repsFromProfiles,
  calcAccelerator, aeCustomerLifetimeProjection,
  projectCustomers, parseStripeCSV,
  resolveRepConfig,
  monthLabel, fmtMoney, fmtPct, DEFAULT_CONFIG,
} from "./commissionEngine";
import { accessTier } from "./teams";

const BRAND = {
  purple: "#6639a6",
  purpleDeep: "#4d2a7e",
  purpleLight: "#9171c4",
  purpleTint: "#f3eefb",
  purpleTintMid: "#e4d8f4",
};

// Stripe Dashboard customer URL builder. Returns null when there's no Stripe
// customer ID (e.g., a record created from CSV import that never matched).
function stripeCustomerUrl(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  return `https://dashboard.stripe.com/customers/${stripeCustomerId}`;
}

// ============================================================
// SUBSCRIPTION STATUS VISUAL METADATA
// ============================================================
const SUB_STATUS_META = {
  active:        { label: "Active",      bg: "#d1fae5", color: "#065f46" },
  trialing:      { label: "Trial",       bg: "#dbeafe", color: "#1d4ed8" },
  past_due:      { label: "Past due",    bg: "#fef3c7", color: "#b45309" },
  paused:        { label: "Paused",      bg: "#f5f5f4", color: "#57534e" },
  canceled:      { label: "Canceled",    bg: "#fee2e2", color: "#b91c1c" },
  incomplete:    { label: "Incomplete",  bg: "#fef3c7", color: "#b45309" },
  unpaid:        { label: "Unpaid",      bg: "#fee2e2", color: "#b91c1c" },
};

function SubscriptionPill({ status, size = "sm" }) {
  const meta = SUB_STATUS_META[status] || { label: status || "Unknown", bg: "#f5f5f4", color: "#57534e" };
  const sizeClasses = size === "xs"
    ? "text-[9px] px-1 py-0"
    : "text-[10px] px-1.5 py-0.5";
  return (
    <span className={`inline-flex items-center rounded-sm font-medium ${sizeClasses}`}
          style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

// ============================================================
// CommissionsView — root component
// ============================================================
export default function CommissionsView({
  profile, onSignOut,
  onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations,
  onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership,
  onProfileUpdated,
}) {
  const tier = accessTier(profile);
  const isExecutive = tier === "executive";
  const shellNav = {
    onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations,
    onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership,
    onProfileUpdated,
  };
  const c = useCommissions();
  const o = useOneoffPayments();
  const includedOneoffs = useMemo(
    () => (o.oneoffs || []).filter((x) => x.included_in_commission),
    [o.oneoffs]
  );
  const collisions = useMemo(
    () => detectFirstNameCollisions(c.profiles),
    [c.profiles]
  );
  const repList = useMemo(
    () => repsFromProfiles(c.profiles),
    [c.profiles]
  );
  const ambiguousNames = useMemo(
    () => new Set(collisions.map((co) => co.firstName)),
    [collisions]
  );
  // Drift sentinel: warn loudly if the dynamic rep list ever diverges from
  // the hardcoded REPS for the 5 production reps. Catches "Heather's profile
  // role_type got changed to manager and her math silently broke" before it
  // reaches a paycheck.
  useEffect(() => {
    if (!c.profiles || c.profiles.length === 0) return;
    const drift = [];
    for (const n of REPS.AE)  if (!repList.AE.includes(n))  drift.push(`hardcoded AE "${n}" missing from dynamic`);
    for (const n of REPS.CSM) if (!repList.CSM.includes(n)) drift.push(`hardcoded CSM "${n}" missing from dynamic`);
    for (const n of repList.AE)  if (REPS.CSM.includes(n)) drift.push(`"${n}" is AE in dynamic but CSM in hardcoded`);
    for (const n of repList.CSM) if (REPS.AE.includes(n))  drift.push(`"${n}" is CSM in dynamic but AE in hardcoded`);
    if (drift.length > 0) console.warn("[REPS drift]", drift);
  }, [c.profiles, repList]);
  const [tab, setTab] = useState("overview");
  const [jumpRep, setJumpRep] = useState(null);
  const [needsFilter, setNeedsFilter] = useState(null);

  if (c.loading) {
    return (
      <ScorecardShell profile={profile} onSignOut={onSignOut} {...shellNav} currentPage="commissions" title="Commissions" subtitle="Executives only">
        <RocketLoader label="Loading commission data…" />
      </ScorecardShell>
    );
  }
  if (c.error) {
    return (
      <ScorecardShell profile={profile} onSignOut={onSignOut} {...shellNav} currentPage="commissions" title="Commissions" subtitle="Executives only">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-900">
            <strong>Failed to load commission data.</strong> {c.error}
          </div>
        </div>
      </ScorecardShell>
    );
  }

  const jumpTo = (newTab, rep, filter) => {
    setTab(newTab);
    if (rep) setJumpRep(rep);
    if (filter) setNeedsFilter(filter);
  };

  const tabs = [
    { id: "overview",  label: "Overview",  icon: TrendingUp },
    { id: "customers", label: "Customers", icon: Users },
    { id: "byRep",     label: "By Rep",    icon: DollarSign },
    { id: "whatif",    label: "What-If",   icon: GitCompare },
    { id: "annualize", label: "Annualize", icon: Calendar },
    { id: "data",      label: "Data Sync", icon: Zap },
    ...(isExecutive ? [{ id: "oneoffs",  label: "One-Offs", icon: Receipt }] : []),
    ...(isExecutive ? [{ id: "settings", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <ScorecardShell profile={profile} onSignOut={onSignOut} {...shellNav} currentPage="commissions" title="Commissions" subtitle="Executives only">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">
            Executives · Commission Tracker
          </div>
          <h1 className="display-font text-5xl md:text-7xl font-medium leading-[1] tracking-tight text-stone-900">
            What the team is <em className="display-font-i font-normal" style={{ color: '#6639a6' }}>earning</em>
          </h1>
          <div className="text-xs text-stone-500 mt-1">
            {c.customers.length} customers · {c.monthCols.length} months
            {c.lastSyncAt && <> · last synced {new Date(c.lastSyncAt).toLocaleString()}</>}
          </div>
        </div>

        <div className="border-b border-stone-200 mb-6 flex gap-0 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition whitespace-nowrap"
                style={active
                  ? { borderColor: BRAND.purple, color: "#1c1917", fontWeight: 500 }
                  : { borderColor: "transparent", color: "#78716c" }}>
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {tab === "overview"  && <OverviewTab  c={c} onJumpTo={jumpTo} oneoffs={includedOneoffs} collisions={collisions} repList={repList} />}
        {tab === "customers" && <CustomersTab c={c} initialFilter={needsFilter} ambiguousNames={ambiguousNames} repList={repList} />}
        {tab === "byRep"     && <ByRepTab     c={c} initialRep={jumpRep} oneoffs={includedOneoffs} collisions={collisions} repList={repList} isExecutive={isExecutive} />}
        {tab === "whatif"    && <WhatIfTab    c={c} repList={repList} />}
        {tab === "annualize" && <AnnualizeTab c={c} repList={repList} />}
        {tab === "data"      && <DataTab      c={c} isExecutive={isExecutive} />}
        {tab === "oneoffs"   && isExecutive && <OneOffsTab profiles={c.profiles} o={o} ambiguousNames={ambiguousNames} repList={repList} />}
        {tab === "settings"  && isExecutive && <SettingsTab c={c} />}
      </div>
    </ScorecardShell>
  );
}

// ============================================================
// SHARED UI primitives
// ============================================================
function Stat({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-stone-200 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</div>
      <div className="mt-1.5 text-2xl font-mono tabular-nums" style={{ color: accent || "#1c1917" }}>{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
    </div>
  );
}

function RepSelect({ value, onChange, type, disabled, ambiguousNames, repList }) {
  const options = repList
    ? (type === "AE" ? repList.AE : repList.CSM)
    : (type === "AE" ? REPS.AE : REPS.CSM);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}
      className="text-xs bg-transparent border border-stone-200 px-1.5 py-0.5 hover:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:cursor-not-allowed">
      <option value="">—</option>
      {options.map((r) => {
        const isAmbiguous = ambiguousNames && ambiguousNames.has(r);
        return (
          <option key={r} value={r} disabled={isAmbiguous}>
            {isAmbiguous ? `${r} (ambiguous — resolve collision)` : r}
          </option>
        );
      })}
    </select>
  );
}

function Btn({ onClick, variant = "secondary", children, className = "", disabled }) {
  const styles = {
    primary:   { background: BRAND.purple, color: "white", borderColor: BRAND.purple },
    secondary: { background: "white", color: "#44403c", borderColor: "#e7e5e4" },
    ghost:     { background: "transparent", color: BRAND.purple, borderColor: BRAND.purpleTintMid },
    danger:    { background: "white", color: "#b91c1c", borderColor: "#fecaca" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={styles[variant]}
      className={`text-sm px-3 py-1.5 border transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

// ============================================================
// COLLISION BANNER — loud warning on Overview + By Rep when two
// commission-earning profiles share a first name. The subscription
// engine matches by first name, so commission numbers double-count
// across colliding profiles until disambiguated.
// ============================================================
function CollisionBanner({ collisions }) {
  if (!collisions || collisions.length === 0) return null;
  return (
    <div className="bg-red-50 border-2 border-red-300 px-5 py-4 flex items-start gap-3">
      <AlertCircle size={20} className="text-red-700 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-900">
          Commission numbers may be unreliable — same-first-name collision detected
        </div>
        <div className="text-xs text-red-800 mt-1.5 leading-relaxed">
          The subscription engine matches reps by first name, so the profiles below
          will be double-counted in subscription commission until disambiguated.
          Assignment dropdowns block these names until you fix one of the profiles.
        </div>
        <ul className="text-xs text-red-900 mt-2 space-y-1 list-none">
          {collisions.map((co) => (
            <li key={co.firstName}>
              <strong>"{co.firstName}"</strong> matches {co.count} profiles:&nbsp;
              {co.profiles.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? " · " : ""}
                  <span className="font-mono">{p.name}</span>
                  <span className="opacity-70 ml-1">
                    ({p.role_type === "csm" ? "CSM" : "AE"}{p.team ? `, ${p.team}` : ""})
                  </span>
                </span>
              ))}
            </li>
          ))}
        </ul>
        <div className="text-xs text-red-800 mt-2">
          Resolve by editing one profile's name (e.g. add a last initial) so first names are unique among commission-earning profiles.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REP OVERRIDES PANEL — per-rep commission_rep_overrides editor
// ============================================================
// Mounted in ByRepTab for the currently selected rep. Reads effective
// config + override history from c (already loaded by useCommissions).
// Writes via the upsert_rep_override RPC (SECURITY DEFINER, exec-gated).
//
// Visual unit safety: rate fields and multiplier fields use distinct
// input components with distinct backgrounds + suffix characters so
// "10" (rate %) and "1.5" (multiplier ×) cannot be confused at a glance.
// The RPC enforces the same boundaries server-side as belt-and-suspenders.
// ============================================================

function RepOverridesPanel({ repName, c, isExecutive }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const overridesForRep = useMemo(
    () => (c.repOverrides || [])
      .filter((o) => o.rep_name === repName)
      .sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || "")),
    [c.repOverrides, repName]
  );

  const summary = overridesForRep.length > 0
    ? `${overridesForRep.length} override${overridesForRep.length === 1 ? "" : "s"} on record`
    : "Using defaults";

  return (
    <div className="bg-white border border-stone-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-stone-50"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown size={14} className="text-stone-500" />
            : <ChevronRight size={14} className="text-stone-500" />}
          <span className="text-sm font-medium text-stone-900">Effective Rates &amp; Override</span>
        </div>
        <span className="text-xs text-stone-500">{summary}</span>
      </button>

      {expanded && (
        <div className="px-5 py-4 border-t border-stone-200 space-y-5">
          <EffectiveRatesDisplay repName={repName} c={c} />

          {isExecutive && (
            !showAddForm ? (
              <div>
                <Btn variant="ghost" onClick={() => setShowAddForm(true)}>
                  <Plus size={12} className="inline mr-1" />Add override
                </Btn>
              </div>
            ) : (
              <AddOverrideForm
                repName={repName}
                onCancel={() => setShowAddForm(false)}
                onSaved={async () => {
                  setShowAddForm(false);
                  await c.reload();
                }}
              />
            )
          )}

          {overridesForRep.length > 0 && (
            <OverridesHistory rows={overridesForRep} />
          )}
        </div>
      )}
    </div>
  );
}

// ---- Unit-distinct inputs ----------------------------------------

function RateInput({ value, onChange, placeholder, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "—"}
        disabled={disabled}
        className="w-24 text-sm border border-stone-300 px-2 py-1 bg-white focus:outline-none focus:border-stone-500 disabled:bg-stone-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm text-stone-600 select-none">%</span>
    </div>
  );
}

function MultiplierInput({ value, onChange, placeholder, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="1"
        max="10"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "—"}
        disabled={disabled}
        className="w-24 text-sm border-2 px-2 py-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: BRAND.purpleTint, borderColor: BRAND.purpleTintMid, color: BRAND.purpleDeep }}
      />
      <span className="text-sm font-semibold select-none" style={{ color: BRAND.purpleDeep }}>×</span>
    </div>
  );
}

function MonthsInput({ value, onChange, placeholder, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "—"}
        disabled={disabled}
        className="w-24 text-sm border border-stone-300 px-2 py-1 bg-white focus:outline-none focus:border-stone-500 disabled:bg-stone-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm text-stone-600 select-none">months</span>
    </div>
  );
}

function DollarInput({ value, onChange, placeholder, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-stone-600 select-none">$</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "—"}
        disabled={disabled}
        className="w-32 text-sm border border-stone-300 px-2 py-1 bg-white focus:outline-none focus:border-stone-500 disabled:bg-stone-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

// ---- Layout primitives -------------------------------------------

function FieldGroup({ title, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FieldRow({ label, helper, children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="text-sm text-stone-900">{label}</div>
        {helper && <div className="text-[10px] text-stone-500">{helper}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---- Effective rates display (read-only) -------------------------

function EffectiveRatesDisplay({ repName, c }) {
  const today = new Date().toISOString().slice(0, 10);
  const effCfg = useMemo(
    () => resolveRepConfig(repName, today, c.indexedOverrides, c.config),
    [repName, c.indexedOverrides, c.config]
  );
  const isOverride = effCfg._source === "override";

  const rows = [
    ["AE Initial CC",       `${(effCfg.aeVoiceRate * 100).toFixed(2)}%`],
    ["AE residual",         `${(effCfg.aeResidualRate * 100).toFixed(2)}%`],
    ["AE residual cap",     `${effCfg.aeResidualMonths} months`],
    ["CSM residual",        `${(effCfg.csmRate * 100).toFixed(2)}%`],
    ["CSM residual cap",    `${effCfg.csmResidualMonths} months`],
    ["Accelerator target",  `$${(effCfg.acceleratorTarget || 0).toLocaleString()}`],
    ["Accel 1.2× tier",     `${effCfg.accelerator120Multiplier}×`],
    ["Accel 1.5× tier",     `${effCfg.accelerator150Multiplier}×`],
    ["TL override",         `${(effCfg.teamLeadOverridePct * 100).toFixed(2)}%`],
  ];

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium flex items-center gap-2">
        <span>Currently effective (today)</span>
        {isOverride ? (
          <span
            className="text-[10px] px-1.5 py-0.5"
            style={{ background: BRAND.purpleTint, color: BRAND.purpleDeep, borderRadius: 2 }}
          >
            override since {effCfg._effective_date}
          </span>
        ) : (
          <span className="text-[10px] text-stone-400">using default config</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-stone-500">{label}</div>
            <div className="font-mono tabular-nums font-medium text-stone-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Preview block (live decimals + raw input echo) --------------

function PreviewBlock({ dbValues, rawInputs }) {
  const lines = [];
  if (dbValues.p_ae_pct                 != null) lines.push(["ae_pct",                  dbValues.p_ae_pct,                  `${rawInputs.aePct} %`]);
  if (dbValues.p_ae_residual_pct        != null) lines.push(["ae_residual_pct",         dbValues.p_ae_residual_pct,         `${rawInputs.aeResidualPct} %`]);
  if (dbValues.p_ae_residual_months     != null) lines.push(["ae_residual_months",      dbValues.p_ae_residual_months,      `${dbValues.p_ae_residual_months} months`]);
  if (dbValues.p_csm_pct                != null) lines.push(["csm_pct",                 dbValues.p_csm_pct,                 `${rawInputs.csmPct} %`]);
  if (dbValues.p_csm_residual_months    != null) lines.push(["csm_residual_months",     dbValues.p_csm_residual_months,     `${dbValues.p_csm_residual_months} months`]);
  if (dbValues.p_accelerator_target     != null) lines.push(["accelerator_target",      dbValues.p_accelerator_target,      `$${dbValues.p_accelerator_target}`]);
  if (dbValues.p_accel_1_5x_pct         != null) lines.push(["accel_1_5x_pct",          dbValues.p_accel_1_5x_pct,          `${rawInputs.accel15xPct} ×`]);
  if (dbValues.p_accel_2x_pct           != null) lines.push(["accel_2x_pct",            dbValues.p_accel_2x_pct,            `${rawInputs.accel2xPct} ×`]);
  if (dbValues.p_team_lead_override_pct != null) lines.push(["team_lead_override_pct",  dbValues.p_team_lead_override_pct,  `${rawInputs.teamLeadOverridePct} %`]);

  return (
    <div className="bg-stone-900 text-stone-100 px-4 py-3 font-mono text-[11px] space-y-0.5 leading-relaxed">
      <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-1.5">About to write</div>
      <div>rep_name: <span className="text-stone-200">{dbValues.p_rep_name}</span></div>
      <div>effective_date: <span className="text-stone-200">{dbValues.p_effective_date}</span></div>
      {lines.map(([col, dec, raw]) => (
        <div key={col}>
          {col}: <span style={{ color: BRAND.purpleLight }}>{String(dec)}</span>{" "}
          <span className="text-stone-500">← you typed: {raw}</span>
        </div>
      ))}
      <div className="text-stone-500 italic">(all other fields NULL → inherit from default)</div>
      {dbValues.p_notes && <div>notes: <span className="text-stone-200">{dbValues.p_notes}</span></div>}
    </div>
  );
}

// ---- History list -------------------------------------------------

function OverridesHistory({ rows }) {
  const formatRow = (r) => {
    const parts = [];
    if (r.ae_pct                 != null) parts.push(`ae_pct: ${r.ae_pct}`);
    if (r.ae_residual_pct        != null) parts.push(`ae_residual_pct: ${r.ae_residual_pct}`);
    if (r.ae_residual_months     != null) parts.push(`ae_residual_months: ${r.ae_residual_months}`);
    if (r.csm_pct                != null) parts.push(`csm_pct: ${r.csm_pct}`);
    if (r.csm_residual_months    != null) parts.push(`csm_residual_months: ${r.csm_residual_months}`);
    if (r.accelerator_target     != null) parts.push(`accelerator_target: $${r.accelerator_target}`);
    if (r.accel_1_5x_pct         != null) parts.push(`accel_1_5x_pct: ${r.accel_1_5x_pct}×`);
    if (r.accel_2x_pct           != null) parts.push(`accel_2x_pct: ${r.accel_2x_pct}×`);
    if (r.team_lead_override_pct != null) parts.push(`team_lead_override_pct: ${r.team_lead_override_pct}`);
    return parts;
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">
        Existing overrides for this rep
      </div>
      <div className="border border-stone-200 divide-y divide-stone-200">
        {rows.map((r) => {
          const parts = formatRow(r);
          return (
            <div key={r.id} className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-mono tabular-nums font-medium text-stone-900">{r.effective_date}</div>
                <div className="text-stone-500 text-[10px]">
                  by {r.created_by_name || "?"} on {r.created_at ? new Date(r.created_at).toLocaleDateString() : "?"}
                </div>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono tabular-nums text-stone-700">
                {parts.map((p, i) => <div key={i}>{p}</div>)}
              </div>
              {r.notes && <div className="mt-1 text-[11px] text-stone-600 italic">&ldquo;{r.notes}&rdquo;</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- The form -----------------------------------------------------

function AddOverrideForm({ repName, onCancel, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [aePct, setAePct] = useState("");
  const [aeResidualPct, setAeResidualPct] = useState("");
  const [aeResidualMonths, setAeResidualMonths] = useState("");
  const [csmPct, setCsmPct] = useState("");
  const [csmResidualMonths, setCsmResidualMonths] = useState("");
  const [acceleratorTarget, setAcceleratorTarget] = useState("");
  const [accel15xPct, setAccel15xPct] = useState("");
  const [accel2xPct, setAccel2xPct] = useState("");
  const [teamLeadOverridePct, setTeamLeadOverridePct] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const transformRate       = (s) => s.trim() === "" ? null : Number(s) / 100;
  const transformMultiplier = (s) => s.trim() === "" ? null : Number(s);
  const transformInt        = (s) => s.trim() === "" ? null : parseInt(s, 10);
  const transformDollar     = (s) => s.trim() === "" ? null : Number(s);

  const dbValues = {
    p_rep_name: repName,
    p_effective_date: effectiveDate,
    p_ae_pct: transformRate(aePct),
    p_ae_residual_pct: transformRate(aeResidualPct),
    p_ae_residual_months: transformInt(aeResidualMonths),
    p_csm_pct: transformRate(csmPct),
    p_csm_residual_months: transformInt(csmResidualMonths),
    p_accelerator_target: transformDollar(acceleratorTarget),
    p_accel_1_5x_pct: transformMultiplier(accel15xPct),
    p_accel_2x_pct: transformMultiplier(accel2xPct),
    p_team_lead_override_pct: transformRate(teamLeadOverridePct),
    p_notes: notes.trim() === "" ? null : notes,
  };

  const overrideFields = [
    dbValues.p_ae_pct, dbValues.p_ae_residual_pct, dbValues.p_ae_residual_months,
    dbValues.p_csm_pct, dbValues.p_csm_residual_months,
    dbValues.p_accelerator_target, dbValues.p_accel_1_5x_pct, dbValues.p_accel_2x_pct,
    dbValues.p_team_lead_override_pct,
  ];
  const hasAtLeastOne = overrideFields.some((v) => v !== null);
  const canSubmit = hasAtLeastOne && !submitting && Boolean(effectiveDate);
  const isPastDate = effectiveDate && effectiveDate < today;

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("upsert_rep_override", dbValues);
      if (rpcErr) throw rpcErr;
      await onSaved();
    } catch (e) {
      console.error("upsert_rep_override failed:", e);
      setError(e.message || String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 border border-stone-200 bg-stone-50/50 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Rep</div>
          <div className="text-sm font-medium text-stone-900">{repName}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Effective date</div>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={submitting}
            className="text-sm border border-stone-300 px-2 py-1 disabled:bg-stone-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
        Applies only to customers with start_date ≥ <strong>{effectiveDate || "?"}</strong>.
        Existing customers continue at their previously locked rate.
      </div>

      {isPastDate && (
        <div className="bg-red-50 border-2 border-red-300 px-3 py-2 text-[11px] text-red-900">
          <strong>⚠ Effective date is in the past</strong> — this will RETROACTIVELY apply to all customers with start_date in [{effectiveDate}, {today}]. Confirm you intend the backdating.
        </div>
      )}

      <FieldGroup title="AE compensation">
        <FieldRow label="AE Initial CC rate" helper="First cash month rate">
          <RateInput value={aePct} onChange={setAePct} placeholder="10" disabled={submitting} />
        </FieldRow>
        <FieldRow label="AE residual rate" helper="Subsequent months">
          <RateInput value={aeResidualPct} onChange={setAeResidualPct} placeholder="3" disabled={submitting} />
        </FieldRow>
        <FieldRow label="AE residual cap" helper="Months from start_date">
          <MonthsInput value={aeResidualMonths} onChange={setAeResidualMonths} placeholder="12" disabled={submitting} />
        </FieldRow>
      </FieldGroup>

      <FieldGroup title="CSM compensation">
        <FieldRow label="CSM residual rate" helper="Every month after first">
          <RateInput value={csmPct} onChange={setCsmPct} placeholder="3" disabled={submitting} />
        </FieldRow>
        <FieldRow label="CSM residual cap" helper="Months from start_date (blank = inherit)">
          <MonthsInput value={csmResidualMonths} onChange={setCsmResidualMonths} placeholder="12" disabled={submitting} />
        </FieldRow>
      </FieldGroup>

      <FieldGroup title="Accelerator">
        <FieldRow label="Accelerator target" helper="Annual variable comp goal">
          <DollarInput value={acceleratorTarget} onChange={setAcceleratorTarget} placeholder="60000" disabled={submitting} />
        </FieldRow>
        <FieldRow label="Accelerator at 1.2× target" helper="Tier 1 payout multiplier">
          <MultiplierInput value={accel15xPct} onChange={setAccel15xPct} placeholder="1.5" disabled={submitting} />
        </FieldRow>
        <FieldRow label="Accelerator at 1.5× target" helper="Tier 2 payout multiplier">
          <MultiplierInput value={accel2xPct} onChange={setAccel2xPct} placeholder="2.0" disabled={submitting} />
        </FieldRow>
      </FieldGroup>

      <FieldGroup title="Team Lead">
        <FieldRow label="Team lead override" helper="% of reports' commissions">
          <RateInput value={teamLeadOverridePct} onChange={setTeamLeadOverridePct} placeholder="2" disabled={submitting} />
        </FieldRow>
      </FieldGroup>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Notes (optional)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Why is this override being set?"
          className="w-full text-sm border border-stone-300 px-2 py-1 h-16 disabled:bg-stone-50 disabled:cursor-not-allowed"
        />
      </div>

      {hasAtLeastOne ? (
        <PreviewBlock
          dbValues={dbValues}
          rawInputs={{ aePct, aeResidualPct, csmPct, accel15xPct, accel2xPct, teamLeadOverridePct }}
        />
      ) : (
        <div className="text-[11px] text-stone-500 italic">
          Fill at least one override field to enable Save. Empty fields inherit from the default config.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-300 px-3 py-2 text-[11px] text-red-900">
          <strong>Save failed:</strong> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
        <Btn onClick={onCancel} variant="secondary" disabled={submitting}>Cancel</Btn>
        <Btn onClick={handleSave} variant="primary" disabled={!canSubmit}>
          {submitting ? "Saving…" : "Save override"}
        </Btn>
      </div>
    </div>
  );
}

// ============================================================
// SUBSCRIPTIONS TOOLTIP (Phase 3.5)
// ============================================================
function SubscriptionsTooltip({ subscriptions, children }) {
  if (!subscriptions || subscriptions.length === 0) return children;

  return (
    <span className="relative inline-block group">
      {children}
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none"
        style={{ minWidth: "260px", maxWidth: "340px" }}
      >
        <span className="block bg-stone-900 text-white text-[10px] rounded-sm px-3 py-2 shadow-lg text-left">
          <span className="block text-[9px] uppercase tracking-wider opacity-70 mb-1.5 font-medium">
            {subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"}
          </span>
          <span className="block max-h-[180px] overflow-y-auto">
            {subscriptions.map((s, i) => (
              <span key={s.id || i} className="block py-1 border-t border-stone-700 first:border-t-0">
                <span className="flex items-center justify-between gap-2 mb-0.5">
                  <SubscriptionPill status={s.status} size="xs" />
                  <span className="font-mono tabular-nums text-[10px] opacity-80">
                    {s.mrr > 0 ? `${fmtMoney(s.mrr)}/mo` : "—"}
                  </span>
                </span>
                <span className="block text-[10px] opacity-90 truncate" title={s.product_label}>
                  {s.product_label || "Subscription"}
                </span>
                <span className="block text-[9px] opacity-60 font-mono tabular-nums">
                  {s.status === "canceled" || s.status === "unpaid"
                    ? `Ended: ${fmtDate(s.canceled_at || s.ended_at)}`
                    : `Next bill: ${fmtDate(s.current_period_end)}`}
                </span>
              </span>
            ))}
          </span>
        </span>
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full block w-0 h-0"
          style={{
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1c1917",
          }}
        />
      </span>
    </span>
  );
}

// ============================================================
// SUBSCRIPTIONS INNER TABLE (Phase 3.5 + Phase 4.1)
// ============================================================
function SubscriptionsInnerTable({ subscriptions, stripeCustomerId }) {
  if (!subscriptions || subscriptions.length === 0) {
    return (
      <div className="px-20 py-3 text-[10px] text-stone-500 italic">
        No subscriptions on file for this customer.
      </div>
    );
  }
  const stripeUrl = stripeCustomerUrl(stripeCustomerId);

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-left text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
          <th className="px-4 py-1 pl-20 font-medium">Subscription ID</th>
          <th className="px-3 py-1 font-medium">Status</th>
          <th className="px-3 py-1 font-medium">Product</th>
          <th className="px-3 py-1 font-medium">Started</th>
          <th className="px-3 py-1 font-medium">Next Bill / Ended</th>
          <th className="px-3 py-1 font-medium text-right">MRR</th>
        </tr>
      </thead>
      <tbody>
        {subscriptions.map((s, i) => (
          <tr key={s.id || i} className="border-b border-stone-100 last:border-b-0">
            <td className="px-4 py-1.5 pl-20 font-mono text-[10px] truncate max-w-[180px]" title={s.id}>
              {s.id ? (
                stripeUrl ? (
                  <a
                    href={stripeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 transition-colors hover:underline"
                    style={{ color: BRAND.purple }}
                    title="Open this customer's profile in Stripe Dashboard"
                  >
                    {s.id}
                    <ExternalLink size={9} className="shrink-0 opacity-60" />
                  </a>
                ) : (
                  <span className="text-stone-500">{s.id}</span>
                )
              ) : (
                <span className="text-stone-400">—</span>
              )}
            </td>
            <td className="px-3 py-1.5">
              <SubscriptionPill status={s.status} size="xs" />
              {s.cancel_at_period_end && (
                <span className="ml-1 text-[9px] text-amber-700 italic" title="Subscription will cancel at period end">
                  (canceling)
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-stone-700">
              <div className="truncate max-w-[200px]" title={s.product_label}>
                {s.product_label || "—"}
              </div>
            </td>
            <td className="px-3 py-1.5 text-stone-600 font-mono tabular-nums whitespace-nowrap">
              {fmtDate(s.created)}
            </td>
            <td className="px-3 py-1.5 text-stone-600 font-mono tabular-nums whitespace-nowrap">
              {s.status === "canceled" || s.status === "unpaid"
                ? fmtDate(s.canceled_at || s.ended_at)
                : fmtDate(s.current_period_end)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-stone-700">
              {s.mrr > 0 ? fmtMoney(s.mrr) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// PER-CUSTOMER DRILL-DOWN ROW
// ============================================================
// Phase 4.1.2: "Initial" → "Initial CC" in cell tooltips/labels (data unchanged).
// ============================================================
export function CustomerDrilldownRow({ line, isAE, onMarkPaid }) {
  const [expanded, setExpanded] = useState(false);
  const c = line.customer;
  const subs = c.subscriptions || [];
  const hasMultipleSubs = subs.length > 1;

  let primarySub = subs.find(s => ["active", "trialing", "past_due"].includes(s.status));
  if (!primarySub && subs.length > 0) {
    primarySub = subs[subs.length - 1];
  }

  const productLabel = subs.length > 0
    ? subs.map(s => s.product_label).filter(Boolean).join(" · ")
    : "—";

  // colSpan for the inner expansion row.
  // AE: 10 cols (Customer, Status, Product, Next Bill, MRR, Cash, Initial CC, Residual, Total, Mark Paid)
  // CSM: 9 cols (no Initial CC column)
  const totalCols = isAE ? 10 : 9;

  const handleRowClick = () => setExpanded((e) => !e);

  const handleMarkPaidClick = (e) => {
    e.stopPropagation();
    if (onMarkPaid) onMarkPaid();
  };

  return (
    <>
      <tr
        className="border-b border-stone-100 bg-stone-50/30 hover:bg-stone-100/60 cursor-pointer transition-colors"
        onClick={handleRowClick}
        title={subs.length > 0 ? `Click to see all ${subs.length} subscription${subs.length === 1 ? "" : "s"}` : "Click for details"}
      >
        <td className="px-4 py-2 pl-12 text-stone-700">
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown size={11} className="text-stone-400 shrink-0" />
              : <ChevronRight size={11} className="text-stone-400 shrink-0" />}
            <div>
              <div className="font-medium text-sm">
                {c.name || <span className="text-stone-400 italic">{c.email}</span>}
              </div>
              <div className="text-[11px] text-stone-500 font-mono truncate max-w-[280px]">{c.email}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2">
          {primarySub ? (
            <SubscriptionsTooltip subscriptions={subs}>
              <span className="inline-flex items-center gap-1">
                <SubscriptionPill status={primarySub.status} />
                {hasMultipleSubs && (
                  <span
                    className="text-[10px] px-1 py-0 rounded-sm font-medium border"
                    style={{ background: BRAND.purpleTint, color: BRAND.purpleDeep, borderColor: BRAND.purpleTintMid }}
                  >
                    +{subs.length - 1}
                  </span>
                )}
              </span>
            </SubscriptionsTooltip>
          ) : (
            <span className="text-[10px] text-stone-400 italic">no sub</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-stone-600">
          <div className="truncate max-w-[180px]" title={productLabel}>{productLabel}</div>
        </td>
        <td className="px-3 py-2 text-xs text-stone-600 font-mono tabular-nums whitespace-nowrap">
          {fmtDate(c.current_period_end)}
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700 text-xs">
          {line.mrr > 0 ? fmtMoney(line.mrr) : <span className="text-stone-300">—</span>}
        </td>
        {/* Cash column — what actually arrived this month */}
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900 text-xs font-medium">
          {line.cashReceived > 0 ? fmtMoney(line.cashReceived) : <span className="text-stone-300">—</span>}
        </td>
        {isAE && (
          <td className="px-3 py-2 text-right font-mono tabular-nums text-xs" style={{ color: BRAND.purple }}>
            {line.voiceAICommission > 0 ? fmtMoney(line.voiceAICommission) : <span className="text-stone-300">—</span>}
          </td>
        )}
        <td className="px-3 py-2 text-right font-mono tabular-nums text-xs" style={{ color: BRAND.purple }}>
          {(line.aeResidual + line.csmResidual) > 0
            ? fmtMoney(line.aeResidual + line.csmResidual)
            : line.isPastResidualCap
              ? <span className="text-stone-400 text-[10px] italic" title="Past 12-month residual cap">capped</span>
              : <span className="text-stone-300">—</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-medium text-stone-900">
          {line.total > 0 ? fmtMoney(line.total) : <span className="text-stone-300">—</span>}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={handleMarkPaidClick}
            disabled={true}
            title="Mark Paid (coming in Phase 4)"
            className="text-[10px] px-2 py-0.5 border rounded-sm font-medium cursor-not-allowed"
            style={{ borderColor: BRAND.purpleTintMid, color: BRAND.purpleLight, background: BRAND.purpleTint }}
          >
            Mark Paid
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white border-b-2 border-stone-200">
          <td colSpan={totalCols} className="px-0 py-2">
            <SubscriptionsInnerTable
              subscriptions={subs}
              stripeCustomerId={c.stripe_customer_id}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// MONTH DRILLDOWN ROW (shared)
// ============================================================
// Phase 4.1.2: inner sub-header now has "Cash" + "Initial CC" headers.
// ============================================================
function MonthDrilldownRow({ monthData, isAE, expanded, onToggle, oneoffCommission = 0 }) {
  const m = monthData;
  const customerCount = m.customers?.length || 0;
  const expandable = customerCount > 0;

  return (
    <>
      <tr
        className={`border-b border-stone-100 ${expandable ? "cursor-pointer hover:bg-stone-50" : ""}`}
        onClick={expandable ? onToggle : undefined}
      >
        <td className="px-4 py-2 text-stone-700 font-mono tabular-nums text-xs">
          <div className="flex items-center gap-1.5">
            {expandable ? (
              expanded
                ? <ChevronDown size={12} className="text-stone-400" />
                : <ChevronRight size={12} className="text-stone-400" />
            ) : <span className="inline-block w-3" />}
            {monthLabel(m.month)}
            {customerCount > 0 && (
              <span className="text-[10px] text-stone-400 ml-1 font-sans">
                ({customerCount} customer{customerCount === 1 ? "" : "s"})
              </span>
            )}
          </div>
        </td>
        {isAE ? (
          <>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
              {m.newDeals || <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
              {m.newMRR > 0 ? fmtMoney(m.newMRR) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
              {m.voiceAINetSales > 0 ? fmtMoney(m.voiceAINetSales) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
              {m.voiceAICommission > 0 ? fmtMoney(m.voiceAICommission) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
              {m.aeResidual > 0 ? fmtMoney(m.aeResidual) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-stone-900">
              {m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
              {oneoffCommission > 0 ? fmtMoney(oneoffCommission) : <span className="text-stone-300">—</span>}
            </td>
          </>
        ) : (
          <>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
              {m.bookMRR > 0 ? fmtMoney(m.bookMRR) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
              {m.csmResidual > 0 ? fmtMoney(m.csmResidual) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-stone-900">
              {m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
              {oneoffCommission > 0 ? fmtMoney(oneoffCommission) : <span className="text-stone-300">—</span>}
            </td>
          </>
        )}
      </tr>
      {expanded && customerCount > 0 && (
        <>
          <tr className="bg-stone-100/70 border-b border-stone-200">
            <td colSpan={isAE ? 8 : 5} className="px-0 py-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                    <th className="px-4 py-1.5 pl-12 font-medium">Customer</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5 font-medium">Product</th>
                    <th className="px-3 py-1.5 font-medium">Next Bill</th>
                    <th className="px-3 py-1.5 font-medium text-right">MRR</th>
                    <th className="px-3 py-1.5 font-medium text-right">Cash</th>
                    {isAE && <th className="px-3 py-1.5 font-medium text-right">Initial CC</th>}
                    <th className="px-3 py-1.5 font-medium text-right">Residual</th>
                    <th className="px-4 py-1.5 font-medium text-right">Total</th>
                    <th className="px-3 py-1.5 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {m.customers.map((line) => (
                    <CustomerDrilldownRow
                      key={(line.customer.stripe_customer_id || line.customer.email) + ":" + m.month}
                      line={line}
                      isAE={isAE}
                      onMarkPaid={() => { /* Phase 4 wires this up */ }}
                    />
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </>
      )}
    </>
  );
}

// ============================================================
// OVERVIEW TAB (with expandable per-rep rows)
// ============================================================
function OverviewTab({ c, onJumpTo, oneoffs, collisions, repList }) {
  const [expandedRep, setExpandedRep] = useState(null);

  const stats = useMemo(() => {
    const paying = c.customers.filter((x) => !x.is_self_serve);
    const aeEra = paying.filter((x) => x.is_ae_era);
    const needsCSM = paying.filter((x) => {
      const a = c.assignments.find((a) =>
        (x.stripe_customer_id && a.stripe_customer_id === x.stripe_customer_id) ||
        (a.email?.toLowerCase() === x.email?.toLowerCase()));
      return !a?.csm;
    });
    const needsAE = aeEra.filter((x) => {
      const a = c.assignments.find((a) =>
        (x.stripe_customer_id && a.stripe_customer_id === x.stripe_customer_id) ||
        (a.email?.toLowerCase() === x.email?.toLowerCase()));
      return !a?.ae;
    });
    let totalThisMonth = 0;
    for (const rep of (repList?.all || [])) {
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols, null, null, repList);
      if (r.monthly.length > 0) totalThisMonth += r.monthly[r.monthly.length - 1].total;
    }
    return { paying, aeEra, needsCSM, needsAE, totalThisMonth };
  }, [c.customers, c.assignments, c.indexedAssignments, c.config, c.monthCols, repList]);

  const perRep = useMemo(() => (repList?.all || []).map((rep) => {
    const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols, null, null, repList);
    const ytd = r.monthly.reduce((s, m) => s + m.total, 0);
    const thisMonth = r.monthly[r.monthly.length - 1]?.total || 0;
    const oo = calcOneoffCommissionByRep(rep, oneoffs || [], c.monthCols, repList);
    const oneOffThisMonth = oo.monthly[oo.monthly.length - 1]?.oneoffCommission || 0;
    const oneOffYtd = oo.total;
    return { rep, isAE: r.isAE, bookSize: r.book.length, ytd, thisMonth, oneOffThisMonth, oneOffYtd };
  }), [c.customers, c.indexedAssignments, c.config, c.monthCols, oneoffs, repList]);

  const expandedRepCustomers = useMemo(() => {
    if (!expandedRep) return null;
    return calcRepCommissionByCustomer(
      expandedRep,
      c.customers,
      c.indexedAssignments,
      c.config,
      c.monthCols,
      c.indexedOverrides,
      c.matchedDealsByCustomer,
      repList,
    );
  }, [expandedRep, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer, repList]);

  const pendingUnmatched = c.unmatched.filter((u) => u.status === "pending");

  return (
    <div className="space-y-6">
      <CollisionBanner collisions={collisions} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-stone-200">
        <Stat label="Paying Customers" value={stats.paying.length}
              sub={`${c.customers.length - stats.paying.length} self-serve excluded`} />
        <Stat label="Commission This Month" value={fmtMoney(stats.totalThisMonth)}
              sub="All reps combined" accent={BRAND.purple} />
        <Stat label="Customers Needing AE" value={stats.needsAE.length}
              sub={`+ ${stats.needsCSM.length} need CSM`}
              accent={stats.needsAE.length > 0 ? "#b91c1c" : undefined} />
      </div>

      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-900">Commission by Rep · This Month + YTD</h3>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">
            Click ▸ to expand · Click name to drill in
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
              <th className="px-5 py-2.5 font-medium"></th>
              <th className="px-5 py-2.5 font-medium">Rep</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium text-right">Book</th>
              <th className="px-3 py-2.5 font-medium text-right">This Month</th>
              <th className="px-5 py-2.5 font-medium text-right">YTD Comm.</th>
              <th className="px-3 py-2.5 font-medium text-right">One-Off · This Mo.</th>
              <th className="px-5 py-2.5 font-medium text-right">One-Off · YTD</th>
            </tr>
          </thead>
          <tbody>
            {perRep.map((r) => {
              const expanded = expandedRep === r.rep;
              return (
                <React.Fragment key={r.rep}>
                  <tr className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-2 py-2.5 w-8">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedRep(expanded ? null : r.rep); }}
                        className="p-1 hover:bg-stone-200 rounded-sm transition-colors"
                        title={expanded ? "Collapse" : "Expand to see customer detail"}
                      >
                        {expanded
                          ? <ChevronDown size={12} className="text-stone-500" />
                          : <ChevronRight size={12} className="text-stone-500" />}
                      </button>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-stone-900 cursor-pointer"
                        onClick={() => onJumpTo("byRep", r.rep)}>{r.rep}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 border" style={r.isAE
                        ? { background: BRAND.purpleTint, color: BRAND.purpleDeep, borderColor: BRAND.purpleTintMid }
                        : { background: "#f5f5f4", color: "#44403c", borderColor: "#e7e5e4" }}>
                        {r.isAE ? "AE" : "CSM"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-700">{r.bookSize}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-900">{fmtMoney(r.thisMonth)}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums font-medium text-stone-900">{fmtMoney(r.ytd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium" style={{ color: BRAND.purple }}>
                      {r.oneOffThisMonth > 0 ? fmtMoney(r.oneOffThisMonth) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums font-medium" style={{ color: BRAND.purple }}>
                      {r.oneOffYtd > 0 ? fmtMoney(r.oneOffYtd) : <span className="text-stone-300">—</span>}
                    </td>
                  </tr>
                  {expanded && expandedRepCustomers && (
                    <tr className="border-b border-stone-200 bg-stone-50/50">
                      <td colSpan={8} className="px-0 py-0">
                        <RepCustomerYTDTable rows={expandedRepCustomers} isAE={r.isAE} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {stats.needsAE.length > 0 && (
        <div className="px-5 py-4 border" style={{ background: BRAND.purpleTint, borderColor: BRAND.purpleTintMid }}>
          <div className="flex items-start gap-3">
            <AlertCircle size={18} style={{ color: BRAND.purpleDeep }} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: BRAND.purpleDeep }}>
                {stats.needsAE.length} AE-era customers need an AE assigned
              </div>
              <div className="text-xs mt-0.5" style={{ color: BRAND.purpleDeep, opacity: 0.85 }}>
                Started on/after Nov 1, 2025. Without an AE, no commission is calculated.
              </div>
              <button onClick={() => onJumpTo("customers", null, "needsAE")}
                className="mt-2 text-xs font-medium underline underline-offset-2"
                style={{ color: BRAND.purpleDeep }}>Open list →</button>
            </div>
          </div>
        </div>
      )}

      {pendingUnmatched.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <Inbox size={18} className="text-stone-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-stone-900">
                {pendingUnmatched.length} CSM-tracker entries not matched to Stripe
              </div>
              <div className="text-xs text-stone-600 mt-0.5">
                Customers in Matt/Sean/Noah&rsquo;s trackers but missing from Stripe — likely cancelled,
                in onboarding, or email mismatch. Review on the Data Sync tab.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// REP-CUSTOMER YTD TABLE (Overview drill-down)
// ============================================================
function RepCustomerYTDTable({ rows, isAE }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="px-12 py-6 text-xs text-stone-500 italic">
        No customers in this rep&rsquo;s book yet.
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
          <th className="px-4 py-1.5 pl-12 font-medium">Customer</th>
          <th className="px-3 py-1.5 font-medium">Status</th>
          <th className="px-3 py-1.5 font-medium">Next Bill</th>
          <th className="px-3 py-1.5 font-medium text-right">Latest MRR</th>
          {isAE && <th className="px-3 py-1.5 font-medium text-right">Cash Collected</th>}
          {isAE && <th className="px-3 py-1.5 font-medium text-right">Initial CC</th>}
          <th className="px-3 py-1.5 font-medium text-right">Residual</th>
          <th className="px-4 py-1.5 font-medium text-right">YTD Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const c = row.customer;
          const subs = c.subscriptions || [];
          let primarySub = subs.find(s => ["active", "trialing", "past_due"].includes(s.status));
          if (!primarySub && subs.length > 0) primarySub = subs[subs.length - 1];
          return (
            <tr key={c.stripe_customer_id || c.email} className="border-b border-stone-100">
              <td className="px-4 py-1.5 pl-12 text-stone-900">
                <div className="font-medium">{c.name || <span className="text-stone-400 italic">—</span>}</div>
                <div className="text-[10px] text-stone-500 font-mono truncate max-w-[260px]">{c.email}</div>
              </td>
              <td className="px-3 py-1.5">
                {primarySub ? (
                  <SubscriptionsTooltip subscriptions={subs}>
                    <span className="inline-flex items-center gap-1">
                      <SubscriptionPill status={primarySub.status} />
                      {subs.length > 1 && (
                        <span
                          className="text-[10px] px-1 py-0 rounded-sm font-medium border"
                          style={{ background: BRAND.purpleTint, color: BRAND.purpleDeep, borderColor: BRAND.purpleTintMid }}
                        >
                          +{subs.length - 1}
                        </span>
                      )}
                    </span>
                  </SubscriptionsTooltip>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">no sub</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-[11px] text-stone-600 font-mono tabular-nums whitespace-nowrap">
                {fmtDate(c.current_period_end)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-stone-700">
                {row.latestMRR > 0 ? fmtMoney(row.latestMRR) : <span className="text-stone-300">—</span>}
              </td>
              {isAE && (
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-stone-700">
                  {row.cashCollected > 0 ? fmtMoney(row.cashCollected) : <span className="text-stone-300">—</span>}
                </td>
              )}
              {isAE && (
                <td className="px-3 py-1.5 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
                  {row.voiceAICommission > 0 ? fmtMoney(row.voiceAICommission) : <span className="text-stone-300">—</span>}
                </td>
              )}
              <td className="px-3 py-1.5 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
                {row.residual > 0 ? fmtMoney(row.residual) : <span className="text-stone-300">—</span>}
              </td>
              <td className="px-4 py-1.5 text-right font-mono tabular-nums font-medium text-stone-900">
                {row.total > 0 ? fmtMoney(row.total) : <span className="text-stone-300">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================
// CUSTOMERS TAB (unchanged)
// ============================================================
function CustomersTab({ c, initialFilter, ambiguousNames, repList }) {
  const [search, setSearch] = useState("");
  const [era, setEra] = useState("paying");
  const [needsFilter, setNeedsFilter] = useState(initialFilter || null);
  const latestMonth = c.monthCols[c.monthCols.length - 1];

  const findAssignment = (x) => c.assignments.find((a) =>
    (x.stripe_customer_id && a.stripe_customer_id === x.stripe_customer_id) ||
    (a.email?.toLowerCase() === x.email?.toLowerCase())
  ) || {};

  const filtered = useMemo(() => {
    let list = c.customers;
    if (era === "paying")     list = list.filter((x) => !x.is_self_serve);
    if (era === "ae-era")     list = list.filter((x) => !x.is_self_serve && x.is_ae_era);
    if (era === "self-serve") list = list.filter((x) =>  x.is_self_serve);
    if (needsFilter === "needsAE")  list = list.filter((x) => x.is_ae_era && !x.is_self_serve && !findAssignment(x).ae);
    if (needsFilter === "needsCSM") list = list.filter((x) => !x.is_self_serve && !findAssignment(x).csm);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((x) =>
        (x.name || "").toLowerCase().includes(q) || x.email.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  }, [c.customers, c.assignments, era, needsFilter, search]);

  const handleBulk = async (rep) => {
    if (!confirm(`Assign ALL ${filtered.length} filtered customers to ${rep} as AE?`)) return;
    try {
      await c.bulkAssignAE(filtered, rep);
    } catch (e) {
      alert(`Bulk assign failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-white border border-stone-200 px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input type="text" placeholder="Search name or email" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm pl-8 pr-3 py-1.5 border border-stone-200 focus:outline-none" />
        </div>
        <select value={era} onChange={(e) => setEra(e.target.value)}
                className="text-sm border border-stone-200 px-2 py-1.5 bg-white focus:outline-none">
          <option value="paying">Paying customers</option>
          <option value="ae-era">AE-era only</option>
          <option value="self-serve">Self-serve ($99)</option>
          <option value="all">All customers</option>
        </select>
        <select value={needsFilter || ""} onChange={(e) => setNeedsFilter(e.target.value || null)}
                className="text-sm border border-stone-200 px-2 py-1.5 bg-white">
          <option value="">All assignments</option>
          <option value="needsAE">Needs AE</option>
          <option value="needsCSM">Needs CSM</option>
        </select>
        <div className="text-xs text-stone-500 ml-auto font-mono tabular-nums">{filtered.length} customers</div>
      </div>

      {filtered.length > 0 && filtered.length < 350 && (
        <div className="flex gap-2 items-center text-xs">
          <span className="text-stone-500">Bulk assign filtered → AE:</span>
          {(repList?.AE || REPS.AE).map((r) => {
            const isAmbiguous = ambiguousNames && ambiguousNames.has(r);
            return (
              <button
                key={r}
                onClick={() => handleBulk(r)}
                disabled={isAmbiguous}
                title={isAmbiguous ? "Ambiguous first name — resolve collision before bulk-assigning" : undefined}
                className="px-2 py-1 border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: BRAND.purpleTintMid, color: BRAND.purpleDeep, background: BRAND.purpleTint }}
              >
                {r}{isAmbiguous ? " ⚠" : ""}
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Start</th>
              <th className="px-3 py-2.5 font-medium text-right">Latest MRR</th>
              <th className="px-3 py-2.5 font-medium text-right">Peak MRR</th>
              <th className="px-3 py-2.5 font-medium">AE</th>
              <th className="px-3 py-2.5 font-medium">CSM</th>
              <th className="px-3 py-2.5 font-medium">Era</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 600).map((x) => {
              const a = findAssignment(x);
              const latestMRR = x.monthly_mrr?.[latestMonth] || 0;
              return (
                <tr key={x.stripe_customer_id || x.email} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className="px-4 py-2">
                    <div className="font-medium text-stone-900 truncate max-w-[260px]">{x.name || x.email}</div>
                    <div className="text-[11px] text-stone-500 font-mono truncate max-w-[260px]">{x.email}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600 font-mono tabular-nums">{x.start_date || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">
                    {latestMRR > 0 ? fmtMoney(latestMRR) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-600">{fmtMoney(x.max_mrr)}</td>
                  <td className="px-3 py-2">{x.is_self_serve
                    ? <span className="text-[11px] text-stone-400">n/a</span>
                    : <RepSelect value={a.ae} type="AE" onChange={(v) => c.setAssignment(x, "ae", v)} ambiguousNames={ambiguousNames} repList={repList} />}</td>
                  <td className="px-3 py-2">{x.is_self_serve
                    ? <span className="text-[11px] text-stone-400">n/a</span>
                    : <RepSelect value={a.csm} type="CSM" onChange={(v) => c.setAssignment(x, "csm", v)} ambiguousNames={ambiguousNames} repList={repList} />}</td>
                  <td className="px-3 py-2">
                    {x.is_self_serve ? <span className="text-[11px] text-stone-500">Self-serve</span>
                      : x.is_ae_era   ? <span className="text-[11px]" style={{ color: BRAND.purpleDeep }}>AE-era</span>
                      :                 <span className="text-[11px] text-stone-500">Pre-AE</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 600 && (
          <div className="px-4 py-2 text-xs text-stone-500 border-t border-stone-100">
            Showing first 600 of {filtered.length} — narrow filter to see more.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// BY REP TAB (Phase 4.1.2: header labels Cash Collected + Initial CC)
// ============================================================
function ByRepTab({ c, initialRep, oneoffs, collisions, repList, isExecutive }) {
  const [selectedRep, setSelectedRep] = useState(initialRep || "Heather");
  const [expandedMonth, setExpandedMonth] = useState(null);

  const calc = useMemo(
    () => calcRepCommissionByCustomerByMonth(
      selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols,
      c.indexedOverrides, c.matchedDealsByCustomer, repList,
    ),
    [selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer, repList]
  );

  const ytd = useMemo(() => calc.monthly.reduce((a, m) => ({
    voiceAICommission: a.voiceAICommission + m.voiceAICommission,
    voiceAINetSales: a.voiceAINetSales + m.voiceAINetSales,
    aeResidual: a.aeResidual + m.aeResidual,
    csmResidual: a.csmResidual + m.csmResidual,
    total: a.total + m.total,
    newDeals: a.newDeals + m.newDeals,
    newMRR: a.newMRR + m.newMRR,
  }), { voiceAICommission: 0, voiceAINetSales: 0, aeResidual: 0, csmResidual: 0, total: 0, newDeals: 0, newMRR: 0 }), [calc]);
  const acc = useMemo(() => calc.isAE ? calcAccelerator(ytd.total, c.config) : null, [calc.isAE, ytd.total, c.config]);

  const oneoffCalc = useMemo(
    () => calcOneoffCommissionByRep(selectedRep, oneoffs || [], c.monthCols, repList),
    [selectedRep, oneoffs, c.monthCols, repList]
  );
  const oneoffByMonth = useMemo(
    () => Object.fromEntries((oneoffCalc.monthly || []).map((m) => [m.month, m.oneoffCommission])),
    [oneoffCalc]
  );
  const oneoffYtd = oneoffCalc.total;

  const exportCSV = () => {
    const rows = calc.isAE
      ? [["Month", "Deals", "New MRR", "Cash Collected", "Initial CC (10%)", "Residual (3%)", "Total"]]
      : [["Month", "Book MRR", "CSM (3%)", "Total"]];
    for (const m of calc.monthly) {
      if (calc.isAE) rows.push([m.month, m.newDeals, m.newMRR.toFixed(2), m.voiceAINetSales.toFixed(2), m.voiceAICommission.toFixed(2), m.aeResidual.toFixed(2), m.total.toFixed(2)]);
      else rows.push([m.month, m.bookMRR.toFixed(2), m.csmResidual.toFixed(2), m.total.toFixed(2)]);
    }
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${selectedRep}_commission.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <CollisionBanner collisions={collisions} />
      <div className="bg-white border border-stone-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-stone-500 font-medium mr-2">Rep</span>
        {(repList?.all || []).map((r) => {
          const ae = isAE(r, repList), active = selectedRep === r;
          return (
            <button key={r} onClick={() => { setSelectedRep(r); setExpandedMonth(null); }}
              className="text-sm px-3 py-1 border transition"
              style={active
                ? { background: BRAND.purple, color: "white", borderColor: BRAND.purple }
                : { background: "white", color: "#44403c", borderColor: "#e7e5e4" }}>
              {r} <span className="text-[10px] ml-1" style={{ opacity: active ? 0.7 : 0.5 }}>{ae ? "AE" : "CSM"}</span>
            </button>
          );
        })}
        <button onClick={exportCSV}
          className="ml-auto text-xs flex items-center gap-1.5 px-2.5 py-1 border border-stone-300 text-stone-700 hover:bg-stone-50">
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-stone-200">
        <Stat label="Book Size" value={calc.book.length} sub={calc.isAE ? "AE-attributed" : "In book"} />
        {calc.isAE ? (
          <>
            <Stat label="YTD New MRR" value={fmtMoney(ytd.newMRR)} sub={`${ytd.newDeals} deals`} />
            <Stat label="YTD Initial CC + Residual"
                  value={fmtMoney(ytd.voiceAICommission + ytd.aeResidual)}
                  sub={`${fmtMoney(ytd.voiceAICommission)} + ${fmtMoney(ytd.aeResidual)}`}
                  accent={BRAND.purple} />
            <Stat label="YTD Total" value={fmtMoney(ytd.total)}
                  sub={acc ? `${fmtPct(ytd.total / acc.target)} of target` : ""} />
          </>
        ) : (
          <>
            <Stat label="Book MRR (latest)"
                  value={fmtMoney(calc.monthly[calc.monthly.length - 1]?.bookMRR || 0)} sub="MRR" />
            <Stat label="This Month"
                  value={fmtMoney(calc.monthly[calc.monthly.length - 1]?.csmResidual || 0)} accent={BRAND.purple} />
            <Stat label="YTD Comm." value={fmtMoney(ytd.csmResidual)} sub="Across book" />
          </>
        )}
        <Stat
          label="YTD One-Off"
          value={oneoffYtd > 0 ? fmtMoney(oneoffYtd) : <span className="text-stone-300">—</span>}
          accent={BRAND.purple}
        />
      </div>

      {calc.isAE && acc && (
        <div className="bg-white border border-stone-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-stone-900">Annual Accelerator</h3>
            <span className="text-xs px-2 py-0.5" style={
              acc.status === "2x" ? { background: "#d1fae5", color: "#064e3b" } :
              acc.status === "1.5x" ? { background: BRAND.purpleTint, color: BRAND.purpleDeep } :
              acc.status === "ontarget" ? { background: "#f1f5f9", color: "#475569" } :
              { background: "#f5f5f4", color: "#57534e" }}>
              {acc.status === "2x" ? "★★ 2x" : acc.status === "1.5x" ? "★ 1.5x" : acc.status === "ontarget" ? "On Target" : "Below"}
            </span>
          </div>
          <div className="relative h-2 bg-stone-100 mb-1">
            <div className="absolute inset-y-0 left-0"
                 style={{ width: `${Math.min(100, (ytd.total / acc.t150) * 100)}%`, background: BRAND.purple }} />
            <div className="absolute inset-y-0" style={{ left: `${(acc.target / acc.t150) * 100}%`, width: "1px", background: "#a8a29e" }} />
            <div className="absolute inset-y-0" style={{ left: `${(acc.t120 / acc.t150) * 100}%`, width: "1px", background: "#a8a29e" }} />
          </div>
          <div className="flex justify-between text-[10px] text-stone-500 font-mono tabular-nums">
            <span>$0</span><span>{fmtMoney(acc.target)}</span>
            <span>{fmtMoney(acc.t120)}</span><span>{fmtMoney(acc.t150)}</span>
          </div>
          {acc.bonus > 0 && (
            <div className="mt-2 text-xs text-stone-700">
              Accelerator bonus: <span className="font-mono font-medium" style={{ color: BRAND.purple }}>{fmtMoney(acc.bonus)}</span>
            </div>
          )}
        </div>
      )}

      <RepOverridesPanel
        repName={selectedRep}
        c={c}
        isExecutive={isExecutive}
      />

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-900">Monthly Breakdown</h3>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Click a month to see customers · Click a customer to see all their subscriptions</span>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/50">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2 font-medium">Month</th>
              {calc.isAE ? (
                <>
                  <th className="px-3 py-2 font-medium text-right">Deals</th>
                  <th className="px-3 py-2 font-medium text-right">New MRR</th>
                  <th className="px-3 py-2 font-medium text-right">Cash Collected</th>
                  <th className="px-3 py-2 font-medium text-right">Initial CC (10%)</th>
                  <th className="px-3 py-2 font-medium text-right">Residual (3%)</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">One-Off</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-medium text-right">Book MRR</th>
                  <th className="px-3 py-2 font-medium text-right">3%</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">One-Off</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {calc.monthly.map((m) => (
              <MonthDrilldownRow
                key={m.month}
                monthData={m}
                isAE={calc.isAE}
                oneoffCommission={oneoffByMonth[m.month] || 0}
                expanded={expandedMonth === m.month}
                onToggle={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
              />
            ))}
            <tr className="border-t-2 border-stone-300 bg-stone-50/50 font-medium">
              <td className="px-4 py-2 text-stone-900 text-xs uppercase tracking-wider">YTD</td>
              {calc.isAE ? (
                <>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{ytd.newDeals}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtMoney(ytd.newMRR)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtMoney(ytd.voiceAINetSales)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.voiceAICommission)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.aeResidual)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmtMoney(ytd.total)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color: BRAND.purple }}>
                    {oneoffYtd > 0 ? fmtMoney(oneoffYtd) : <span className="text-stone-300">—</span>}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">—</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.csmResidual)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmtMoney(ytd.total)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color: BRAND.purple }}>
                    {oneoffYtd > 0 ? fmtMoney(oneoffYtd) : <span className="text-stone-300">—</span>}
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// WHAT-IF TAB
// ============================================================
function WhatIfTab({ c, repList }) {
  const [scenarios, setScenarios] = useState([
    { name: "Current",    config: { ...c.config }, locked: true },
    { name: "Scenario B", config: { ...c.config, aeResidualRate: 0.04, aeResidualMonths: 18 } },
  ]);

  const addScenario = () => {
    if (scenarios.length >= 4) return;
    setScenarios([...scenarios, {
      name: `Scenario ${String.fromCharCode(66 + scenarios.length - 1)}`,
      config: { ...c.config },
    }]);
  };
  const removeScenario = (i) => setScenarios(scenarios.filter((_, idx) => idx !== i));
  const updateScenario = (i, field, val) => {
    const next = [...scenarios];
    if (field === "name") next[i].name = val;
    else next[i].config = { ...next[i].config, [field]: parseFloat(val) || 0 };
    setScenarios(next);
  };

  const results = useMemo(() => scenarios.map((s) => {
    const byRep = {};
    let total = 0;
    for (const rep of (repList?.all || [])) {
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, s.config, c.monthCols, null, null, repList);
      const ytd = r.monthly.reduce((sum, m) => sum + m.total, 0);
      byRep[rep] = ytd;
      total += ytd;
    }
    return { ...s, byRep, total };
  }), [scenarios, c.customers, c.indexedAssignments, c.monthCols, repList]);

  const base = results[0];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-medium text-stone-900">What-If Comp Simulator</h2>
            <p className="text-xs text-stone-500 mt-0.5">Compare scenarios side-by-side. Deltas vs. Current.</p>
          </div>
          <Btn variant="ghost" onClick={addScenario} disabled={scenarios.length >= 4}>
            <Plus size={12} className="inline mr-1" /> Add scenario
          </Btn>
        </div>
      </div>

      <div className="grid gap-px bg-stone-200"
           style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(0, 1fr))` }}>
        {scenarios.map((s, i) => (
          <div key={i} className="bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <input value={s.name} onChange={(e) => updateScenario(i, "name", e.target.value)}
                className="text-sm font-medium bg-transparent border-b border-transparent hover:border-stone-200 focus:outline-none focus:border-stone-400 w-full"
                disabled={s.locked} />
              {!s.locked && <button onClick={() => removeScenario(i)} className="text-stone-400 hover:text-red-600"><X size={14} /></button>}
            </div>
            <div className="space-y-2 text-xs">
              {[
                ["aeVoiceRate",        "AE Initial CC rate %", 0.01],
                ["aeResidualRate",     "AE Residual %", 0.01],
                ["aeResidualMonths",   "AE Cap (mo.)",  1],
                ["csmRate",            "CSM rate %",    0.01],
                ["csmResidualMonths",  "CSM Cap (mo.)", 1],
              ].map(([k, label, step]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-stone-600">{label}</span>
                  <input type="number" step={step} value={s.config[k] ?? ""} disabled={s.locked}
                    onChange={(e) => updateScenario(i, k, e.target.value)}
                    className="w-20 text-right font-mono tabular-nums border border-stone-200 px-1.5 py-0.5 focus:outline-none disabled:bg-stone-50 disabled:text-stone-500" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">
            YTD Commission per Rep · {c.monthCols[0]} → {c.monthCols[c.monthCols.length - 1]}
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
              <th className="px-5 py-2.5 font-medium">Rep</th>
              {scenarios.map((s, i) => (
                <th key={i} className="px-3 py-2.5 font-medium text-right">
                  {s.name}{i > 0 && <span className="text-stone-400 ml-1">Δ</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(repList?.all || []).map((rep) => (
              <tr key={rep} className="border-b border-stone-100">
                <td className="px-5 py-2.5 font-medium text-stone-900">
                  {rep} <span className="text-[10px] text-stone-400">{isAE(rep, repList) ? "AE" : "CSM"}</span>
                </td>
                {results.map((r, i) => {
                  const val = r.byRep[rep];
                  const delta = i > 0 ? val - base.byRep[rep] : null;
                  return (
                    <td key={i} className="px-3 py-2.5 text-right font-mono tabular-nums">
                      <span className="text-stone-900">{fmtMoney(val)}</span>
                      {delta !== null && Math.abs(delta) > 1 && (
                        <span className="text-xs ml-1.5" style={{ color: delta > 0 ? "#15803d" : "#b91c1c" }}>
                          {delta > 0 ? "+" : ""}{fmtMoney(delta)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300 bg-stone-50/50 font-medium">
              <td className="px-5 py-2.5 text-xs uppercase tracking-wider">Total</td>
              {results.map((r, i) => {
                const delta = i > 0 ? r.total - base.total : null;
                return (
                  <td key={i} className="px-3 py-2.5 text-right font-mono tabular-nums">
                    <span className="font-semibold">{fmtMoney(r.total)}</span>
                    {delta !== null && Math.abs(delta) > 1 && (
                      <span className="text-xs ml-1.5" style={{ color: delta > 0 ? "#15803d" : "#b91c1c" }}>
                        {delta > 0 ? "+" : ""}{fmtMoney(delta)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border text-xs text-stone-600" style={{ background: BRAND.purpleTint, borderColor: BRAND.purpleTintMid }}>
        Scenarios are local — they don&rsquo;t change the live comp settings. Copy numbers into Settings to make active.
      </div>
    </div>
  );
}

// ============================================================
// ANNUALIZE TAB (unchanged)
// ============================================================
function AnnualizeTab({ c, repList }) {
  const [method, setMethod] = useState("hold");
  const [growth, setGrowth] = useState(5);
  const [planYear, setPlanYear] = useState(() => new Date().getFullYear());

  const projected = useMemo(() => {
    const planMonths = Array.from({ length: 12 }, (_, i) => `${planYear}-${String(i + 1).padStart(2, "0")}`);
    const actualSet = new Set(c.monthCols);
    const projMonths = planMonths.filter((m) => !actualSet.has(m));
    const allMonths  = planMonths.filter((m) => actualSet.has(m) || projMonths.includes(m));

    const projCustomers = projectCustomers(c.customers, c.monthCols, projMonths, method, growth);

    return (repList?.all || []).map((rep) => {
      const r = calcRepCommission(rep, projCustomers, c.indexedAssignments, c.config, allMonths, null, null, repList);
      const yearTotal   = r.monthly.reduce((s, m) => s + m.total, 0);
      const actualTotal = r.monthly.filter((m) =>  actualSet.has(m.month)).reduce((s, m) => s + m.total, 0);
      const projTotal   = r.monthly.filter((m) => !actualSet.has(m.month)).reduce((s, m) => s + m.total, 0);
      const acc = isAE(rep, repList) ? calcAccelerator(yearTotal, c.config) : null;
      return { rep, isAE: isAE(rep, repList), yearTotal, actualTotal, projTotal, acc };
    });
  }, [c.customers, c.indexedAssignments, c.config, c.monthCols, method, growth, planYear, repList]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 px-5 py-4">
        <h2 className="text-sm font-medium text-stone-900">Year-End Annualizer</h2>
        <p className="text-xs text-stone-500 mt-0.5 mb-3">
          Project full-year earnings by extending current MRR forward. Useful for accelerator forecasting.
        </p>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-stone-600">Plan year</span>
            <input type="number" value={planYear}
              onChange={(e) => setPlanYear(parseInt(e.target.value) || 2026)}
              className="w-20 border border-stone-200 px-2 py-1 font-mono tabular-nums focus:outline-none" />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-stone-600">Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="border border-stone-200 px-2 py-1 focus:outline-none">
              <option value="hold">Hold current MRR</option>
              <option value="growth">Apply growth rate</option>
            </select>
          </label>
          {method === "growth" && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-stone-600">Annual growth</span>
              <input type="number" step="1" value={growth}
                onChange={(e) => setGrowth(parseFloat(e.target.value) || 0)}
                className="w-16 border border-stone-200 px-2 py-1 font-mono tabular-nums focus:outline-none" />
              <span className="text-xs text-stone-500">%</span>
            </label>
          )}
        </div>
      </div>

      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-900">Projected Full-Year {planYear} per Rep</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
              <th className="px-5 py-2.5 font-medium">Rep</th>
              <th className="px-3 py-2.5 font-medium text-right">Actual YTD</th>
              <th className="px-3 py-2.5 font-medium text-right">Projected Remaining</th>
              <th className="px-3 py-2.5 font-medium text-right">Full-Year Total</th>
              <th className="px-5 py-2.5 font-medium text-right">Accelerator</th>
            </tr>
          </thead>
          <tbody>
            {projected.map((p) => (
              <tr key={p.rep} className="border-b border-stone-100">
                <td className="px-5 py-3 font-medium text-stone-900">
                  {p.rep} <span className="text-[10px] text-stone-400">{p.isAE ? "AE" : "CSM"}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-stone-700">{fmtMoney(p.actualTotal)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums" style={{ color: BRAND.purpleLight }}>{fmtMoney(p.projTotal)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-stone-900">{fmtMoney(p.yearTotal)}</td>
                <td className="px-5 py-3 text-right">
                  {p.isAE && p.acc ? (
                    <div className="inline-flex flex-col items-end gap-0.5">
                      <span className="text-xs px-1.5 py-0.5 inline-block" style={
                        p.acc.status === "2x"        ? { background: "#d1fae5", color: "#064e3b" } :
                        p.acc.status === "1.5x"      ? { background: BRAND.purpleTint, color: BRAND.purpleDeep } :
                        p.acc.status === "ontarget"  ? { background: "#f1f5f9", color: "#475569" } :
                        { background: "#f5f5f4", color: "#57534e" }}>
                        {p.acc.status === "2x" ? "★★ 2x earn" : p.acc.status === "1.5x" ? "★ 1.5x earn" : p.acc.status === "ontarget" ? "On Target" : "Below"}
                      </span>
                      {p.acc.bonus > 0 && <span className="text-[10px] font-mono text-stone-500">+{fmtMoney(p.acc.bonus)} bonus</span>}
                    </div>
                  ) : <span className="text-stone-300 text-xs">n/a</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300 bg-stone-50/50 font-medium">
              <td className="px-5 py-2.5 text-xs uppercase tracking-wider">Total</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtMoney(projected.reduce((s, p) => s + p.actualTotal, 0))}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: BRAND.purpleLight }}>{fmtMoney(projected.reduce((s, p) => s + p.projTotal, 0))}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">{fmtMoney(projected.reduce((s, p) => s + p.yearTotal, 0))}</td>
              <td className="px-5 py-2.5 text-right text-xs text-stone-500">+{fmtMoney(projected.reduce((s, p) => s + (p.acc?.bonus || 0), 0))} bonus</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// DATA TAB (unchanged)
// ============================================================
function DataTab({ c, isExecutive }) {
  const [syncMsg, setSyncMsg] = useState(null);
  const [importMsg, setImportMsg] = useState(null);

  const handleSync = async () => {
    setSyncMsg({ kind: "info", text: "Syncing from Stripe…" });
    try {
      const result = await c.triggerStripeSync();
      setSyncMsg({ kind: "ok", text: `Synced ${result.customers_upserted} customers in ${result.duration_ms}ms.${result.errors?.length ? ` ${result.errors.length} warnings.` : ""}` });
    } catch (e) {
      setSyncMsg({ kind: "err", text: e.message || "Sync failed" });
    }
  };

  const handleCSV = (file) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsed = parseStripeCSV(results.data);
          setImportMsg({ kind: "ok", text: `Parsed ${parsed.customers.length} customers across ${parsed.meta.month_cols.length} months. To persist, use Stripe Sync or the SQL upsert (see deployment doc).` });
        } catch (e) {
          setImportMsg({ kind: "err", text: e.message });
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-stone-900 flex items-center gap-2">
            <Zap size={14} style={{ color: BRAND.purple }} /> Stripe Sync
          </h3>
          {c.lastSyncAt && (
            <span className="text-xs text-stone-500 font-mono">last: {new Date(c.lastSyncAt).toLocaleString()}</span>
          )}
        </div>
        <p className="text-xs text-stone-600 mb-3">
          Pulls customers + subscriptions from Stripe and rebuilds the monthly MRR matrix.
          Assignments are preserved across syncs (matched by Stripe customer ID, then email).
        </p>
        <Btn variant="primary" onClick={handleSync} disabled={c.syncing}>
          <RefreshCw size={12} className={`inline mr-1.5 ${c.syncing ? "animate-spin" : ""}`} />
          {c.syncing ? "Syncing…" : "Sync from Stripe now"}
        </Btn>
        {syncMsg && (
          <div className="mt-3 px-3 py-2 text-xs border" style={
            syncMsg.kind === "ok"  ? { background: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" } :
            syncMsg.kind === "err" ? { background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" } :
                                     { background: BRAND.purpleTint, borderColor: BRAND.purpleTintMid, color: BRAND.purpleDeep }}>
            {syncMsg.text}
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 px-5 py-4">
        <h3 className="text-sm font-medium text-stone-900 mb-3 flex items-center gap-2">
          <FileText size={14} /> CSV Preview (optional)
        </h3>
        <p className="text-xs text-stone-600 mb-3">
          Parses a Stripe MRR export to verify the format. Doesn&rsquo;t write to the database — use Stripe Sync for that.
        </p>
        <label className="inline-block px-3 py-1.5 border border-stone-300 text-sm cursor-pointer hover:bg-stone-50">
          <Plus size={12} className="inline mr-1" /> Choose CSV
          <input type="file" accept=".csv" className="hidden"
            onChange={(e) => { if (e.target.files[0]) handleCSV(e.target.files[0]); }} />
        </label>
        {importMsg && (
          <div className="mt-3 px-3 py-2 text-xs border" style={importMsg.kind === "ok"
            ? { background: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }
            : { background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}>
            {importMsg.text}
          </div>
        )}
      </div>

      {c.unmatched.filter((u) => u.status === "pending").length > 0 && (
        <div className="bg-white border border-stone-200">
          <div className="px-5 py-3 border-b border-stone-200">
            <h3 className="text-sm font-medium text-stone-900">
              Unmatched CSM-Tracker Entries ({c.unmatched.filter((u) => u.status === "pending").length})
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Customers in trackers but not in Stripe. Mark resolved or ignored once reviewed.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <th className="px-4 py-2 font-medium">Rep</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {c.unmatched.filter((u) => u.status === "pending").map((u) => (
                <tr key={u.id} className="border-b border-stone-100">
                  <td className="px-4 py-2 font-medium">{u.rep}</td>
                  <td className="px-4 py-2">{u.customer_name || "—"}</td>
                  <td className="px-4 py-2 text-xs font-mono text-stone-600">{u.email}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => c.resolveUnmatched(u.id, { status: "resolved", note: "matched" })}
                            className="text-xs px-2 py-1 border border-stone-300 hover:bg-stone-50 mr-1">Mark resolved</button>
                    <button onClick={() => c.resolveUnmatched(u.id, { status: "ignored", note: "ignored" })}
                            className="text-xs px-2 py-1 border border-stone-300 hover:bg-stone-50">Ignore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// resolveRepProfile — first-name string → profile.id, matching
// the same convention used by commissionEngine.js
// (o.assigned_ae === profile.name.split(' ')[0]). Returns a
// tagged result so callers distinguish "no rep selected" from
// "no profile" from "first-name collision (ambiguous)".
// ------------------------------------------------------------
function resolveRepProfile(repFirstName, profiles) {
  if (!repFirstName) return { id: null, status: "unassigned" };
  const matches = (profiles || []).filter(
    (pf) => (pf.name || "").split(" ")[0] === repFirstName
  );
  if (matches.length === 0) return { id: null, status: "no_profile" };
  if (matches.length > 1) return { id: null, status: "ambiguous", count: matches.length };
  return { id: matches[0].id, status: "ok" };
}

// ============================================================
// ONE-OFFS TAB — exec-only, include/exclude controls (Phase 4.3 Step 5)
// ============================================================
// Shows captured one-off (non-invoice) Stripe charges from
// oneoff_payments. Each row can be opened to assign AE/CSM + rate
// and included in commission via set_oneoff_inclusion (SECURITY
// DEFINER, exec-gated server-side).
// ============================================================
function OneOffsTab({ profiles, o, ambiguousNames, repList }) {
  const [editingChargeId, setEditingChargeId] = useState(null);

  if (o.loading) {
    return (
      <div className="text-center text-stone-500 text-sm py-12">
        Loading one-off payments…
      </div>
    );
  }
  if (o.error) {
    return (
      <div className="bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-900">
        <strong>Failed to load one-off payments.</strong> {o.error}
      </div>
    );
  }

  const rows = o.oneoffs;
  const includedCount = rows.filter((r) => r.included_in_commission).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-stone-900">One-Off Payments</h2>
          <div className="text-xs text-stone-500 mt-0.5">
            {rows.length} captured · {includedCount} included in commission
          </div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium">Cash Month</th>
              <th className="px-3 py-2 font-medium text-right">Refunded</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone-500 text-sm italic">
                  No one-off payments captured yet.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <OneOffRow
                  key={p.stripe_charge_id}
                  payment={p}
                  profiles={profiles}
                  ambiguousNames={ambiguousNames}
                  repList={repList}
                  isEditing={editingChargeId === p.stripe_charge_id}
                  onOpenEdit={() => setEditingChargeId(p.stripe_charge_id)}
                  onCloseEdit={() => setEditingChargeId(null)}
                  reload={o.reload}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// OneOffRow — one payment + (when expanded) the include form
// ------------------------------------------------------------
function OneOffRow({ payment: p, profiles, ambiguousNames, repList, isEditing, onOpenEdit, onCloseEdit, reload }) {
  const netAmount = Math.max(0, (p.amount || 0) - (p.amount_refunded || 0));
  const isIncluded = !!p.included_in_commission;

  return (
    <>
      <tr className="border-b border-stone-100 last:border-b-0">
        <td className="px-4 py-2 text-stone-700">
          {p.customer_name || <span className="text-stone-400 italic">—</span>}
        </td>
        <td className="px-3 py-2 text-stone-600 font-mono text-[11px] truncate max-w-[240px]" title={p.customer_email}>
          {p.customer_email || <span className="text-stone-400">—</span>}
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">
          {fmtMoney(p.amount || 0)}
        </td>
        <td className="px-3 py-2 text-stone-600 font-mono tabular-nums text-xs">
          {p.cash_month ? monthLabel(p.cash_month) : <span className="text-stone-400">—</span>}
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-600 text-xs">
          {p.amount_refunded > 0 ? fmtMoney(p.amount_refunded) : <span className="text-stone-300">—</span>}
        </td>
        <td className="px-3 py-2">
          {isIncluded ? (
            <span
              className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm"
              style={{ background: BRAND.purpleTint, color: BRAND.purpleDeep }}
            >
              Included
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-stone-100 text-stone-500">
              Not included
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {isEditing ? (
            <button
              type="button"
              onClick={onCloseEdit}
              className="text-[10px] px-2 py-1 border font-medium border-stone-200 text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenEdit}
              className="text-[10px] px-2 py-1 border font-medium"
              style={{ borderColor: BRAND.purpleTintMid, color: BRAND.purple, background: BRAND.purpleTint }}
            >
              {isIncluded ? "Edit" : "Include"}
            </button>
          )}
        </td>
      </tr>
      {isEditing && (
        <tr className="bg-stone-50 border-b border-stone-200">
          <td colSpan={7} className="px-4 py-4">
            <OneOffIncludeForm
              payment={p}
              profiles={profiles}
              ambiguousNames={ambiguousNames}
              repList={repList}
              netAmount={netAmount}
              onCancel={onCloseEdit}
              onSaved={async () => { onCloseEdit(); await reload(); }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------
// OneOffIncludeForm — assignments, rates, preview, and the
// single rpc call that writes the inclusion decision.
// ------------------------------------------------------------
function OneOffIncludeForm({ payment: p, profiles, ambiguousNames, repList, netAmount, onCancel, onSaved }) {
  // Convert stored decimal rate (0.10) back to display percentage ("10").
  const decimalToPctStr = (r) =>
    r != null ? String(+(r * 100).toFixed(2)) : "";

  const [assignedAe, setAssignedAe] = useState(p.assigned_ae || null);
  const [assignedCsm, setAssignedCsm] = useState(p.assigned_csm || null);
  const [aeRateInput, setAeRateInput] = useState(decimalToPctStr(p.ae_commission_rate));
  const [csmRateInput, setCsmRateInput] = useState(decimalToPctStr(p.csm_commission_rate));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const aeRatePct = parseFloat(aeRateInput);
  const csmRatePct = parseFloat(csmRateInput);
  const aeRateValid = !isNaN(aeRatePct) && aeRatePct >= 0 && aeRatePct <= 100;
  const csmRateValid = !isNaN(csmRatePct) && csmRatePct >= 0 && csmRatePct <= 100;

  const aeResolution = resolveRepProfile(assignedAe, profiles);
  const csmResolution = resolveRepProfile(assignedCsm, profiles);

  const aePreview = (assignedAe && aeRateValid) ? netAmount * (aeRatePct / 100) : null;
  const csmPreview = (assignedCsm && csmRateValid) ? netAmount * (csmRatePct / 100) : null;

  const aeReady = !assignedAe || (aeRateValid && aeResolution.status === "ok");
  const csmReady = !assignedCsm || (csmRateValid && csmResolution.status === "ok");
  const hasAtLeastOne = !!assignedAe || !!assignedCsm;
  const canSubmit = hasAtLeastOne && aeReady && csmReady && !submitting;

  const handleInclude = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("set_oneoff_inclusion", {
        p_charge_id: p.stripe_charge_id,
        p_include: true,
        p_assigned_ae: assignedAe || null,
        p_assigned_csm: assignedCsm || null,
        p_ae_rate: assignedAe ? (aeRatePct / 100) : null,
        p_csm_rate: assignedCsm ? (csmRatePct / 100) : null,
        p_assigned_ae_id: assignedAe ? aeResolution.id : null,
        p_assigned_csm_id: assignedCsm ? csmResolution.id : null,
      });
      if (rpcErr) throw rpcErr;
      await onSaved();
    } catch (e) {
      console.error("set_oneoff_inclusion (include) failed:", e);
      setError(e.message || String(e));
      setSubmitting(false);
    }
  };

  const handleExclude = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("set_oneoff_inclusion", {
        p_charge_id: p.stripe_charge_id,
        p_include: false,
        p_assigned_ae: null,
        p_assigned_csm: null,
        p_ae_rate: null,
        p_csm_rate: null,
        p_assigned_ae_id: null,
        p_assigned_csm_id: null,
      });
      if (rpcErr) throw rpcErr;
      await onSaved();
    } catch (e) {
      console.error("set_oneoff_inclusion (exclude) failed:", e);
      setError(e.message || String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-stone-500">
        Net amount (after refund):{" "}
        <span className="font-mono tabular-nums font-medium text-stone-900">{fmtMoney(netAmount)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AE column */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">AE</div>
          <div className="flex items-center gap-2">
            <RepSelect type="AE" value={assignedAe} onChange={setAssignedAe} disabled={submitting} ambiguousNames={ambiguousNames} repList={repList} />
            {assignedAe && (
              <>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={aeRateInput}
                  onChange={(e) => setAeRateInput(e.target.value)}
                  placeholder="rate"
                  disabled={submitting}
                  className="w-20 text-xs border border-stone-200 px-1.5 py-0.5 focus:outline-none focus:border-stone-400"
                />
                <span className="text-xs text-stone-500">%</span>
              </>
            )}
          </div>
          {assignedAe && aeRateValid && (
            <div className="text-[11px] text-stone-600 font-mono tabular-nums">
              {fmtMoney(netAmount)} × {aeRatePct}% ={" "}
              <span className="font-medium" style={{ color: BRAND.purple }}>{fmtMoney(aePreview)}</span>
            </div>
          )}
          {assignedAe && !aeRateValid && aeRateInput !== "" && (
            <div className="text-[11px] text-red-700">Rate must be between 0 and 100.</div>
          )}
          {assignedAe && aeResolution.status === "no_profile" && (
            <div className="text-[11px] text-red-700">
              No profile found for AE "{assignedAe}". Reconcile profile.name (case + spelling) before including.
            </div>
          )}
          {assignedAe && aeResolution.status === "ambiguous" && (
            <div className="text-[11px] text-red-700">
              {aeResolution.count} profiles match AE "{assignedAe}". First names must be unique — disambiguate before including.
            </div>
          )}
        </div>

        {/* CSM column */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">CSM</div>
          <div className="flex items-center gap-2">
            <RepSelect type="CSM" value={assignedCsm} onChange={setAssignedCsm} disabled={submitting} ambiguousNames={ambiguousNames} repList={repList} />
            {assignedCsm && (
              <>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={csmRateInput}
                  onChange={(e) => setCsmRateInput(e.target.value)}
                  placeholder="rate"
                  disabled={submitting}
                  className="w-20 text-xs border border-stone-200 px-1.5 py-0.5 focus:outline-none focus:border-stone-400"
                />
                <span className="text-xs text-stone-500">%</span>
              </>
            )}
          </div>
          {assignedCsm && csmRateValid && (
            <div className="text-[11px] text-stone-600 font-mono tabular-nums">
              {fmtMoney(netAmount)} × {csmRatePct}% ={" "}
              <span className="font-medium" style={{ color: BRAND.purple }}>{fmtMoney(csmPreview)}</span>
            </div>
          )}
          {assignedCsm && !csmRateValid && csmRateInput !== "" && (
            <div className="text-[11px] text-red-700">Rate must be between 0 and 100.</div>
          )}
          {assignedCsm && csmResolution.status === "no_profile" && (
            <div className="text-[11px] text-red-700">
              No profile found for CSM "{assignedCsm}". Reconcile profile.name (case + spelling) before including.
            </div>
          )}
          {assignedCsm && csmResolution.status === "ambiguous" && (
            <div className="text-[11px] text-red-700">
              {csmResolution.count} profiles match CSM "{assignedCsm}". First names must be unique — disambiguate before including.
            </div>
          )}
        </div>
      </div>

      {!hasAtLeastOne && (
        <div className="text-[11px] text-stone-500 italic">
          Assign at least one rep (AE or CSM) to include this payment.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-900">
          <strong>Failed to save.</strong> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
        <Btn onClick={onCancel} variant="secondary" disabled={submitting}>Cancel</Btn>
        {p.included_in_commission && (
          <Btn onClick={handleExclude} variant="danger" disabled={submitting}>
            {submitting ? "Saving…" : "Exclude"}
          </Btn>
        )}
        <Btn onClick={handleInclude} variant="primary" disabled={!canSubmit}>
          {submitting ? "Saving…" : "Confirm & Include"}
        </Btn>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS TAB (Phase 4.1.2: labels match Initial CC convention)
// ============================================================
function SettingsTab({ c }) {
  const [draft, setDraft] = useState(c.config);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const update = (k, v) => setDraft({ ...draft, [k]: parseFloat(v) || 0 });

  const save = async () => {
    setSaving(true);
    try {
      await c.saveConfig(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">AE Compensation · Heather, Mason</h3>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          {[
            ["aeVoiceRate",        "Initial CC rate (first cash month)", 0.01],
            ["aeResidualRate",     "AE residual rate (subsequent months)", 0.01],
            ["aeResidualMonths",   "AE cap (months from start)", 1],
            ["acceleratorTarget",  "Annual variable target ($)", 1000],
          ].map(([k, label, step]) => (
            <label key={k} className="flex flex-col">
              <span className="text-xs text-stone-600 mb-1">{label}</span>
              <input type="number" step={step} value={draft[k] ?? ""} onChange={(e) => update(k, e.target.value)}
                className="border border-stone-200 px-2 py-1.5 font-mono tabular-nums focus:outline-none" />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">CSM Compensation · Matt, Sean, Noah</h3>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col">
            <span className="text-xs text-stone-600 mb-1">Monthly residual rate</span>
            <input type="number" step="0.01" value={draft.csmRate ?? ""}
              onChange={(e) => update("csmRate", e.target.value)}
              className="border border-stone-200 px-2 py-1.5 font-mono tabular-nums focus:outline-none" />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-stone-600 mb-1">CSM cap (months from start)</span>
            <input type="number" step="1" value={draft.csmResidualMonths ?? ""}
              onChange={(e) => update("csmResidualMonths", e.target.value)}
              className="border border-stone-200 px-2 py-1.5 font-mono tabular-nums focus:outline-none" />
          </label>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Btn variant="primary" onClick={save} disabled={saving}>
          {savedFlash ? <><Check size={12} className="inline mr-1" /> Saved</> : saving ? "Saving…" : "Save changes"}
        </Btn>
        <Btn onClick={() => setDraft(c.config)}>Discard</Btn>
      </div>
    </div>
  );
}
