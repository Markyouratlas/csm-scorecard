-- ============================================================
-- src/38-meta-spend-by-campaign.sql
-- Per-campaign Meta ad spend over a window, for the Ad spend / CAC drill-downs on
-- the Booked Meetings tab. Summed server-side (meta_ads_daily accumulates past the
-- client row cap). p_since NULL = all synced history.
--
-- SECURITY DEFINER, gated to executive + growth_manager. Idempotent.
-- Paste into the Supabase SQL editor.
-- ============================================================

drop function if exists public.meta_spend_by_campaign(date);
create or replace function public.meta_spend_by_campaign(p_since date)
returns table (campaign_id text, campaign_name text, spend numeric)
language plpgsql security definer set search_path to 'public'
as $msbc$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive'
          or v_role_type in ('ceo','coo','cto','cfo') or v_role_type = 'growth_manager') then
    raise exception 'Not authorized to read ad spend' using errcode = '42501';
  end if;
  return query select m.campaign_id, max(m.campaign_name), coalesce(sum(m.spend), 0) from public.meta_ads_daily m where p_since is null or m.date_start >= p_since group by m.campaign_id having coalesce(sum(m.spend), 0) > 0;
end;
$msbc$;
grant execute on function public.meta_spend_by_campaign(date) to authenticated;
