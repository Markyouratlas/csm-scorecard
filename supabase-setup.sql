-- =============================================================================
--  CSM Scorecard — Supabase Schema
--  Paste this entire file into the Supabase SQL Editor and click "Run."
-- =============================================================================

-- 1. Profiles table (one row per user, linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  title text not null default 'Customer Success Manager',
  color text not null default '#0F766E',
  role text not null default 'csm' check (role in ('csm', 'manager')),
  created_at timestamptz not null default now()
);

-- 2. Weekly scorecards table (one row per user per week)
create table if not exists public.weekly_scorecards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_key date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, week_key)
);

-- =============================================================================
--  ROW LEVEL SECURITY
--  Each user can only read/write their own data. Managers can read everyone.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.weekly_scorecards enable row level security;

-- Profiles: anyone signed in can read all profiles (so login screen + manager
-- dashboard can list CSMs). Users can only update their own profile.
-- Managers can update or delete any profile.
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users update self, managers update anyone" on public.profiles;
create policy "Users update self, managers update anyone"
  on public.profiles for update
  to authenticated
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

drop policy if exists "Managers can delete profiles" on public.profiles;
create policy "Managers can delete profiles"
  on public.profiles for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

-- Weekly scorecards: users can read/write their own. Managers can read all.
drop policy if exists "Users read own scorecards, managers read all" on public.weekly_scorecards;
create policy "Users read own scorecards, managers read all"
  on public.weekly_scorecards for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

drop policy if exists "Users insert own scorecards" on public.weekly_scorecards;
create policy "Users insert own scorecards"
  on public.weekly_scorecards for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own scorecards" on public.weekly_scorecards;
create policy "Users update own scorecards"
  on public.weekly_scorecards for update
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users delete own scorecards" on public.weekly_scorecards;
create policy "Users delete own scorecards"
  on public.weekly_scorecards for delete
  to authenticated
  using (auth.uid() = user_id);

-- Helpful indexes
create index if not exists weekly_scorecards_user_week_idx on public.weekly_scorecards(user_id, week_key);
create index if not exists weekly_scorecards_week_idx on public.weekly_scorecards(week_key);
