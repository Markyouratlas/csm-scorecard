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

import React, { useState, useMemo } from "react";
import {
  TrendingUp, Users, DollarSign, AlertCircle, Settings, Download,
  GitCompare, Calendar, Zap, FileText, Check, X, Plus,
  RefreshCw, Search, Inbox,
  LogOut, LayoutDashboard, UserCircle2, Lightbulb, Plug, UserMinus, Crown,
  Settings as SettingsIcon,
} from "lucide-react";
import Papa from "papaparse";

import AtlasLogo from "./AtlasLogo";
import SettingsModal from "./SettingsModal";
import { useGlassInteraction } from "./hooks/useGlassInteraction.js";
import { useCommissions } from "./useCommissions";
import {
  ALL_REPS, REPS, isAE,
  calcRepCommission, calcAccelerator, aeCustomerLifetimeProjection,
  projectCustomers, parseStripeCSV,
  monthLabel, fmtMoney, fmtPct, DEFAULT_CONFIG,
} from "./commissionEngine";
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
    { id: "overview",  label: "Overview",  icon: TrendingUp },
    { id: "customers", label: "Customers", icon: Users },
    { id: "byRep",     label: "By Rep",    icon: DollarSign },
    { id: "whatif",    label: "What-If",   icon: GitCompare },
    { id: "annualize", label: "Annualize", icon: Calendar },
    { id: "data",      label: "Data Sync", icon: Zap },
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
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-medium">Atlas</div>
          <h1 className="font-serif italic text-3xl text-stone-900 mt-0.5">Commission Tracker</h1>
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

        {tab === "overview"  && <OverviewTab  c={c} onJumpTo={jumpTo} />}
        {tab === "customers" && <CustomersTab c={c} initialFilter={needsFilter} />}
        {tab === "byRep"     && <ByRepTab     c={c} initialRep={jumpRep} />}
        {tab === "whatif"    && <WhatIfTab    c={c} />}
        {tab === "annualize" && <AnnualizeTab c={c} />}
        {tab === "data"      && <DataTab      c={c} isExecutive={isExecutive} />}
        {tab === "settings"  && isExecutive && <SettingsTab c={c} />}
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
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols);
      if (r.monthly.length > 0) totalThisMonth += r.monthly[r.monthly.length - 1].total;
    }
    return { paying, aeEra, needsCSM, needsAE, totalThisMonth };
  }, [c.customers, c.assignments, c.indexedAssignments, c.config, c.monthCols]);

  const perRep = useMemo(() => ALL_REPS.map((rep) => {
    const r = calcRepCommission(rep, c.customers, c.indexedAssignments, c.config, c.monthCols);
    const ytd = r.monthly.reduce((s, m) => s + m.total, 0);
    const thisMonth = r.monthly[r.monthly.length - 1]?.total || 0;
    return { rep, isAE: r.isAE, bookSize: r.book.length, ytd, thisMonth };
  }), [c.customers, c.indexedAssignments, c.config, c.monthCols]);

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
              <th className="px-5 py-2.5 font-medium text-right">YTD Comm.</th>
            </tr>
          </thead>
          <tbody>
            {perRep.map((r) => (
              <tr key={r.rep} className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                  onClick={() => onJumpTo("byRep", r.rep)}>
                <td className="px-5 py-2.5 font-medium text-stone-900">{r.rep}</td>
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
// BY REP TAB
// ============================================================
function ByRepTab({ c, initialRep }) {
  const [selectedRep, setSelectedRep] = useState(initialRep || "Heather");
  const calc = useMemo(
    () => calcRepCommission(selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols),
    [selectedRep, c.customers, c.indexedAssignments, c.config, c.monthCols]
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
      const r = calcRepCommission(rep, c.customers, c.indexedAssignments, s.config, c.monthCols);
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
      const r = calcRepCommission(rep, projCustomers, c.indexedAssignments, c.config, allMonths);
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
            ["aeVoiceRate",        "Voice AI rate (initial cash)", 0.01],
            ["upfrontMultiplier",  "Upfront multiplier (mo. prepaid)", 0.1],
            ["aeResidualRate",     "AE residual rate (months 2+)", 0.01],
            ["aeResidualMonths",   "Residual cap (months)", 1],
            ["acceleratorTarget",  "Annual variable target ($)", 1000],
          ].map(([k, label, step]) => (
            <label key={k} className="flex flex-col">
              <span className="text-xs text-stone-600 mb-1">{label}</span>
              <input type="number" step={step} value={draft[k]} onChange={(e) => update(k, e.target.value)}
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
            <input type="number" step="0.01" value={draft.csmRate}
              onChange={(e) => update("csmRate", e.target.value)}
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
