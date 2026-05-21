// ============================================================
// CommissionsTab — personal Commission view for AEs and CSMs
// ============================================================
// Rendered as a tab inside AeView.jsx (for Heather/Mason) and CsmView.jsx
// (for Matt/Sean/Noah). Shows ONLY the current user's commission, scoped by
// matching their profile.name first-token to the assignments.ae/csm field.
//
// This is read-only — no assignment editing here. Reps go to the full
// Commission Tracker view (gated to managers) to change assignments.
//
// Usage in CsmView/AeView:
//   import CommissionsTab from "./CommissionsTab";
//   ...
//   {tab === 'commissions' && <CommissionsTab profile={profile} />}
// ============================================================

import React, { useMemo } from "react";
import { DollarSign, TrendingUp } from "lucide-react";
import { useCommissions } from "./useCommissions";
import {
  calcRepCommission, calcAccelerator, monthLabel, fmtMoney, fmtPct, isAE,
} from "./commissionEngine";

const BRAND = {
  purple: "#6639a6",
  purpleDeep: "#4d2a7e",
  purpleLight: "#9171c4",
  purpleTint: "#f3eefb",
  purpleTintMid: "#e4d8f4",
};

export default function CommissionsTab({ profile }) {
  const c = useCommissions();

  // Resolve "this user" to a rep name by first token of profile.name.
  // Matches the current_user_rep_name() server function.
  const repName = (profile?.name || "").split(" ")[0];
  const userIsAE = isAE(repName);

  const calc = useMemo(() => {
    if (!repName) return null;
    return calcRepCommission(repName, c.customers, c.indexedAssignments, c.config, c.monthCols);
  }, [repName, c.customers, c.indexedAssignments, c.config, c.monthCols]);

  if (c.loading) {
    return <div className="px-6 py-12 text-center text-stone-500 text-sm">Loading commissions…</div>;
  }
  if (c.error) {
    return (
      <div className="px-6 py-6">
        <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-900">
          Failed to load commission data: {c.error}
        </div>
      </div>
    );
  }
  if (!calc || calc.book.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <DollarSign size={32} className="mx-auto text-stone-300 mb-3" />
        <div className="text-sm text-stone-700 font-medium">No customers attributed to you yet</div>
        <div className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
          When a manager assigns customers to you in the Commission Tracker, your numbers will show up here.
        </div>
      </div>
    );
  }

  const ytd = calc.monthly.reduce((a, m) => ({
    voiceAICommission: a.voiceAICommission + m.voiceAICommission,
    aeResidual:        a.aeResidual + m.aeResidual,
    csmResidual:       a.csmResidual + m.csmResidual,
    total:             a.total + m.total,
    newDeals:          a.newDeals + m.newDeals,
    newMRR:            a.newMRR + m.newMRR,
  }), { voiceAICommission: 0, aeResidual: 0, csmResidual: 0, total: 0, newDeals: 0, newMRR: 0 });

  const acc = userIsAE ? calcAccelerator(ytd.total, c.config) : null;
  const lastMonth = calc.monthly[calc.monthly.length - 1];

  return (
    <div className="px-6 py-6 space-y-6 max-w-6xl">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-medium">My Commission</div>
        <h2 className="font-serif italic text-2xl text-stone-900 mt-0.5">Earnings & Forecast</h2>
        <p className="text-xs text-stone-500 mt-1">
          Read-only view. To change assignments, ask your manager.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200">
        <PersonalStat label="Book Size" value={calc.book.length} sub="Active customers" />
        {userIsAE ? (
          <>
            <PersonalStat label="YTD New MRR" value={fmtMoney(ytd.newMRR)} sub={`${ytd.newDeals} deals closed`} />
            <PersonalStat label="This Month"  value={fmtMoney(lastMonth?.total || 0)} accent={BRAND.purple} />
            <PersonalStat label="YTD Total"   value={fmtMoney(ytd.total)}
              sub={acc ? `${fmtPct(ytd.total / acc.target)} of $${acc.target.toLocaleString()} target` : ""}
              accent="#1c1917" />
          </>
        ) : (
          <>
            <PersonalStat label="Book MRR (latest)" value={fmtMoney(lastMonth?.bookMRR || 0)} sub="Recurring monthly" />
            <PersonalStat label="This Month"        value={fmtMoney(lastMonth?.total || 0)} accent={BRAND.purple} />
            <PersonalStat label="YTD Total"         value={fmtMoney(ytd.total)} sub="3% of paid MRR" />
          </>
        )}
      </div>

      {userIsAE && acc && (
        <div className="bg-white border border-stone-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-stone-900">Annual Accelerator Progress</h3>
            <span className="text-xs px-2 py-0.5" style={
              acc.status === "2x"        ? { background: "#d1fae5", color: "#064e3b" } :
              acc.status === "1.5x"      ? { background: BRAND.purpleTint, color: BRAND.purpleDeep } :
              acc.status === "ontarget"  ? { background: "#f1f5f9", color: "#475569" } :
              { background: "#f5f5f4", color: "#57534e" }}>
              {acc.status === "2x" ? "★★ Earning 2x" :
               acc.status === "1.5x" ? "★ Earning 1.5x" :
               acc.status === "ontarget" ? "On Target" :
               `${fmtPct(ytd.total / acc.target)} to target`}
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
              Accelerator bonus earned: <span className="font-mono font-medium" style={{ color: BRAND.purple }}>{fmtMoney(acc.bonus)}</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-900">My Monthly Breakdown</h3>
          <TrendingUp size={14} className="text-stone-400" />
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/50">
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2 font-medium">Month</th>
              {userIsAE ? (
                <>
                  <th className="px-3 py-2 font-medium text-right">Deals</th>
                  <th className="px-3 py-2 font-medium text-right">New MRR</th>
                  <th className="px-3 py-2 font-medium text-right">Voice AI</th>
                  <th className="px-3 py-2 font-medium text-right">Residual</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-medium text-right">Book MRR</th>
                  <th className="px-4 py-2 font-medium text-right">Commission</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {calc.monthly.map((m) => (
              <tr key={m.month} className="border-b border-stone-100">
                <td className="px-4 py-2 text-stone-700 font-mono tabular-nums text-xs">{monthLabel(m.month)}</td>
                {userIsAE ? (
                  <>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.newDeals || <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.newMRR > 0 ? fmtMoney(m.newMRR) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{m.voiceAICommission > 0 ? fmtMoney(m.voiceAICommission) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{m.aeResidual > 0 ? fmtMoney(m.aeResidual) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-stone-900">{m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{m.bookMRR > 0 ? fmtMoney(m.bookMRR) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium" style={{ color: BRAND.purple }}>{m.total > 0 ? fmtMoney(m.total) : <span className="text-stone-300">—</span>}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300 bg-stone-50/50 font-medium">
              <td className="px-4 py-2 text-xs uppercase tracking-wider">YTD</td>
              {userIsAE ? (
                <>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{ytd.newDeals}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtMoney(ytd.newMRR)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.voiceAICommission)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: BRAND.purple }}>{fmtMoney(ytd.aeResidual)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmtMoney(ytd.total)}</td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">—</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold" style={{ color: BRAND.purple }}>{fmtMoney(ytd.total)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonalStat({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-stone-200 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</div>
      <div className="mt-1.5 text-2xl font-mono tabular-nums" style={{ color: accent || "#1c1917" }}>{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
    </div>
  );
}
