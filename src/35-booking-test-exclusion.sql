-- ============================================================
-- src/35-booking-test-exclusion.sql
-- Mark internal/test bookings so they're backed out of attribution metrics.
--
-- `cal_bookings.is_test` = a booking made by our own team for testing (not a real
-- prospect). cal-sync's row mapper does NOT set this column, so a nightly re-sync
-- (upsert on uid) leaves it intact once flagged.
--
-- Growth (growth_manager) can't write cal_bookings, so set_booking_test() is a
-- SECURITY DEFINER toggle gated to executive + growth_manager. Every attribution
-- read path filters is_test out: useCalBookings (Booked Meetings + Meta Live counts,
-- cost-per-booked), atlas_blue_deals (Atlas Blue funnel). booked_meetings_detail
-- still RETURNS test rows (flagged) so they can be found + toggled in the drill-down.
--
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

alter table public.cal_bookings add column if not exists is_test boolean not null default false;

-- Toggle a booking's test flag (exec + growth_manager only).
drop function if exists public.set_booking_test(text, boolean);
create or replace function public.set_booking_test(p_uid text, p_is_test boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to flag bookings' using errcode = '42501';
  end if;
  update public.cal_bookings set is_test = coalesce(p_is_test, false) where uid = p_uid;
end;
$fn$;
grant execute on function public.set_booking_test(text, boolean) to authenticated;

-- Recreate booked_meetings_detail with is_test in the result (drill-down shows +
-- manages test rows; the tab count excludes them via useCalBookings).
drop function if exists public.booked_meetings_detail(timestamptz);
create or replace function public.booked_meetings_detail(p_since timestamptz)
returns table (
  uid text, event_type_slug text, start_time timestamptz, booked_at timestamptz,
  cal_status text, attendee_name text, attendee_email text, host_name text,
  deal_status text, mrr numeric, one_time numeric, products text, is_test boolean
)
language plpgsql security definer set search_path to 'public'
as $function$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to read booked meetings detail' using errcode = '42501';
  end if;
  return query
    select cb.uid, cb.event_type_slug, cb.start_time, cb.created_at_cal as booked_at,
           cb.status as cal_status, cb.attendee_name, cb.attendee_email, cb.host_name,
           d.status as deal_status, d.mrr, d.one_time,
           case when d.status = 'Closed Won'
                then public.stripe_plan_label(d.matched_stripe_customer_id) else null end as products,
           cb.is_test
      from public.cal_bookings cb
      left join lateral (
        select ad.status, ad.mrr, ad.one_time, ad.matched_stripe_customer_id
          from public.ae_deals ad
         where ad.booking_uid = cb.uid and ad.status <> 'Deleted'
         order by ad.meeting_at desc nulls last limit 1
      ) d on true
     where cb.created_at_cal >= p_since
     order by cb.start_time desc nulls last;
end;
$function$;
grant execute on function public.booked_meetings_detail(timestamptz) to authenticated;

-- Atlas Blue funnel: back test bookings out of the ad-driven deals too.
create or replace function public.atlas_blue_deals(p_since timestamptz)
returns table (
  id uuid, meeting_at timestamptz, booked_at timestamptz, status text,
  one_time numeric, mrr numeric, customer_name text, customer_email text, rep_name text
)
language plpgsql security definer set search_path to 'public'
as $function$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to read the Atlas Blue funnel' using errcode = '42501';
  end if;
  return query
    select d.id, d.meeting_at, cb.created_at_cal as booked_at, d.status, d.one_time, d.mrr,
           d.customer_name, d.customer_email, cb.host_name as rep_name
      from public.ae_deals d
      join public.cal_bookings cb           on cb.uid = d.booking_uid
      join public.cal_event_type_config cfg on cfg.slug = cb.event_type_slug
     where cfg.is_ad_driven = true
       and coalesce(cb.is_test, false) = false
       and d.meeting_at >= p_since
       and d.status <> 'Deleted';
end;
$function$;
grant execute on function public.atlas_blue_deals(timestamptz) to authenticated;
