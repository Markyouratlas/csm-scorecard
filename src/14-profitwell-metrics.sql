-- =============================================================================
--  ProfitWell Metrics — Raw Store
--  Stores EVERY ProfitWell monthly metric (all trends, full history) so the
--  full catalog is queryable in-app. One row per (metric_name, month_key).
--
--  Paste into Supabase SQL Editor and click "Run".
--  Safe to re-run: CREATE TABLE IF NOT EXISTS + idempotent policies.
--  Written ONLY by the profitwell-sync Edge Function (service_role); not hand-edited.
-- =============================================================================

-- 1. Table  (long format: one row per metric per month — adding metrics never needs a schema change)
create table if not exists public.profitwell_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_name text not null,
  month_key   date not null,          -- first-of-month, e.g. 2026-05-01
  value       numeric,                -- nullable: some PW metrics return null (e.g. trial_conversion_time)
  synced_at   timestamptz not null default now(),
  unique (metric_name, month_key)
);

create index if not exists profitwell_metrics_name_idx  on public.profitwell_metrics (metric_name);
create index if not exists profitwell_metrics_month_idx on public.profitwell_metrics (month_key);

-- 2. Row-level security (RLS = Postgres's per-row permission system)
alter table public.profitwell_metrics enable row level security;

-- Read: any authenticated user — matches how atlas_targets is read by the dashboard.
drop policy if exists "Authenticated users can read profitwell_metrics" on public.profitwell_metrics;
create policy "Authenticated users can read profitwell_metrics"
  on public.profitwell_metrics for select
  to authenticated
  using (true);

-- NO insert/update/delete policy on purpose: only the profitwell-sync function writes,
-- via the service_role key (which bypasses RLS). Humans never hand-edit raw ProfitWell data.
