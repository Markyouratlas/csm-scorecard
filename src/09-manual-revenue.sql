-- ============================================================
-- src/09-manual-revenue.sql
-- Manual (non-Stripe) revenue for the Odyssey Revenue card.
-- ============================================================
-- Holds wire/ACH and other deals that Stripe never sees. The Stripe
-- sync (supabase/functions/stripe-sync) NEVER writes to this table, so
-- these entries survive every sync run.
--
--   entry_type = 'recurring'  -> monthly amount; counts toward net MRR
--                                (and the MRR hero) every month.
--   entry_type = 'onetime'    -> one-time cash; shown but NOT counted in MRR.
--
-- Writes go through the SECURITY DEFINER RPCs in src/10-manual-revenue-rpc.sql
-- (add_manual_revenue / void_manual_revenue), gated by is_commission_executive().
-- The RLS policies here are exec-only belt-and-suspenders.
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS).
-- Additive and non-destructive — creates a new table, touches nothing existing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.manual_revenue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_label   text NOT NULL,                                   -- which product bucket it rolls into
  customer_name   text NOT NULL,                                   -- manual / free text
  entry_type      text NOT NULL CHECK (entry_type IN ('recurring','onetime')),
  amount          numeric NOT NULL CHECK (amount >= 0),            -- monthly amount if recurring; total if one-time
  payment_method  text,                                            -- optional free text: 'wire', 'ach', ...
  note            text,
  voided          boolean NOT NULL DEFAULT false,                  -- soft-delete; voided rows never count
  created_by      uuid REFERENCES public.profiles(id),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  voided_by       uuid REFERENCES public.profiles(id),
  voided_at       timestamptz
);

ALTER TABLE public.manual_revenue ENABLE ROW LEVEL SECURITY;

-- Execs only — read and write. (Writes also funnel through the Step 2 RPCs.)
DROP POLICY IF EXISTS manual_revenue_exec_select ON public.manual_revenue;
CREATE POLICY manual_revenue_exec_select ON public.manual_revenue
  FOR SELECT USING (public.is_commission_executive());

DROP POLICY IF EXISTS manual_revenue_exec_write ON public.manual_revenue;
CREATE POLICY manual_revenue_exec_write ON public.manual_revenue
  FOR ALL USING (public.is_commission_executive()) WITH CHECK (public.is_commission_executive());

-- ============================================================
-- Verification
-- ============================================================
SELECT to_regclass('public.manual_revenue') AS table_exists;                          -- expect: manual_revenue
SELECT relrowsecurity AS rls_enabled FROM pg_class WHERE relname = 'manual_revenue';   -- expect: true
SELECT polname FROM pg_policy WHERE polrelid = 'public.manual_revenue'::regclass;      -- expect: 2 policy rows
SELECT count(*) AS row_count FROM public.manual_revenue;                               -- expect: 0
