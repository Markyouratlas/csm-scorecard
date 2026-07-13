-- ============================================================
-- src/18-ga4-metrics.sql
-- Storage for the GA4 → Growth scorecard integration (ga4-sync edge function).
-- Two grains: date × channel (main report) and date × eventName (opt-in events).
-- The edge function upserts a rolling 90-day window (service role); the browser
-- only READS these (never live GA4 on page load).
--
-- RLS: readable by executive / manager / growth_manager / team leads (mirrors the
-- atlas-blue "Managers read all" policy + growth_manager). Investors are excluded —
-- this is department-level marketing data, not an investor-readable aggregate. No
-- client write policy: the ga4-sync function writes with the service role (bypasses RLS).
--
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

create table if not exists public.ga4_daily_metrics (
  date                    date not null,
  channel                 text not null,
  sessions                integer,
  active_users            integer,
  key_events              numeric,
  session_key_event_rate  numeric,
  synced_at               timestamptz not null default now(),
  primary key (date, channel)
);

create table if not exists public.ga4_daily_events (
  date         date not null,
  event_name   text not null,
  event_count  numeric,
  synced_at    timestamptz not null default now(),
  primary key (date, event_name)
);

create index if not exists ga4_daily_metrics_date_idx on public.ga4_daily_metrics (date);
create index if not exists ga4_daily_events_date_idx   on public.ga4_daily_events (date);

alter table public.ga4_daily_metrics enable row level security;
alter table public.ga4_daily_events  enable row level security;

-- Read access — exec / manager / growth_manager / team lead. Same predicate on both tables.
drop policy if exists "Growth+managers read ga4_daily_metrics" on public.ga4_daily_metrics;
create policy "Growth+managers read ga4_daily_metrics"
  on public.ga4_daily_metrics for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager'
           or p.role_type = 'executive' or p.role_type = 'growth_manager'
           or p.is_team_lead = true)
  ));

drop policy if exists "Growth+managers read ga4_daily_events" on public.ga4_daily_events;
create policy "Growth+managers read ga4_daily_events"
  on public.ga4_daily_events for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager'
           or p.role_type = 'executive' or p.role_type = 'growth_manager'
           or p.is_team_lead = true)
  ));

-- ============================================================
-- Verification
--   select count(*), min(date), max(date), sum(sessions) from ga4_daily_metrics;
--   select event_name, sum(event_count) from ga4_daily_events group by 1;
-- ============================================================
