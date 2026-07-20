-- ============================================================================
--  25-employee-compensation.sql
--  Per-employee salaries for the Gross Margin (delivery labor) + a new
--  Operating Margin metric. Entered on the Roster page by executives ONLY.
--
--  Salaries live here — NOT on `profiles` — because profiles is world-readable
--  (its SELECT policy is `using (true)`), and Postgres RLS is row-level, so a
--  salary column there would be readable by every authenticated user. This table
--  is executive-tier only for both read and write.
--
--  Safe to re-run.
-- ============================================================================

-- 1. employee_compensation -------------------------------------------------
create table if not exists public.employee_compensation (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references public.profiles(id) on delete cascade,
  annual_salary  numeric,                      -- null = not entered yet. Monthly is derived (annual/12).
  counts_in_cogs boolean not null default false, -- per-person "delivery labor" flag → gross-margin COGS
  notes          text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

-- 2. RLS — executive tier only (read + write) ------------------------------
alter table public.employee_compensation enable row level security;

drop policy if exists "Executives read employee_compensation" on public.employee_compensation;
create policy "Executives read employee_compensation"
  on public.employee_compensation for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

drop policy if exists "Executives write employee_compensation" on public.employee_compensation;
create policy "Executives write employee_compensation"
  on public.employee_compensation for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

-- 3. Operating-margin opex catch-all on the existing config row ------------
alter table public.cogs_config add column if not exists other_opex_monthly numeric not null default 0;

-- 4. Cleanup — drop the placeholder delivery-labor seeds from cogs_line_items.
--    Those three people are real employees now entered via the roster (their
--    salary + delivery flag live in employee_compensation), so keeping the seed
--    rows would double-count them in the gross-margin labor subtotal. The
--    cogs_line_items 'labor' category remains for genuine non-employee/contractor
--    delivery costs added manually in the Gross Margin modal.
delete from public.cogs_line_items
  where category = 'labor'
    and name in ('Haley Folsom (FDE)', 'Andrew Park (FDE)', 'Noah (CS)');
