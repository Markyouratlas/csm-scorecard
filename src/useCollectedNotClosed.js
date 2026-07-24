import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// Deals whose customer is paying in Stripe but the ae_deal is still open.
// Via the collected_not_closed rpc (exec sees all; an AE sees their own).
// is_full = collected cash has reached the deal's expected upfront (a deposit is a
// partial payment that never clears the bar → surface only, never auto-close).
export function useCollectedNotClosed() {
  const { data, isPending, error } = useQuery({
    queryKey: ["collected-not-closed"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("collected_not_closed");
      if (error) throw error;
      return (data || [])
        .filter((d) => Number(d.collected) > 0)
        .map((d) => ({
          ...d,
          collected: Number(d.collected) || 0,
          is_full: d.one_time == null ? true : Number(d.collected) >= Number(d.one_time),
        }));
    },
  });
  return { deals: data || [], loading: isPending, error: error ?? null };
}
