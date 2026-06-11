-- ============================================================
-- src/12-mrr-snapshots-rpc.sql
-- Exec-gated write path for mrr_snapshots. Mirrors add_manual_revenue
-- (src/10-manual-revenue-rpc.sql): SECURITY DEFINER, is_commission_executive()
-- gate, server-stamped actor, input guards, explicit grant.
--
-- This is the ONLY supported way to write a monthly MRR snapshot. The "Edit MRR
-- history" panel (Step 2c) and the monthly auto-capture (Step 2d) both call it.
-- It UPSERTS on month_key, so re-entering a month overwrites that month rather
-- than creating a duplicate — exactly what backfilling/correcting needs.
--
-- Idempotent: safe to re-run (DROP FUNCTION IF EXISTS before CREATE).
-- ============================================================

DROP FUNCTION IF EXISTS public.upsert_mrr_snapshot(text, numeric, integer, text, text);

CREATE OR REPLACE FUNCTION public.upsert_mrr_snapshot(
  p_month_key text,                 -- 'YYYY-MM'
  p_mrr       numeric,              -- committed MRR for the month
  p_customers integer DEFAULT NULL, -- optional customer count
  p_source    text    DEFAULT 'manual',
  p_note      text    DEFAULT NULL
)
RETURNS mrr_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row   mrr_snapshots;
  v_actor text;
BEGIN
  -- Authorization
  IF NOT public.is_commission_executive() THEN
    RAISE EXCEPTION 'Not authorized: only executives may write MRR snapshots'
      USING errcode = '42501';
  END IF;

  -- Guards
  IF p_month_key IS NULL OR p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'month_key must be YYYY-MM (e.g. 2026-04). Got: %', p_month_key;
  END IF;
  IF p_mrr IS NULL OR p_mrr < 0 THEN
    RAISE EXCEPTION 'mrr must be a non-negative number. Got: %', p_mrr;
  END IF;
  IF p_customers IS NOT NULL AND p_customers < 0 THEN
    RAISE EXCEPTION 'customers must be non-negative or null. Got: %', p_customers;
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual','auto') THEN
    RAISE EXCEPTION 'source must be ''manual'' or ''auto''. Got: %', p_source;
  END IF;

  SELECT name INTO v_actor FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.mrr_snapshots (month_key, mrr, customers, source, note, created_by, created_by_name)
  VALUES (p_month_key, p_mrr, p_customers, p_source, p_note, auth.uid(), v_actor)
  ON CONFLICT (month_key) DO UPDATE
    SET mrr        = EXCLUDED.mrr,
        customers  = EXCLUDED.customers,
        source     = EXCLUDED.source,
        note       = EXCLUDED.note,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_mrr_snapshot(text, numeric, integer, text, text) TO authenticated;

-- ============================================================
-- Verification
-- ============================================================
SELECT proname, prosecdef AS is_security_definer, proconfig AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_mrr_snapshot';
-- Expect 1 row: upsert_mrr_snapshot · true · {search_path=public}
