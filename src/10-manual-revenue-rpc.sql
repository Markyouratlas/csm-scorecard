-- ============================================================
-- src/10-manual-revenue-rpc.sql
-- Exec-gated write path for manual_revenue. Mirrors upsert_rep_override
-- (src/08-rep-override-rpc.sql): SECURITY DEFINER, is_commission_executive()
-- gate, server-stamped auth.uid()/name, explicit grant, verification queries.
--
-- These two functions are the ONLY supported way to mutate manual_revenue.
-- The form calls them via supabase.rpc(...); it never writes the table directly.
--
-- Idempotent: safe to re-run (DROP FUNCTION IF EXISTS before each CREATE).
-- ============================================================

-- ---- add_manual_revenue ----
DROP FUNCTION IF EXISTS public.add_manual_revenue(text, text, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.add_manual_revenue(
  p_product_label  text,
  p_customer_name  text,
  p_entry_type     text,              -- 'recurring' | 'onetime'
  p_amount         numeric,           -- monthly amount if recurring; total if one-time
  p_payment_method text DEFAULT NULL, -- optional free text: 'wire','ach',...
  p_note           text DEFAULT NULL
)
RETURNS manual_revenue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row   manual_revenue;
  v_actor text;
BEGIN
  -- Authorization
  IF NOT public.is_commission_executive() THEN
    RAISE EXCEPTION 'Not authorized: only executives may add manual revenue'
      USING errcode = '42501';
  END IF;

  -- Required fields
  IF p_product_label IS NULL OR length(trim(p_product_label)) = 0 THEN
    RAISE EXCEPTION 'product_label is required';
  END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'customer_name is required';
  END IF;

  -- Guards
  IF p_entry_type IS NULL OR p_entry_type NOT IN ('recurring','onetime') THEN
    RAISE EXCEPTION 'entry_type must be ''recurring'' or ''onetime''. Got: %', p_entry_type;
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be a non-negative number. Got: %', p_amount;
  END IF;

  SELECT name INTO v_actor FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.manual_revenue (
    product_label, customer_name, entry_type, amount, payment_method, note,
    created_by, created_by_name
  ) VALUES (
    trim(p_product_label), trim(p_customer_name), p_entry_type, p_amount,
    p_payment_method, p_note,
    auth.uid(), v_actor
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_manual_revenue(text, text, text, numeric, text, text) TO authenticated;

-- ---- void_manual_revenue (soft-delete) ----
DROP FUNCTION IF EXISTS public.void_manual_revenue(uuid);

CREATE OR REPLACE FUNCTION public.void_manual_revenue(p_id uuid)
RETURNS manual_revenue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row manual_revenue;
BEGIN
  IF NOT public.is_commission_executive() THEN
    RAISE EXCEPTION 'Not authorized: only executives may void manual revenue'
      USING errcode = '42501';
  END IF;

  UPDATE public.manual_revenue
     SET voided = true, voided_by = auth.uid(), voided_at = now()
   WHERE id = p_id AND voided = false
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active manual_revenue row found for id %', p_id;
  END IF;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_manual_revenue(uuid) TO authenticated;

-- ============================================================
-- Verification
-- ============================================================
SELECT proname, prosecdef AS is_security_definer, proconfig AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('add_manual_revenue','void_manual_revenue')
ORDER BY proname;
-- Expect 2 rows, each is_security_definer = true, config = {search_path=public}.
