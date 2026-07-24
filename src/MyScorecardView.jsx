import React, { useState } from "react";
import { Phone, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useDialer } from "./DialerContext";
import { useFailedPayments } from "./useFailedPayments";
import { useDunningCases } from "./useDunningCases";
import { useCommissions } from "./useCommissions";
import DuplicateCustomersAlert from "./DuplicateCustomersAlert";
import { usePayFixQueue } from "./usePayFix";
import { useDuplicateDeals } from "./useDuplicateDeals";
import { useCollectedNotClosed } from "./useCollectedNotClosed";
import { useAutoClosed } from "./useAutoClosed";
import { useUnlinkedClosedWon } from "./useUnlinkedClosedWon";

const money = (v, cur) => `${cur && cur !== "usd" ? cur.toUpperCase() + " " : "$"}${Math.round(Number(v) || 0).toLocaleString()}`;
const fmtDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"; } catch { return "—"; } };
const fmtTime = (iso) => { try { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""; } catch { return ""; } };
const CASE_PILL = {
  contacted: ["Contacted", "bg-blue-100 text-blue-700"],
  promised: ["Promised", "bg-emerald-100 text-emerald-700"],
  snoozed: ["Snoozed", "bg-stone-100 text-stone-600"],
  recovered: ["Recovered", "bg-emerald-100 text-emerald-700"],
  churned: ["Churned", "bg-stone-200 text-stone-600"],
};
const TOUCH_ICON = { call: "📞", text: "💬", email: "✉️", note: "📝" };

// One failed-payment card, overlaid with its tracked dunning case (status,
// promise date, touch log). Call/Text auto-log a touch.
function DunningRow({ r, kase, dunning }) {
  const { openDialer, openMessages, available } = useDialer();
  const [showLog, setShowLog] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const gaveUp = r.status === "uncollectible";
  const meta = { name: r.name, email: r.email, amount: r.amount_due };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { console.error("dunning action failed:", e); } finally { setBusy(false); } };

  const call = () => { if (r.phone) { openDialer(r.phone, { name: r.name }); run(() => dunning.logTouch(r.customer_id, "call", {}, meta)); } };
  const text = () => { if (r.phone) { openMessages(r.phone, { name: r.name }); run(() => dunning.logTouch(r.customer_id, "text", {}, meta)); } };
  const setStatus = (patch) => run(() => dunning.updateCase(r.customer_id, patch, meta));
  const saveNote = () => { if (!noteDraft.trim()) return; run(() => dunning.logTouch(r.customer_id, "note", { note: noteDraft.trim() }, meta)).then(() => setNoteDraft("")); };

  const pill = kase ? CASE_PILL[kase.status] : null;
  return (
    <div className={`border rounded-lg p-3 ${gaveUp ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-stone-900 flex items-center gap-2 flex-wrap">
            {r.name || r.email || "Customer"}
            {gaveUp
              ? <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Stripe gave up — final</span>
              : r.status === "incomplete"
              ? <span className="text-[10px] font-semibold text-orange-800 bg-orange-100 px-1.5 py-0.5 rounded">incomplete — first payment failed</span>
              : <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">retrying</span>}
            {pill && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${pill[1]}`}>{pill[0]}{kase.status === "promised" && kase.promised_pay_date ? ` ${fmtDate(kase.promised_pay_date)}` : ""}{kase.status === "snoozed" && kase.snooze_until ? ` → ${fmtDate(kase.snooze_until)}` : ""}</span>}
          </div>
          <div className="text-[11px] text-stone-500">
            {money(r.amount_due, r.currency)} owed · {r.attempt_count} failed attempt{r.attempt_count === 1 ? "" : "s"}
            {r.next_attempt && !gaveUp ? ` · next retry ${fmtDate(r.next_attempt)}` : ""}
            {r.plan ? ` · ${r.plan}` : ""}
            {r.created ? ` · since ${fmtDate(r.created)}` : ""}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {r.email || "no email"}
            {r.phone
              ? <> · {r.phone} <span className="text-[9px] uppercase tracking-wide text-stone-400">({r.phone_source === "ghl" ? "from GHL" : "from Atlas"})</span></>
              : <> · <span className="text-stone-400">no phone found</span></>}
            {kase && kase.touch_count > 0 && (
              <> · <button onClick={() => setShowLog((s) => !s)} className="text-stone-500 hover:text-stone-700 underline">{kase.touch_count} touch{kase.touch_count === 1 ? "" : "es"}{kase.last_touch_at ? ` · last ${fmtDate(kase.last_touch_at)}` : ""}</button></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {r.phone && available && (
            <>
              <button onClick={call} disabled={busy} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 whitespace-nowrap disabled:opacity-50"><Phone size={12} /> Call</button>
              <button onClick={text} disabled={busy} className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 flex items-center gap-1 whitespace-nowrap disabled:opacity-50"><MessageSquare size={12} /> Text</button>
            </>
          )}
          {r.hosted_invoice_url && (
            <a href={r.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 whitespace-nowrap">Invoice ↗</a>
          )}
          {r.customer_id && (
            <a href={`https://dashboard.stripe.com/customers/${r.customer_id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">Stripe ↗</a>
          )}
        </div>
      </div>

      {/* Tracking controls */}
      <div className="mt-2.5 pt-2.5 border-t border-black/5 flex items-center gap-2 flex-wrap text-[11px]">
        <label className="flex items-center gap-1 text-stone-500">Promised to pay
          <input type="date" value={kase?.status === "promised" ? (kase.promised_pay_date || "") : ""} onChange={(e) => e.target.value && setStatus({ status: "promised", promised_pay_date: e.target.value, resolved_at: null })} className="border border-stone-300 rounded px-1.5 py-0.5 bg-white" /></label>
        <label className="flex items-center gap-1 text-stone-500">Snooze
          <input type="date" value={kase?.status === "snoozed" ? (kase.snooze_until || "") : ""} onChange={(e) => e.target.value && setStatus({ status: "snoozed", snooze_until: e.target.value, resolved_at: null })} className="border border-stone-300 rounded px-1.5 py-0.5 bg-white" /></label>
        <button onClick={() => setStatus({ status: "contacted" })} disabled={busy} className="font-semibold px-2 py-1 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50">Mark contacted</button>
        <button onClick={() => setStatus({ status: "recovered", resolved_at: new Date().toISOString() })} disabled={busy} className="font-semibold px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">✓ Mark paid / resolved</button>
        <button onClick={() => setStatus({ status: "churned", resolved_at: new Date().toISOString() })} disabled={busy} className="font-semibold px-2 py-1 rounded border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 disabled:opacity-50">Write off</button>
        <button onClick={() => setShowLog((s) => !s)} className="font-semibold px-2 py-1 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50">+ Note</button>
      </div>

      {showLog && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNote()} placeholder="Add a note…" className="flex-1 text-xs border border-stone-300 rounded px-2 py-1.5 bg-white" />
            <button onClick={saveNote} disabled={busy || !noteDraft.trim()} className="text-xs font-semibold px-2.5 py-1.5 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50">Save</button>
          </div>
          {kase?.touches?.length > 0 && (
            <div className="space-y-1">
              {kase.touches.map((t) => (
                <div key={t.id} className="text-[11px] text-stone-600 flex gap-2">
                  <span className="shrink-0">{TOUCH_ICON[t.kind] || "•"}</span>
                  <span className="text-stone-400 shrink-0 w-14">{fmtDate(t.at)}</span>
                  <span className="min-w-0">{t.note || t.outcome || t.kind}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Failed payments (dunning) — customers whose Stripe auto-charge failed, enriched
// with a phone (our deals/fulfillment first, else GHL) so Mark can call from the
// dialer, plus a tracked case per customer (status / promise date / touch log).
function FailedPaymentsSection() {
  const { rows: allRows, generatedAt, loading, fetching, error, refresh } = useFailedPayments();
  const dunning = useDunningCases();
  const [query, setQuery] = useState("");
  const isDone = (id) => { const k = dunning.byStripe[id]; return k && (k.status === "recovered" || k.status === "churned"); };
  // Customers you've already resolved (paid / written off) drop out of the active
  // list even if Stripe still lists them this cycle.
  const active = allRows.filter((r) => !isDone(r.customer_id));
  const doneCount = allRows.length - active.length;
  const total = active.reduce((s, r) => s + (Number(r.amount_due) || 0), 0);
  // Search by name/email, then newest failing invoice first.
  const q = query.trim().toLowerCase();
  const rows = (q ? active.filter((r) => `${r.name || ""} ${r.email || ""}`.toLowerCase().includes(q)) : active)
    .slice().sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
  const liveIds = new Set(allRows.map((r) => r.customer_id).filter(Boolean));
  // Open cases whose customer is no longer failing at all = they paid → recovered.
  const resolved = dunning.cases.filter((c) => !liveIds.has(c.stripe_customer_id) && c.status !== "recovered" && c.status !== "churned");
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display-font text-xl font-medium text-stone-900">Failed payments · dunning</h2>
          <p className="text-sm text-stone-500">
            Customers whose Stripe auto-charge failed. Call to recover, then track the outcome.
            {generatedAt && <span className="text-stone-400"> · updated {fmtTime(generatedAt)}</span>}
          </p>
        </div>
        <button onClick={() => refresh()} disabled={fetching}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
          <RefreshCw size={13} className={fetching ? "animate-spin" : ""} /> {fetching ? "Checking…" : "Refresh"}
        </button>
      </div>

      {resolved.length > 0 && (
        <div className="border-l-4 border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-semibold mb-1">✓ {resolved.length} recovered — no longer failing in Stripe</div>
          <div className="space-y-1">
            {resolved.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <span>{c.customer_name || c.customer_email}{c.amount_at_risk ? ` · was ${money(c.amount_at_risk)}` : ""}{c.touch_count ? ` · ${c.touch_count} touch${c.touch_count === 1 ? "" : "es"}` : ""}</span>
                <button onClick={() => dunning.updateCase(c.stripe_customer_id, { status: "recovered", resolved_at: new Date().toISOString() })}
                  className="font-semibold text-emerald-700 hover:underline shrink-0">Mark recovered</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-stone-400">Checking Stripe…</div>
      ) : error ? (
        <div className="border-l-4 border-red-400 bg-red-50 p-4 text-sm text-red-800">Couldn’t load failed payments: {error}</div>
      ) : active.length === 0 ? (
        <div className="border-l-4 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">✓ No failed payments right now — nothing in dunning.</div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-stone-500">{active.length} customer{active.length === 1 ? "" : "s"} · {money(total)} at risk{doneCount > 0 ? ` · ${doneCount} resolved this cycle` : ""}{q ? ` · ${rows.length} match${rows.length === 1 ? "" : "es"}` : ""}</div>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…"
                className="text-xs border border-stone-300 rounded-md pl-7 pr-2 py-1.5 bg-white w-56 focus:outline-none focus:ring-1 focus:ring-stone-300" />
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="text-sm text-stone-400 py-2">No matches for “{query}”.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <DunningRow key={r.invoice_id} r={r} kase={dunning.byStripe[r.customer_id]} dunning={dunning} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

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

      <FailedPaymentsSection />

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
