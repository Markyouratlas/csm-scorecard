-- =============================================================================
--  Weekly MRR — Migration
--  Adds the `weekly_mrr` table: per-week manual MRR overrides for the
--  Investor (Odyssey Gold) + Odyssey executive hero trajectory chart.
--
--  We do NOT store interpolated weeks here. The app derives the weekly MRR
--  series at read time by linearly interpolating between the real MONTHLY
--  anchors (atlas_targets 'total-mrr' actuals + the live current month). This
--  table holds ONLY the weeks an executive has manually corrected with a real
--  figure — those overrides win over the interpolated value.
--
--  Paste this entire file into the Supabase SQL Editor and click "Run".
--  Safe to re-run: create-if-not-exists + idempotent policies.
-- =============================================================================

-- 1. Table — one row per overridden week (week_key = Monday, YYYY-MM-DD).
create table if not exists public.weekly_mrr (
  week_key date primary key,
  mrr numeric,
  source text not null default 'manual',   -- 'manual' (exec override)
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- 2. Row-level security — mirrors atlas_targets:
--    everyone authenticated can read; only executives can write.
alter table public.weekly_mrr enable row level security;

drop policy if exists "Authenticated users can read weekly_mrr" on public.weekly_mrr;
create policy "Authenticated users can read weekly_mrr"
  on public.weekly_mrr for select
  to authenticated
  using (true);

drop policy if exists "Executives can insert weekly_mrr" on public.weekly_mrr;
create policy "Executives can insert weekly_mrr"
  on public.weekly_mrr for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can update weekly_mrr" on public.weekly_mrr;
create policy "Executives can update weekly_mrr"
  on public.weekly_mrr for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );

drop policy if exists "Executives can delete weekly_mrr" on public.weekly_mrr;
create policy "Executives can delete weekly_mrr"
  on public.weekly_mrr for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role_type = 'executive')
    )
  );
