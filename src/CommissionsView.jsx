// ============================================================
// CommissionsView — top-level view for the Commission Tracker
// ============================================================
// Rendered when viewMode === 'commissions'. Has its own standalone header
// (CommissionsHeader, defined at the bottom of this file) which mirrors the
// nav row used by Leadership / Manager / Shared pages — so the user can
// always navigate OUT of the Commission Tracker.
//
// Sub-tabs:
//   overview — KPIs, per-rep table, alerts (needs-AE, unmatched)
//   customers — assignment workspace
//   byRep — drill-in per rep, monthly breakdown, accelerator
//   whatif — scenario simulator
//   annualize — full-year projection
//   data — Stripe sync + CSV import
//   settings — comp config (executive-only)
// ============================================================

import React, { useState, useMemo, useEffect } from "react";
import {
  TrendingUp, Users, DollarSign, AlertCircle, Settings, Download,
  GitCompare, Calendar, Zap, FileText, Check, X, Plus,
  RefreshCw, Search, Inbox,
  Edit3, Trash2, Loader2, CheckCircle2, Clock, ExternalLink, ChevronRight,
  LogOut, LayoutDashboard, UserCircle2, Lightbulb, Plug, UserMinus, Crown,
  Settings as SettingsIcon,
} from "lucide-react";
import Papa from "papaparse";

import AtlasLogo from "./AtlasLogo";
import SettingsModal from "./SettingsModal";
import { supabase } from "./supabase";
import { useGlassInteraction } from "./hooks/useGlassInteraction.js";
import { useCommissions } from "./useCommissions";
import {
  ALL_REPS, REPS, isAE,
  calcRepCommission, calcAccelerator, calcTeamLeadOverride, aeCustomerLifetimeProjection,
  projectCustomers, parseStripeCSV,
  monthLabel, fmtMoney, fmtPct, DEFAULT_CONFIG,
} from "./commissionEngine";
import { findBestMatch, buildAutoMatchOps } from "./dealMatcher";
import { accessTier, isLeadershipRole } from "./teams";

const BRAND = {
  purple: "#6639a6",
  purpleDeep: "#4d2a7e",
  purpleLight: "#9171c4",
  purpleTint: "#f3eefb",
  purpleTintMid: "#e4d8f4",
};

export default function CommissionsView({
  profile,
  onSignOut,
  onSwitchToSelf,
  onSwitchToManager,
  onSwitchToFeatureRequests,
  onSwitchToIntegrations,
  onSwitchToCancellations,
  onSwitchToApiGuide,
  onSwitchToLeadership,
  onProfileUpdated,
}) {
  const tier = accessTier(profile);
  const isExecutive = tier === "executive";
  const canSeeManagerView = tier === "executive" || tier === "team_lead";
  const canGoToSelf = !isLeadershipRole(profile?.role_type);
  const [showSettings, setShowSettings] = useState(false);
  const c = useCommissions();
  const [tab, setTab] = useState("overview");
  const [jumpRep, setJumpRep] = useState(null);
  const [needsFilter, setNeedsFilter] = useState(null);

  if (c.loading) {
    return (
      <CommissionsHeader
        profile={profile}
        onSignOut={onSignOut}
        onSwitchToSelf={onSwitchToSelf}
        onSwitchToManager={onSwitchToManager}
        onSwitchToFeatureRequests={onSwitchToFeatureRequests}
        onSwitchToIntegrations={onSwitchToIntegrations}
        onSwitchToCancellations={onSwitchToCancellations}
        onSwitchToApiGuide={onSwitchToApiGuide}
        onSwitchToLeadership={onSwitchToLeadership}
        canSeeManagerView={canSeeManagerView}
        canGoToSelf={canGoToSelf}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        onProfileUpdated={onProfileUpdated}
      >
        <div className="max-w-7xl mx-auto px-6 py-12 text-center text-stone-500 text-sm">
          Loading commission data…
        </div>
      </CommissionsHeader>
    );
  }
  if (c.error) {
    return (
      <CommissionsHeader
        profile={profile}
        onSignOut={onSignOut}
        onSwitchToSelf={onSwitchToSelf}
        onSwitchToManager={onSwitchToManager}
        onSwitchToFeatureRequests={onSwitchToFeatureRequests}
        onSwitchToIntegrations={onSwitchToIntegrations}
        onSwitchToCancellations={onSwitchToCancellations}
        onSwitchToApiGuide={onSwitchToApiGuide}
        onSwitchToLeadership={onSwitchToLeadership}
        canSeeManagerView={canSeeManagerView}
        canGoToSelf={canGoToSelf}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        onProfileUpdated={onProfileUpdated}
      >
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-900">
            <strong>Failed to load commission data.</strong> {c.error}
          </div>
        </div>
      </CommissionsHeader>
    );
  }

  const jumpTo = (newTab, rep, filter) => {
    setTab(newTab);
    if (rep) setJumpRep(rep);
    if (filter) setNeedsFilter(filter);
  };

  const tabs = [
    { id: "overview",     label: "Overview",      icon: TrendingUp },
    { id: "customers",    label: "Customers",     icon: Users },
    { id: "pendingDeals", label: "Pending Deals", icon: Inbox },
    { id: "byRep",        label: "By Rep",        icon: DollarSign },
    { id: "whatif",       label: "What-If",       icon: GitCompare },
    { id: "annualize",    label: "Annualize",     icon: Calendar },
    { id: "data",         label: "Data Sync",     icon: Zap },
    ...(isExecutive ? [{ id: "settings", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <CommissionsHeader
      profile={profile}
      onSignOut={onSignOut}
      onSwitchToSelf={onSwitchToSelf}
      onSwitchToManager={onSwitchToManager}
      onSwitchToFeatureRequests={onSwitchToFeatureRequests}
      onSwitchToIntegrations={onSwitchToIntegrations}
      onSwitchToCancellations={onSwitchToCancellations}
      onSwitchToApiGuide={onSwitchToApiGuide}
      onSwitchToLeadership={onSwitchToLeadership}
      canSeeManagerView={canSeeManagerView}
      canGoToSelf={canGoToSelf}
      showSettings={showSettings}
      setShowSettings={setShowSettings}
      onProfileUpdated={onProfileUpdated}
    >
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="mono-font text-[10.5px] uppercase tracking-[0.18em] font-semibold text-stone-500">
            Sales &amp; CS · commission ledger
          </div>
          <h1 className="display-font text-4xl md:text-5xl font-medium text-stone-900 mt-1">
            Where the team is <em className="display-font-i font-normal" style={{ color: '#6639a6' }}>earning</em>
          </h1>
          <p className="text-stone-600 mt-3 max-w-2xl">
            Every paying customer attributed to a rep, with live commission math.
            Heather and Mason earn on AE deals; Matt, Sean, and Noah earn on their CSM book.
          </p>
          <div className="text-xs text-stone-500 mt-3 mono-font">
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

        {tab === "overview"     && <OverviewTab     c={c} onJumpTo={jumpTo} />}
        {tab === "customers"    && <CustomersTab    c={c} initialFilter={needsFilter} />}
        {tab === "pendingDeals" && <PendingDealsTab c={c} profile={profile} />}
        {tab === "byRep"        && <ByRepTab        c={c} initialRep={jumpRep} />}
        {tab === "whatif"       && <WhatIfTab       c={c} />}
        {tab === "annualize"    && <AnnualizeTab    c={c} />}
        {tab === "data"         && <DataTab         c={c} isExecutive={isExecutive} />}
        {tab === "settings"     && isExecutive && <SettingsTab c={c} />}
      </div>
    </CommissionsHeader>
  );
}

// ============================================================
// SHARED UI
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

function RepSelect({ value, onChange, type, disabled }) {
  const options = type === "AE" ? REPS.AE : REPS.CSM;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}
      className="text-xs bg-transparent border border-stone-200 px-1.5 py-0.5 hover:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:cursor-not-allowed">
      <option value="">—</option>
      {options.map((r) => <option key={r} value={r}>{r}</option>)}
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
// OVERVIEW TAB
// ============================================================
function OverviewTab({ c, onJumpTo }) {
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
    for (const rep of ALL_REPS) {
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer);
      if (r.monthly.length > 0) totalThisMonth += r.monthly[r.monthly.length - 1].total;
    }
    // Add TL override earnings for any team leads (they earn on top of their direct)
    for (const p of (c.profiles || [])) {
      if (!p.is_team_lead) continue;
      const tl = calcTeamLeadOverride(
        p, c.profiles, c.customers, c.indexedAssignments,
        c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer,
      );
      if (tl.monthly.length > 0) totalThisMonth += tl.monthly[tl.monthly.length - 1].total;
    }
    return { paying, aeEra, needsCSM, needsAE, totalThisMonth };
  }, [c.customers, c.assignments, c.indexedAssignments, c.config, c.monthCols, c.profiles, c.indexedOverrides, c.matchedDealsByCustomer]);

  const perRep = useMemo(() => ALL_REPS.map((rep) => {
    const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer);
    const ytd = r.monthly.reduce((s, m) => s + m.total, 0);
    const thisMonth = r.monthly[r.monthly.length - 1]?.total || 0;

    // Compute TL override earnings if this rep is a team lead
    // Look up the rep's profile to get the team lead flag
    const profile = (c.profiles || []).find((p) =>
      (p.name || "").split(" ")[0] === rep
    );
    let tlOverrideYTD = 0;
    let tlOverrideThisMonth = 0;
    let tlOverrideByReport = {};
    if (profile?.is_team_lead) {
      const tlCalc = calcTeamLeadOverride(
        profile,
        c.profiles,
        c.customers,
        c.indexedAssignments,
        c.config,
        c.monthCols,
        c.indexedOverrides,
        c.matchedDealsByCustomer,
      );
      tlOverrideYTD = tlCalc.totalOverride;
      tlOverrideThisMonth = tlCalc.monthly[tlCalc.monthly.length - 1]?.total || 0;
      tlOverrideByReport = tlCalc.byReport;
    }

    return {
      rep, isAE: r.isAE, bookSize: r.book.length,
      ytd, thisMonth,
      tlOverrideYTD, tlOverrideThisMonth, tlOverrideByReport,
      isTeamLead: !!profile?.is_team_lead,
      totalYTD: ytd + tlOverrideYTD,
      totalThisMonth: thisMonth + tlOverrideThisMonth,
    };
  }), [c.customers, c.indexedAssignments, c.config, c.monthCols, c.profiles, c.indexedOverrides, c.matchedDealsByCustomer]);

  const pendingUnmatched = c.unmatched.filter((u) => u.status === "pending");

  return (
    <div className="space-y-6">
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
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Click row to drill in</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
              <th className="px-5 py-2.5 font-medium">Rep</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium text-right">Book</th>
              <th className="px-3 py-2.5 font-medium text-right">This Month</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Team Lead override earnings — % of reports' commissions">TL Override (YTD)</th>
              <th className="px-5 py-2.5 font-medium text-right">YTD Total</th>
            </tr>
          </thead>
          <tbody>
            {perRep.map((r) => (
              <tr key={r.rep} className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                  onClick={() => onJumpTo("byRep", r.rep)}>
                <td className="px-5 py-2.5 font-medium text-stone-900">
                  {r.rep}
                  {r.isTeamLead && (
                    <span className="ml-1.5 inline-flex items-center text-[9px] mono-font px-1 py-0.5 rounded font-medium" style={{ background: BRAND.purpleTint, color: BRAND.purpleDeep }}>
                      TL
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs px-1.5 py-0.5 border" style={r.isAE
                    ? { background: BRAND.purpleTint, color: BRAND.purpleDeep, borderColor: BRAND.purpleTintMid }
                    : { background: "#f5f5f4", color: "#44403c", borderColor: "#e7e5e4" }}>
                    {r.isAE ? "AE" : "CSM"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-700">{r.bookSize}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-900">
                  {fmtMoney(r.thisMonth)}
                  {r.tlOverrideThisMonth > 0 && (
                    <div className="text-[10px] mt-0.5" style={{ color: BRAND.purple }}>
                      + {fmtMoney(r.tlOverrideThisMonth)} TL
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: r.tlOverrideYTD > 0 ? BRAND.purple : "#a8a29e" }}>
                  {r.tlOverrideYTD > 0 ? fmtMoney(r.tlOverrideYTD) : <span className="text-stone-300">—</span>}
                </td>
                <td className="px-5 py-2.5 text-right font-mono tabular-nums font-medium text-stone-900">{fmtMoney(r.totalYTD)}</td>
              </tr>
            ))}
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
// CUSTOMERS TAB
// ============================================================
function CustomersTab({ c, initialFilter }) {
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
          {REPS.AE.map((r) => (
            <button key={r} onClick={() => handleBulk(r)} className="px-2 py-1 border"
              style={{ borderColor: BRAND.purpleTintMid, color: BRAND.purpleDeep, background: BRAND.purpleTint }}>
              {r}
            </button>
          ))}
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
                    : <RepSelect value={a.ae} type="AE" onChange={(v) => c.setAssignment(x, "ae", v)} />}</td>
                  <td className="px-3 py-2">{x.is_self_serve
                    ? <span className="text-[11px] text-stone-400">n/a</span>
                    : <RepSelect value={a.csm} type="CSM" onChange={(v) => c.setAssignment(x, "csm", v)} />}</td>
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
// PENDING DEALS TAB
// ============================================================
// Manager-facing inbox of AE-submitted deals awaiting Stripe match.
// Lets you:
//   - Filter by status / AE / search
//   - Edit AE submission (especially email, to match Stripe billing)
//   - Pick the matching Stripe customer from a searchable dropdown
//   - Confirm the match (locks the row, flows commission downstream)
//   - Mark "needs review" if the deal is questionable
//   - Delete the submission entirely
// ============================================================
function PendingDealsTab({ c, profile }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("submitted"); // submitted | matched | needs_review | all
  const [aeFilter, setAeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [matchingId, setMatchingId] = useState(null);
  const [autoMatchBusy, setAutoMatchBusy] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState(null);

  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("commission_pending_deals")
      .select("*")
      .order("closed_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDeals(); }, []);

  // Pull distinct AE names from the loaded deals for the filter dropdown
  const allAes = useMemo(() => {
    const set = new Set();
    deals.forEach(d => d.ae_name && set.add(d.ae_name));
    return [...set].sort();
  }, [deals]);

  // Filter the deals view
  const visible = useMemo(() => {
    let out = deals;
    if (filter !== "all") out = out.filter(d => d.status === filter);
    if (aeFilter !== "all") out = out.filter(d => d.ae_name === aeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(d =>
        (d.customer_name || "").toLowerCase().includes(q) ||
        (d.customer_email || "").toLowerCase().includes(q) ||
        (d.ae_name || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [deals, filter, aeFilter, search]);

  // Counts for the filter chips
  const counts = useMemo(() => {
    const byStatus = { submitted: 0, matched: 0, needs_review: 0, draft: 0 };
    for (const d of deals) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    byStatus.all = deals.length;
    return byStatus;
  }, [deals]);

  // KPIs
  const kpis = useMemo(() => {
    const pending = deals.filter(d => d.status === "submitted" || d.status === "needs_review");
    const matched = deals.filter(d => d.status === "matched");
    return {
      pendingCount: pending.length,
      pendingMRR: pending.reduce((s, d) => s + (Number(d.mrr_amount) || 0), 0),
      pendingUpfront: pending.reduce((s, d) => s + (Number(d.upfront_amount) || 0), 0),
      matchedCount: matched.length,
      matchedMRR: matched.reduce((s, d) => s + (Number(d.mrr_amount) || 0), 0),
    };
  }, [deals]);

  // Run the auto-matcher across all submitted deals.
  // - Builds operations via dealMatcher (pure JS)
  // - Writes back to DB (suggestions + auto-confirmed matches)
  // - For each auto-confirmed match, also writes the AE assignment (Phase 3.5 bridge)
  const handleRunAutoMatch = async () => {
    setAutoMatchBusy(true);
    setAutoMatchResult(null);

    const ops = buildAutoMatchOps(deals, c.customers, { autoConfirmExactEmail: "always" });

    let autoConfirmed = 0;
    let suggestionsAdded = 0;
    let noMatch = 0;

    for (const op of ops) {
      try {
        // Write the deal update
        const { error } = await supabase
          .from("commission_pending_deals")
          .update(op.fields)
          .eq("id", op.dealId);
        if (error) {
          console.error("Auto-match write failed for deal", op.dealId, error);
          continue;
        }

        if (op.autoConfirmed && op.match) {
          // Replicate Phase 3.5 bridge: create/update commission_assignments
          const dealRow = deals.find(d => d.id === op.dealId);
          const aeFirstName = (dealRow?.ae_name || "").split(" ")[0];
          const stripeId = op.match.customer.stripe_customer_id;
          if (aeFirstName && stripeId) {
            try {
              const { data: assignmentRow } = await supabase
                .from("commission_assignments")
                .select("*")
                .eq("stripe_customer_id", stripeId)
                .maybeSingle();
              if (assignmentRow) {
                await supabase
                  .from("commission_assignments")
                  .update({ ae: aeFirstName })
                  .eq("id", assignmentRow.id);
              } else {
                await supabase
                  .from("commission_assignments")
                  .insert({
                    stripe_customer_id: stripeId,
                    email: op.match.customer.email,
                    ae: aeFirstName,
                    csm: null,
                  });
              }
            } catch (assignErr) {
              console.error("Bridge write failed for auto-confirmed match:", assignErr);
            }
          }
          autoConfirmed++;
        } else if (op.fields.suggested_match_stripe_customer_id) {
          suggestionsAdded++;
        } else {
          noMatch++;
        }
      } catch (e) {
        console.error("Auto-match op failed:", e);
      }
    }

    setAutoMatchResult({ autoConfirmed, suggestionsAdded, noMatch });
    setAutoMatchBusy(false);
    await loadDeals();
  };

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-stone-500 text-sm">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Loading deal submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-900">
        Failed to load: {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200">
        <PendingKpi label="Awaiting your review" value={kpis.pendingCount}
          sub={`${fmtMoney(kpis.pendingMRR)} MRR · ${fmtMoney(kpis.pendingUpfront)} upfront`}
          icon={Clock} color="#1d4ed8" />
        <PendingKpi label="Matched & confirmed" value={kpis.matchedCount}
          sub={`${fmtMoney(kpis.matchedMRR)} MRR matched`}
          icon={CheckCircle2} color="#059669" />
        <PendingKpi label="Active AEs" value={allAes.length} sub="With at least 1 submission" icon={Users} color="#6639a6" />
        <PendingKpi label="Total submissions" value={deals.length} sub="All time" icon={Inbox} color="#57534e" />
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-stone-200 p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: "submitted",    label: "Awaiting review", color: "#1d4ed8" },
            { id: "needs_review", label: "Needs review",    color: "#b45309" },
            { id: "matched",      label: "Matched",         color: "#059669" },
            { id: "all",          label: "All",             color: "#57534e" },
          ].map(f => {
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 transition-colors ${active ? "text-white" : "border border-stone-200 text-stone-600 hover:border-stone-900"}`}
                style={active ? { background: f.color } : {}}>
                {f.label} <span className="opacity-70 ml-1">({counts[f.id] ?? 0})</span>
              </button>
            );
          })}
        </div>

        <div className="border-l border-stone-200 h-6" />

        <select value={aeFilter} onChange={(e) => setAeFilter(e.target.value)}
          className="text-xs border border-stone-200 px-2 py-1 bg-white focus:outline-none focus:border-stone-900">
          <option value="all">All AEs</option>
          {allAes.map(ae => <option key={ae} value={ae}>{ae}</option>)}
        </select>

        <div className="flex items-center flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 mr-2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, email, or AE..."
            className="w-full text-sm bg-transparent border-b border-transparent focus:border-stone-900 focus:outline-none py-1" />
        </div>

        <button onClick={handleRunAutoMatch} disabled={autoMatchBusy}
          title="Re-run auto-matching across all submitted deals"
          className="text-xs px-2.5 py-1 text-white rounded-sm hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-1"
          style={{ background: "#6639a6" }}>
          {autoMatchBusy
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Matching…</>
            : <><Zap className="w-3 h-3" /> Re-run auto-match</>}
        </button>

        <button onClick={loadDeals}
          className="text-xs px-2.5 py-1 border border-stone-200 text-stone-600 hover:border-stone-900 transition-colors inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Auto-match result banner */}
      {autoMatchResult && (
        <div className="px-4 py-3 border-l-4 bg-white" style={{ borderLeftColor: "#6639a6" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-stone-700">
              Auto-match completed:
              {" "}<span className="font-semibold text-emerald-700">{autoMatchResult.autoConfirmed} auto-confirmed</span>
              {" · "}<span className="font-semibold text-blue-700">{autoMatchResult.suggestionsAdded} suggestions added</span>
              {" · "}<span className="font-semibold text-stone-600">{autoMatchResult.noMatch} couldn't be matched</span>
            </div>
            <button onClick={() => setAutoMatchResult(null)} className="text-stone-400 hover:text-stone-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {visible.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 p-12 text-center">
          <Inbox className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <div className="text-sm text-stone-700 font-medium">
            {filter === "submitted" ? "Inbox zero" : "Nothing here"}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            {filter === "submitted"
              ? "No deals waiting for your review right now."
              : "No deals match the current filters."}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/50">
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <th className="px-4 py-2 font-medium">AE</th>
                <th className="px-3 py-2 font-medium">Closed</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">AE's email</th>
                <th className="px-3 py-2 font-medium text-right">MRR</th>
                <th className="px-3 py-2 font-medium text-right">Upfront</th>
                <th className="px-3 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(deal => (
                <PendingDealRow
                  key={deal.id}
                  deal={deal}
                  customers={c.customers}
                  profile={profile}
                  isEditing={editingId === deal.id}
                  isMatching={matchingId === deal.id}
                  onStartEdit={() => { setEditingId(deal.id); setMatchingId(null); }}
                  onStartMatch={() => { setMatchingId(deal.id); setEditingId(null); }}
                  onCancel={() => { setEditingId(null); setMatchingId(null); }}
                  onChanged={loadDeals}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PendingKpi({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white border border-stone-200 px-5 py-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</div>
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />}
      </div>
      <div className="text-2xl font-mono tabular-nums text-stone-900">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

// One row in the pending deals table — expands inline for edit/match
function PendingDealRow({ deal, customers, profile, isEditing, isMatching, onStartEdit, onStartMatch, onCancel, onChanged }) {
  const [busy, setBusy] = useState(false);
  const meta = {
    submitted:    { label: "Awaiting review",  color: "#1d4ed8", bg: "#dbeafe" },
    matched:      { label: "Matched",          color: "#065f46", bg: "#d1fae5" },
    needs_review: { label: "Needs review",     color: "#b45309", bg: "#fef3c7" },
    draft:        { label: "Draft (AE)",       color: "#78716c", bg: "#f5f5f4" },
  }[deal.status] || { label: deal.status, color: "#78716c", bg: "#f5f5f4" };

  // Find the matched customer record if any
  const matchedCustomer = useMemo(() => {
    if (!deal.matched_stripe_customer_id) return null;
    return customers.find(cu => cu.stripe_customer_id === deal.matched_stripe_customer_id);
  }, [deal.matched_stripe_customer_id, customers]);

  // Persisted suggestion from the auto-matcher (set when handleRunAutoMatch ran)
  const persistedSuggestion = useMemo(() => {
    if (!deal.suggested_match_stripe_customer_id) return null;
    const cu = customers.find(c => c.stripe_customer_id === deal.suggested_match_stripe_customer_id);
    if (!cu) return null;
    return { customer: cu, confidence: deal.match_confidence, method: deal.match_method, reason: deal.suggested_match_reason };
  }, [deal, customers]);

  // Live fallback if no persisted suggestion: compute one on the fly
  const liveSuggestion = useMemo(() => {
    if (deal.status === "matched") return null;
    if (persistedSuggestion) return null;
    return findBestMatch(deal, customers);
  }, [deal, customers, persistedSuggestion]);

  // Combined: prefer persisted (the manager's "official" suggestion), fall back to live
  const suggestion = persistedSuggestion || liveSuggestion;
  const emailSuggestion = suggestion?.customer || null;  // for legacy code paths below

  const handleNeedsReview = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("commission_pending_deals")
      .update({ status: "needs_review" })
      .eq("id", deal.id);
    setBusy(false);
    if (error) alert("Failed: " + error.message);
    else onChanged();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${deal.customer_name}" submitted by ${deal.ae_name}? Cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("commission_pending_deals")
      .delete()
      .eq("id", deal.id);
    setBusy(false);
    if (error) alert("Failed: " + error.message);
    else onChanged();
  };

  const handleUnmatch = async () => {
    if (!confirm(`Unmatch this deal and return to "Awaiting review"? This will also remove ${deal.ae_name} from the AE attribution on this customer.`)) return;
    setBusy(true);

    const previouslyMatchedId = deal.matched_stripe_customer_id;
    const aeFirstName = (deal.ae_name || "").split(" ")[0];

    // 1. Reset the pending deal
    const { error } = await supabase
      .from("commission_pending_deals")
      .update({
        status: "submitted",
        matched_stripe_customer_id: null,
        matched_at: null,
        matched_by: null,
        matched_by_name: null,
        match_method: null,
        match_confidence: null,
      })
      .eq("id", deal.id);

    if (error) {
      setBusy(false);
      alert("Failed: " + error.message);
      return;
    }

    // 2. Reverse the AE assignment we created during match
    // (only remove if the assignment is currently this AE — protect against
    // a manager having manually reassigned the customer to someone else)
    if (previouslyMatchedId && aeFirstName) {
      try {
        const { data: assignmentRow } = await supabase
          .from("commission_assignments")
          .select("*")
          .eq("stripe_customer_id", previouslyMatchedId)
          .maybeSingle();

        if (assignmentRow && assignmentRow.ae === aeFirstName) {
          if (assignmentRow.csm) {
            // Keep the CSM, just clear the AE
            await supabase
              .from("commission_assignments")
              .update({ ae: null })
              .eq("id", assignmentRow.id);
          } else {
            // No CSM either — delete the row entirely
            await supabase
              .from("commission_assignments")
              .delete()
              .eq("id", assignmentRow.id);
          }
        }
      } catch (e) {
        console.error("Failed to reverse assignment on unmatch:", e);
      }
    }

    setBusy(false);
    onChanged();
  };

  return (
    <>
      <tr className="border-b border-stone-100 hover:bg-stone-50/40">
        <td className="px-4 py-2 text-stone-700 text-sm font-medium whitespace-nowrap">{deal.ae_name}</td>
        <td className="px-3 py-2 text-stone-500 font-mono tabular-nums text-xs whitespace-nowrap">
          {new Date(deal.closed_date).toLocaleDateString()}
        </td>
        <td className="px-3 py-2 text-stone-900 text-sm">{deal.customer_name}</td>
        <td className="px-3 py-2 text-stone-600 text-xs font-mono">{deal.customer_email}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
          {Number(deal.mrr_amount) > 0 ? fmtMoney(Number(deal.mrr_amount)) : <span className="text-stone-300">—</span>}
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
          {Number(deal.upfront_amount) > 0 ? fmtMoney(Number(deal.upfront_amount)) : <span className="text-stone-300">—</span>}
        </td>
        <td className="px-3 py-2 text-xs">
          {matchedCustomer ? (
            <span className="inline-flex items-center gap-1 text-emerald-700"
              title={deal.matched_by_name === "Auto-matcher" ? "Auto-matched — review when convenient" : ""}>
              <CheckCircle2 className="w-3 h-3" />
              <span className="truncate max-w-[160px]">{matchedCustomer.name}</span>
              {deal.matched_by_name === "Auto-matcher" && (
                <span className="text-[9px] mono-font px-1 rounded text-violet-700" style={{ background: "#f3eefb" }}>auto</span>
              )}
            </span>
          ) : suggestion ? (
            <SuggestionPill suggestion={suggestion} />
          ) : (
            <span className="text-stone-400">No match yet</span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium"
            style={{ background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {busy ? (
            <Loader2 className="w-4 h-4 text-stone-400 animate-spin inline" />
          ) : (
            <div className="inline-flex items-center gap-1">
              {deal.status !== "matched" && (
                <button onClick={onStartMatch} title="Match to Stripe customer"
                  className="px-2 py-1 text-[11px] font-medium text-white rounded-sm transition-opacity hover:opacity-90"
                  style={{ background: "#6639a6" }}>
                  Match
                </button>
              )}
              {deal.status === "matched" && (
                <button onClick={handleUnmatch} title="Unmatch and return to inbox"
                  className="px-2 py-1 text-[11px] font-medium border border-stone-300 rounded-sm hover:bg-stone-100 transition-colors">
                  Unmatch
                </button>
              )}
              <button onClick={onStartEdit} title="Edit AE's submission"
                className="p-1 text-stone-500 hover:text-stone-900 transition-colors">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              {deal.status !== "matched" && deal.status !== "needs_review" && (
                <button onClick={handleNeedsReview} title="Flag for review"
                  className="p-1 text-stone-500 hover:text-amber-600 transition-colors">
                  <AlertCircle className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleDelete} title="Delete submission"
                className="p-1 text-stone-500 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Inline edit panel */}
      {isEditing && (
        <tr className="border-b border-stone-200" style={{ background: "#f8fafc" }}>
          <td colSpan={9} className="p-4">
            <EditDealPanel deal={deal} onCancel={onCancel} onSaved={() => { onChanged(); onCancel(); }} />
          </td>
        </tr>
      )}

      {/* Inline match panel */}
      {isMatching && (
        <tr className="border-b border-stone-200" style={{ background: "#faf7ff" }}>
          <td colSpan={9} className="p-4">
            <MatchDealPanel deal={deal} customers={customers}
              suggestion={emailSuggestion}
              suggestionMeta={suggestion}
              profile={profile} onCancel={onCancel}
              onMatched={() => { onChanged(); onCancel(); }} />
          </td>
        </tr>
      )}
    </>
  );
}

// Edit panel — manager-only, can edit anything except status/match fields
function EditDealPanel({ deal, onCancel, onSaved }) {
  const [form, setForm] = useState({
    customer_name:  deal.customer_name || "",
    customer_email: deal.customer_email || "",
    customer_phone: deal.customer_phone || "",
    mrr_amount:     deal.mrr_amount != null ? String(deal.mrr_amount) : "",
    upfront_amount: deal.upfront_amount != null ? String(deal.upfront_amount) : "",
    closed_date:    deal.closed_date || "",
    notes:          deal.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("commission_pending_deals")
      .update({
        customer_name:  form.customer_name.trim(),
        customer_email: form.customer_email.trim().toLowerCase(),
        customer_phone: form.customer_phone.trim() || null,
        mrr_amount:     Number(form.mrr_amount) || 0,
        upfront_amount: Number(form.upfront_amount) || 0,
        closed_date:    form.closed_date,
        notes:          form.notes.trim() || null,
      })
      .eq("id", deal.id);
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  };

  return (
    <div className="bg-white border-2 border-stone-300 rounded-sm">
      <div className="px-4 py-2 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
        <div className="text-xs font-medium text-stone-700">
          Editing <span className="font-semibold">{deal.ae_name}'s</span> submission
        </div>
        <button onClick={onCancel} className="text-stone-400 hover:text-stone-900"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <FormField label="Customer name">
          <input value={form.customer_name} onChange={(e) => update("customer_name", e.target.value)}
            className="w-full border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-stone-900" />
        </FormField>
        <FormField label="Email (AE-known)" hint="Edit to match Stripe billing email">
          <input value={form.customer_email} onChange={(e) => update("customer_email", e.target.value)}
            className="w-full border border-stone-300 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:border-stone-900" />
        </FormField>
        <FormField label="Closed">
          <input type="date" value={form.closed_date} onChange={(e) => update("closed_date", e.target.value)}
            className="w-full border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-stone-900" />
        </FormField>
        <FormField label="MRR">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">$</span>
            <input type="number" step="0.01" min="0" value={form.mrr_amount} onChange={(e) => update("mrr_amount", e.target.value)}
              className="w-full border border-stone-300 pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums focus:outline-none focus:border-stone-900" />
          </div>
        </FormField>
        <FormField label="Upfront">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">$</span>
            <input type="number" step="0.01" min="0" value={form.upfront_amount} onChange={(e) => update("upfront_amount", e.target.value)}
              className="w-full border border-stone-300 pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums focus:outline-none focus:border-stone-900" />
          </div>
        </FormField>
        <FormField label="Phone">
          <input value={form.customer_phone} onChange={(e) => update("customer_phone", e.target.value)}
            className="w-full border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-stone-900" />
        </FormField>
        <FormField label="Notes" className="md:col-span-3">
          <textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)}
            className="w-full border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-stone-900 resize-y" />
        </FormField>
      </div>
      {error && <div className="px-4 pb-2 text-xs text-red-700">{error}</div>}
      <div className="px-4 py-2 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy}
          className="px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 rounded-sm">Cancel</button>
        <button onClick={handleSave} disabled={busy}
          className="px-3 py-1.5 text-xs font-medium text-white rounded-sm hover:opacity-90"
          style={{ background: "#6639a6" }}>
          {busy ? <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> : <Check className="w-3 h-3 inline mr-1" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

// Match panel — pick a Stripe customer from a searchable list and confirm
function MatchDealPanel({ deal, customers, suggestion, suggestionMeta, profile, onCancel, onMatched }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(suggestion?.stripe_customer_id || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [secondaryEmail, setSecondaryEmail] = useState("");

  // Top 30 candidates by relevance
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dealEmail = (deal.customer_email || "").toLowerCase();
    const dealName = (deal.customer_name || "").toLowerCase();

    const scored = customers.map(cu => {
      const cuEmail = (cu.email || "").toLowerCase();
      const cuSecondary = (cu.secondary_email || "").toLowerCase();
      const cuName = (cu.name || "").toLowerCase();

      let score = 0;
      // Strong signal: email match
      if (cuEmail && cuEmail === dealEmail) score += 100;
      if (cuSecondary && cuSecondary === dealEmail) score += 90;
      // Medium signal: name match
      if (cuName && dealName && cuName === dealName) score += 50;
      if (cuName && dealName && cuName.includes(dealName)) score += 20;
      if (cuName && dealName && dealName.includes(cuName)) score += 15;
      // Search query
      if (q) {
        if (cuName.includes(q)) score += 10;
        if (cuEmail.includes(q)) score += 10;
        if (cuSecondary.includes(q)) score += 8;
      }
      return { cu, score };
    });

    let filtered = scored;
    if (q) filtered = filtered.filter(s => s.score > 0);
    // Always show selection at top if not in the filtered list
    if (selectedId && !filtered.some(s => s.cu.stripe_customer_id === selectedId)) {
      const found = scored.find(s => s.cu.stripe_customer_id === selectedId);
      if (found) filtered = [{ ...found, score: 1000 }, ...filtered];
    }
    return filtered.sort((a, b) => b.score - a.score).slice(0, 30).map(s => s.cu);
  }, [customers, search, deal, selectedId]);

  const selected = customers.find(cu => cu.stripe_customer_id === selectedId);

  const handleConfirm = async () => {
    if (!selectedId) {
      setError("Pick a Stripe customer first.");
      return;
    }
    setBusy(true);
    setError(null);

    // 1. Optionally save secondary_email on the Stripe customer record
    if (showSecondaryEmail && secondaryEmail.trim()) {
      const { error: secErr } = await supabase
        .from("commission_customers")
        .update({ secondary_email: secondaryEmail.trim().toLowerCase() })
        .eq("stripe_customer_id", selectedId);
      if (secErr) {
        setBusy(false);
        setError("Failed to save secondary email: " + secErr.message);
        return;
      }
    }

    // 2. Mark the deal as matched
    const { error } = await supabase
      .from("commission_pending_deals")
      .update({
        status: "matched",
        matched_stripe_customer_id: selectedId,
        matched_at: new Date().toISOString(),
        matched_by: profile.id,
        matched_by_name: profile.name || "Manager",
        match_method: "manual",
        match_confidence: 1.00,
      })
      .eq("id", deal.id);

    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    // 3. Bridge into commission_assignments — this is what flows the deal
    // into the AE's earnings on the Overview tab and the AE's scorecard.
    // The deal's ae_name is the first-name token; that's what the
    // assignment system uses.
    const aeFirstName = (deal.ae_name || "").split(" ")[0];
    if (aeFirstName && selected) {
      try {
        const existing = customers.find(cu => cu.stripe_customer_id === selectedId);
        if (existing) {
          // Look for an existing assignment for this customer
          const { data: assignmentRow } = await supabase
            .from("commission_assignments")
            .select("*")
            .eq("stripe_customer_id", selectedId)
            .maybeSingle();

          if (assignmentRow) {
            // Update existing assignment, keep CSM if already set
            await supabase
              .from("commission_assignments")
              .update({ ae: aeFirstName })
              .eq("id", assignmentRow.id);
          } else {
            // Create a new assignment row
            await supabase
              .from("commission_assignments")
              .insert({
                stripe_customer_id: selectedId,
                email: existing.email,
                ae: aeFirstName,
                csm: null,
              });
          }
        }
      } catch (e) {
        // Don't block the match if assignment write fails — just log and warn
        console.error("Failed to create AE assignment after match:", e);
        // Still proceed — the match itself succeeded
      }
    }

    setBusy(false);
    onMatched();
  };

  return (
    <div className="bg-white border-2 rounded-sm" style={{ borderColor: "#6639a6" }}>
      <div className="px-4 py-2 border-b border-stone-200 flex items-center justify-between" style={{ background: "#f3eefb" }}>
        <div className="text-xs font-medium" style={{ color: "#4d2a7e" }}>
          Match <span className="font-semibold">{deal.customer_name}</span> ({deal.customer_email}) to a Stripe customer
        </div>
        <button onClick={onCancel} className="text-stone-500 hover:text-stone-900"><X className="w-4 h-4" /></button>
      </div>

      {/* Auto-matcher suggestion reason */}
      {suggestionMeta && (
        <div className="px-4 py-2 border-b border-stone-200 text-xs"
          style={{ background: "#faf7ff", color: "#4d2a7e" }}>
          <span className="mono-font uppercase tracking-wider text-[10px] font-semibold mr-1.5">✨ Auto-suggestion:</span>
          {suggestionMeta.reason}
          {suggestionMeta.confidence != null && (
            <span className="ml-2 text-stone-500">
              · Confidence: {Math.round(suggestionMeta.confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {/* AE-submitted summary */}
      <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 text-xs text-stone-600">
        <span className="font-medium text-stone-700">{deal.ae_name}</span> submitted:
        {Number(deal.mrr_amount) > 0 && <> {fmtMoney(Number(deal.mrr_amount))}/mo MRR</>}
        {Number(deal.upfront_amount) > 0 && <> · {fmtMoney(Number(deal.upfront_amount))} upfront</>}
        {deal.notes && <> · <span className="italic">"{deal.notes}"</span></>}
      </div>

      <div className="p-4">
        {/* Search */}
        <div className="flex items-center gap-2 mb-3 border border-stone-200 px-2 py-1.5 bg-white">
          <Search className="w-4 h-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Stripe customers by name or email..."
            className="flex-1 text-sm bg-transparent focus:outline-none" autoFocus />
          {suggestion && !search && (
            <span className="text-[10px] uppercase tracking-wider text-blue-700">
              Auto-suggested: {suggestion.name}
            </span>
          )}
        </div>

        {/* Candidates list */}
        <div className="border border-stone-200 max-h-64 overflow-y-auto bg-white">
          {candidates.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500">
              No matches. Try a different search term.
            </div>
          ) : (
            candidates.map(cu => {
              const isSelected = cu.stripe_customer_id === selectedId;
              const isSuggested = suggestion && cu.stripe_customer_id === suggestion.stripe_customer_id;
              const emailMatches = (cu.email || "").toLowerCase() === (deal.customer_email || "").toLowerCase();
              const secondaryMatches = (cu.secondary_email || "").toLowerCase() === (deal.customer_email || "").toLowerCase();
              return (
                <button key={cu.stripe_customer_id}
                  onClick={() => setSelectedId(cu.stripe_customer_id)}
                  className={`w-full text-left px-3 py-2 border-b border-stone-100 last:border-b-0 transition-colors ${isSelected ? "" : "hover:bg-stone-50"}`}
                  style={isSelected ? { background: "#f3eefb", borderColor: "#6639a6" } : {}}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium text-stone-900 truncate">{cu.name}</div>
                        {emailMatches && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded text-emerald-800" style={{ background: "#d1fae5" }}>
                            ✓ email matches
                          </span>
                        )}
                        {secondaryMatches && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded text-emerald-800" style={{ background: "#d1fae5" }}>
                            ✓ secondary email matches
                          </span>
                        )}
                        {isSuggested && !emailMatches && !secondaryMatches && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded text-blue-800" style={{ background: "#dbeafe" }}>
                            ★ suggested
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 font-mono truncate mt-0.5">
                        {cu.email}
                        {cu.secondary_email && <> · <span className="italic">2nd: {cu.secondary_email}</span></>}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        Started {cu.start_date ? new Date(cu.start_date).toLocaleDateString() : "—"}
                        {Number(cu.max_mrr) > 0 && <> · peak {fmtMoney(Number(cu.max_mrr))}/mo MRR</>}
                        {cu.is_self_serve && <> · <span className="text-amber-700">self-serve</span></>}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "#6639a6" }} />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Secondary email helper */}
        {selected && (
          <div className="mt-3">
            {!showSecondaryEmail ? (
              <button onClick={() => { setShowSecondaryEmail(true); setSecondaryEmail(deal.customer_email); }}
                className="text-xs text-stone-600 hover:text-stone-900 underline inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> The Stripe billing email differs from {deal.ae_name}'s email — save it as secondary
              </button>
            ) : (
              <div className="border border-stone-200 bg-amber-50 p-3 rounded-sm">
                <label className="text-[10px] uppercase tracking-wider text-stone-600 font-medium block mb-1">
                  Save secondary email on {selected.name}
                </label>
                <div className="flex items-center gap-2">
                  <input value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)}
                    placeholder="e.g. owner@acmeroofing.com"
                    className="flex-1 border border-stone-300 px-2 py-1 text-sm font-mono focus:outline-none focus:border-stone-900" />
                  <button onClick={() => setShowSecondaryEmail(false)} className="text-stone-500 hover:text-stone-900 text-xs">cancel</button>
                </div>
                <div className="text-[11px] text-stone-600 mt-1">
                  This makes future deals from {deal.ae_name} (or anyone) using this email match automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">{error}</div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-stone-200 bg-stone-50 flex justify-between items-center gap-2 flex-wrap">
        <div className="text-xs text-stone-600">
          {selected ? <>Will match <span className="font-medium text-stone-900">{deal.customer_name}</span> → <span className="font-medium text-stone-900">{selected.name}</span></> : "Pick a customer above"}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy}
            className="px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 rounded-sm">Cancel</button>
          <button onClick={handleConfirm} disabled={busy || !selectedId}
            className="px-3 py-1.5 text-xs font-medium text-white rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#6639a6" }}>
            {busy ? <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 inline mr-1" />}
            Confirm match
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, hint, className = "", children }) {
  return (
    <div className={className}>
      <label className="block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-stone-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// Renders an auto-match suggestion as a colored pill with confidence.
// Color/icon vary by match method:
//   exact_email_primary   → emerald — strongest, billing-email match
//   exact_email_secondary → emerald — strong, secondary-email match
//   fuzzy_name_strong     → blue    — name very close
//   fuzzy_name_weak       → amber   — name only loosely matches; needs review
function SuggestionPill({ suggestion }) {
  const { customer, confidence, method, reason } = suggestion;
  const pct = Math.round((confidence || 0) * 100);

  let style, IconComp, label;
  if (method === "exact_email_primary" || method === "exact_email_secondary") {
    style = { background: "#d1fae5", color: "#065f46" };
    IconComp = CheckCircle2;
    label = method === "exact_email_primary" ? "Email ✓" : "Secondary ✓";
  } else if (method === "fuzzy_name_strong") {
    style = { background: "#dbeafe", color: "#1e40af" };
    IconComp = Search;
    label = `Name ${pct}%`;
  } else {
    style = { background: "#fef3c7", color: "#92400e" };
    IconComp = AlertCircle;
    label = `Weak ${pct}%`;
  }

  return (
    <div className="flex flex-col gap-0.5" title={reason || ""}>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium" style={style}>
        <IconComp className="w-3 h-3" />
        {label}
      </span>
      <span className="text-stone-600 truncate max-w-[160px] text-[11px]">{customer.name}</span>
    </div>
  );
}

// ============================================================
// BY REP TAB
// ============================================================
function ByRepTab({ c, initialRep }) {
  const [selectedRep, setSelectedRep] = useState(initialRep || "Heather");
  const calc = useMemo(
    () => calcRepCommission(selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer),
    [selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols]
  );

  // Look up the rep's profile to check if they're a team lead
  const selectedRepProfile = useMemo(() =>
    (c.profiles || []).find((p) => (p.name || "").split(" ")[0] === selectedRep),
    [selectedRep, c.profiles]
  );

  // If they're a team lead, compute their TL override earnings
  const tlOverrideCalc = useMemo(() => {
    if (!selectedRepProfile?.is_team_lead) return null;
    return calcTeamLeadOverride(
      selectedRepProfile,
      c.profiles,
      c.customers,
      c.indexedAssignments,
      c.config,
      c.monthCols,
      c.indexedOverrides,
      c.matchedDealsByCustomer,
    );
  }, [selectedRepProfile, c.profiles, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer]);
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

  const exportCSV = () => {
    const rows = calc.isAE
      ? [["Month", "Deals", "New MRR", "Voice AI Cash", "Voice AI 10%", "Residual 3%", "Total"]]
      : [["Month", "Book MRR", "CSM 3%", "Total"]];
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
      <div className="bg-white border border-stone-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-stone-500 font-medium mr-2">Rep</span>
        {ALL_REPS.map((r) => {
          const ae = isAE(r), active = selectedRep === r;
          return (
            <button key={r} onClick={() => setSelectedRep(r)}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200">
        <Stat label="Book Size" value={calc.book.length} sub={calc.isAE ? "AE-attributed" : "In book"} />
        {calc.isAE ? (
          <>
            <Stat label="YTD New MRR" value={fmtMoney(ytd.newMRR)} sub={`${ytd.newDeals} deals`} />
            <Stat label="YTD Voice AI + Residual"
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

      {/* Team Lead Override Earnings — only shown if rep is a team lead */}
      {tlOverrideCalc && tlOverrideCalc.totalOverride > 0 && (
        <div className="bg-white border border-stone-200">
          <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-stone-900">Team Lead Override Earnings</h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {selectedRep} earns a percentage of each report's commissions. Listed below per report.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">YTD Override</div>
              <div className="text-lg font-mono tabular-nums font-medium" style={{ color: BRAND.purple }}>
                {fmtMoney(tlOverrideCalc.totalOverride)}
              </div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-stone-50/50 border-b border-stone-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <th className="px-5 py-2 font-medium">Report</th>
                <th className="px-3 py-2 font-medium text-right">Their YTD Commission</th>
                <th className="px-3 py-2 font-medium text-right">{selectedRep}'s Override</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tlOverrideCalc.byReport).map(([reportName, breakdown]) => {
                const reportTotalCommission = breakdown.perMonth.reduce((s, m) => s + m.reportTotal, 0);
                return (
                  <tr key={reportName} className="border-b border-stone-100">
                    <td className="px-5 py-2 text-stone-900 font-medium">{reportName}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
                      {fmtMoney(reportTotalCommission)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>
                      {fmtMoney(breakdown.total)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-stone-300 bg-stone-50/50">
                <td className="px-5 py-2 text-[10px] uppercase tracking-wider font-medium">Total</td>
                <td className="px-3 py-2 text-right text-stone-400">—</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color: BRAND.purple }}>
                  {fmtMoney(tlOverrideCalc.totalOverride)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <div className="px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">Monthly Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/50">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2 font-medium">Month</th>
              {calc.isAE ? (
                <>
                  <th className="px-3 py-2 font-medium text-right">Deals</th>
                  <th className="px-3 py-2 font-medium text-right">New MRR</th>
                  <th className="px-3 py-2 font-medium text-right">Voice AI Cash</th>
                  <th className="px-3 py-2 font-medium text-right">10%</th>
                  <th className="px-3 py-2 font-medium text-right">3% Residual</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-medium text-right">Book MRR</th>
                  <th className="px-3 py-2 font-medium text-right">3%</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {calc.monthly.map((m) => (
              <tr key={m.month} className="border-b border-stone-100">
                <td className="px-4 py-2 text-stone-700 font-mono tabular-nums text-xs">{monthLabel(m.month)}</td>
                {calc.isAE ? (
                  <>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.newDeals || <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.newMRR > 0 ? fmtMoney(m.newMRR) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.voiceAINetSales > 0 ? fmtMoney(m.voiceAINetSales) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{m.voiceAICommission > 0 ? fmtMoney(m.voiceAICommission) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{m.aeResidual > 0 ? fmtMoney(m.aeResidual) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-stone-900">{m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.bookMRR > 0 ? fmtMoney(m.bookMRR) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{m.csmResidual > 0 ? fmtMoney(m.csmResidual) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-stone-900">{m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}</td>
                  </>
                )}
              </tr>
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
                </>
              ) : (
                <>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">—</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.csmResidual)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmtMoney(ytd.total)}</td>
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
function WhatIfTab({ c }) {
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
    for (const rep of ALL_REPS) {
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, s.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer);
      const ytd = r.monthly.reduce((sum, m) => sum + m.total, 0);
      byRep[rep] = ytd;
      total += ytd;
    }
    return { ...s, byRep, total };
  }), [scenarios, c.customers, c.indexedAssignments, c.monthCols]);

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
                ["aeVoiceRate",        "AE Voice AI %", 0.01],
                ["upfrontMultiplier",  "Upfront mult.", 0.1],
                ["aeResidualRate",     "AE Residual %", 0.01],
                ["aeResidualMonths",   "Residual mo.",  1],
                ["csmRate",            "CSM rate %",    0.01],
              ].map(([k, label, step]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-stone-600">{label}</span>
                  <input type="number" step={step} value={s.config[k]} disabled={s.locked}
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
            {ALL_REPS.map((rep) => (
              <tr key={rep} className="border-b border-stone-100">
                <td className="px-5 py-2.5 font-medium text-stone-900">
                  {rep} <span className="text-[10px] text-stone-400">{isAE(rep) ? "AE" : "CSM"}</span>
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
// ANNUALIZE TAB
// ============================================================
function AnnualizeTab({ c }) {
  const [method, setMethod] = useState("hold");
  const [growth, setGrowth] = useState(5);
  const [planYear, setPlanYear] = useState(() => new Date().getFullYear());

  const projected = useMemo(() => {
    const planMonths = Array.from({ length: 12 }, (_, i) => `${planYear}-${String(i + 1).padStart(2, "0")}`);
    const actualSet = new Set(c.monthCols);
    const projMonths = planMonths.filter((m) => !actualSet.has(m));
    const allMonths  = planMonths.filter((m) => actualSet.has(m) || projMonths.includes(m));

    const projCustomers = projectCustomers(c.customers, c.monthCols, projMonths, method, growth);

    return ALL_REPS.map((rep) => {
      const r = calcRepCommission(rep, projCustomers, c.indexedAssignments, c.config, allMonths, c.indexedOverrides, c.matchedDealsByCustomer);
      const yearTotal   = r.monthly.reduce((s, m) => s + m.total, 0);
      const actualTotal = r.monthly.filter((m) =>  actualSet.has(m.month)).reduce((s, m) => s + m.total, 0);
      const projTotal   = r.monthly.filter((m) => !actualSet.has(m.month)).reduce((s, m) => s + m.total, 0);
      const acc = isAE(rep) ? calcAccelerator(yearTotal, c.config) : null;
      return { rep, isAE: isAE(rep), yearTotal, actualTotal, projTotal, acc };
    });
  }, [c.customers, c.indexedAssignments, c.config, c.monthCols, method, growth, planYear]);

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
// DATA TAB (Stripe sync + CSV/JSON import + unmatched mgmt)
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
          // We don't actually replace the DB here; we just preview.
          // To persist a CSV import, an executive should run `supabase_customers_upsert` SQL.
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

// ============================================================
// SETTINGS TAB (executive-only)
// ============================================================
function SettingsTab({ c }) {
  const [draft, setDraft] = useState(c.config);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const update = (k, v) => setDraft({ ...draft, [k]: typeof v === "number" ? v : (parseFloat(v) || 0) });

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
          <p className="text-[11px] text-stone-500 mt-0.5">Global defaults applied to all AEs unless overridden per-rep below.</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          <PercentField
            label="Voice AI rate (on initial cash)"
            value={draft.aeVoiceRate}
            onChange={(v) => update("aeVoiceRate", v)}
            hint="10% of cash collected at deal close"
          />
          <PercentField
            label="AE residual rate (monthly)"
            value={draft.aeResidualRate}
            onChange={(v) => update("aeResidualRate", v)}
            hint="3% of MRR each month after prepay window"
          />
          <NumberField
            label="Residual cap (months)"
            value={draft.aeResidualMonths}
            onChange={(v) => update("aeResidualMonths", v)}
            step={1}
            hint="Stop paying residual after this many months from start"
          />
          <NumberField
            label="Annual variable target ($)"
            value={draft.acceleratorTarget}
            onChange={(v) => update("acceleratorTarget", v)}
            step={1000}
            hint="Accelerator unlocks above this"
          />
          <NumberField
            label="Upfront multiplier (advanced)"
            value={draft.upfrontMultiplier}
            onChange={(v) => update("upfrontMultiplier", v)}
            step={0.5}
            hint="Fallback only — used to estimate upfront cash for legacy seed customers without a submitted deal record. New AE deals use the actual cash submitted via the form, so this rarely matters."
          />
        </div>
      </div>

      <div className="bg-white border border-stone-200">
        <div className="px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">CSM Compensation · Matt, Sean, Noah</h3>
          <p className="text-[11px] text-stone-500 mt-0.5">Global defaults applied to all CSMs unless overridden per-rep below.</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          <PercentField
            label="Monthly residual rate"
            value={draft.csmRate}
            onChange={(v) => update("csmRate", v)}
            hint="3% of MRR each month the customer pays"
          />
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Btn variant="primary" onClick={save} disabled={saving}>
          {savedFlash ? <><Check size={12} className="inline mr-1" /> Saved</> : saving ? "Saving…" : "Save changes"}
        </Btn>
        <Btn onClick={() => setDraft(c.config)}>Discard</Btn>
      </div>

      {/* Per-rep overrides panel */}
      <PerRepRatesPanel c={c} />

      {/* Reporting structure panel */}
      <ReportingStructurePanel c={c} />
    </div>
  );
}

// Helper input components for Settings — keep the display layer in % while the
// underlying storage stays as a 0-1 decimal (engine reads 0.10, not 10).
function PercentField({ label, value, onChange, hint }) {
  // Convert storage (0.10) to display (10), edit, then convert back on change.
  // Round to 2 decimal places when displaying to avoid 0.030000000000004 artifacts.
  const display = value != null && !isNaN(value) ? Math.round(Number(value) * 10000) / 100 : "";
  return (
    <label className="flex flex-col">
      <span className="text-xs text-stone-600 mb-1">{label}</span>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(0);
            const pct = parseFloat(raw);
            if (isNaN(pct)) return;
            onChange(pct / 100);
          }}
          className="w-full border border-stone-200 px-2 py-1.5 pr-8 font-mono tabular-nums focus:outline-none focus:border-stone-900"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs pointer-events-none">%</span>
      </div>
      {hint && <span className="text-[10px] text-stone-500 mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, hint }) {
  return (
    <label className="flex flex-col">
      <span className="text-xs text-stone-600 mb-1">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full border border-stone-200 px-2 py-1.5 font-mono tabular-nums focus:outline-none focus:border-stone-900"
      />
      {hint && <span className="text-[10px] text-stone-500 mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

// PercentInput — input that displays whole numbers (10, 12.5) representing
// percentages. Used inside form state where the value lives as a string;
// caller is responsible for dividing by 100 when persisting to DB.
function PercentInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-stone-300 px-2 py-1.5 pr-8 text-sm font-mono focus:outline-none focus:border-stone-900"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs pointer-events-none">%</span>
    </div>
  );
}

// ============================================================
// Per-Rep Rates Panel — executive can set rep-specific commission rates
// with effective dating
// ============================================================
function PerRepRatesPanel({ c }) {
  const [editingRep, setEditingRep] = useState(null);

  // Build "currently effective" rates per rep by walking the overrides list
  // (the engine's indexOverrides already returns sorted desc by date, so the
  // first applicable row for each rep is what we want)
  const currentRates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const out = {};
    for (const rep of ALL_REPS) {
      const repOverrides = c.indexedOverrides?.[rep] || [];
      const effective = repOverrides.find((o) => (o.effective_date || "") <= today);
      out[rep] = effective || null;
    }
    return out;
  }, [c.indexedOverrides]);

  // Helper to display a value either from the rep's override or the default config
  const display = (rep, field, defaultKey, isPct = false, isMoney = false) => {
    const override = currentRates[rep];
    const overrideVal = override?.[field];
    if (overrideVal != null) {
      return (
        <span className="font-mono tabular-nums" style={{ color: "#6639a6" }} title={`Override · effective ${override.effective_date}`}>
          {isPct ? fmtPct(Number(overrideVal)) : isMoney ? fmtMoney(Number(overrideVal)) : Number(overrideVal)}
        </span>
      );
    }
    const defaultVal = c.config?.[defaultKey];
    return (
      <span className="font-mono tabular-nums text-stone-500">
        {isPct ? fmtPct(defaultVal) : isMoney ? fmtMoney(defaultVal) : defaultVal}
        <span className="ml-1 text-[10px] text-stone-400">default</span>
      </span>
    );
  };

  return (
    <div className="bg-white border border-stone-200">
      <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-stone-900">Per-Rep Rate Overrides</h3>
          <p className="text-xs text-stone-500 mt-0.5">Override the global rates above for a specific rep on a specific date. Click <span className="font-mono">Edit</span> to manage a rep's rate history.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50/50 border-b border-stone-200">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-3 py-2 font-medium">Rep</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium text-right">AE Voice AI %</th>
              <th className="px-3 py-2 font-medium text-right">AE Residual %</th>
              <th className="px-3 py-2 font-medium text-right">Residual Months</th>
              <th className="px-3 py-2 font-medium text-right">CSM %</th>
              <th className="px-3 py-2 font-medium text-right">Annual Target</th>
              <th className="px-3 py-2 font-medium text-right">TL Override %</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ALL_REPS.map((rep) => {
              const isAERep = isAE(rep);
              return (
                <tr key={rep} className="border-b border-stone-100">
                  <td className="px-3 py-2 text-stone-900 font-medium">{rep}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center text-[10px] mono-font px-1.5 py-0.5 rounded ${isAERep ? "" : ""}`}
                      style={isAERep
                        ? { background: "#f3eefb", color: "#4d2a7e" }
                        : { background: "#fef3c7", color: "#92400e" }}>
                      {isAERep ? "AE" : "CSM"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAERep ? display(rep, "ae_pct", "aeVoiceRate", true) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAERep ? display(rep, "ae_residual_pct", "aeResidualRate", true) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAERep ? display(rep, "ae_residual_months", "aeResidualMonths") : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!isAERep ? display(rep, "csm_pct", "csmRate", true) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAERep ? display(rep, "accelerator_target", "acceleratorTarget", false, true) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const override = currentRates[rep];
                      const val = override?.team_lead_override_pct;
                      if (val != null) {
                        return (
                          <span className="font-mono tabular-nums" style={{ color: "#6639a6" }}>
                            {fmtPct(Number(val))}
                          </span>
                        );
                      }
                      return <span className="text-stone-400 text-[10px]">none</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditingRep(rep)}
                      className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900 transition-colors px-2 py-1 hover:bg-stone-100 rounded-sm"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingRep && (
        <RepRatesEditor rep={editingRep} c={c} onClose={() => setEditingRep(null)} />
      )}
    </div>
  );
}

// ============================================================
// RepRatesEditor modal — manages the rate history (timeline) for one rep
// ============================================================
function RepRatesEditor({ rep, c, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isAERep = isAE(rep);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("commission_rep_overrides")
      .select("*")
      .eq("rep_name", rep)
      .order("effective_date", { ascending: false });
    if (e) setError(e.message);
    else setHistory(data || []);
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [rep]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this rate entry? The previous entry will become effective again.")) return;
    const { error: e } = await supabase
      .from("commission_rep_overrides")
      .delete()
      .eq("id", id);
    if (e) alert("Delete failed: " + e.message);
    else {
      loadHistory();
      c.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-sm border-2" style={{ borderColor: "#6639a6" }}>
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between" style={{ background: "#f3eefb" }}>
          <div>
            <h4 className="text-sm font-medium" style={{ color: "#4d2a7e" }}>
              {rep}'s commission rate history
            </h4>
            <p className="text-xs text-stone-600 mt-0.5">
              Newest at top. The currently-effective row is whichever has effective_date ≤ today.
            </p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Add new entry form */}
          <NewRateEntryForm
            rep={rep}
            isAERep={isAERep}
            onSaved={() => { loadHistory(); c.reload(); }}
          />

          {/* History */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">Rate history</div>
            {loading ? (
              <div className="text-center text-xs text-stone-500 py-6"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</div>
            ) : error ? (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>
            ) : history.length === 0 ? (
              <div className="text-center text-xs text-stone-500 py-6 border border-dashed border-stone-200 rounded-sm">
                No rate overrides yet. {rep} is using the global defaults from the top of the Settings tab.
              </div>
            ) : (
              <div className="border border-stone-200 overflow-x-auto rounded-sm">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                      <th className="px-2 py-2 font-medium">Effective</th>
                      {isAERep && <th className="px-2 py-2 font-medium text-right">AE %</th>}
                      {isAERep && <th className="px-2 py-2 font-medium text-right">Res %</th>}
                      {isAERep && <th className="px-2 py-2 font-medium text-right">Res Mo</th>}
                      {!isAERep && <th className="px-2 py-2 font-medium text-right">CSM %</th>}
                      {!isAERep && <th className="px-2 py-2 font-medium text-right">CSM Mo</th>}
                      {isAERep && <th className="px-2 py-2 font-medium text-right">Target</th>}
                      <th className="px-2 py-2 font-medium text-right">TL %</th>
                      <th className="px-2 py-2 font-medium">Notes</th>
                      <th className="px-2 py-2 font-medium">Author</th>
                      <th className="px-2 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => {
                      const isActive = (h.effective_date || "") <= new Date().toISOString().slice(0, 10);
                      const isNewest = idx === 0;
                      const isEffective = isActive && (
                        idx === 0 ||
                        // OR: it's the first one that's <= today
                        history.slice(0, idx).every((prev) => (prev.effective_date || "") > new Date().toISOString().slice(0, 10))
                      );
                      return (
                        <tr key={h.id} className="border-b border-stone-100">
                          <td className="px-2 py-1.5 font-mono tabular-nums text-stone-700">
                            {h.effective_date}
                            {isEffective && <span className="ml-1.5 text-[9px] mono-font px-1 py-0.5 rounded text-emerald-800" style={{ background: "#d1fae5" }}>active</span>}
                            {!isActive && <span className="ml-1.5 text-[9px] mono-font px-1 py-0.5 rounded text-amber-800" style={{ background: "#fef3c7" }}>future</span>}
                          </td>
                          {isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.ae_pct != null ? fmtPct(Number(h.ae_pct)) : <span className="text-stone-300">—</span>}</td>}
                          {isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.ae_residual_pct != null ? fmtPct(Number(h.ae_residual_pct)) : <span className="text-stone-300">—</span>}</td>}
                          {isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.ae_residual_months ?? <span className="text-stone-300">—</span>}</td>}
                          {!isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.csm_pct != null ? fmtPct(Number(h.csm_pct)) : <span className="text-stone-300">—</span>}</td>}
                          {!isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.csm_residual_months ?? <span className="text-stone-300">—</span>}</td>}
                          {isAERep && <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.accelerator_target != null ? fmtMoney(Number(h.accelerator_target)) : <span className="text-stone-300">—</span>}</td>}
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.team_lead_override_pct != null ? fmtPct(Number(h.team_lead_override_pct)) : <span className="text-stone-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-stone-600 text-[11px]">{h.notes || <span className="text-stone-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-stone-500 text-[10px]">{h.created_by_name || <span className="text-stone-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-right">
                            <button onClick={() => handleDelete(h.id)} title="Delete entry"
                              className="p-1 text-stone-500 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// NewRateEntryForm — add a new effective-dated rate row for a rep
// ============================================================
function NewRateEntryForm({ rep, isAERep, onSaved }) {
  const [form, setForm] = useState({
    effective_date: new Date().toISOString().slice(0, 10),
    ae_pct: "",
    ae_residual_pct: "",
    ae_residual_months: "",
    csm_pct: "",
    csm_residual_months: "",
    accelerator_target: "",
    accel_1_5x_pct: "",
    accel_2x_pct: "",
    team_lead_override_pct: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);

    // Build payload — only include non-empty fields
    const payload = { rep_name: rep, effective_date: form.effective_date };
    // Fields that are PERCENTAGES in the UI but DECIMALS (0-1) in the DB.
    // User types "10", we store 0.10.
    const percentFields = [
      "ae_pct", "ae_residual_pct",
      "csm_pct",
      "accel_1_5x_pct", "accel_2x_pct",
      "team_lead_override_pct",
    ];
    // Fields that are stored as raw numbers (months, $ targets)
    const rawNumFields = [
      "ae_residual_months",
      "csm_residual_months",
      "accelerator_target",
    ];
    for (const f of percentFields) {
      if (form[f] !== "" && form[f] != null) {
        payload[f] = Number(form[f]) / 100;
      }
    }
    for (const f of rawNumFields) {
      if (form[f] !== "" && form[f] != null) {
        payload[f] = Number(form[f]);
      }
    }
    if (form.notes.trim()) payload.notes = form.notes.trim();

    // Stamp the author
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      payload.created_by = userData.user.id;
      const { data: profData } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profData?.name) payload.created_by_name = profData.name;
    }

    const { error: e } = await supabase
      .from("commission_rep_overrides")
      .insert(payload);

    setBusy(false);
    if (e) {
      if (e.code === "23505") {
        setError(`${rep} already has a rate entry effective ${form.effective_date}. Delete the existing one first, or pick a different date.`);
      } else {
        setError(e.message);
      }
    } else {
      // Reset form and notify parent
      setForm({
        effective_date: new Date().toISOString().slice(0, 10),
        ae_pct: "", ae_residual_pct: "", ae_residual_months: "",
        csm_pct: "", csm_residual_months: "",
        accelerator_target: "", accel_1_5x_pct: "", accel_2x_pct: "",
        team_lead_override_pct: "", notes: "",
      });
      setExpanded(false);
      onSaved();
    }
  };

  return (
    <div className="border border-stone-200 rounded-sm" style={{ background: "#fafafa" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors"
      >
        <div>
          <div className="text-sm font-medium text-stone-900 inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add new effective-dated rate entry
          </div>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Set rates that take effect on a specific date. Leave fields blank to inherit defaults.
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 text-stone-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-stone-200">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <Field label="Effective date" required>
              <input type="date" value={form.effective_date}
                onChange={(e) => update("effective_date", e.target.value)}
                className="w-full border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:border-stone-900" />
            </Field>

            {isAERep && (
              <>
                <Field label="AE Voice AI %" hint="e.g. 10 for 10%">
                  <PercentInput value={form.ae_pct} onChange={(v) => update("ae_pct", v)} placeholder="10" />
                </Field>
                <Field label="AE Residual %" hint="e.g. 3 for 3%">
                  <PercentInput value={form.ae_residual_pct} onChange={(v) => update("ae_residual_pct", v)} placeholder="3" />
                </Field>
                <Field label="AE Residual months" hint="e.g. 12">
                  <input type="number" step="1" value={form.ae_residual_months}
                    onChange={(e) => update("ae_residual_months", e.target.value)}
                    placeholder="12"
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-stone-900" />
                </Field>
                <Field label="Annual target $">
                  <input type="number" step="1000" value={form.accelerator_target}
                    onChange={(e) => update("accelerator_target", e.target.value)}
                    placeholder="60000"
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-stone-900" />
                </Field>
                <Field label="Accel 1.5× threshold" hint="e.g. 120 for 120% of target">
                  <PercentInput value={form.accel_1_5x_pct} onChange={(v) => update("accel_1_5x_pct", v)} placeholder="120" />
                </Field>
                <Field label="Accel 2× threshold" hint="e.g. 150 for 150% of target">
                  <PercentInput value={form.accel_2x_pct} onChange={(v) => update("accel_2x_pct", v)} placeholder="150" />
                </Field>
              </>
            )}

            {!isAERep && (
              <>
                <Field label="CSM monthly residual %" hint="e.g. 3 for 3%">
                  <PercentInput value={form.csm_pct} onChange={(v) => update("csm_pct", v)} placeholder="3" />
                </Field>
                <Field label="CSM residual months" hint="blank = no cap">
                  <input type="number" step="1" value={form.csm_residual_months}
                    onChange={(e) => update("csm_residual_months", e.target.value)}
                    placeholder="(unlimited)"
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-stone-900" />
                </Field>
              </>
            )}

            <Field label="Team Lead Override %" hint="if this rep is a team lead, % they earn on reports' commissions (e.g. 2)">
              <PercentInput value={form.team_lead_override_pct} onChange={(v) => update("team_lead_override_pct", v)} placeholder="2" />
            </Field>

            <Field label="Notes (optional)" className="col-span-2 md:col-span-3">
              <textarea rows={1} value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. Mid-year raise · approved by Mark"
                className="w-full border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:border-stone-900 resize-y" />
            </Field>
          </div>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button onClick={handleSubmit} disabled={busy}
              className="px-3 py-2 text-sm font-medium text-white rounded-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
              style={{ background: "#6639a6" }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 inline mr-1" />}
              Add entry
            </button>
            <button onClick={() => setExpanded(false)}
              className="px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Reporting Structure Panel — executive can set manager_id per profile
// ============================================================
function ReportingStructurePanel({ c }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  // Filter out executives — they don't need managers
  const reportableProfiles = useMemo(() => {
    return (c.profiles || []).filter((p) =>
      p.role !== "executive" &&
      !["coo", "ceo", "cto"].includes(p.role_type)
    );
  }, [c.profiles]);

  // All profiles that could be a manager (team leads + executives)
  const potentialManagers = useMemo(() => {
    return (c.profiles || []).filter((p) =>
      p.is_team_lead || p.role === "executive" || ["coo", "ceo", "cto"].includes(p.role_type)
    );
  }, [c.profiles]);

  const handleChange = async (profileId, newManagerId) => {
    setBusyId(profileId);
    setError(null);
    const { error: e } = await supabase
      .from("profiles")
      .update({ manager_id: newManagerId || null })
      .eq("id", profileId);
    setBusyId(null);
    if (e) {
      setError(e.message);
    } else {
      c.reload();
    }
  };

  return (
    <div className="bg-white border border-stone-200">
      <div className="px-5 py-3 border-b border-stone-200">
        <h3 className="text-sm font-medium text-stone-900">Reporting Structure</h3>
        <p className="text-xs text-stone-500 mt-0.5">
          Set who each rep reports to. Team leads earn the override % (configured above) on their reports' commissions.
          Leave blank to default by team (everyone on team X rolls up to team X's lead).
        </p>
      </div>

      {error && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50/50 border-b border-stone-200">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Team Lead?</th>
              <th className="px-3 py-2 font-medium">Reports To</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {reportableProfiles.map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="px-3 py-2 text-stone-900 font-medium">{p.name}</td>
                <td className="px-3 py-2 text-stone-600 text-[11px] mono-font uppercase tracking-wider">
                  {p.team || <span className="text-stone-300">—</span>}
                </td>
                <td className="px-3 py-2">
                  {p.is_team_lead ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#f3eefb", color: "#4d2a7e" }}>
                      <Crown className="w-3 h-3" /> Yes
                    </span>
                  ) : (
                    <span className="text-stone-400 text-[10px]">no</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={p.manager_id || ""}
                    onChange={(e) => handleChange(p.id, e.target.value)}
                    disabled={busyId === p.id}
                    className="border border-stone-300 px-2 py-1 text-xs bg-white focus:outline-none focus:border-stone-900 min-w-[160px]"
                  >
                    <option value="">— default (by team) —</option>
                    {potentialManagers
                      .filter((m) => m.id !== p.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.is_team_lead ? "(TL)" : ""}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {busyId === p.id && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// CommissionsHeader — standalone-view chrome
// Matches the nav row used by SharedPagesView, LeadershipDashboardView,
// and ManagerView so the user can always navigate out of Commissions.
// ============================================================
function CommissionsHeader({
  profile, onSignOut,
  onSwitchToSelf, onSwitchToManager, onSwitchToFeatureRequests,
  onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide,
  onSwitchToLeadership,
  canSeeManagerView, canGoToSelf,
  showSettings, setShowSettings, onProfileUpdated,
  children,
}) {
  const headerRef = useGlassInteraction();
  return (
    <div className="min-h-screen" style={{ background: "var(--bg, #FAFAF7)" }}>
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={28} />
            <div className="hidden sm:block">
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">Commission Tracker</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Atlas · Sales &amp; CS</div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {onSwitchToLeadership && (
              <button onClick={onSwitchToLeadership} className="hidden md:flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm hover:opacity-80"
                style={{ color: "#6639A6" }}
                title="Leadership Dashboard">
                <Crown className="w-4 h-4" /> <span className="hidden lg:inline">Leadership</span>
              </button>
            )}
            {onSwitchToApiGuide && (
              <button onClick={onSwitchToApiGuide} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="API Setup">
                <Zap className="w-4 h-4" /> <span className="hidden lg:inline">API Setup</span>
              </button>
            )}
            {onSwitchToFeatureRequests && (
              <button onClick={onSwitchToFeatureRequests} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Feature Requests">
                <Lightbulb className="w-4 h-4" /> <span className="hidden lg:inline">Feature Requests</span>
              </button>
            )}
            {onSwitchToIntegrations && (
              <button onClick={onSwitchToIntegrations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Integrations">
                <Plug className="w-4 h-4" /> <span className="hidden lg:inline">Integrations</span>
              </button>
            )}
            {onSwitchToCancellations && (
              <button onClick={onSwitchToCancellations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Cancellations">
                <UserMinus className="w-4 h-4" /> <span className="hidden lg:inline">Cancellations</span>
              </button>
            )}
            {canGoToSelf && onSwitchToSelf && (
              <button onClick={onSwitchToSelf} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <UserCircle2 className="w-4 h-4" /> My scorecard
              </button>
            )}
            {canSeeManagerView && onSwitchToManager && (
              <button onClick={onSwitchToManager} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <LayoutDashboard className="w-4 h-4" /> Manager view
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {children}

      {showSettings && (
        <SettingsModal
          profile={profile}
          onClose={() => setShowSettings(false)}
          onProfileUpdated={onProfileUpdated}
        />
      )}
    </div>
  );
}
