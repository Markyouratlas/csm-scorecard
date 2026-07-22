-- ============================================================
-- src/34-booked-meetings-detail.sql
-- Per-booking detail for the Growth "Booked Meetings" drill-down.
--
-- Growth (role_type='growth_manager') can't read ae_deals (RLS), so this
-- SECURITY DEFINER rpc — gated to executive + growth_manager, same as
-- atlas_blue_deals — returns, for every cal_booking in the window: the customer
-- (attendee), who the meeting is with (host), the meeting date, the calendar
-- status, and the matched sales outcome from ae_deals (status, cash, MRR, and the
-- real Stripe product(s) for a Closed Won). Windowed by created_at_cal so it
-- matches useCalBookings' default window.
--
-- LEFT JOIN LATERAL so bookings with no matching deal still appear (deal fields
-- null), and at most one deal per booking (most recent meeting wins).
-- Idempotent: DROP first (return signature is fixed). Paste into the SQL editor.
-- ============================================================

DROP FUNCTION IF EXISTS public.booked_meetings_detail(timestamptz);

CREATE OR REPLACE FUNCTION public.booked_meetings_detail(p_since timestamptz)
RETURNS TABLE (
  uid             text,
  event_type_slug text,
  start_time      timestamptz,
  booked_at       timestamptz,
  cal_status      text,
  attendee_name   text,
  attendee_email  text,
  host_name       text,
  deal_status     text,
  mrr             numeric,
  one_time        numeric,
  products        text
)
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
     OR v_role_type IN ('ceo', 'coo', 'cto', 'cfo')
     OR v_role_type = 'growth_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to read booked meetings detail'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT cb.uid, cb.event_type_slug, cb.start_time, cb.created_at_cal AS booked_at,
           cb.status AS cal_status, cb.attendee_name, cb.attendee_email, cb.host_name,
           d.status AS deal_status, d.mrr, d.one_time,
           CASE WHEN d.status = 'Closed Won'
                THEN public.stripe_plan_label(d.matched_stripe_customer_id)
                ELSE NULL END AS products
      FROM cal_bookings cb
      LEFT JOIN LATERAL (
        SELECT ad.status, ad.mrr, ad.one_time, ad.matched_stripe_customer_id
          FROM ae_deals ad
         WHERE ad.booking_uid = cb.uid
           AND ad.status <> 'Deleted'
         ORDER BY ad.meeting_at DESC NULLS LAST
         LIMIT 1
      ) d ON true
     WHERE cb.created_at_cal >= p_since
     ORDER BY cb.start_time DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.booked_meetings_detail(timestamptz) TO authenticated;

-- Verify (as an exec/growth session):
--   select * from booked_meetings_detail(now() - interval '56 days') limit 20;
SELECT proname, prosecdef AS is_security_definer, proconfig AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'booked_meetings_detail';
