import React, { useState } from "react";
import { useCommissions } from "./useCommissions";
import DuplicateCustomersAlert from "./DuplicateCustomersAlert";
import { usePayFixQueue } from "./usePayFix";

// Deals an AE flagged as having a payment arrangement that needs fixing in Stripe.
function PayFixQueueSection() {
  const { queue, loading, complete } = usePayFixQueue();
  const [busy, setBusy] = useState(null);
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  const onComplete = async (id) => {
    setBusy(id);
    try { await complete(id); } catch (e) { console.error("pay_fix_complete failed:", e); }
    finally { setBusy(null); }
  };
  return (
    <section className="space-y-3">
      <div>
        <h2 className="display-font text-xl font-medium text-stone-900">Stripe payment fixes</h2>
        <p className="text-sm text-stone-500">Deals an AE flagged because the collected terms don’t match Stripe. Fix it in Stripe, then mark completed — the AE gets notified to confirm.</p>
      </div>
      {loading ? (
        <div className="text-sm text-stone-400">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="border-l-4 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">✓ No payment fixes waiting.</div>
      ) : (
        <div className="space-y-2">
          {queue.map((d) => (
            <div key={d.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-stone-900">{d.customer_name || d.customer_email || "Customer"}</div>
                  <div className="text-[11px] text-stone-500">
                    Flagged by {d.ae_name || "AE"}
                    {d.mrr ? ` · ${money(d.mrr)}/mo` : ""}{d.one_time ? ` · ${money(d.one_time)} upfront` : ""}
                  </div>
                  {d.pay_fix_note && (
                    <div className="text-sm text-stone-700 mt-1.5 whitespace-pre-wrap bg-white border border-amber-200 rounded p-2">{d.pay_fix_note}</div>
                  )}
                </div>
                <button onClick={() => onComplete(d.id)} disabled={busy === d.id}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                  {busy === d.id ? "Saving…" : "Mark completed"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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

      <PayFixQueueSection />

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
