import React from "react";
import { useCommissions } from "./useCommissions";
import DuplicateCustomersAlert from "./DuplicateCustomersAlert";

// ============================================================
// MyScorecardView — Mark's personal action center. A first step: surfaces the
// data-cleanup items he owns (starting with duplicate Stripe customers). Designed
// to grow — add more personal widgets/sections over time.
// ============================================================
export default function MyScorecardView({ profile }) {
  const c = useCommissions();
  const firstName = (profile?.name || "").split(" ")[0] || "there";

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400">My View</div>
        <h1 className="display-font text-3xl font-medium text-stone-900 leading-tight">
          Hey {firstName} — your queue
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Things that need your attention. This is your space — we’ll keep adding to it.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="display-font text-xl font-medium text-stone-900">Data cleanup</h2>
          <p className="text-sm text-stone-500">Duplicate Stripe customers from failed-payment retries — delete the $0 one in Stripe.</p>
        </div>
        {c.loading ? (
          <div className="text-sm text-stone-400">Loading…</div>
        ) : (
          <DuplicateCustomersAlert
            customers={c.customers}
            monthCols={c.monthCols}
            emptyMessage="✓ No duplicate Stripe customers right now — all clean."
          />
        )}
      </section>
    </div>
  );
}
