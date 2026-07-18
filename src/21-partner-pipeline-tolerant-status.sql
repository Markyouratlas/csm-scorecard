-- =============================================================================
--  Open Partner Pipeline — tolerant status matching
--
--  Portal deals arrive with SLUG statuses (closed_won, closed_lost, closed_churned)
--  while Attio deals use display strings (Closed won, Closed - Churned). The original
--  open_partner_pipeline() only matched the exact Attio strings, so portal slugs were
--  wrongly counted as OPEN (e.g. a closed_won deal stayed in the pipeline).
--
--  Redefine the function to NORMALIZE status (lowercase; collapse any run of
--  space/underscore/hyphen/slash to one space) before bucketing — so 'Closed won' and
--  'closed_won' both read as Won. MUST mirror normStatus() in src/channelDeals.js.
--
--  Idempotent. Run in: Supabase Dashboard → SQL Editor.
-- =============================================================================

create or replace function public.open_partner_pipeline()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.parse_channel_value(avg_value)), 0)
  from public.channel_deals
  where btrim(lower(regexp_replace(coalesce(status, ''), '[[:space:]_/-]+', ' ', 'g')))
        not in ('closed won', 'closed lost', 'closed churned', 'declined');
$$;

-- Recompute the current week immediately so the stored value corrects itself now
-- (otherwise it only refreshes on the next channel_deals change or weekly cron).
insert into public.atlas_weekly_updates (week_key, partner_pipeline_amount, updated_at)
values ((date_trunc('week', (now() at time zone 'America/Toronto')))::date, public.open_partner_pipeline(), now())
on conflict (week_key) do update
  set partner_pipeline_amount = excluded.partner_pipeline_amount, updated_at = now();
