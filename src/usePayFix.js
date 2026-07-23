import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// ============================================================
// Payment-fix ticket workflow (see src/41-deal-payment-fix.sql).
//   AE flags (+ note) -> 'flagged'  -> exec My View queue
//   Exec completes     -> 'fixed'    -> AE notification
//   AE acknowledges    -> 'done'     -> back to Closed Won, keeps a Modified-payment badge
// ============================================================

// Exec queue: every deal flagged for a Stripe payment fix (across all AEs).
export function usePayFixQueue() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["pay-fix-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ae_deals")
        .select("id, customer_name, customer_email, mrr, one_time, pay_fix_note, pay_fix_flagged_at, ae_id")
        .eq("pay_fix_status", "flagged")
        .order("pay_fix_flagged_at", { ascending: true });
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
  const complete = async (dealId) => {
    const { error } = await supabase.rpc("pay_fix_complete", { p_deal_id: dealId });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["pay-fix-queue"] });
  };
  return { queue: data || [], loading: isPending, error: error ?? null, complete };
}

// AE side: their deals an exec has fixed but they haven't acknowledged yet.
export function usePayFixNotifications(aeId) {
  const { data } = useQuery({
    queryKey: ["pay-fix-notify", aeId || null],
    enabled: !!aeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ae_deals")
        .select("id, customer_name, pay_fix_completed_at")
        .eq("ae_id", aeId)
        .eq("pay_fix_status", "fixed");
      if (error) throw error;
      return data || [];
    },
  });
  return { notifications: data || [] };
}

// AE flags a deal (writes their own row — RLS allows it).
export async function flagPayFix(dealId, note, profileId) {
  const { error } = await supabase.from("ae_deals").update({
    pay_fix_status: "flagged",
    pay_fix_note: note || null,
    pay_fix_flagged_by: profileId || null,
    pay_fix_flagged_at: new Date().toISOString(),
    pay_fix_completed_at: null, pay_fix_completed_by: null, pay_fix_ack_at: null,
  }).eq("id", dealId);
  if (error) throw error;
}

// AE acknowledges the exec's fix -> 'done' (keeps the Modified-payment badge).
export async function ackPayFix(dealId) {
  const { error } = await supabase.from("ae_deals").update({
    pay_fix_status: "done",
    pay_fix_ack_at: new Date().toISOString(),
  }).eq("id", dealId);
  if (error) throw error;
}
