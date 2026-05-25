// ============================================================
// CommissionsTab — personal Commission view for AEs and CSMs
// ============================================================
// Rendered as a tab inside AeView.jsx (for Heather/Mason) and CsmView.jsx
// (for Matt/Sean/Noah).
//
// AE-only features (Phase 2):
//   - "Submit a deal" form: capture customer name, email, MRR, upfront cash, close date
//   - "My submitted deals" table: see status (draft/submitted/matched/needs_review),
//     edit/delete rows while still in pre-match status
//   - Bulk upload coming in Phase 5
//
// All AE deal data lives in commission_pending_deals (see migration 03).
// RLS ensures AEs only see their own rows.
//
// CSMs only see the existing read-only earnings view — they don't submit deals.
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  DollarSign, TrendingUp, Plus, Trash2, Edit3, Check, X,
  CheckCircle2, Clock, AlertCircle, Search, Loader2,
  Upload, FileSpreadsheet, Download, ChevronRight,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
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

// ============================================================
// Status visual metadata
// ============================================================
const STATUS_META = {
  draft:        { label: "Draft",         color: "#78716c", bg: "#f5f5f4", icon: Edit3 },
  submitted:    { label: "Submitted",     color: "#1d4ed8", bg: "#dbeafe", icon: Clock },
  matched:      { label: "Matched",       color: "#065f46", bg: "#d1fae5", icon: CheckCircle2 },
  needs_review: { label: "Needs review",  color: "#b45309", bg: "#fef3c7", icon: AlertCircle },
};

// ============================================================
// Main component
// ============================================================
export default function CommissionsTab({ profile }) {
  const c = useCommissions();

  // Resolve "this user" to a rep name by first token of profile.name.
  // Matches the current_user_rep_name() server function.
  const repName = (profile?.name || "").split(" ")[0];
  const userIsAE = isAE(repName);

  const calc = useMemo(() => {
    if (!repName) return null;
    return calcRepCommission(repName, c.customers, c.indexedAssignments, c.config, c.monthCols, c.indexedOverrides, c.matchedDealsByCustomer);
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

  return (
    <div className="px-6 py-6 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-medium">My Commission</div>
        <h2 className="font-serif italic text-2xl text-stone-900 mt-0.5">Earnings &amp; Forecast</h2>
        <p className="text-xs text-stone-500 mt-1">
          {userIsAE
            ? "Submit deals as you close them. Once your manager confirms the match, the commission flows into your earnings below."
            : "Read-only view. To change assignments, ask your manager."}
        </p>
      </div>

      {/* AE-only: deal submission flow */}
      {userIsAE && (
        <AEDealSubmissionSection profile={profile} repName={repName} />
      )}

      {/* Empty-state guard: only show earnings table if the user actually has attribution */}
      {(!calc || calc.book.length === 0) ? (
        <div className="bg-white border border-stone-200 px-6 py-12 text-center">
          <DollarSign size={32} className="mx-auto text-stone-300 mb-3" />
          <div className="text-sm text-stone-700 font-medium">
            {userIsAE
              ? "No matched deals yet"
              : "No customers attributed to you yet"}
          </div>
          <div className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            {userIsAE
              ? "Once a deal you submit above gets matched to Stripe and confirmed by your manager, your earnings will appear here."
              : "When a manager assigns customers to you in the Commission Tracker, your numbers will show up here."}
          </div>
        </div>
      ) : (
        <EarningsSection calc={calc} userIsAE={userIsAE} config={c.config} />
      )}
    </div>
  );
}

// ============================================================
// AE deal-submission section
// ============================================================
// Renders:
//   - "Add deal" form (collapsed by default; expands when AE clicks)
//   - List of the AE's own pending deals with status + edit/delete actions
// ============================================================
function AEDealSubmissionSection({ profile, repName }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Load this AE's pending deals (RLS scopes to ae_id = auth.uid())
  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("commission_pending_deals")
      .select("*")
      .eq("ae_id", profile.id)
      .order("closed_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setDeals(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.id) loadDeals();
  }, [profile?.id]);

  // Stats
  const stats = useMemo(() => {
    const byStatus = { draft: 0, submitted: 0, matched: 0, needs_review: 0 };
    let pendingMRR = 0;
    let matchedMRR = 0;
    let pendingUpfront = 0;
    let matchedUpfront = 0;
    for (const d of deals) {
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      if (d.status === "matched") {
        matchedMRR += Number(d.mrr_amount) || 0;
        matchedUpfront += Number(d.upfront_amount) || 0;
      } else {
        pendingMRR += Number(d.mrr_amount) || 0;
        pendingUpfront += Number(d.upfront_amount) || 0;
      }
    }
    return { byStatus, pendingMRR, matchedMRR, pendingUpfront, matchedUpfront };
  }, [deals]);

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-medium">Deal submissions</div>
          <h3 className="font-serif italic text-xl text-stone-900 mt-0.5">Deals you've closed</h3>
          <p className="text-xs text-stone-500 mt-1">
            Add deals as you close them — your manager will match them to Stripe and confirm.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowBulkUpload(true); setShowAddForm(false); setEditingId(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-stone-700 border border-stone-300 rounded-sm hover:bg-stone-100 transition-colors"
          >
            <Upload size={14} /> Bulk upload
          </button>
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-sm transition-opacity hover:opacity-90"
            style={{ background: BRAND.purple }}
          >
            <Plus size={14} /> Add deal
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200">
        <PendingStat
          label="Pending match"
          value={stats.byStatus.submitted + stats.byStatus.draft + stats.byStatus.needs_review}
          sub={`${fmtMoney(stats.pendingMRR)} MRR · ${fmtMoney(stats.pendingUpfront)} upfront`}
          icon={Clock} iconColor="#1d4ed8"
        />
        <PendingStat
          label="Matched"
          value={stats.byStatus.matched}
          sub={`${fmtMoney(stats.matchedMRR)} MRR · ${fmtMoney(stats.matchedUpfront)} upfront`}
          icon={CheckCircle2} iconColor="#059669"
        />
        <PendingStat
          label="Needs review"
          value={stats.byStatus.needs_review}
          sub={stats.byStatus.needs_review > 0 ? "Manager may have flagged" : "All clear"}
          icon={AlertCircle}
          iconColor={stats.byStatus.needs_review > 0 ? "#b45309" : "#a8a29e"}
        />
        <PendingStat
          label="Total deals"
          value={deals.length}
          sub="All time"
          icon={TrendingUp} iconColor="#57534e"
        />
      </div>

      {/* Inline add/edit form */}
      {(showAddForm || editingId) && (
        <DealForm
          profile={profile}
          repName={repName}
          existingDeal={editingId ? deals.find(d => d.id === editingId) : null}
          onClose={() => { setShowAddForm(false); setEditingId(null); }}
          onSaved={() => { setShowAddForm(false); setEditingId(null); loadDeals(); }}
        />
      )}

      {/* Bulk upload modal */}
      {showBulkUpload && (
        <BulkUploadModal
          profile={profile}
          repName={repName}
          existingDeals={deals}
          onClose={() => setShowBulkUpload(false)}
          onImported={() => { setShowBulkUpload(false); loadDeals(); }}
        />
      )}

      {/* Deals table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h4 className="text-sm font-medium text-stone-900">My deals</h4>
          {loading && <Loader2 size={14} className="text-stone-400 animate-spin" />}
        </div>

        {error && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-xs text-red-900">
            {error}
          </div>
        )}

        {!loading && deals.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <DollarSign size={28} className="mx-auto text-stone-300 mb-3" />
            <div className="text-sm text-stone-700 font-medium">No deals submitted yet</div>
            <div className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
              Click "Add deal" above when you close your next sale. We'll track it through matching and into your earnings.
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/50">
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <th className="px-4 py-2 font-medium">Closed</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium text-right">MRR</th>
                <th className="px-3 py-2 font-medium text-right">Upfront</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => (
                <DealRow
                  key={d.id}
                  deal={d}
                  onEdit={() => { setEditingId(d.id); setShowAddForm(false); }}
                  onDeleted={loadDeals}
                  onSubmitted={loadDeals}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Deal row
// ============================================================
function DealRow({ deal, onEdit, onDeleted, onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[deal.status] || STATUS_META.draft;
  const StatusIcon = meta.icon;
  const isLocked = deal.status === "matched";

  const handleSubmit = async () => {
    if (!confirm(`Submit "${deal.customer_name}" for matching? You can still edit or delete it until your manager confirms the match.`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("commission_pending_deals")
      .update({ status: "submitted" })
      .eq("id", deal.id);
    setBusy(false);
    if (error) {
      alert("Failed to submit: " + error.message);
    } else {
      onSubmitted();
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the deal for "${deal.customer_name}"? This can't be undone.`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("commission_pending_deals")
      .delete()
      .eq("id", deal.id);
    setBusy(false);
    if (error) {
      alert("Failed to delete: " + error.message);
    } else {
      onDeleted();
    }
  };

  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/40">
      <td className="px-4 py-2 text-stone-700 font-mono tabular-nums text-xs whitespace-nowrap">
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
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium"
          style={{ background: meta.bg, color: meta.color }}
        >
          <StatusIcon size={11} />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {busy ? (
          <Loader2 size={14} className="text-stone-400 animate-spin inline-block" />
        ) : isLocked ? (
          <span className="text-[10px] text-stone-400 italic">locked</span>
        ) : (
          <div className="inline-flex items-center gap-1">
            {deal.status === "draft" && (
              <button
                onClick={handleSubmit}
                title="Submit for matching"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white rounded-sm transition-opacity hover:opacity-90"
                style={{ background: BRAND.purple }}
              >
                Submit
              </button>
            )}
            <button
              onClick={onEdit}
              title="Edit"
              className="p-1 text-stone-500 hover:text-stone-900 transition-colors"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={handleDelete}
              title="Delete"
              className="p-1 text-stone-500 hover:text-red-600 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ============================================================
// Deal form (used for both Add and Edit)
// ============================================================
function DealForm({ profile, repName, existingDeal, onClose, onSaved }) {
  const isEditing = !!existingDeal;
  const [form, setForm] = useState(() => existingDeal ? {
    customer_name:   existingDeal.customer_name || "",
    customer_email:  existingDeal.customer_email || "",
    customer_phone:  existingDeal.customer_phone || "",
    mrr_amount:      existingDeal.mrr_amount != null ? String(existingDeal.mrr_amount) : "",
    upfront_amount:  existingDeal.upfront_amount != null ? String(existingDeal.upfront_amount) : "",
    closed_date:     existingDeal.closed_date || new Date().toISOString().slice(0, 10),
    notes:           existingDeal.notes || "",
  } : {
    customer_name:   "",
    customer_email:  "",
    customer_phone:  "",
    mrr_amount:      "",
    upfront_amount:  "",
    closed_date:     new Date().toISOString().slice(0, 10),
    notes:           "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitAfterSave, setSubmitAfterSave] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isValid =
    form.customer_name.trim().length > 0 &&
    form.customer_email.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.customer_email.trim()) &&
    form.closed_date &&
    (Number(form.mrr_amount) > 0 || Number(form.upfront_amount) > 0);

  const handleSave = async () => {
    if (!isValid) {
      setError("Customer name, valid email, close date, and at least one amount (MRR or upfront) are required.");
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      customer_name:   form.customer_name.trim(),
      customer_email:  form.customer_email.trim().toLowerCase(),
      customer_phone:  form.customer_phone.trim() || null,
      mrr_amount:      Number(form.mrr_amount) || 0,
      upfront_amount:  Number(form.upfront_amount) || 0,
      closed_date:     form.closed_date,
      notes:           form.notes.trim() || null,
    };

    let result;
    if (isEditing) {
      // Edit existing — don't change ae_id, ae_name, or status here
      // (status changes happen via dedicated Submit button)
      result = await supabase
        .from("commission_pending_deals")
        .update(payload)
        .eq("id", existingDeal.id);
    } else {
      // New deal — start as draft unless user clicked "Save & submit"
      result = await supabase
        .from("commission_pending_deals")
        .insert({
          ...payload,
          ae_id: profile.id,
          ae_name: profile.name || repName,
          status: submitAfterSave ? "submitted" : "draft",
        });
    }

    setBusy(false);
    if (result.error) {
      // Handle the unique constraint violation gracefully
      if (result.error.code === "23505") {
        setError("You've already submitted a deal with this email on this close date. Edit the existing one instead.");
      } else {
        setError(result.error.message);
      }
    } else {
      onSaved();
    }
  };

  return (
    <div className="bg-white border-2 rounded-sm overflow-hidden" style={{ borderColor: BRAND.purple }}>
      <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between" style={{ background: BRAND.purpleTint }}>
        <h4 className="text-sm font-medium" style={{ color: BRAND.purpleDeep }}>
          {isEditing ? "Edit deal" : "Add a new deal"}
        </h4>
        <button onClick={onClose} className="text-stone-500 hover:text-stone-900 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer name" required>
          <input
            type="text"
            value={form.customer_name}
            onChange={(e) => update("customer_name", e.target.value)}
            placeholder="Acme Roofing Co."
            className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
          />
        </Field>

        <Field label="Customer email" required hint="Primary email you communicate with — may differ from Stripe billing email">
          <input
            type="email"
            value={form.customer_email}
            onChange={(e) => update("customer_email", e.target.value)}
            placeholder="owner@acmeroofing.com"
            className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
          />
        </Field>

        <Field label="Close date" required>
          <input
            type="date"
            value={form.closed_date}
            onChange={(e) => update("closed_date", e.target.value)}
            className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            type="tel"
            value={form.customer_phone}
            onChange={(e) => update("customer_phone", e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
          />
        </Field>

        <Field label="MRR amount" hint="Monthly recurring revenue ($)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.mrr_amount}
              onChange={(e) => update("mrr_amount", e.target.value)}
              placeholder="0.00"
              className="w-full border border-stone-300 pl-7 pr-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-stone-900"
            />
          </div>
        </Field>

        <Field label="Upfront cash" hint="One-time / months prepaid ($)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.upfront_amount}
              onChange={(e) => update("upfront_amount", e.target.value)}
              placeholder="0.00"
              className="w-full border border-stone-300 pl-7 pr-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-stone-900"
            />
          </div>
        </Field>

        <Field label="Notes (optional)" className="md:col-span-2">
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Anything your manager should know — e.g. annual prepay, special discount, source"
            className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900 resize-y"
          />
        </Field>
      </div>

      {error && (
        <div className="px-5 pb-3">
          <div className="bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900 flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2 flex-wrap">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 transition-colors rounded-sm"
        >
          Cancel
        </button>
        {!isEditing && (
          <button
            onClick={() => { setSubmitAfterSave(false); handleSave(); }}
            disabled={busy || !isValid}
            className="px-3 py-2 text-sm font-medium border border-stone-300 hover:bg-stone-100 transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
            Save as draft
          </button>
        )}
        <button
          onClick={() => { setSubmitAfterSave(true); handleSave(); }}
          disabled={busy || !isValid}
          className="px-3 py-2 text-sm font-medium text-white rounded-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: BRAND.purple }}
        >
          {busy ? <Loader2 size={14} className="inline animate-spin mr-1" /> : <Check size={14} className="inline mr-1" />}
          {isEditing ? "Save changes" : "Save & submit"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, required, className = "", children }) {
  return (
    <div className={className}>
      <label className="block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-stone-500 mt-1">{hint}</div>}
    </div>
  );
}

function PendingStat({ label, value, sub, icon: Icon, iconColor }) {
  return (
    <div className="bg-white border border-stone-200 px-5 py-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</div>
        {Icon && <Icon size={14} style={{ color: iconColor }} />}
      </div>
      <div className="text-2xl font-mono tabular-nums text-stone-900">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

// ============================================================
// Earnings section (existing functionality — preserved)
// ============================================================
function EarningsSection({ calc, userIsAE, config }) {
  const ytd = calc.monthly.reduce((a, m) => ({
    voiceAICommission: a.voiceAICommission + m.voiceAICommission,
    aeResidual:        a.aeResidual + m.aeResidual,
    csmResidual:       a.csmResidual + m.csmResidual,
    total:             a.total + m.total,
    newDeals:          a.newDeals + m.newDeals,
    newMRR:            a.newMRR + m.newMRR,
  }), { voiceAICommission: 0, aeResidual: 0, csmResidual: 0, total: 0, newDeals: 0, newMRR: 0 });

  const acc = userIsAE ? calcAccelerator(ytd.total, config) : null;
  const lastMonth = calc.monthly[calc.monthly.length - 1];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-medium">Earnings to date</div>
        <h3 className="font-serif italic text-xl text-stone-900 mt-0.5">Confirmed commission</h3>
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

// ============================================================
// BulkUploadModal — drag/drop CSV or XLSX of closed deals
// ============================================================
// User flow:
//   1. Drop a file or click to browse
//   2. We parse it client-side and try to auto-detect which column
//      maps to which deal field (customer_name, customer_email, mrr_amount,
//      upfront_amount, closed_date, customer_phone, notes)
//   3. AE can override the mapping if auto-detect was wrong
//   4. Preview table shows each row with validation status
//   5. AE can uncheck rows they don't want to import, edit cells inline
//   6. Click Import → batch insert into commission_pending_deals
// ============================================================

const FIELD_DEFINITIONS = [
  { key: "customer_name",  label: "Customer name",  required: true,  type: "string" },
  { key: "customer_email", label: "Customer email", required: true,  type: "email" },
  { key: "mrr_amount",     label: "MRR amount",     required: false, type: "money" },
  { key: "upfront_amount", label: "Upfront cash",   required: false, type: "money" },
  { key: "closed_date",    label: "Close date",     required: true,  type: "date" },
  { key: "customer_phone", label: "Phone",          required: false, type: "string" },
  { key: "notes",          label: "Notes",          required: false, type: "string" },
];

// Header-to-field auto-detection. Tested against common spreadsheet conventions.
const HEADER_ALIASES = {
  customer_name:  ["customer", "customer name", "company", "company name", "client", "client name", "name", "account", "account name", "business", "business name"],
  customer_email: ["email", "customer email", "email address", "client email", "billing email", "e-mail", "contact email"],
  mrr_amount:     ["mrr", "mrr amount", "monthly", "monthly recurring", "monthly recurring revenue", "monthly amount", "monthly fee", "subscription", "recurring", "monthly mrr", "mo"],
  upfront_amount: ["upfront", "upfront cash", "upfront amount", "initial", "initial payment", "deposit", "annual", "annual prepay", "one-time", "onetime", "cash", "prepay", "total", "deal value", "deal amount"],
  closed_date:    ["close date", "closed", "closed date", "date closed", "won date", "date", "sale date", "deal date", "signed date", "signed", "won"],
  customer_phone: ["phone", "customer phone", "phone number", "tel", "telephone", "mobile", "contact"],
  notes:          ["notes", "comment", "comments", "description", "memo", "details"],
};

function autoDetectMapping(headers) {
  const mapping = {};
  const lowerHeaders = headers.map(h => (h || "").toString().toLowerCase().trim());

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      const h = lowerHeaders[i];
      if (!h) continue;
      if (aliases.some(a => h === a || h === a.replace(/\s+/g, "") || h.replace(/[_\-\s]/g, "") === a.replace(/\s+/g, ""))) {
        if (!mapping[field]) {
          mapping[field] = headers[i];
          break;
        }
      }
    }
  }
  return mapping;
}

// Parse a money string: "$1,500.00", "1500", "$1.5k" → number
function parseMoney(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  // handle "1.5k" or "1k" suffix
  const m = s.match(/^([\d.]+)\s*([km]?)$/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (m[2]?.toLowerCase() === "k") return n * 1000;
    if (m[2]?.toLowerCase() === "m") return n * 1000000;
    return n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parse a date string into ISO YYYY-MM-DD. Accepts many common formats.
function parseDate(v) {
  if (!v) return null;
  // Excel date serial number
  if (typeof v === "number") {
    // Excel epoch is 1899-12-30
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try Date.parse fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function validateRow(row) {
  const errors = [];
  if (!row.customer_name || !String(row.customer_name).trim()) errors.push("Missing customer name");
  if (!row.customer_email || !String(row.customer_email).trim()) errors.push("Missing email");
  else if (!/\S+@\S+\.\S+/.test(String(row.customer_email).trim())) errors.push("Invalid email");
  if (!row.closed_date) errors.push("Missing or invalid close date");
  if ((Number(row.mrr_amount) || 0) === 0 && (Number(row.upfront_amount) || 0) === 0) errors.push("MRR or Upfront required");
  return errors;
}

function BulkUploadModal({ profile, repName, existingDeals, onClose, onImported }) {
  const [stage, setStage] = useState("upload");  // upload | mapping | preview | importing | done
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);  // array of objects from the parser
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});  // { field: headerName }
  const [previewRows, setPreviewRows] = useState([]);  // [{ checked, ...fields, errors }]
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ===== File parsing =====
  const handleFile = async (file) => {
    setError(null);
    setFileName(file.name);

    try {
      const ext = file.name.toLowerCase().split(".").pop();
      let rows = [];

      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        // Use papaparse for CSV
        await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              rows = results.data;
              resolve();
            },
            error: reject,
          });
        });
      } else if (ext === "xlsx" || ext === "xls") {
        // Use SheetJS for Excel
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      } else {
        setError(`Unsupported file type: .${ext}. Use .csv or .xlsx`);
        return;
      }

      if (rows.length === 0) {
        setError("That file appears to be empty or has no data rows.");
        return;
      }

      const hdrs = Object.keys(rows[0]);
      const guessedMapping = autoDetectMapping(hdrs);

      setRawRows(rows);
      setHeaders(hdrs);
      setMapping(guessedMapping);
      setStage("mapping");
    } catch (e) {
      setError(`Could not read file: ${e.message}`);
    }
  };

  // ===== Mapping → Preview =====
  const buildPreview = () => {
    const existingKeys = new Set(
      existingDeals.map(d => `${(d.customer_email || "").toLowerCase()}::${d.closed_date}`)
    );

    const newRows = rawRows.map((raw, i) => {
      const row = {
        _rowNum: i + 2,  // +2: header is row 1, data starts at row 2
        checked: true,
        customer_name:  mapping.customer_name  ? raw[mapping.customer_name]  : "",
        customer_email: mapping.customer_email ? raw[mapping.customer_email] : "",
        customer_phone: mapping.customer_phone ? raw[mapping.customer_phone] : "",
        mrr_amount:     mapping.mrr_amount     ? parseMoney(raw[mapping.mrr_amount])     : 0,
        upfront_amount: mapping.upfront_amount ? parseMoney(raw[mapping.upfront_amount]) : 0,
        closed_date:    mapping.closed_date    ? parseDate(raw[mapping.closed_date])     : null,
        notes:          mapping.notes          ? raw[mapping.notes]          : "",
      };
      // Trim string fields
      row.customer_name = String(row.customer_name || "").trim();
      row.customer_email = String(row.customer_email || "").trim().toLowerCase();
      row.customer_phone = String(row.customer_phone || "").trim();
      row.notes = String(row.notes || "").trim();

      row.errors = validateRow(row);
      const key = `${row.customer_email}::${row.closed_date}`;
      if (existingKeys.has(key)) {
        row.errors = [...row.errors, "Duplicate (already submitted)"];
        row.checked = false;  // unchecked by default
      }
      return row;
    });

    setPreviewRows(newRows);
    setStage("preview");
  };

  const updatePreviewRow = (rowIdx, updates) => {
    setPreviewRows(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], ...updates };
      // Re-validate
      const errors = validateRow(next[rowIdx]);
      const existingKeys = new Set(
        existingDeals.map(d => `${(d.customer_email || "").toLowerCase()}::${d.closed_date}`)
      );
      const key = `${(next[rowIdx].customer_email || "").toLowerCase()}::${next[rowIdx].closed_date}`;
      if (existingKeys.has(key) && !errors.includes("Duplicate (already submitted)")) {
        errors.push("Duplicate (already submitted)");
      }
      next[rowIdx].errors = errors;
      return next;
    });
  };

  // ===== Submit batch =====
  const handleImport = async () => {
    setStage("importing");
    setError(null);
    const toImport = previewRows.filter(r => r.checked && (r.errors?.length || 0) === 0);

    if (toImport.length === 0) {
      setError("Nothing to import. Check the rows and fix any errors first.");
      setStage("preview");
      return;
    }

    const payload = toImport.map(r => ({
      ae_id: profile.id,
      ae_name: profile.name || repName,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone || null,
      mrr_amount: Number(r.mrr_amount) || 0,
      upfront_amount: Number(r.upfront_amount) || 0,
      closed_date: r.closed_date,
      notes: r.notes || null,
      status: "submitted",
    }));

    const { data, error: insErr } = await supabase
      .from("commission_pending_deals")
      .insert(payload)
      .select();

    if (insErr) {
      setError(`Import failed: ${insErr.message}`);
      setStage("preview");
      return;
    }

    setImportResult({
      inserted: data?.length || 0,
      skipped: previewRows.length - toImport.length,
    });
    setStage("done");
  };

  // ===== Template download =====
  const downloadTemplate = () => {
    const csv = "Customer Name,Email,MRR,Upfront,Close Date,Phone,Notes\n" +
                "Acme Roofing,owner@acmeroofing.com,500,1500,2026-05-20,(555) 123-4567,3-month prepay\n" +
                "Bright Movers,info@brightmovers.com,300,0,2026-05-18,,Annual contract\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atlas-bulk-deals-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ===== Render =====
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white max-w-5xl w-full max-h-[90vh] overflow-y-auto rounded-sm border-2" style={{ borderColor: BRAND.purple }}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between" style={{ background: BRAND.purpleTint }}>
          <div className="flex items-center gap-2">
            <Upload size={16} style={{ color: BRAND.purpleDeep }} />
            <h4 className="text-sm font-medium" style={{ color: BRAND.purpleDeep }}>
              Bulk upload deals
              {fileName && <span className="text-stone-500 font-normal ml-2">· {fileName}</span>}
            </h4>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Stage indicator */}
        <div className="px-5 py-2 border-b border-stone-200 bg-stone-50/60 flex items-center gap-2 text-[10px] uppercase tracking-wider font-medium">
          <StageStep label="Upload"  active={stage === "upload"}  done={["mapping", "preview", "importing", "done"].includes(stage)} />
          <ChevronRight size={11} className="text-stone-300" />
          <StageStep label="Mapping" active={stage === "mapping"} done={["preview", "importing", "done"].includes(stage)} />
          <ChevronRight size={11} className="text-stone-300" />
          <StageStep label="Preview" active={stage === "preview"} done={["importing", "done"].includes(stage)} />
          <ChevronRight size={11} className="text-stone-300" />
          <StageStep label="Import"  active={stage === "importing" || stage === "done"} done={stage === "done"} />
        </div>

        {/* Body */}
        <div className="p-5">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STAGE 1: UPLOAD */}
          {stage === "upload" && (
            <div>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                className={`block border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-colors ${dragging ? "" : "border-stone-300 hover:border-stone-500"}`}
                style={dragging ? { borderColor: BRAND.purple, background: BRAND.purpleTint } : {}}
              >
                <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <FileSpreadsheet size={36} className="mx-auto mb-3 text-stone-400" />
                <div className="text-sm font-medium text-stone-900">Drop a spreadsheet here</div>
                <div className="text-xs text-stone-500 mt-1">or click to browse — .csv or .xlsx</div>
                <button type="button" onClick={(e) => { e.preventDefault(); downloadTemplate(); }}
                  className="mt-4 text-xs inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 underline">
                  <Download size={11} /> Download a template CSV
                </button>
              </label>

              <div className="mt-4 text-xs text-stone-500 space-y-1">
                <div><span className="font-semibold text-stone-700">Expected columns (case-insensitive):</span></div>
                <div>· <span className="mono-font">Customer Name</span> · <span className="mono-font">Email</span> · <span className="mono-font">MRR</span> · <span className="mono-font">Upfront</span> · <span className="mono-font">Close Date</span> · <span className="mono-font">Phone</span> · <span className="mono-font">Notes</span></div>
                <div>If your headers differ, you can map them manually on the next step.</div>
              </div>
            </div>
          )}

          {/* STAGE 2: MAPPING */}
          {stage === "mapping" && (
            <div>
              <p className="text-sm text-stone-700 mb-3">
                We detected {rawRows.length} row{rawRows.length === 1 ? "" : "s"}. Confirm which column from your spreadsheet maps to which deal field:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FIELD_DEFINITIONS.map(field => (
                  <div key={field.key} className="border border-stone-200 px-3 py-2.5 rounded-sm">
                    <label className="block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <select
                      value={mapping[field.key] || ""}
                      onChange={(e) => setMapping(m => ({ ...m, [field.key]: e.target.value || undefined }))}
                      className="w-full border border-stone-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-stone-900"
                    >
                      <option value="">— ignore —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setStage("upload")}
                  className="text-sm text-stone-700 hover:bg-stone-100 px-3 py-1.5 rounded-sm">
                  ← Back
                </button>
                <button onClick={buildPreview}
                  disabled={!mapping.customer_name || !mapping.customer_email || !mapping.closed_date}
                  className="px-3 py-2 text-sm font-medium text-white rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: BRAND.purple }}>
                  Continue to preview →
                </button>
              </div>
              {(!mapping.customer_name || !mapping.customer_email || !mapping.closed_date) && (
                <div className="mt-2 text-xs text-amber-700">
                  Customer name, email, and close date are required.
                </div>
              )}
            </div>
          )}

          {/* STAGE 3: PREVIEW */}
          {stage === "preview" && (
            <div>
              <PreviewSummary previewRows={previewRows} />
              <div className="border border-stone-200 overflow-x-auto rounded-sm mt-3">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2 w-12">Row</th>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Email</th>
                      <th className="px-2 py-2 text-right">MRR</th>
                      <th className="px-2 py-2 text-right">Upfront</th>
                      <th className="px-2 py-2">Close date</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <PreviewRow key={i} row={row} idx={i} onUpdate={(updates) => updatePreviewRow(i, updates)} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setStage("mapping")}
                  className="text-sm text-stone-700 hover:bg-stone-100 px-3 py-1.5 rounded-sm">
                  ← Back to mapping
                </button>
                <button onClick={handleImport}
                  disabled={previewRows.filter(r => r.checked && (r.errors?.length || 0) === 0).length === 0}
                  className="px-4 py-2 text-sm font-medium text-white rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-2"
                  style={{ background: BRAND.purple }}>
                  <Check size={14} />
                  Import {previewRows.filter(r => r.checked && (r.errors?.length || 0) === 0).length} deal{previewRows.filter(r => r.checked && (r.errors?.length || 0) === 0).length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}

          {/* STAGE 4: IMPORTING */}
          {stage === "importing" && (
            <div className="py-12 text-center">
              <Loader2 size={32} className="mx-auto animate-spin text-stone-400 mb-3" />
              <div className="text-sm text-stone-700">Importing your deals…</div>
            </div>
          )}

          {/* STAGE 5: DONE */}
          {stage === "done" && importResult && (
            <div className="py-8 text-center">
              <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: BRAND.purple }} />
              <div className="text-lg font-medium text-stone-900">All done</div>
              <div className="text-sm text-stone-600 mt-1">
                Imported <span className="font-semibold">{importResult.inserted}</span> deal{importResult.inserted === 1 ? "" : "s"}
                {importResult.skipped > 0 && <> · Skipped {importResult.skipped} (duplicates or invalid)</>}
              </div>
              <button onClick={onImported}
                className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-sm hover:opacity-90 transition-opacity"
                style={{ background: BRAND.purple }}>
                See my deals
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageStep({ label, active, done }) {
  let style;
  if (done) style = { color: "#059669" };
  else if (active) style = { color: BRAND.purple };
  else style = { color: "#a8a29e" };
  return (
    <span className="inline-flex items-center gap-1" style={style}>
      {done && <Check size={11} />}
      {label}
    </span>
  );
}

function PreviewSummary({ previewRows }) {
  const ok = previewRows.filter(r => r.checked && (r.errors?.length || 0) === 0).length;
  const errs = previewRows.filter(r => r.errors?.length > 0).length;
  const unchecked = previewRows.filter(r => !r.checked).length - previewRows.filter(r => !r.checked && r.errors?.includes("Duplicate (already submitted)")).length;
  const dupes = previewRows.filter(r => r.errors?.includes("Duplicate (already submitted)")).length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200">
      <SummaryStat label="Ready to import" value={ok} color="#059669" />
      <SummaryStat label="Errors" value={errs} color="#dc2626" />
      <SummaryStat label="Duplicates" value={dupes} color="#b45309" />
      <SummaryStat label="Total rows" value={previewRows.length} color="#57534e" />
    </div>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">{label}</div>
      <div className="text-xl font-mono tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function PreviewRow({ row, idx, onUpdate }) {
  const hasErrors = (row.errors?.length || 0) > 0;
  const isDuplicate = row.errors?.includes("Duplicate (already submitted)");
  return (
    <tr className={`border-b border-stone-100 ${hasErrors ? "bg-red-50/40" : ""}`}>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={row.checked}
          onChange={(e) => onUpdate({ checked: e.target.checked })}
          disabled={isDuplicate && !row.checked}
          className="cursor-pointer" />
      </td>
      <td className="px-2 py-1.5 text-stone-400 mono-font text-[10px]">{row._rowNum}</td>
      <td className="px-2 py-1.5">
        <input value={row.customer_name || ""}
          onChange={(e) => onUpdate({ customer_name: e.target.value })}
          className="w-full bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5" />
      </td>
      <td className="px-2 py-1.5">
        <input value={row.customer_email || ""}
          onChange={(e) => onUpdate({ customer_email: e.target.value })}
          className="w-full bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5 mono-font text-[11px]" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input type="number" step="0.01" value={row.mrr_amount || 0}
          onChange={(e) => onUpdate({ mrr_amount: parseFloat(e.target.value) || 0 })}
          className="w-20 text-right bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5 mono-font tabular-nums" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input type="number" step="0.01" value={row.upfront_amount || 0}
          onChange={(e) => onUpdate({ upfront_amount: parseFloat(e.target.value) || 0 })}
          className="w-20 text-right bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5 mono-font tabular-nums" />
      </td>
      <td className="px-2 py-1.5">
        <input type="date" value={row.closed_date || ""}
          onChange={(e) => onUpdate({ closed_date: e.target.value })}
          className="bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-900 focus:outline-none px-1 py-0.5 text-[11px]" />
      </td>
      <td className="px-2 py-1.5">
        {hasErrors ? (
          <span className="inline-flex items-center gap-1 text-red-700" title={row.errors.join(" · ")}>
            <AlertCircle size={11} />
            <span className="text-[10px]">{row.errors.length} issue{row.errors.length === 1 ? "" : "s"}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check size={11} />
            <span className="text-[10px]">OK</span>
          </span>
        )}
      </td>
    </tr>
  );
}
