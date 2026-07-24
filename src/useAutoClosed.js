import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// Deals the Phase-B job (collected-not-closed-autoclose) flipped to Closed Won
// automatically because the customer was already paying in full in Stripe.
// Surfaced in the exec My View so Mark can see what closed itself. Exec-readable
// (RLS: managers/execs read all ae_deals). Resolves AE names for display.
export function useAutoClosed(limit = 25) {
  const { data, isPending } = useQuery({
    queryKey: ["auto-closed", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ae_deals")
        .select("id, customer_name, customer_email, one_time, mrr, ae_id, auto_closed_at, matched_stripe_customer_id, notes")
        .not("auto_closed_at", "is", null)
        .order("auto_closed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const ids = [...new Set((data || []).map((d) => d.ae_id).filter(Boolean))];
      const names = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
        for (const p of profs || []) names[p.id] = p.name;
      }
      return (data || []).map((d) => ({ ...d, ae_name: names[d.ae_id] || "" }));
    },
  });
  return { deals: data || [], loading: isPending };
}
