import React, { useState } from "react";
import { useCommissions } from "./useCommissions";
import DuplicateCustomersAlert from "./DuplicateCustomersAlert";
import { usePayFixQueue } from "./usePayFix";

// Deals an AE flagged as having a payment arrangement that needs fixing in Stripe.
function PayFixQueueSection({ onOpenAe }) {
  const { queue, loading, complete } = usePayFixQueue();
  const [busy, setBusy] = useState(null);
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  const fmtDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null; } catch { return null; } };
  const Field = ({ label, value, mono, full }) => value ? (
    <div className={full ? "col-span-2 sm:col-span-3" : ""}>
      <span className="text-stone-400">{label}: </span>
      <span className={`text-stone-700 ${mono ? "font-mono break-all" : ""}`}>{value}</span>
    </div>
  ) : null;
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
            <div key={d.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-medium text-stone-900 text-base">{d.customer_name || d.customer_email || "Customer"}</div>
                  <div className="text-[11px] text-stone-500">Flagged by {d.ae_name || "AE"}{d.pay_fix_flagged_at ? ` · ${fmtDate(d.pay_fix_flagged_at)}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {onOpenAe && d.ae_id && (
                    <button onClick={() => onOpenAe(d.ae_id)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 whitespace-nowrap">
                      In {(d.ae_name || "AE").split(" ")[0]}’s pipeline ↗
                    </button>
                  )}
                  {d.matched_stripe_customer_id && (
                    <a href={`https://dashboard.stripe.com/customers/${d.matched_stripe_customer_id}`} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">Open in Stripe ↗</a>
                  )}
                  <button onClick={() => onComplete(d.id)} disabled={busy === d.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap">
                    {busy === d.id ? "Saving…" : "Mark completed"}
                  </button>
                </div>
              </div>

              {d.pay_fix_note && (
                <div className="text-sm text-stone-800 whitespace-pre-wrap bg-white border border-amber-300 rounded p-2.5 mb-2.5">
                  <span className="mono-font text-[9px] uppercase tracking-widest text-amber-700 block mb-1">Terms from the AE</span>
                  {d.pay_fix_note}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                <Field label="Email" value={d.customer_email} />
                <Field label="Payment email" value={d.payment_email} />
                <Field label="Phone" value={d.customer_phone} />
                <Field label="MRR" value={d.mrr ? `${money(d.mrr)}/mo` : null} />
                <Field label="Upfront" value={d.one_time ? money(d.one_time) : null} />
                <Field label="Expected MRR" value={d.expected_mrr ? `${money(d.expected_mrr)}/mo` : null} />
                <Field label="Meeting" value={fmtDate(d.meeting_at)} />
                <Field label="Closed" value={fmtDate(d.closed_at)} />
                <Field label="Stripe customer" value={d.matched_stripe_customer_id} mono />
                <Field label="Deal notes" value={d.notes} full />
              </div>
              {!d.matched_stripe_customer_id && (
                <div className="text-[11px] text-stone-400 mt-2">No Stripe customer linked on this deal — search Stripe by email ({d.customer_email || d.payment_email || "—"}).</div>
              )}
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
export default function MyScorecardView({ profile, onOpenAe }) {
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

      <PayFixQueueSection onOpenAe={onOpenAe} />

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
