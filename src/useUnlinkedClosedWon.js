import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// Closed Won deals never matched to a Stripe customer (the Greg-type email
// mismatch). Exec-only via the unlinked_closed_won rpc. Candidates + link are
// fetched/committed on demand from the same migration's rpcs.
export function useUnlinkedClosedWon() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["unlinked-closed-won"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unlinked_closed_won");
      if (error) throw error;
      return data || [];
    },
  });

  // Ranked Stripe candidates for one deal.
  const candidates = async (dealId) => {
    const { data, error } = await supabase.rpc("stripe_candidates_for_deal", { p_deal_id: dealId });
    if (error) throw error;
    return data || [];
  };

  // Commit the link — writes the id onto the deal + its fulfillment row.
  const link = async (dealId, stripeCustomerId) => {
    const { error } = await supabase.rpc("link_deal_to_stripe", {
      p_deal_id: dealId, p_stripe_customer_id: stripeCustomerId,
    });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["unlinked-closed-won"] });
  };

  return { deals: data || [], loading: isPending, candidates, link };
}
