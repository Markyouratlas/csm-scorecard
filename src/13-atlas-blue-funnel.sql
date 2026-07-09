-- ============================================================
-- src/13-atlas-blue-funnel.sql
-- Read path for Nick's Atlas Blue funnel (Growth scorecard).
--
-- The Growth Manager (role_type='growth_manager') is NOT a manager/exec, so
-- ae_deals RLS does not let them read the pipeline. This SECURITY DEFINER rpc
-- exposes ONLY the ad-driven ("Atlas Blue") deals, and only the minimal columns
-- the funnel needs (no notes / contact PII), gated to executive + growth_manager.
--
-- "Atlas Blue" = ad-driven, the same classification the Growth dashboard already
-- uses: ae_deals.booking_uid -> cal_bookings.uid -> cal_event_type_config where
-- is_ad_driven = true. Manual deals (no booking_uid) are intentionally excluded.
--
-- The client (src/hooks/useAtlasBlueFunnel.js) does the weekly/daily bucketing
-- and status math (deriveFunnelWeek / closeableHeld in src/aeFunnel.js), so the
-- Atlas Blue funnel and the AE Daily Funnel can never disagree.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.atlas_blue_deals(p_since timestamptz)
RETURNS TABLE (
  id         uuid,
  meeting_at timestamptz,
  status     text,
  one_time   numeric,
  mrr        numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role      text;
  v_role_type text;
BEGIN
  -- Authorization: executives (legacy role or role_type) OR the Growth Manager.
  SELECT p.role, p.role_type INTO v_role, v_role_type
    FROM profiles p WHERE p.id = auth.uid() LIMIT 1;

  IF NOT (
        v_role = 'executive'
     OR v_role_type = 'executive'
     OR v_role_type IN ('ceo', 'coo', 'cto', 'cfo')
     OR v_role_type = 'growth_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to read the Atlas Blue funnel'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT d.id, d.meeting_at, d.status, d.one_time, d.mrr
      FROM ae_deals d
      JOIN cal_bookings cb           ON cb.uid = d.booking_uid
      JOIN cal_event_type_config cfg ON cfg.slug = cb.event_type_slug
     WHERE cfg.is_ad_driven = true
       AND d.meeting_at >= p_since
       AND d.status <> 'Deleted';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.atlas_blue_deals(timestamptz) TO authenticated;

-- ============================================================
-- Verification
-- ============================================================
-- As an executive or growth_manager session:
--   select * from atlas_blue_deals(now() - interval '84 days');   -- returns ad-driven deals
-- As a member/other role: the same call raises "Not authorized to read the Atlas Blue funnel".
SELECT proname, prosecdef AS is_security_definer, proconfig AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'atlas_blue_deals';
-- Expect 1 row: atlas_blue_deals · true · {search_path=public}
