-- =============================================================================
--  Atlas Weekly Updates — Migration
--  Adds `atlas_weekly_updates`: one row per week powering the investors' "Weekly
--  Update" (the Friday post). It stores ONLY the weekly-specific fields —
--  snapshot extras (churned / pipeline / cash on hand / runway), the WoW MRR &
--  customers snapshot, the narrative, Core Rocks, and Asks.
--
--  The 8 pace metrics' "This Wk" values are NOT stored here — they're summed from
--  atlas_daily_updates for the week — and the Target column reuses
--  atlas_weekly_targets (one set of weekly targets drives both the daily + weekly
--  posts). Investor-readable, executive-write — same RLS as atlas_daily_updates.
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

create table if not exists public.atlas_weekly_updates (
  week_key date primary key,                 -- Monday of the week (YYYY-MM-DD)
  -- narrative
  focus            text,
  focus_metric     text,
  plan_to_improve  text,                      -- required in the Slack post
  key_learning     text,
  blocker          text,
  rocks_product    text,                      -- newline-separated bullets
  rocks_team       text,
  rocks_general    text,
  asks             text,                      -- newline-separated bullets
  -- snapshot extras (manual)
  churned_this_week numeric,
  pipeline_amount   numeric,
  pipeline_count    numeric,
  cash_on_hand      numeric,
  runway_months     numeric,
  -- end-of-week snapshot (for WoW deltas) — prefilled from live, overridable
  total_mrr        numeric,
  total_customers  numeric,
  -- per-metric This-Wk overrides (jsonb keyed by pace metric_key). Presence of a
  -- key means the exec typed over the calculated daily sum for that metric; a key
  -- set to 0 is a real override (vs absent = use the sum).
  metric_overrides jsonb not null default '{}'::jsonb,
  -- links
  plan_url         text,
  scorecard_url    text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- Added after initial release (safe on a table created before this column existed).
alter table public.atlas_weekly_updates
  add column if not exists metric_overrides jsonb not null default '{}'::jsonb;

-- Row-level security: authenticated read (incl. investors), executive-tier write.
alter table public.atlas_weekly_updates enable row level security;

drop policy if exists "Authenticated users can read atlas_weekly_updates" on public.atlas_weekly_updates;
create policy "Authenticated users can read atlas_weekly_updates"
  on public.atlas_weekly_updates for select
  to authenticated
  using (true);

drop policy if exists "Executives can insert atlas_weekly_updates" on public.atlas_weekly_updates;
create policy "Executives can insert atlas_weekly_updates"
  on public.atlas_weekly_updates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can update atlas_weekly_updates" on public.atlas_weekly_updates;
create policy "Executives can update atlas_weekly_updates"
  on public.atlas_weekly_updates for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );
