-- =============================================================================
--  Atlas Targets — Migration
--  Adds the `atlas_targets` table for editable monthly targets + manual actuals.
--  Pre-seeded with historical data from the Atlas KPI spreadsheet.
--
--  Paste this entire file into Supabase SQL Editor and click "Run".
--  Safe to re-run: uses upserts on (metric_key, month_key) so it won't duplicate.
-- =============================================================================

-- 1. Table
create table if not exists public.atlas_targets (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  month_key date not null,
  actual_value numeric,
  target_value numeric,
  actual_source text,         -- null, 'manual', 'manual_backfill', 'stripe', 'profitwell', etc.
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (metric_key, month_key)
);

create index if not exists atlas_targets_metric_idx on public.atlas_targets (metric_key);
create index if not exists atlas_targets_month_idx on public.atlas_targets (month_key);

-- 2. Row-level security
alter table public.atlas_targets enable row level security;

drop policy if exists "Authenticated users can read atlas_targets" on public.atlas_targets;
create policy "Authenticated users can read atlas_targets"
  on public.atlas_targets for select
  to authenticated
  using (true);

drop policy if exists "Executives can insert atlas_targets" on public.atlas_targets;
create policy "Executives can insert atlas_targets"
  on public.atlas_targets for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can update atlas_targets" on public.atlas_targets;
create policy "Executives can update atlas_targets"
  on public.atlas_targets for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

-- 3. Seed data from Atlas_KPI_Reporting.xlsx (extracted 2026-05-20)
-- 161 rows: 7 months of historical actuals (Nov 2025 → May 2026) +
-- 20 months of forward-looking MRR/ARPU/customer/calls targets through Dec 2027.
insert into public.atlas_targets (metric_key, month_key, actual_value, target_value, actual_source) values
  ('net-new-sales', '2025-11-01', 42, null, 'manual_backfill'),
  ('net-new-sales', '2025-12-01', 74, null, 'manual_backfill'),
  ('net-new-sales', '2026-01-01', 67, null, 'manual_backfill'),
  ('net-new-sales', '2026-02-01', 48, null, 'manual_backfill'),
  ('net-new-sales', '2026-03-01', 27, null, 'manual_backfill'),
  ('net-new-sales', '2026-04-01', 32, null, 'manual_backfill'),
  ('net-new-sales', '2026-05-01', 11, null, 'manual_backfill'),
  ('net-new-mrr', '2025-11-01', 9583, null, 'manual_backfill'),
  ('net-new-mrr', '2025-12-01', 26280, null, 'manual_backfill'),
  ('net-new-mrr', '2026-01-01', 23341, null, 'manual_backfill'),
  ('net-new-mrr', '2026-02-01', 17494, null, 'manual_backfill'),
  ('net-new-mrr', '2026-03-01', 9474, null, 'manual_backfill'),
  ('net-new-mrr', '2026-04-01', 11019, null, 'manual_backfill'),
  ('net-new-mrr', '2026-05-01', 6856, null, 'manual_backfill'),
  ('total-mrr', '2025-11-01', 116583, 116583, 'manual_backfill'),
  ('total-mrr', '2025-12-01', 138480, 135000, 'manual_backfill'),
  ('total-mrr', '2026-01-01', 155143, 182899, 'manual_backfill'),
  ('total-mrr', '2026-02-01', 160128, 247793, 'manual_backfill'),
  ('total-mrr', '2026-03-01', 160212, 335712, 'manual_backfill'),
  ('total-mrr', '2026-04-01', 163727, 422665, 'manual_backfill'),
  ('total-mrr', '2026-05-01', 167682, 460705, 'manual_backfill'),
  ('total-customers', '2025-11-01', 291, null, 'manual_backfill'),
  ('total-customers', '2025-12-01', 365, null, 'manual_backfill'),
  ('total-customers', '2026-01-01', 432, null, 'manual_backfill'),
  ('total-customers', '2026-02-01', 480, null, 'manual_backfill'),
  ('total-customers', '2026-03-01', 333, null, 'manual_backfill'),
  ('total-customers', '2026-04-01', 365, null, 'manual_backfill'),
  ('total-customers', '2026-05-01', 371, null, 'manual_backfill'),
  ('net-mrr-churned', '2025-11-01', 0, null, 'manual_backfill'),
  ('net-mrr-churned', '2025-12-01', 5477, null, 'manual_backfill'),
  ('net-mrr-churned', '2026-01-01', 6600, null, 'manual_backfill'),
  ('net-mrr-churned', '2026-02-01', 9000, null, 'manual_backfill'),
  ('net-mrr-churned', '2026-03-01', 11250, null, 'manual_backfill'),
  ('net-mrr-churned', '2026-04-01', 11335, null, 'manual_backfill'),
  ('net-mrr-churned', '2026-05-01', 0, null, 'manual_backfill'),
  ('churn-pct', '2025-11-01', 0, null, 'manual_backfill'),
  ('churn-pct', '2025-12-01', 0.046979, null, 'manual_backfill'),
  ('churn-pct', '2026-01-01', 0.04766, null, 'manual_backfill'),
  ('churn-pct', '2026-02-01', 0.058011, null, 'manual_backfill'),
  ('churn-pct', '2026-03-01', 0.070256, null, 'manual_backfill'),
  ('churn-pct', '2026-04-01', 0.07075, null, 'manual_backfill'),
  ('churn-pct', '2026-05-01', 0, null, 'manual_backfill'),
  ('arpu', '2025-11-01', 400.6289, null, 'manual_backfill'),
  ('arpu', '2025-12-01', 379.3973, null, 'manual_backfill'),
  ('arpu', '2026-01-01', 359.1273, null, 'manual_backfill'),
  ('arpu', '2026-02-01', 333.6, null, 'manual_backfill'),
  ('arpu', '2026-03-01', 481.1171, null, 'manual_backfill'),
  ('arpu', '2026-04-01', 448.5671, null, 'manual_backfill'),
  ('arpu', '2026-05-01', 451.973, 468.55, 'manual_backfill'),
  ('prs-submitted', '2025-12-01', 40, null, 'manual_backfill'),
  ('prs-submitted', '2026-01-01', 70, null, 'manual_backfill'),
  ('prs-submitted', '2026-02-01', 53, null, 'manual_backfill'),
  ('prs-submitted', '2026-03-01', 30, null, 'manual_backfill'),
  ('prs-submitted', '2026-04-01', 101, null, 'manual_backfill'),
  ('prs-submitted', '2026-05-01', 111, null, 'manual_backfill'),
  ('prs-deployed', '2025-12-01', 40, null, 'manual_backfill'),
  ('prs-deployed', '2026-01-01', 70, null, 'manual_backfill'),
  ('prs-deployed', '2026-02-01', 40, null, 'manual_backfill'),
  ('prs-deployed', '2026-03-01', 30, null, 'manual_backfill'),
  ('prs-deployed', '2026-04-01', 66, null, 'manual_backfill'),
  ('prs-deployed', '2026-05-01', 53, null, 'manual_backfill'),
  ('sales-calls-booked', '2025-12-01', 350, null, 'manual_backfill'),
  ('sales-calls-booked', '2026-01-01', 523, null, 'manual_backfill'),
  ('sales-calls-booked', '2026-02-01', 320, null, 'manual_backfill'),
  ('sales-calls-booked', '2026-03-01', 285, null, 'manual_backfill'),
  ('sales-calls-booked', '2026-04-01', 259, null, 'manual_backfill'),
  ('sales-calls-booked', '2026-05-01', 98, null, 'manual_backfill'),
  ('sales-calls-sat', '2025-12-01', 136, null, 'manual_backfill'),
  ('sales-calls-sat', '2026-01-01', 194, null, 'manual_backfill'),
  ('sales-calls-sat', '2026-02-01', 101, null, 'manual_backfill'),
  ('sales-calls-sat', '2026-03-01', 101, null, 'manual_backfill'),
  ('sales-calls-sat', '2026-04-01', 121, null, 'manual_backfill'),
  ('sales-calls-sat', '2026-05-01', 47, null, 'manual_backfill'),
  ('no-shows', '2025-12-01', 214, null, 'manual_backfill'),
  ('no-shows', '2026-01-01', 329, null, 'manual_backfill'),
  ('no-shows', '2026-02-01', 219, null, 'manual_backfill'),
  ('no-shows', '2026-03-01', 184, null, 'manual_backfill'),
  ('no-shows', '2026-04-01', 138, null, 'manual_backfill'),
  ('no-shows', '2026-05-01', 51, null, 'manual_backfill'),
  ('show-rate', '2025-12-01', 0.388571, null, 'manual_backfill'),
  ('show-rate', '2026-01-01', 0.370937, null, 'manual_backfill'),
  ('show-rate', '2026-02-01', 0.315625, null, 'manual_backfill'),
  ('show-rate', '2026-03-01', 0.354386, null, 'manual_backfill'),
  ('show-rate', '2026-04-01', 0.467181, null, 'manual_backfill'),
  ('show-rate', '2026-05-01', 0.479592, null, 'manual_backfill'),
  ('total-mrr', '2026-06-01', null, 207087.27, null),
  ('arpu', '2026-06-01', null, 468.55, null),
  ('new-customers', '2026-06-01', null, 84.1005, null),
  ('sales-calls-booked', '2026-06-01', null, 336.4018, null),
  ('total-mrr', '2026-07-01', null, 255752.7784, null),
  ('arpu', '2026-07-01', null, 468.55, null),
  ('new-customers', '2026-07-01', null, 103.8641, null),
  ('sales-calls-booked', '2026-07-01', null, 415.4563, null),
  ('total-mrr', '2026-08-01', null, 315854.6814, null),
  ('arpu', '2026-08-01', null, 468.55, null),
  ('new-customers', '2026-08-01', null, 128.2721, null),
  ('sales-calls-booked', '2026-08-01', null, 513.0885, null),
  ('total-mrr', '2026-09-01', null, 390080.5315, null),
  ('arpu', '2026-09-01', null, 468.55, null),
  ('new-customers', '2026-09-01', null, 158.4161, null),
  ('sales-calls-booked', '2026-09-01', null, 633.6643, null),
  ('total-mrr', '2026-10-01', null, 481749.4564, null),
  ('arpu', '2026-10-01', null, 468.55, null),
  ('new-customers', '2026-10-01', null, 195.6438, null),
  ('sales-calls-booked', '2026-10-01', null, 782.5754, null),
  ('total-mrr', '2026-11-01', null, 594960.5787, null),
  ('arpu', '2026-11-01', null, 468.55, null),
  ('new-customers', '2026-11-01', null, 241.6202, null),
  ('sales-calls-booked', '2026-11-01', null, 966.4806, null),
  ('total-mrr', '2026-12-01', null, 734776.3147, null),
  ('arpu', '2026-12-01', null, 468.55, null),
  ('new-customers', '2026-12-01', null, 298.4009, null),
  ('sales-calls-booked', '2026-12-01', null, 1193.6036, null),
  ('total-mrr', '2027-01-01', null, 907448.7486, null),
  ('arpu', '2027-01-01', null, 468.55, null),
  ('new-customers', '2027-01-01', null, 368.5251, null),
  ('sales-calls-booked', '2027-01-01', null, 1474.1004, null),
  ('total-mrr', '2027-02-01', null, 1120699.2045, null),
  ('arpu', '2027-02-01', null, 468.55, null),
  ('new-customers', '2027-02-01', null, 455.1285, null),
  ('sales-calls-booked', '2027-02-01', null, 1820.514, null),
  ('total-mrr', '2027-03-01', null, 1384063.5176, null),
  ('arpu', '2027-03-01', null, 468.55, null),
  ('new-customers', '2027-03-01', null, 562.0837, null),
  ('sales-calls-booked', '2027-03-01', null, 2248.3348, null),
  ('total-mrr', '2027-04-01', null, 1709318.4442, null),
  ('arpu', '2027-04-01', null, 468.55, null),
  ('new-customers', '2027-04-01', null, 694.1734, null),
  ('sales-calls-booked', '2027-04-01', null, 2776.6934, null),
  ('total-mrr', '2027-05-01', null, 2111008.2786, null),
  ('arpu', '2027-05-01', null, 468.55, null),
  ('new-customers', '2027-05-01', null, 857.3041, null),
  ('sales-calls-booked', '2027-05-01', null, 3429.2164, null),
  ('total-mrr', '2027-06-01', null, 2607095.2241, null),
  ('arpu', '2027-06-01', null, 468.55, null),
  ('new-customers', '2027-06-01', null, 1058.7706, null),
  ('sales-calls-booked', '2027-06-01', null, 4235.0822, null),
  ('total-mrr', '2027-07-01', null, 3219762.6018, null),
  ('arpu', '2027-07-01', null, 468.55, null),
  ('new-customers', '2027-07-01', null, 1307.5816, null),
  ('sales-calls-booked', '2027-07-01', null, 5230.3266, null),
  ('total-mrr', '2027-08-01', null, 3976406.8132, null),
  ('arpu', '2027-08-01', null, 468.55, null),
  ('new-customers', '2027-08-01', null, 1614.8633, null),
  ('sales-calls-booked', '2027-08-01', null, 6459.4533, null),
  ('total-mrr', '2027-09-01', null, 4910862.4143, null),
  ('arpu', '2027-09-01', null, 468.55, null),
  ('new-customers', '2027-09-01', null, 1994.3562, null),
  ('sales-calls-booked', '2027-09-01', null, 7977.4248, null),
  ('total-mrr', '2027-10-01', null, 6064915.0816, null),
  ('arpu', '2027-10-01', null, 468.55, null),
  ('new-customers', '2027-10-01', null, 2463.0299, null),
  ('sales-calls-booked', '2027-10-01', null, 9852.1197, null),
  ('total-mrr', '2027-11-01', null, 7490170.1258, null),
  ('arpu', '2027-11-01', null, 468.55, null),
  ('new-customers', '2027-11-01', null, 3041.8419, null),
  ('sales-calls-booked', '2027-11-01', null, 12167.3678, null),
  ('total-mrr', '2027-12-01', null, 9250360.1054, null),
  ('arpu', '2027-12-01', null, 468.55, null),
  ('new-customers', '2027-12-01', null, 3756.6748, null),
  ('sales-calls-booked', '2027-12-01', null, 15026.6992, null)
on conflict (metric_key, month_key) do update set
  actual_value = excluded.actual_value,
  target_value = coalesce(public.atlas_targets.target_value, excluded.target_value),  -- never overwrite manually edited targets
  actual_source = excluded.actual_source;
