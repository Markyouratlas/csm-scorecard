import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// The dunning call-list. Live Stripe fetch (invoices in dunning) enriched with a
// phone from our own deals/fulfillment rows or GoHighLevel. Exec-only via the
// stripe-failed-payments edge function. On-demand snapshot — no stored table — so
// it stays accurate; refetch() drives the manual Refresh button.
export function useFailedPayments() {
  const q = useQuery({
    queryKey: ["failed-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("stripe-failed-payments");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data; // { rows, count, generatedAt }
    },
    staleTime: 5 * 60 * 1000, // 5 min — it's a live external call, don't hammer Stripe/GHL
    refetchOnWindowFocus: false,
  });
  return {
    rows: q.data?.rows || [],
    generatedAt: q.data?.generatedAt || null,
    loading: q.isPending,
    fetching: q.isFetching,
    error: q.error ? (q.error.message || String(q.error)) : null,
    refresh: q.refetch,
  };
}
