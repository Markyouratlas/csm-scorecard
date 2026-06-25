-- =============================================================================
--  Atlas Daily Updates — Migration
--  Adds the two tables that power the Investor view's "Daily Update" tab:
--    1. atlas_daily_updates  — one row per reported calendar day (the 8 pace
--       metrics + snapshot + the qualitative founder fields).
--    2. atlas_weekly_targets — editable weekly targets per metric (set Mondays),
--       used to compute the "vs Pace" column + 🟢🟡🔴 colors.
--
--  Investors must NEVER read per-customer Stripe/commission data, so the Daily
--  tab reads from these aggregate tables only. RLS mirrors atlas_targets exactly:
--  any authenticated user (incl. investors) can READ; only executives can WRITE.
--
--  Paste this entire file into the Supabase SQL Editor and click "Run".
--  Safe to re-run: CREATE IF NOT EXISTS + idempotent policies + ON CONFLICT seed.
-- =============================================================================

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.atlas_daily_updates (
  update_date date primary key,            -- the day being reported (YYYY-MM-DD)
  -- 8 pace metrics — that day's value. null = N/A (metric doesn't apply).
  cold_outreach   numeric,
  ad_spend        numeric,
  calls_booked    numeric,
  calls_held      numeric,                 -- all demos held (incl. unqualified)
  calls_unqualified numeric,               -- subset of calls_held; backed out of the close-rate denom
  deals_closed    numeric,
  new_customers   numeric,
  cash_collected  numeric,                 -- TOTAL cash = Stripe + Wire/ACH (computed on save)
  cash_stripe     numeric,                 -- Stripe portion (manual until a daily-cash sync exists)
  cash_wire_ach   numeric,                 -- Wire / ACH portion (manual)
  mrr_added       numeric,
  -- snapshot (point-in-time, not cumulative)
  total_mrr       numeric,
  total_customers numeric,
  -- qualitative founder fields
  focus            text,                    -- the week's #1 focus
  focus_metric     text,                    -- metric the founder is improving
  plan_to_improve  text,                    -- REQUIRED in the Slack post
  key_learning     text,
  blocker          text,
  plan_url         text,
  scorecard_url    text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- Added after the initial release: split cash into Stripe + Wire/ACH portions.
-- Safe on a table created before these columns existed (run on re-paste).
alter table public.atlas_daily_updates add column if not exists cash_stripe   numeric;
alter table public.atlas_daily_updates add column if not exists cash_wire_ach numeric;
-- Added with the 'Unqualified' meeting status: unqualified demos held that day,
-- so the close-rate denominator (calls_held) can back them out.
alter table public.atlas_daily_updates add column if not exists calls_unqualified numeric;

create table if not exists public.atlas_weekly_targets (
  week_key date not null,                   -- Monday of the week (YYYY-MM-DD)
  metric_key text not null,                 -- 'cold_outreach' | 'ad_spend' | ... | 'show_rate' | 'close_rate'
  target_value numeric,                     -- null = N/A
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (week_key, metric_key)
);

create index if not exists atlas_weekly_targets_week_idx on public.atlas_weekly_targets (week_key);

-- 2. Row-level security -------------------------------------------------------
--    Read: any authenticated user (investors included).
--    Write: executive tier only (role = 'executive' OR role_type = 'executive').

alter table public.atlas_daily_updates  enable row level security;
alter table public.atlas_weekly_targets enable row level security;

-- atlas_daily_updates ---------------------------------------------------------
drop policy if exists "Authenticated users can read atlas_daily_updates" on public.atlas_daily_updates;
create policy "Authenticated users can read atlas_daily_updates"
  on public.atlas_daily_updates for select
  to authenticated
  using (true);

drop policy if exists "Executives can insert atlas_daily_updates" on public.atlas_daily_updates;
create policy "Executives can insert atlas_daily_updates"
  on public.atlas_daily_updates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can update atlas_daily_updates" on public.atlas_daily_updates;
create policy "Executives can update atlas_daily_updates"
  on public.atlas_daily_updates for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

-- atlas_weekly_targets --------------------------------------------------------
drop policy if exists "Authenticated users can read atlas_weekly_targets" on public.atlas_weekly_targets;
create policy "Authenticated users can read atlas_weekly_targets"
  on public.atlas_weekly_targets for select
  to authenticated
  using (true);

drop policy if exists "Executives can insert atlas_weekly_targets" on public.atlas_weekly_targets;
create policy "Executives can insert atlas_weekly_targets"
  on public.atlas_weekly_targets for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can update atlas_weekly_targets" on public.atlas_weekly_targets;
create policy "Executives can update atlas_weekly_targets"
  on public.atlas_weekly_targets for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

-- 3. Seed THIS week's targets with the investors' example figures -------------
--    Gives the tab a populated starting point; execs edit from there. Uses
--    date_trunc('week', ...) which in Postgres returns the Monday. ON CONFLICT
--    DO NOTHING so re-running never clobbers an exec's edited targets.
insert into public.atlas_weekly_targets (week_key, metric_key, target_value) values
  (date_trunc('week', current_date)::date, 'cold_outreach',  200),
  (date_trunc('week', current_date)::date, 'ad_spend',       7500),
  (date_trunc('week', current_date)::date, 'calls_booked',   15),
  (date_trunc('week', current_date)::date, 'calls_held',     12),
  (date_trunc('week', current_date)::date, 'deals_closed',   4),
  (date_trunc('week', current_date)::date, 'new_customers',  4),
  (date_trunc('week', current_date)::date, 'cash_collected', 10000),
  (date_trunc('week', current_date)::date, 'mrr_added',      5000),
  (date_trunc('week', current_date)::date, 'show_rate',      70),
  (date_trunc('week', current_date)::date, 'close_rate',     33)
on conflict (week_key, metric_key) do nothing;
