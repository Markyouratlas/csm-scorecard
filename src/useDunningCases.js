import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase.js";

// Tracked dunning case layer (src/45-dunning-cases.sql). Keyed by
// stripe_customer_id. Cases + their touch logs are fetched together and keyed
// into a map the FailedPaymentsSection overlays on the live Stripe list. All
// writes are exec-only via RLS. A case is created lazily on the first action.
export function useDunningCases() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["dunning-cases"],
    queryFn: async () => {
      const { data: cases, error } = await supabase
        .from("dunning_cases")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const ids = (cases || []).map((c) => c.id);
      let touches = [];
      if (ids.length) {
        const { data: t } = await supabase
          .from("dunning_touches").select("*").in("case_id", ids).order("at", { ascending: false });
        touches = t || [];
      }
      const byStripe = {};
      const touchesByCase = {};
      for (const t of touches) (touchesByCase[t.case_id] ||= []).push(t);
      for (const c of cases || []) byStripe[c.stripe_customer_id] = { ...c, touches: touchesByCase[c.id] || [] };
      return { byStripe, cases: cases || [] };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dunning-cases"] });
  const uid = async () => (await supabase.auth.getUser()).data?.user?.id || null;

  // Ensure a case row exists for this customer; returns its id.
  const ensureCase = async (stripeId, meta = {}) => {
    if (!stripeId) throw new Error("stripe_customer_id required");
    const { data: existing } = await supabase
      .from("dunning_cases").select("id").eq("stripe_customer_id", stripeId).maybeSingle();
    if (existing?.id) return existing.id;
    const { data, error } = await supabase.from("dunning_cases").insert({
      stripe_customer_id: stripeId,
      customer_email: meta.email || null,
      customer_name: meta.name || null,
      amount_at_risk: meta.amount ?? null,
      status: "contacted",
      updated_by: await uid(),
    }).select("id").single();
    if (error) throw error;
    return data.id;
  };

  // Patch a case's status/dates/notes (creates the case if missing).
  const updateCase = async (stripeId, patch, meta = {}) => {
    await ensureCase(stripeId, meta);
    const { error } = await supabase.from("dunning_cases")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: await uid() })
      .eq("stripe_customer_id", stripeId);
    if (error) throw error;
    await invalidate();
  };

  // Append an outreach touch (trigger bumps touch_count + last_touch_at).
  const logTouch = async (stripeId, kind, { outcome = null, note = null } = {}, meta = {}) => {
    const caseId = await ensureCase(stripeId, meta);
    const { error } = await supabase.from("dunning_touches")
      .insert({ case_id: caseId, kind, outcome, note, by: await uid() });
    if (error) throw error;
    await invalidate();
  };

  return {
    byStripe: data?.byStripe || {},
    cases: data?.cases || [],
    loading: isPending,
    ensureCase, updateCase, logTouch, invalidate,
  };
}
