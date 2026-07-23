// ============================================================
// useCommissions — commission data via React Query (cached)
// ============================================================
// Reads are cached at the app-root QueryClient so switching away from and
// back to the Commissions view renders instantly from cache and refreshes
// in the background. DB writes are unchanged; mutations refetch on success.
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import {
  DEFAULT_CONFIG,
  indexAssignments,
  indexOverrides,
  indexMatchedDeals,
} from "./commissionEngine";

async function fetchCommissions() {
  const [custRes, asgnRes, cfgRes, unmRes, pendRes, ovrRes, profRes] = await Promise.all([
    supabase.from("commission_customers").select("*").order("start_date", { ascending: false }),
    supabase.from("commission_assignments").select("*"),
    supabase.from("commission_config").select("*").eq("id", 1).maybeSingle(),
    supabase.from("commission_unmatched").select("*").order("created_at", { ascending: false }),
    supabase.from("commission_pending_deals").select("*"),
    supabase.from("commission_rep_overrides").select("*"),
    supabase.from("profiles").select("id, name, role, role_type, team, is_team_lead, manager_id"),
  ]);

  if (custRes.error) console.error("customers query error:", custRes.error);
  if (asgnRes.error) console.error("assignments query error:", asgnRes.error);
  if (cfgRes.error)  console.error("config query error:", cfgRes.error);
  if (unmRes.error)  console.error("unmatched query error:", unmRes.error);
  if (pendRes.error) console.error("pending_deals query error:", pendRes.error);
  if (ovrRes.error)  console.error("rep_overrides query error:", ovrRes.error);
  if (profRes.error) console.error("profiles query error:", profRes.error);

  const customers = custRes.data || [];
  let lastSyncAt = null;
  if (customers.length) {
    lastSyncAt = customers.reduce((max, c) =>
      c.last_synced_at && (!max || c.last_synced_at > max) ? c.last_synced_at : max, null);
  }

  return {
    customers,
    assignments: asgnRes.data || [],
    config: cfgRes.data?.settings || DEFAULT_CONFIG,
    unmatched: unmRes.data || [],
    pendingDeals: pendRes.data || [],
    repOverrides: ovrRes.data || [],
    profiles: profRes.data || [],
    lastSyncAt,
  };
}

export function useCommissions() {
  const queryClient = useQueryClient();
  const { data, isPending, error: queryError, refetch } = useQuery({
    queryKey: ["commissions"],
    queryFn: fetchCommissions,
  });

  const [syncing, setSyncing] = useState(false);

  const customers    = data?.customers    ?? [];
  const assignments  = data?.assignments  ?? [];
  const config       = data?.config       ?? DEFAULT_CONFIG;
  const unmatched    = data?.unmatched    ?? [];
  const pendingDeals = data?.pendingDeals ?? [];
  const repOverrides = data?.repOverrides ?? [];
  const profiles     = data?.profiles     ?? [];
  const lastSyncAt   = data?.lastSyncAt   ?? null;

  const loading = isPending;
  const error = queryError ? (queryError.message || String(queryError)) : null;

  const indexedAssignments = useMemo(() => indexAssignments(assignments), [assignments]);
  const indexedOverrides = useMemo(() => indexOverrides(repOverrides), [repOverrides]);
  const matchedDealsByCustomer = useMemo(() => indexMatchedDeals(pendingDeals), [pendingDeals]);
  const monthCols = useMemo(() => {
    const set = new Set();
    for (const c of customers) {
      if (c.monthly_mrr) for (const k of Object.keys(c.monthly_mrr)) set.add(k);
    }
    return Array.from(set).sort();
  }, [customers]);

  const setAssignment = useCallback(async (customer, field, rep) => {
    // `rep` may be a rep object { id, name, firstName }, a legacy name string, or null.
    const repName = rep && typeof rep === "object" ? (rep.firstName || (rep.name || "").split(" ")[0]) : (rep || null);
    const repProfileId = rep && typeof rep === "object" ? (rep.id || null) : null;
    const existing = assignments.find((a) =>
      (customer.stripe_customer_id && a.stripe_customer_id === customer.stripe_customer_id) ||
      (a.email?.toLowerCase() === customer.email?.toLowerCase())
    );
    try {
      if (existing) {
        const newAe    = field === "ae"  ? repName      : existing.ae;
        const newAeId  = field === "ae"  ? repProfileId : existing.ae_id;
        const newCsm   = field === "csm" ? repName      : existing.csm;
        const newCsmId = field === "csm" ? repProfileId : existing.csm_id;
        if (!newAe && !newCsm) {
          const { error: delErr } = await supabase.from("commission_assignments").delete().eq("id", existing.id);
          if (delErr) throw delErr;
        } else {
          const { error: upErr } = await supabase.from("commission_assignments")
            .update({ ae: newAe, ae_id: newAeId, csm: newCsm, csm_id: newCsmId }).eq("id", existing.id);
          if (upErr) throw upErr;
        }
      } else {
        const { error: insErr } = await supabase.from("commission_assignments").insert({
          stripe_customer_id: customer.stripe_customer_id || null,
          email: customer.email,
          ae:     field === "ae"  ? repName      : null,
          ae_id:  field === "ae"  ? repProfileId : null,
          csm:    field === "csm" ? repName      : null,
          csm_id: field === "csm" ? repProfileId : null,
        });
        if (insErr) throw insErr;
      }
      await refetch();
    } catch (e) {
      console.error("setAssignment failed:", e);
      await refetch();
      throw e;
    }
  }, [assignments, refetch]);

  const bulkAssignAE = useCallback(async (customerList, rep) => {
    const repName = rep && typeof rep === "object" ? (rep.firstName || (rep.name || "").split(" ")[0]) : (rep || null);
    const repProfileId = rep && typeof rep === "object" ? (rep.id || null) : null;
    const targets = customerList.filter((c) => !c.is_self_serve);
    const updates = targets.map((c) => {
      const existing = assignments.find((a) =>
        (c.stripe_customer_id && a.stripe_customer_id === c.stripe_customer_id) ||
        (a.email?.toLowerCase() === c.email?.toLowerCase())
      );
      return {
        ...(existing?.id ? { id: existing.id } : {}),
        stripe_customer_id: c.stripe_customer_id || null,
        email: c.email,
        ae: repName,
        ae_id: repProfileId,
        csm: existing?.csm || null,
        csm_id: existing?.csm_id || null,
      };
    });
    try {
      const { error: upErr } = await supabase.from("commission_assignments").upsert(updates, { onConflict: "stripe_customer_id" });
      if (upErr) throw upErr;
      await refetch();
    } catch (e) {
      console.error("bulkAssignAE failed:", e);
      await refetch();
      throw e;
    }
  }, [assignments, refetch]);

  const saveConfig = useCallback(async (newConfig) => {
    try {
      const { error: upErr } = await supabase.from("commission_config").upsert({ id: 1, settings: newConfig }, { onConflict: "id" });
      if (upErr) throw upErr;
      queryClient.setQueryData(["commissions"], (old) => old ? { ...old, config: newConfig } : old);
    } catch (e) {
      console.error("saveConfig failed:", e);
      throw e;
    }
  }, [queryClient]);

  const resolveUnmatched = useCallback(async (id, resolution) => {
    try {
      const { error: upErr } = await supabase.from("commission_unmatched").update({
        status: resolution.status,
        resolution_note: resolution.note,
        resolved_at: new Date().toISOString(),
      }).eq("id", id);
      if (upErr) throw upErr;
      await refetch();
    } catch (e) {
      console.error("resolveUnmatched failed:", e);
      throw e;
    }
  }, [refetch]);

  const triggerStripeSync = useCallback(async () => {
    setSyncing(true);
    let baselineLastSynced = lastSyncAt || null;
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("stripe-sync");
      if (fnErr) throw fnErr;
      if (fnData?.error) throw new Error(fnData.error);
      if (fnData?.customers_upserted !== undefined) {
        await refetch();
        return fnData;
      }
      const pollStart = Date.now();
      const maxWaitMs = 8 * 60 * 1000;
      const pollIntervalMs = 10_000;
      while (Date.now() - pollStart < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const { data: latestRow } = await supabase
          .from("commission_customers")
          .select("last_synced_at")
          .order("last_synced_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const latest = latestRow?.last_synced_at || null;
        if (latest && latest !== baselineLastSynced) {
          await refetch();
          return { ...fnData, polled_until: new Date().toISOString() };
        }
      }
      console.warn("Stripe sync polling timeout — data may still be syncing in background");
      await refetch();
      return { ...fnData, timed_out: true };
    } catch (e) {
      console.error("Stripe sync failed:", e);
      throw e;
    } finally {
      setSyncing(false);
    }
  }, [refetch, lastSyncAt]);

  return {
    customers,
    assignments,
    indexedAssignments,
    config,
    unmatched,
    pendingDeals,
    repOverrides,
    indexedOverrides,
    matchedDealsByCustomer,
    profiles,
    monthCols,
    loading,
    error,
    syncing,
    lastSyncAt,
    setAssignment,
    bulkAssignAE,
    saveConfig,
    resolveUnmatched,
    triggerStripeSync,
    reload: refetch,
  };
}
