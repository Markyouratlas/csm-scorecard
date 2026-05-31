// ============================================================
// useOneoffPayments — read-only fetch of oneoff_payments
// ============================================================
// Sibling hook to useCommissions. Pulls the captured one-off
// (non-invoice) Stripe charges so an exec UI can review them
// and decide include/exclude + AE/CSM rates.
//
// Read-only in this revision. Writes go through the
// `set_oneoff_inclusion` SECURITY DEFINER function and will be
// added in a later step.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

export function useOneoffPayments() {
  const [oneoffs, setOneoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("oneoff_payments")
        .select("*")
        .order("charge_created_at", { ascending: false });

      if (qErr) throw qErr;
      if (!mountedRef.current) return;
      setOneoffs(data || []);
    } catch (e) {
      console.error("useOneoffPayments load error:", e);
      if (mountedRef.current) setError(e.message || String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return {
    oneoffs,
    loading,
    error,
    reload: loadAll,
  };
}
