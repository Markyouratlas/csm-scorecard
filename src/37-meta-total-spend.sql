-- ============================================================
-- src/37-meta-total-spend.sql
-- Total Meta ad spend over a window, for the Booked Meetings tab's blended CAC
-- (ad spend ÷ new customers). Summed server-side so it stays correct as
-- meta_ads_daily accumulates past the client row cap (the sync only upserts, never
-- deletes, so this table grows over time). p_since NULL = all synced history.
--
-- SECURITY DEFINER, gated to executive + growth_manager. Idempotent.
-- Paste into the Supabase SQL editor.
-- ============================================================

drop function if exists public.meta_total_spend(date);
create or replace function public.meta_total_spend(p_since date)
returns numeric
language plpgsql security definer set search_path to 'public'
as $mts$
declare v_role text; v_role_type text; v_sum numeric;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to read ad spend' using errcode = '42501';
  end if;
  select coalesce(sum(spend), 0) into v_sum
    from public.meta_ads_daily
   where p_since is null or date_start >= p_since;
  return v_sum;
end;
$mts$;
grant execute on function public.meta_total_spend(date) to authenticated;
