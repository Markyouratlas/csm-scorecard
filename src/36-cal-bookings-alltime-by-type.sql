-- ============================================================
-- src/36-cal-bookings-alltime-by-type.sql
-- All-time booked-meeting counts per Cal.com event type, for the Booked Meetings
-- tab's "All-Time" hero cards. Test/internal bookings (cal_bookings.is_test) are
-- excluded so it stays consistent with every other attribution number.
--
-- SECURITY DEFINER, gated to executive + growth_manager (Growth can't read
-- cal_bookings in aggregate across all time via the client without a limit).
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

drop function if exists public.cal_bookings_alltime_by_type();
create or replace function public.cal_bookings_alltime_by_type()
returns table (event_type_slug text, n bigint)
language plpgsql security definer set search_path to 'public'
as $cbat$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to read booked-meeting totals' using errcode = '42501';
  end if;
  return query
    select cb.event_type_slug, count(*)::bigint
      from public.cal_bookings cb
     where coalesce(cb.is_test, false) = false
     group by cb.event_type_slug;
end;
$cbat$;
grant execute on function public.cal_bookings_alltime_by_type() to authenticated;
