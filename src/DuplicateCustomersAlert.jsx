import React, { useMemo } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { combinedCash, fmtMoney } from "./commissionEngine";

// ============================================================
// DuplicateCustomersAlert — flags same-email Stripe customers where one twin has $0
// collected (the failed-payment-then-retry pattern: a new Stripe customer is created
// on each attempt). The $0 one should be deleted in Stripe so it doesn't inflate
// customer counts / MRR / commission. Links straight to it in Stripe.
//
// Shared by the Commissions view and Mark's personal view.
// ============================================================
export default function DuplicateCustomersAlert({ customers, monthCols, emptyMessage = null }) {
  const groups = useMemo(() => {
    const byEmail = {};
    for (const c of customers || []) {
      const e = (c.email || "").toLowerCase().trim();
      if (!e) continue;
      (byEmail[e] || (byEmail[e] = [])).push(c);
    }
    const totalCash = (c) => (monthCols || []).reduce((s, m) => s + combinedCash(c, m), 0);
    const out = [];
    for (const [email, list] of Object.entries(byEmail)) {
      if (list.length < 2) continue;
      const withCash = list.map((c) => ({ c, cash: totalCash(c) })).sort((a, b) => b.cash - a.cash);
      if (!withCash.some((x) => x.cash <= 0)) continue; // only actionable when a twin has $0
      out.push({ email, withCash });
    }
    return out.sort((a, b) => a.email.localeCompare(b.email));
  }, [customers, monthCols]);

  if (groups.length === 0) {
    return emptyMessage
      ? <div className="border-l-4 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">{emptyMessage}</div>
      : null;
  }
  return (
    <div className="border-l-4 border-amber-400 bg-amber-50 p-4">
      <div className="font-semibold text-amber-900 flex items-center gap-2">
        <AlertCircle size={16} /> {groups.length} duplicate Stripe customer{groups.length > 1 ? "s" : ""} to clean up
      </div>
      <p className="text-sm text-amber-800 mt-1">
        These emails have more than one Stripe customer — usually a failed payment that created an extra profile
        before the real one went through. Delete the <strong>$0-collected</strong> one in Stripe so it doesn’t
        inflate customer counts, MRR, or commission.
      </p>
      <div className="mt-3 space-y-2">
        {groups.map((g) => (
          <div key={g.email} className="text-xs bg-white border border-amber-200 rounded p-2.5">
            <div className="font-medium text-stone-800 mb-1.5">{g.email}</div>
            <div className="space-y-1">
              {g.withCash.map(({ c, cash }) => (
                <div key={c.stripe_customer_id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-stone-500 truncate">{c.stripe_customer_id}</span>
                  <span className="text-stone-700 truncate flex-1">{c.name}</span>
                  {cash > 0 ? (
                    <span className="text-emerald-700 font-medium whitespace-nowrap">{fmtMoney(cash)} collected · keep</span>
                  ) : (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-red-700 font-semibold">$0 collected · delete</span>
                      <a href={`https://dashboard.stripe.com/customers/${c.stripe_customer_id}`}
                         target="_blank" rel="noreferrer"
                         className="text-blue-600 underline inline-flex items-center gap-0.5">Stripe <ExternalLink size={10} /></a>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
