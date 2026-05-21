// ============================================================
// useCommissions — fetches all commission data from Supabase
// ============================================================
// PATCHED: realtime subscriptions disabled (page was hanging).
// All mutations now use simple optimistic-update + reload pattern.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabase";
import { DEFAULT_CONFIG, indexAssignments } from "./commissionEngine";

export function useCommissions() {
  const [customers, setCustomers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [unmatched, setUnmatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ---- Initial load ----
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        custRes,
        asgnRes,
        cfgRes,
        unmRes,
      ] = await Promise.all([
        supabase.from("commission_customers").select("*").order("start_date", { ascending: false }),
        supabase.from("commission_assignments").select("*"),
        supabase.from("commission_config").select("*").eq("id", 1).maybeSingle(),
        supabase.from("commission_unmatched").select("*").order("created_at", { ascending: false }),
      ]);

      // Log any errors but don't blow up on individual failures
      if (custRes.error) console.error("customers query error:", custRes.error);
      if (asgnRes.error) console.error("assignments query error:", asgnRes.error);
      if (cfgRes.error)  console.error("config query error:", cfgRes.error);
      if (unmRes.error)  console.error("unmatched query error:", unmRes.error);

      if (!mountedRef.current) return;

      setCustomers(custRes.data || []);
      setAssignments(asgnRes.data || []);
      setConfig(cfgRes.data?.settings || DEFAULT_CONFIG);
      setUnmatched(unmRes.data || []);

      if (custRes.data?.length) {
        const latest = custRes.data.reduce((max, c) =>
          c.last_synced_at && (!max || c.last_synced_at > max) ? c.last_synced_at : max, null);
        setLastSyncAt(latest);
      }
    } catch (e) {
      console.error("useCommissions load error:", e);
      if (mountedRef.current) setError(e.message || String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Realtime subscriptions DISABLED ----
  // Was causing the page to hang in production. Mutations below now just
  // reload after writing. Can re-enable later once stable.

  // ---- Derived: indexed assignment lookups for the engine ----
  const indexedAssignments = useMemo(() => indexAssignments(assignments), [assignments]);

  // ---- Derived: month columns from data ----
  const monthCols = useMemo(() => {
    const set = new Set();
    for (const c of customers) {
      if (c.monthly_mrr) for (const k of Object.keys(c.monthly_mrr)) set.add(k);
    }
    return Array.from(set).sort();
  }, [customers]);

  // ---- Mutations (optimistic + reload on success/failure) ----
  const setAssignment = useCallback(async (customer, field, value) => {
    const existing = assignments.find((a) =>
      (customer.stripe_customer_id && a.stripe_customer_id === customer.stripe_customer_id) ||
      (a.email?.toLowerCase() === customer.email?.toLowerCase())
    );

    try {
      if (existing) {
        const newAe  = field === "ae"  ? value : existing.ae;
        const newCsm = field === "csm" ? value : existing.csm;
        if (!newAe && !newCsm) {
          const { error: delErr } = await supabase
            .from("commission_assignments")
            .delete()
            .eq("id", existing.id);
          if (delErr) throw delErr;
        } else {
          const { error: upErr } = await supabase
            .from("commission_assignments")
            .update({ ae: newAe, csm: newCsm })
            .eq("id", existing.id);
          if (upErr) throw upErr;
        }
      } else {
        const { error: insErr } = await supabase
          .from("commission_assignments")
          .insert({
            stripe_customer_id: customer.stripe_customer_id || null,
            email: customer.email,
            ae:  field === "ae"  ? value : null,
            csm: field === "csm" ? value : null,
          });
        if (insErr) throw insErr;
      }
      await loadAll();
    } catch (e) {
      console.error("setAssignment failed:", e);
      await loadAll();
      throw e;
    }
  }, [assignments, loadAll]);

  const bulkAssignAE = useCallback(async (customerList, rep) => {
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
        ae: rep,
        csm: existing?.csm || null,
      };
    });
    try {
      const { error: upErr } = await supabase
        .from("commission_assignments")
        .upsert(updates, { onConflict: "stripe_customer_id" });
      if (upErr) throw upErr;
      await loadAll();
    } catch (e) {
      console.error("bulkAssignAE failed:", e);
      await loadAll();
      throw e;
    }
  }, [assignments, loadAll]);

  const saveConfig = useCallback(async (newConfig) => {
    try {
      const { error: upErr } = await supabase
        .from("commission_config")
        .upsert({ id: 1, settings: newConfig }, { onConflict: "id" });
      if (upErr) throw upErr;
      setConfig(newConfig);
    } catch (e) {
      console.error("saveConfig failed:", e);
      throw e;
    }
  }, []);

  const resolveUnmatched = useCallback(async (id, resolution) => {
    try {
      const { error: upErr } = await supabase
        .from("commission_unmatched")
        .update({
          status: resolution.status,
          resolution_note: resolution.note,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (upErr) throw upErr;
      await loadAll();
    } catch (e) {
      console.error("resolveUnmatched failed:", e);
      throw e;
    }
  }, [loadAll]);

  // ---- Stripe sync trigger ----
  const triggerStripeSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("stripe-sync");
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      await loadAll();
      return data;
    } catch (e) {
      console.error("Stripe sync failed:", e);
      throw e;
    } finally {
      setSyncing(false);
    }
  }, [loadAll]);

  return {
    customers,
    assignments,
    indexedAssignments,
    config,
    unmatched,
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
    reload: loadAll,
  };
}
