-- =============================================================================
--  Investor Visibility — Migration
--  Backs the exec-only "Access" view: a per-tile/section/tab visibility map the
--  executive curates, and the Investor view reads to decide what to show.
--  Single jsonb row: { "<key>": true } — a key present & true = visible to
--  investors; absent or false = hidden (FAIL-CLOSED: nothing shows until an
--  executive checks it). Investor-readable, executive-writable.
--  Paste into the SQL Editor and Run. Safe to re-run.
-- =============================================================================

create table if not exists public.investor_visibility (
  id          int primary key default 1 check (id = 1),
  visible     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

insert into public.investor_visibility (id, visible)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.investor_visibility enable row level security;

-- Read: any authenticated user (investors included) — they need it to render.
drop policy if exists "Authenticated read investor_visibility" on public.investor_visibility;
create policy "Authenticated read investor_visibility"
  on public.investor_visibility for select to authenticated using (true);

-- Write: executive tier only.
drop policy if exists "Executives insert investor_visibility" on public.investor_visibility;
create policy "Executives insert investor_visibility"
  on public.investor_visibility for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')
  ));

drop policy if exists "Executives update investor_visibility" on public.investor_visibility;
create policy "Executives update investor_visibility"
  on public.investor_visibility for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')
  ));
