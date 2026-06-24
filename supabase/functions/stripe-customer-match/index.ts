// ============================================================
// Supabase Edge Function: stripe-customer-match
// ============================================================
// Given a customer EMAIL, looks the customer up LIVE in Stripe and returns their
// current committed MRR + one-time (non-invoice) cash collected — so an AE can
// auto-fill a just-closed sale immediately, without waiting on the full nightly
// stripe-sync. Mirrors stripe-daily-cash (live Stripe API per request).
//
// Any signed-in user may call it (the caller supplies the email of a deal they're
// working). The Stripe secret stays server-side.
//
// Deploy:  supabase functions deploy stripe-customer-match
//          (reuses STRIPE_SECRET_KEY — no new secret)
//
// Invoke:  supabase.functions.invoke('stripe-customer-match', { body: { email } })
// Returns: { matched, stripe_customer_id, name, mrr, one_time, currency:'usd' }
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function stripeRequest(path: string, sk: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${sk}` } });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function stripeList(resource: string, sk: string, query = ""): Promise<any[]> {
  const items: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  while (true) {
    if (++pages > 20) break;
    const params = new URLSearchParams(query);
    params.set("limit", "100");
    if (startingAfter) params.set("starting_after", startingAfter);
    const j = await stripeRequest(`/${resource}?${params.toString()}`, sk);
    items.push(...(j.data || []));
    if (!j.has_more) break;
    startingAfter = j.data[j.data.length - 1].id;
  }
  return items;
}

// Monthly recurring revenue of a subscription (normalize any interval → month).
function mrrOfSub(sub: any): number {
  if (!sub.items?.data) return 0;
  let cents = 0;
  for (const item of sub.items.data) {
    const unit = item.price?.unit_amount || 0;
    const qty = item.quantity || 1;
    const interval = item.price?.recurring?.interval || "month";
    const ic = item.price?.recurring?.interval_count || 1;
    let f = 1 / ic;
    if (interval === "year") f = 1 / (12 * ic);
    else if (interval === "week") f = (52 / 12) / ic;
    else if (interval === "day") f = (365 / 12) / ic;
    cents += unit * qty * f;
  }
  return cents / 100;
}

const CURRENT = new Set(["active", "trialing", "past_due"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sk = Deno.env.get("STRIPE_SECRET_KEY");
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

    // Require a signed-in user (any role — the AE supplies the deal's email).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    let email = "";
    try { const b = await req.json(); email = String(b?.email || "").trim().toLowerCase(); } catch { /* */ }
    if (!email) return json({ error: "email is required" }, 400);

    const customers = await stripeRequest(`/customers?email=${encodeURIComponent(email)}&limit=10`, sk);
    const custList = customers?.data || [];
    if (custList.length === 0) return json({ matched: false, mrr: null, one_time: null, currency: "usd" });

    let mrr = 0, oneTime = 0, primaryId: string | null = null, name: string | null = null;
    for (const cust of custList) {
      const subs = await stripeList("subscriptions", sk, `customer=${cust.id}&status=all&expand[]=data.items.data.price`);
      let custMrr = 0;
      for (const s of subs) if (CURRENT.has(s.status)) custMrr += mrrOfSub(s);
      mrr += custMrr;

      // Cash collected — exactly what the Daily Pulse (stripe-daily-cash) does:
      // sum every succeeded, captured USD charge for the customer. No invoice logic
      // (invoiced or not, recurring or one-off — it's all cash that actually landed),
      // which is why the daily pulse correctly captured the $7,000.
      const charges = await stripeList("charges", sk, `customer=${cust.id}`);
      for (const ch of charges) {
        if (ch.status !== "succeeded" || ch.paid !== true) continue;
        if (ch.currency && ch.currency !== "usd") continue;
        const cap = (ch.amount_captured != null ? ch.amount_captured : ch.amount) || 0;
        if (cap > 0) oneTime += cap / 100;
      }
      // Prefer the customer that actually has recurring revenue as the primary id.
      if (!primaryId || custMrr > 0) { primaryId = cust.id; name = cust.name || cust.email || null; }
    }

    return json({
      matched: true,
      stripe_customer_id: primaryId,
      name,
      mrr: Math.round(mrr * 100) / 100,
      one_time: Math.round(oneTime * 100) / 100,
      currency: "usd",
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
