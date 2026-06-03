-- ============================================================
-- src/08-rep-override-rpc.sql
-- Phase 4.3 — upsert_rep_override SECURITY DEFINER RPC
-- ============================================================
-- Wraps INSERT/UPDATE on commission_rep_overrides with:
--   1. Authorization — is_commission_executive() (same gate used by
--      set_oneoff_inclusion). RLS on commission_rep_overrides already
--      restricts writes to execs; this is belt-and-suspenders.
--   2. Unit-system range validation — the real reason this RPC exists.
--      The form sends decimals; bad client code could store a 10x
--      multiplier as a 10% rate (or vice versa). These guards refuse
--      values that are clearly the wrong unit before they reach the
--      paycheck table. Rates: 0<x<=1. Multipliers: 1<=x<=10. Months:
--      >0. Dollars: >=0.
--   3. UPSERT on the existing (rep_name, effective_date) unique
--      constraint. ON CONFLICT DO UPDATE replaces the value columns
--      but PRESERVES created_by / created_by_name — the audit trigger
--      rep_overrides_audit logs the modifier separately to
--      commission_audit_log.
--   4. Server-side audit stamping — created_by from auth.uid(),
--      created_by_name from profiles.name. The form cannot spoof
--      these.
--
-- Refuses all-NULL override rows (no-op rows pollute the table).
-- To revert a rep to defaults, DELETE the existing override row(s)
-- instead — a separate function (out of scope here) will handle that.
-- ============================================================

-- Idempotent re-run: drop any prior version with this exact signature.
DROP FUNCTION IF EXISTS public.upsert_rep_override(
  text, date, numeric, numeric, integer, numeric, integer,
  numeric, numeric, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.upsert_rep_override(
  p_rep_name                text,
  p_effective_date          date,
  p_ae_pct                  numeric  DEFAULT NULL,   -- DECIMAL 0<x<=1 (e.g. 0.10 = 10%)
  p_ae_residual_pct         numeric  DEFAULT NULL,   -- DECIMAL 0<x<=1 (e.g. 0.03 = 3%)
  p_ae_residual_months      integer  DEFAULT NULL,   -- POSITIVE INT (or NULL to inherit)
  p_csm_pct                 numeric  DEFAULT NULL,   -- DECIMAL 0<x<=1 (e.g. 0.03 = 3%)
  p_csm_residual_months     integer  DEFAULT NULL,   -- POSITIVE INT (or NULL to inherit / no cap)
  p_accelerator_target      numeric  DEFAULT NULL,   -- DOLLARS x>=0 (e.g. 60000.00)
  p_accel_1_5x_pct          numeric  DEFAULT NULL,   -- MULTIPLIER 1<=x<=10 (drives the 1.2x-target tier; default 1.5x payout)
  p_accel_2x_pct            numeric  DEFAULT NULL,   -- MULTIPLIER 1<=x<=10 (drives the 1.5x-target tier; default 2.0x payout)
  p_team_lead_override_pct  numeric  DEFAULT NULL,   -- DECIMAL 0<x<=1 (e.g. 0.02 = 2%)
  p_notes                   text     DEFAULT NULL
)
RETURNS commission_rep_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row commission_rep_overrides;
  v_actor_name text;
BEGIN
  -- ---- Authorization ----
  IF NOT public.is_commission_executive() THEN
    RAISE EXCEPTION 'Not authorized: only executives may write per-rep commission overrides'
      USING errcode = '42501';
  END IF;

  -- ---- Required fields ----
  IF p_rep_name IS NULL OR length(trim(p_rep_name)) = 0 THEN
    RAISE EXCEPTION 'rep_name is required';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'effective_date is required';
  END IF;

  -- ---- Unit-system range guards ----
  -- Decimal rates: 0 < x <= 1. Strictly greater than 0 — to revert
  -- a rep to defaults, pass NULL (or DELETE the row). 0 is rejected
  -- to surface unit-confusion bugs (a "10" sent as a rate becomes
  -- 10.0 in the DB → caught by upper bound; a "0" rate is almost
  -- always a mistake).
  IF p_ae_pct IS NOT NULL AND (p_ae_pct <= 0 OR p_ae_pct > 1) THEN
    RAISE EXCEPTION 'ae_pct must be a decimal between 0 (exclusive) and 1 (e.g. 0.10 = 10%%). Got: %', p_ae_pct;
  END IF;
  IF p_ae_residual_pct IS NOT NULL AND (p_ae_residual_pct <= 0 OR p_ae_residual_pct > 1) THEN
    RAISE EXCEPTION 'ae_residual_pct must be a decimal between 0 (exclusive) and 1 (e.g. 0.03 = 3%%). Got: %', p_ae_residual_pct;
  END IF;
  IF p_csm_pct IS NOT NULL AND (p_csm_pct <= 0 OR p_csm_pct > 1) THEN
    RAISE EXCEPTION 'csm_pct must be a decimal between 0 (exclusive) and 1 (e.g. 0.03 = 3%%). Got: %', p_csm_pct;
  END IF;
  IF p_team_lead_override_pct IS NOT NULL AND (p_team_lead_override_pct <= 0 OR p_team_lead_override_pct > 1) THEN
    RAISE EXCEPTION 'team_lead_override_pct must be a decimal between 0 (exclusive) and 1 (e.g. 0.02 = 2%%). Got: %', p_team_lead_override_pct;
  END IF;

  -- Multipliers: 1 <= x <= 10. 1.0 = no acceleration; 10x is a sanity ceiling.
  -- These look like rates (numeric(5,4)) but are NOT — a 0.5 here would be
  -- nonsense (0.5x payout). The lower bound of 1 catches that mistake.
  IF p_accel_1_5x_pct IS NOT NULL AND (p_accel_1_5x_pct < 1 OR p_accel_1_5x_pct > 10) THEN
    RAISE EXCEPTION 'accel_1_5x_pct is a MULTIPLIER (e.g. 1.5 = 1.5x payout at the 1.2x-target tier), must be between 1 and 10. Got: %', p_accel_1_5x_pct;
  END IF;
  IF p_accel_2x_pct IS NOT NULL AND (p_accel_2x_pct < 1 OR p_accel_2x_pct > 10) THEN
    RAISE EXCEPTION 'accel_2x_pct is a MULTIPLIER (e.g. 2.0 = 2x payout at the 1.5x-target tier), must be between 1 and 10. Got: %', p_accel_2x_pct;
  END IF;

  -- Months: > 0 (a 0-month cap means "the rep earns nothing"; not a useful
  -- override — use NULL to inherit or set a positive cap).
  IF p_ae_residual_months IS NOT NULL AND p_ae_residual_months <= 0 THEN
    RAISE EXCEPTION 'ae_residual_months must be a positive integer (or NULL to inherit). Got: %', p_ae_residual_months;
  END IF;
  IF p_csm_residual_months IS NOT NULL AND p_csm_residual_months <= 0 THEN
    RAISE EXCEPTION 'csm_residual_months must be a positive integer (or NULL to inherit / no cap). Got: %', p_csm_residual_months;
  END IF;

  -- Dollars: >= 0.
  IF p_accelerator_target IS NOT NULL AND p_accelerator_target < 0 THEN
    RAISE EXCEPTION 'accelerator_target must be a non-negative dollar amount. Got: %', p_accelerator_target;
  END IF;

  -- ---- Refuse all-NULL override rows ----
  -- notes alone doesn't count — an all-NULL override row contributes
  -- nothing to engine math and just pollutes the table.
  IF     p_ae_pct                  IS NULL
     AND p_ae_residual_pct         IS NULL
     AND p_ae_residual_months      IS NULL
     AND p_csm_pct                 IS NULL
     AND p_csm_residual_months     IS NULL
     AND p_accelerator_target      IS NULL
     AND p_accel_1_5x_pct          IS NULL
     AND p_accel_2x_pct            IS NULL
     AND p_team_lead_override_pct  IS NULL
  THEN
    RAISE EXCEPTION 'At least one override field must be non-NULL. To revert a rep to defaults, DELETE the existing override row(s) instead.';
  END IF;

  -- ---- Actor name (denormalized into the row for quick display) ----
  SELECT name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  -- ---- UPSERT ----
  INSERT INTO public.commission_rep_overrides (
    rep_name, effective_date,
    ae_pct, ae_residual_pct, ae_residual_months,
    csm_pct, csm_residual_months,
    accelerator_target, accel_1_5x_pct, accel_2x_pct,
    team_lead_override_pct,
    notes,
    created_by, created_by_name
  ) VALUES (
    p_rep_name, p_effective_date,
    p_ae_pct, p_ae_residual_pct, p_ae_residual_months,
    p_csm_pct, p_csm_residual_months,
    p_accelerator_target, p_accel_1_5x_pct, p_accel_2x_pct,
    p_team_lead_override_pct,
    p_notes,
    auth.uid(),
    v_actor_name
  )
  ON CONFLICT (rep_name, effective_date) DO UPDATE SET
    ae_pct                  = EXCLUDED.ae_pct,
    ae_residual_pct         = EXCLUDED.ae_residual_pct,
    ae_residual_months      = EXCLUDED.ae_residual_months,
    csm_pct                 = EXCLUDED.csm_pct,
    csm_residual_months     = EXCLUDED.csm_residual_months,
    accelerator_target      = EXCLUDED.accelerator_target,
    accel_1_5x_pct          = EXCLUDED.accel_1_5x_pct,
    accel_2x_pct            = EXCLUDED.accel_2x_pct,
    team_lead_override_pct  = EXCLUDED.team_lead_override_pct,
    notes                   = EXCLUDED.notes
    -- created_by / created_by_name PRESERVED on UPDATE.
    -- The audit trigger rep_overrides_audit captures who modified the row.
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ============================================================
-- Grant EXECUTE to authenticated role
-- ============================================================
-- Supabase defaults usually permit this for public schema functions,
-- but DROP+CREATE can reset grants. Explicit is safer for the money
-- path. A non-exec authenticated caller will now reach the function
-- (and get a 42501 from the authz check inside), rather than getting
-- a "function does not exist" error from Postgres.
-- ============================================================
GRANT EXECUTE ON FUNCTION public.upsert_rep_override(
  text, date, numeric, numeric, integer, numeric, integer,
  numeric, numeric, numeric, numeric, text
) TO authenticated;

-- ============================================================
-- Verification queries
-- ============================================================

-- 1. Confirm exactly one function exists with this name and the
--    full 12-parameter signature.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  pg_get_function_arguments(p.oid)          AS args_with_defaults
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_rep_override';
-- Expect 1 row. arg_signature should be:
--   text, date, numeric, numeric, integer, numeric, integer, numeric, numeric, numeric, numeric, text

-- 2. Confirm the SECURITY DEFINER + search_path attributes landed.
SELECT
  p.proname,
  p.prosecdef        AS is_security_definer,
  p.proconfig        AS config_settings,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_rep_override';
-- Expect: is_security_definer = true; config_settings includes 'search_path=public'.
