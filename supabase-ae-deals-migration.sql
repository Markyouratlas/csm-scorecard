-- =============================================================================
--  AE Deals — Migration
--  Adds `ae_deals`: one row per AE meeting/deal, auto-imported from cal_bookings
--  (host = the AE) and enriched with the AE's outcome (status), MRR + one-time
--  payment (auto-matched from Stripe or manual for wire/ACH), and notes.
--
--  Lives outside weekly_scorecards so deals persist across weeks and survive cal
--  re-syncs. The Daily Funnel, Active Pipeline, and Closed bucket are all just
--  filters on this one table (open = not Won/Lost; closed = Won/Lost).
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

create table if not exists public.ae_deals (
  id uuid primary key default gen_random_uuid(),
  ae_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'cal',            -- 'cal' | 'manual'
  booking_uid text,                              -- cal_bookings.uid (null for manual rows)
  customer_name text,
  customer_email text,                           -- prospect (attendee_email) — default match key
  payment_email text,                            -- AE override for the Stripe match
  meeting_at timestamptz,                         -- cal start_time (drives day/week grouping)
  event_type text,
  status text not null default 'Scheduled',      -- Scheduled | Showed | No-show | Proposal sent |
                                                 -- Follow-up | Rescheduled | Closed Won | Closed Lost
  payment_method text not null default 'stripe', -- 'stripe' | 'wire_ach'
  mrr numeric,                                   -- auto from Stripe unless wire_ach (then manual)
  one_time numeric,                              -- auto from Stripe unless wire_ach (then manual)
  matched_stripe_customer_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  -- Idempotent cal import: one row per (AE, booking). NULL booking_uid (manual
  -- rows) are exempt from the uniqueness check in Postgres, so manual dups are ok.
  unique (ae_id, booking_uid)
);

create index if not exists ae_deals_ae_idx on public.ae_deals (ae_id);
create index if not exists ae_deals_status_idx on public.ae_deals (status);
create index if not exists ae_deals_meeting_idx on public.ae_deals (meeting_at);

-- Row-level security ---------------------------------------------------------
--   An AE has full CRUD over their OWN rows. Managers/executives can read all.
alter table public.ae_deals enable row level security;

drop policy if exists "AE reads own ae_deals" on public.ae_deals;
create policy "AE reads own ae_deals"
  on public.ae_deals for select to authenticated
  using (ae_id = auth.uid());

drop policy if exists "Managers read all ae_deals" on public.ae_deals;
create policy "Managers read all ae_deals"
  on public.ae_deals for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role = 'manager'
             or p.role_type = 'executive' or p.is_team_lead = true)
    )
  );

drop policy if exists "AE inserts own ae_deals" on public.ae_deals;
create policy "AE inserts own ae_deals"
  on public.ae_deals for insert to authenticated
  with check (ae_id = auth.uid());

drop policy if exists "AE updates own ae_deals" on public.ae_deals;
create policy "AE updates own ae_deals"
  on public.ae_deals for update to authenticated
  using (ae_id = auth.uid());

drop policy if exists "AE deletes own ae_deals" on public.ae_deals;
create policy "AE deletes own ae_deals"
  on public.ae_deals for delete to authenticated
  using (ae_id = auth.uid());

-- Managers/executives may write on an AE's behalf (sync/edit during drill-in).
drop policy if exists "Managers insert all ae_deals" on public.ae_deals;
create policy "Managers insert all ae_deals"
  on public.ae_deals for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role = 'manager'
             or p.role_type = 'executive' or p.is_team_lead = true)
    )
  );

drop policy if exists "Managers update all ae_deals" on public.ae_deals;
create policy "Managers update all ae_deals"
  on public.ae_deals for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role = 'manager'
             or p.role_type = 'executive' or p.is_team_lead = true)
    )
  );

drop policy if exists "Managers delete all ae_deals" on public.ae_deals;
create policy "Managers delete all ae_deals"
  on public.ae_deals for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'executive' or p.role = 'manager'
             or p.role_type = 'executive' or p.is_team_lead = true)
    )
  );
