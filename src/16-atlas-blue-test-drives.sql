-- ============================================================
-- src/16-atlas-blue-test-drives.sql
-- "Test Drives" for Nick's Atlas Blue funnel = DISTINCT customers who had a
-- conversation with the Atlas Blue campaign 'Atlas Blue Paid Ads Funnel Agent'.
--
-- A growth_manager can't read atlas_sessions under RLS, so this SECURITY DEFINER
-- rpc (gated to executive + growth_manager, like atlas_blue_deals) returns one row
-- per distinct customer (last-10 phone, else email) with their FIRST conversation
-- date. The client buckets first_at by Toronto week/day into the funnel's Test
-- Drives column (which feeds Cost/Test Drive + Action %).
--
-- Idempotent (CREATE OR REPLACE). Paste into the Supabase SQL editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atlas_blue_test_drives()
RETURNS TABLE (contact_key text, first_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role      text;
  v_role_type text;
BEGIN
  SELECT p.role, p.role_type INTO v_role, v_role_type
    FROM profiles p WHERE p.id = auth.uid() LIMIT 1;
  IF NOT (
        v_role = 'executive'
     OR v_role_type = 'executive'
     OR v_role_type IN ('ceo', 'coo', 'cfo', 'cto')
     OR v_role_type = 'growth_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to read Atlas Blue test drives'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT
      COALESCE(NULLIF(RIGHT(regexp_replace(s.contact_phone, '\D', '', 'g'), 10), ''), lower(s.contact_email)) AS contact_key,
      MIN(COALESCE(s.created_at, s.updated_at)) AS first_at
    FROM atlas_sessions s
    WHERE s.campaign_name = 'Atlas Blue Paid Ads Funnel Agent'
      AND (s.contact_phone IS NOT NULL OR s.contact_email IS NOT NULL)
    GROUP BY 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.atlas_blue_test_drives() TO authenticated;

-- ============================================================
-- Verification (as an executive or growth_manager session)
-- ============================================================
SELECT count(*) AS distinct_test_drive_customers FROM atlas_blue_test_drives();
-- Expect the number of unique contacts that have chatted with the campaign.
SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'atlas_blue_test_drives';
-- Expect: atlas_blue_test_drives · true
