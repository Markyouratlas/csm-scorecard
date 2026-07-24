import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// Customers with 2+ non-Deleted Closed Won ae_deals (grouped by Stripe customer id,
// else email) — the Rich Yanek / Ryan Walsh pattern: a duplicate close that
// double-counts revenue + commission and can double-onboard. Exec-only (RLS lets
// execs read all ae_deals). Surfaced in Mark's My View.
export function useDuplicateDeals() {
  const { data, isPending, error } = useQuery({
    queryKey: ["duplicate-closed-won-deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ae_deals")
        .select("id, customer_name, customer_email, matched_stripe_customer_id, one_time, mrr, closed_at, ae_id")
        .eq("status", "Closed Won");
      if (error) throw error;
      const ids = [...new Set((data || []).map((d) => d.ae_id).filter(Boolean))];
      const names = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
        for (const p of profs || []) names[p.id] = p.name;
      }
      const groups = {};
      for (const d of data || []) {
        const key = d.matched_stripe_customer_id || (d.customer_email || "").toLowerCase();
        if (!key) continue;
        (groups[key] || (groups[key] = [])).push({ ...d, ae_name: names[d.ae_id] || "" });
      }
      return Object.entries(groups)
        .filter(([, list]) => list.length >= 2)
        .map(([key, list]) => ({ key, list: list.sort((a, b) => (b.one_time || 0) - (a.one_time || 0)) }));
    },
  });
  return { dupes: data || [], loading: isPending, error: error ?? null };
}
