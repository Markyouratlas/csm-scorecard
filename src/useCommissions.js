// ============================================================
// useCommissions — fetches all commission data from Supabase
// ============================================================
// Pattern mirrors useScorecard / useMtdData:
//   - returns { customers, assignments, config, unmatched, loading, ... }
//   - real-time subscriptions on assignments + customers
//   - exposes mutation helpers that immediately update local state then
//     persist (optimistic), rolling back on error.
//
// Permissions are enforced server-side by RLS — this hook just fetches what
// the current user is allowed to see.
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
        { data: custData, error: custErr },
        { data: asgnData, error: asgnErr },
        { data: cfgData, error: cfgErr },
        { data: unmData, error: unmErr },
      ] = await Promise.all([
        supabase.from("commission_customers").select("*").order("start_date", { ascending: false }),
        supabase.from("commission_assignments").select("*"),
        supabase.from("commission_config").select("*").eq("id", 1).maybeSingle(),
        supabase.from("commission_unmatched").select("*").order("created_at", { ascending: false }),
      ]);
      if (custErr) throw custErr;
      if (asgnErr) throw asgnErr;
      if (cfgErr) throw cfgErr;
      if (unmErr) throw unmErr;

      if (!mountedRef.current) return;
      setCustomers(custData || []);
      setAssignments(asgnData || []);
      setConfig(cfgData?.settings || DEFAULT_CONFIG);
      setUnmatched(unmData || []);
      if (custData?.length) {
        const latest = custData.reduce((max, c) =>
          c.last_synced_at && (!max || c.last_synced_at > max) ? c.last_synced_at : max, null);
        setLastSyncAt(latest);
      }
    } catch (e) {
      console.error("useCommissions load error:", e);
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Real-time subscriptions ----
  useEffect(() => {
    const channel = supabase
      .channel("commission-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "commission_assignments" },
        (payload) => {
          setAssignments((prev) => {
            const next = prev.filter((a) => a.id !== payload.old?.id && a.id !== payload.new?.id);
            if (payload.eventType !== "DELETE" && payload.new) next.push(payload.new);
            return next;
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "commission_customers" },
        (payload) => {
          if (!payload.new) return;
          setCustomers((prev) => prev.map((c) =>
            c.stripe_customer_id === payload.new.stripe_customer_id ? payload.new : c
          ));
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commission_customers" },
        (payload) => {
          if (!payload.new) return;
          setCustomers((prev) => {
            if (prev.some((c) => c.stripe_customer_id === payload.new.stripe_customer_id)) return prev;
            return [payload.new, ...prev];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ---- Derived: indexed assignment lookups for the engine ----
  const indexedAssignments = useMemo(() => indexAssignments(assignments), [assignments]);

  // ---- Derived: month columns from data (the union of all monthly_mrr keys, sorted) ----
  const monthCols = useMemo(() => {
    const set = new Set();
    for (const c of customers) {
      if (c.monthly_mrr) for (const k of Object.keys(c.monthly_mrr)) set.add(k);
    }
    return Array.from(set).sort();
  }, [customers]);

  // ---- Mutations ----
  const setAssignment = useCallback(async (customer, field, value) => {
    // field is 'ae' or 'csm', value is the rep name or null.
    const existing = assignments.find((a) =>
      (customer.stripe_customer_id && a.stripe_customer_id === customer.stripe_customer_id) ||
      (a.email?.toLowerCase() === customer.email?.toLowerCase())
    );

    // Optimistic update
    const optimistic = existing
      ? { ...existing, [field]: value }
      : {
          id: `temp_${Date.now()}`,
          stripe_customer_id: customer.stripe_customer_id || null,
          email: customer.email,
          ae: field === "ae" ? value : null,
          csm: field === "csm" ? value : null,
        };
    setAssignments((prev) => {
      const next = prev.filter((a) => a.id !== existing?.id);
      // If both ae and csm are null, drop the row.
      if (!optimistic.ae && !optimistic.csm) return next;
      next.push(optimistic);
      return next;
    });

    try {
      if (!optimistic.ae && !optimistic.csm && existing) {
        // Delete
        const { error: delErr } = await supabase
          .from("commission_assignments")
          .delete()
          .eq("id", existing.id);
        if (delErr) throw delErr;
      } else if (existing) {
        // Update
        const { data, error: upErr } = await supabase
          .from("commission_assignments")
          .update({ ae: optimistic.ae, csm: optimistic.csm })
          .eq("id", existing.id)
          .select()
          .single();
        if (upErr) throw upErr;
        // Replace optimistic with persisted row
        setAssignments((prev) => prev.map((a) => a.id === existing.id ? data : a));
      } else {
        // Insert
        const { data, error: insErr } = await supabase
          .from("commission_assignments")
          .insert({
            stripe_customer_id: customer.stripe_customer_id || null,
            email: customer.email,
            ae: optimistic.ae,
            csm: optimistic.csm,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        setAssignments((prev) => prev.map((a) => a.id === optimistic.id ? data : a));
      }
    } catch (e) {
      console.error("setAssignment failed:", e);
      // Roll back
      await loadAll();
      throw e;
    }
  }, [assignments, loadAll]);

  const bulkAssignAE = useCallback(async (customerList, rep) => {
    // Build upserts: keep existing csm, set ae to `rep`. Skip self-serve.
    const targets = customerList.filter((c) => !c.is_self_serve);
    const updates = targets.map((c) => {
      const existing = assignments.find((a) =>
        (c.stripe_customer_id && a.stripe_customer_id === c.stripe_customer_id) ||
        (a.email?.toLowerCase() === c.email?.toLowerCase())
      );
      return {
        id: existing?.id,
        stripe_customer_id: c.stripe_customer_id || null,
        email: c.email,
        ae: rep,
        csm: existing?.csm || null,
      };
    });
    // Optimistic
    setAssignments((prev) => {
      const next = [...prev];
      for (const u of updates) {
        const idx = next.findIndex((a) => a.id === u.id);
        if (idx >= 0) next[idx] = { ...next[idx], ae: rep };
        else next.push({ ...u, id: `temp_${Math.random()}` });
      }
      return next;
    });
    try {
      const { error: upErr } = await supabase
        .from("commission_assignments")
        .upsert(
          updates.map(({ id, ...rest }) => (id?.toString().startsWith("temp_") ? rest : { id, ...rest })),
          { onConflict: "stripe_customer_id" }
        );
      if (upErr) throw upErr;
      await loadAll();
    } catch (e) {
      console.error("bulkAssignAE failed:", e);
      await loadAll();
      throw e;
    }
  }, [assignments, loadAll]);

  const saveConfig = useCallback(async (newConfig) => {
    const prevConfig = config;
    setConfig(newConfig);
    try {
      const { error: upErr } = await supabase
        .from("commission_config")
        .upsert({ id: 1, settings: newConfig }, { onConflict: "id" });
      if (upErr) throw upErr;
    } catch (e) {
      console.error("saveConfig failed:", e);
      setConfig(prevConfig);
      throw e;
    }
  }, [config]);

  const resolveUnmatched = useCallback(async (id, resolution) => {
    setUnmatched((prev) => prev.filter((u) => u.id !== id));
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
    } catch (e) {
      console.error("resolveUnmatched failed:", e);
      await loadAll();
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
