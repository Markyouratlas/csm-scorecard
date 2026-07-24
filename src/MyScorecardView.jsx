import React, { useState } from "react";
import { useCommissions } from "./useCommissions";
import DuplicateCustomersAlert from "./DuplicateCustomersAlert";
import { usePayFixQueue } from "./usePayFix";
import { useDuplicateDeals } from "./useDuplicateDeals";
import { useCollectedNotClosed } from "./useCollectedNotClosed";
import { useAutoClosed } from "./useAutoClosed";
import { useUnlinkedClosedWon } from "./useUnlinkedClosedWon";

// Customers paying in Stripe whose deal is still open (should be closed → onboarding,
// unless it's a deposit / already-closed). Read-only surfacing — the AE closes them
// in their pipeline (or the Phase-B job auto-closes the confident-full ones).
function CollectedNotClosedSection({ onOpenAe }) {
  const { deals, loading } = useCollectedNotClosed();
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="display-font text-xl font-medium text-stone-900">Collected but not closed</h2>
        <p className="text-sm text-stone-500">Customers paying in Stripe whose deal is still open. Paid-in-full ones should be closed (→ onboarding); partials are likely deposits.</p>
      </div>
      {loading ? (
        <div className="text-sm text-stone-400">Loading…</div>
      ) : deals.length === 0 ? (
        <div className="border-l-4 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">✓ Nothing collected-but-not-closed.</div>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => (
            <div key={d.deal_id} className={`border rounded-lg p-3 ${d.is_full ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-stone-900">
                    {d.customer_name || d.customer_email || "Customer"}
                    {d.is_full
                      ? <span className="ml-2 text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">paid in full</span>
                      : <span className="ml-2 text-[10px] font-semibold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">partial · likely deposit</span>}
                    {d.already_closed && <span className="ml-2 text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">already has a Closed Won ⚠</span>}
                  </div>
                  <div className="text-[11px] text-stone-500">{d.ae_name || "AE"} · {d.status} · collected {money(d.collected)}{d.one_time ? ` of ${money(d.one_time)} expected` : ""}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {onOpenAe && d.ae_id && (
                    <button onClick={() => onOpenAe(d.ae_id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 whitespace-nowrap">In {(d.ae_name || "AE").split(" ")[0]}’s pipeline ↗</button>
                  )}
                  {d.stripe_customer_id && (
                    <a href={`https://dashboard.stripe.com/customers/${d.stripe_customer_id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">Stripe ↗</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// One unlinked Closed Won deal — expands to a ranked Stripe-candidate picker.
function UnlinkedRow({ deal, candidates, link, onOpenAe }) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState(null);
  const [busy, setBusy] = useState(null);
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && cands === null) {
      try { setCands(await candidates(deal.deal_id)); } catch (e) { console.error("candidates failed:", e); setCands([]); }
    }
  };
  const onLink = async (sid) => {
    setBusy(sid);
    try { await link(deal.deal_id, sid); } catch (e) { console.error("link failed:", e); }
    finally { setBusy(null); }
  };
  return (
    <div className="border border-stone-200 bg-white rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-stone-900">{deal.customer_name || deal.customer_email || "Customer"}</div>
          <div className="text-[11px] text-stone-500">{deal.ae_name || "AE"} · {deal.customer_email || "no email"}{deal.payment_email && deal.payment_email !== deal.customer_email ? ` · pays as ${deal.payment_email}` : ""}{deal.one_time ? ` · ${money(deal.one_time)} upfront` : ""}{deal.mrr ? ` · ${money(deal.mrr)}/mo` : ""}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenAe && deal.ae_id && (
            <button onClick={() => onOpenAe(deal.ae_id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 whitespace-nowrap">In {(deal.ae_name || "AE").split(" ")[0]}’s pipeline ↗</button>
          )}
          <button onClick={toggle} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">{open ? "Hide" : "Find in Stripe"}</button>
        </div>
      </div>
      {open && (
        <div className="mt-2.5 border-t border-stone-100 pt-2.5">
          {cands === null ? (
            <div className="text-xs text-stone-400">Searching Stripe…</div>
          ) : cands.length === 0 ? (
            <div className="text-xs text-stone-500">No likely match found. Search Stripe manually by email, then link with the deal’s Stripe field.</div>
          ) : (
            <div className="space-y-1.5">
              {cands.map((c) => (
                <div key={c.stripe_customer_id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="text-stone-800 font-medium">{c.name || c.email || c.stripe_customer_id}</span>
                    <span className="text-stone-500 ml-2">{c.email}{Number(c.collected) > 0 ? ` · ${money(c.collected)} collected` : ""}</span>
                    <span className="ml-2 text-[10px] font-semibold text-stone-400">match {c.score}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a href={`https://dashboard.stripe.com/customers/${c.stripe_customer_id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Stripe ↗</a>
                    <button onClick={() => onLink(c.stripe_customer_id)} disabled={busy === c.stripe_customer_id} className="font-semibold px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">{busy === c.stripe_customer_id ? "Linking…" : "Link"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Closed Won deals never matched to a Stripe customer (email-mismatch stragglers).
function UnlinkedClosedWonSection({ onOpenAe }) {
  const { deals, loading, candidates, link } = useUnlinkedClosedWon();
  if (loading) return null;
  if (deals.length === 0) return null; // quiet when everything's linked
  return (
    <section className="space-y-3">
      <div>
        <h2 className="display-font text-xl font-medium text-stone-900">Unlinked Closed Won</h2>
        <p className="text-sm text-stone-500">Closed deals we never matched to a Stripe customer (usually the deal email ≠ the payment email). Until linked, their cash is invisible to commission + Fulfillment. Pick the right Stripe customer to link everywhere at once.</p>
      </div>
      <div className="space-y-2">
        {deals.map((d) => (
          <UnlinkedRow key={d.deal_id} deal={d} candidates={candidates} link={link} onOpenAe={onOpenAe} />
        ))}
      </div>
    </section>
  );
}

// Deals the Phase-B job auto-closed (customer was already paying in full).
function AutoClosedSection({ onOpenAe }) {
  const { deals, loading } = useAutoClosed();
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  const fmtDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"; } catch { return "—"; } };
  if (loading || deals.length === 0) return null; // quiet until something auto-closes
  return (
    <section className="space-y-3">
      <div>
        <h2 className="display-font text-xl font-medium text-stone-900">Auto-closed</h2>
        <p className="text-sm text-stone-500">Deals the system closed for you because the customer was already paying in full in Stripe. Onboarding fired automatically.</p>
      </div>
      <div className="space-y-2">
        {deals.map((d) => (
          <div key={d.id} className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-stone-900">{d.customer_name || d.customer_email || "Customer"}</div>
              <div className="text-[11px] text-stone-500">{d.ae_name || "AE"} · {d.one_time ? `${money(d.one_time)} upfront` : ""}{d.mrr ? ` · ${money(d.mrr)}/mo` : ""} · auto-closed {fmtDate(d.auto_closed_at)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {onOpenAe && d.ae_id && (
                <button onClick={() => onOpenAe(d.ae_id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 whitespace-nowrap">In {(d.ae_name || "AE").split(" ")[0]}’s pipeline ↗</button>
              )}
              {d.matched_stripe_customer_id && (
                <a href={`https://dashboard.stripe.com/customers/${d.matched_stripe_customer_id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">Stripe ↗</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Customers with more than one Closed Won deal (double-count risk).
function DuplicateDealsAlert({ onOpenAe }) {
  const { dupes, loading } = useDuplicateDeals();
  const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;
  const fmtDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; } catch { return "—"; } };
  if (loading) return <div className="text-sm text-stone-400">Loading…</div>;
  if (dupes.length === 0) return <div className="border-l-4 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">✓ No duplicate Closed Won deals.</div>;
  return (
    <div className="border-l-4 border-amber-400 bg-amber-50 p-4">
      <div className="font-semibold text-amber-900 flex items-center gap-2">⚠ {dupes.length} customer{dupes.length > 1 ? "s" : ""} with duplicate Closed Won deals</div>
      <p className="text-sm text-amber-800 mt-1">The same customer has more than one Closed Won deal — this double-counts revenue + commission and can double-onboard. Keep one and set the extra to <strong>Deleted</strong> in the AE's pipeline.</p>
      <div className="mt-3 space-y-2">
        {dupes.map((g) => (
          <div key={g.key} className="text-xs bg-white border border-amber-200 rounded p-2.5">
            <div className="font-medium text-stone-800 mb-1.5">
              {g.list[0].customer_name || g.list[0].customer_email} · {g.list.length} deals{g.list[0].ae_name ? ` · ${g.list[0].ae_name}` : ""}
            </div>
            <div className="space-y-1">
              {g.list.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-stone-500">{d.id.slice(0, 8)}</span>
                  <span className="text-stone-700 flex-1">{d.one_time ? `${money(d.one_time)} upfront` : "no upfront"}{d.mrr ? ` · ${money(d.mrr)}/mo` : ""}</span>
                  <span className="text-stone-500 whitespace-nowrap">closed {fmtDate(d.closed_at)}</span>
                </div>
              ))}
            </div>
            {onOpenAe && g.list[0].ae_id && (
              <button onClick={() => onOpenAe(g.list[0].ae_id)} className="mt-2 text-[11px] font-semibold text-blue-700 hover:underline">Open in the AE's pipeline →</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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

      <CollectedNotClosedSection onOpenAe={onOpenAe} />

      <UnlinkedClosedWonSection onOpenAe={onOpenAe} />

      <AutoClosedSection onOpenAe={onOpenAe} />

      <PayFixQueueSection onOpenAe={onOpenAe} />

      <section className="space-y-3">
        <div>
          <h2 className="display-font text-xl font-medium text-stone-900">Data cleanup</h2>
          <p className="text-sm text-stone-500">Duplicate Stripe customers (failed-payment retries) and customers with more than one Closed Won deal.</p>
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
        <DuplicateDealsAlert onOpenAe={onOpenAe} />
      </section>
    </div>
  );
}
