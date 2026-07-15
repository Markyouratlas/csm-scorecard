-- =============================================================================
--  Open Partner Pipeline metric — server-side single source of truth
--
--  Sum of open channel-partner deal values (deals NOT Won and NOT Lost/Churned),
--  computed from channel_deals and stored in atlas_weekly_updates so the
--  investor-facing surfaces (RLS-blocked from channel_deals) can read it.
--
--  ⚠️ open_partner_pipeline() is the AUTHORITATIVE definition. Its open-status rule
--  MUST mirror isOpenChannelDeal() in src/channelDeals.js (the client mirror that
--  drives Heather's Open tile + the Open Pipeline stat). Change one → change both.
--
--  Freshness: a statement-level trigger on channel_deals recomputes + stores on
--  every deal change (near-live); weekly-update-autofill also seeds it per week.
-- =============================================================================

-- 1. Storage column on the investor-readable weekly table (select using(true)).
alter table public.atlas_weekly_updates
  add column if not exists partner_pipeline_amount numeric;

-- 2. Defensive text→numeric parse (mirrors JS parseChannelValue): strip non-numeric,
--    return 0 on anything that won't cast — so a malformed avg_value can NEVER throw
--    inside the trigger and block a channel_deals write.
create or replace function public.parse_channel_value(v text)
returns numeric language plpgsql immutable as $$
declare cleaned text; result numeric;
begin
  cleaned := nullif(regexp_replace(coalesce(v, ''), '[^0-9.]', '', 'g'), '');
  if cleaned is null then return 0; end if;
  begin
    result := cleaned::numeric;
  exception when others then
    return 0;
  end;
  return result;
end;
$$;

-- 3. THE metric. Open = not Closed won, and not Closed lost / Closed - Churned /
--    declined (null status counts as open). Mirror of isOpenChannelDeal().
create or replace function public.open_partner_pipeline()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.parse_channel_value(avg_value)), 0)
  from public.channel_deals
  where status is distinct from 'Closed won'
    and (status is null or status not in ('Closed lost', 'Closed - Churned', 'declined'));
$$;

-- 4. Near-live writer: on any channel_deals change, recompute + upsert the current
--    ISO-week row (Monday, America/Toronto — matches getWeekKey). SECURITY DEFINER so
--    it can write atlas_weekly_updates regardless of who edited the deal.
create or replace function public.refresh_partner_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wk  date    := (date_trunc('week', (now() at time zone 'America/Toronto')))::date;
  amt numeric := public.open_partner_pipeline();
begin
  insert into public.atlas_weekly_updates (week_key, partner_pipeline_amount, updated_at)
  values (wk, amt, now())
  on conflict (week_key) do update
    set partner_pipeline_amount = excluded.partner_pipeline_amount,
        updated_at = now();
  return null;
end;
$$;

-- open_partner_pipeline() is called by weekly-update-autofill via rpc (service_role).
grant execute on function public.open_partner_pipeline() to authenticated, service_role;

drop trigger if exists channel_deals_partner_pipeline on public.channel_deals;
create trigger channel_deals_partner_pipeline
  after insert or update or delete on public.channel_deals
  for each statement execute function public.refresh_partner_pipeline();

-- 5. Seed the current week immediately so the metric is live the moment this runs.
insert into public.atlas_weekly_updates (week_key, partner_pipeline_amount, updated_at)
values ((date_trunc('week', (now() at time zone 'America/Toronto')))::date, public.open_partner_pipeline(), now())
on conflict (week_key) do update
  set partner_pipeline_amount = excluded.partner_pipeline_amount, updated_at = now();
