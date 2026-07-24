-- ============================================================
-- src/45-dunning-cases.sql
-- Tracked dunning process. The live Stripe fetch (stripe-failed-payments) says WHO
-- is currently failing; these tables track WHAT we've done about it. Keyed by
-- stripe_customer_id (stable — Stripe invoice ids churn as it retries).
--
--   dunning_cases   — one per customer: status + promise-to-pay date + snooze +
--                     notes + touch counters. A row is created on first action.
--   dunning_touches — append-only outreach log (call / text / email / note); a
--                     trigger bumps the parent case's touch_count + last_touch_at.
--
-- Exec-only (dunning is Mark's workflow) via _is_exec() from src/44. Idempotent.
-- ============================================================

create table if not exists public.dunning_cases (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text unique not null,
  customer_email text,
  customer_name text,
  status text not null default 'contacted'
    check (status in ('contacted','promised','snoozed','recovered','churned')),
  promised_pay_date date,
  snooze_until date,
  amount_at_risk numeric,
  notes text,
  touch_count int not null default 0,
  last_touch_at timestamptz,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.dunning_touches (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.dunning_cases(id) on delete cascade,
  kind text not null check (kind in ('call','text','email','note')),
  outcome text,
  note text,
  at timestamptz not null default now(),
  by uuid
);
create index if not exists dunning_touches_case_idx on public.dunning_touches(case_id, at desc);

-- Bump the parent case whenever a touch is logged.
create or replace function public.dunning_bump_case()
returns trigger language plpgsql security definer set search_path to 'public' as $dbc$
begin
  update public.dunning_cases
     set touch_count = touch_count + 1, last_touch_at = new.at, updated_at = now()
   where id = new.case_id;
  return new;
end; $dbc$;

drop trigger if exists trg_dunning_bump on public.dunning_touches;
create trigger trg_dunning_bump after insert on public.dunning_touches
  for each row execute function public.dunning_bump_case();

-- RLS: executives only (read + write), mirroring the rest of the exec workflow.
alter table public.dunning_cases enable row level security;
alter table public.dunning_touches enable row level security;

drop policy if exists dunning_cases_exec_all on public.dunning_cases;
create policy dunning_cases_exec_all on public.dunning_cases
  for all using (public._is_exec()) with check (public._is_exec());

drop policy if exists dunning_touches_exec_all on public.dunning_touches;
create policy dunning_touches_exec_all on public.dunning_touches
  for all using (public._is_exec()) with check (public._is_exec());
