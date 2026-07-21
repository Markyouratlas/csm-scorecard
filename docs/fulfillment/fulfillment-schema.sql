-- ============================================================
-- Fulfillment Tracker schema — csm-scorecard Supabase project
-- Run as ONE "+ New query" in the SQL Editor. Safe to re-run.
-- ============================================================

-- 1) Access helpers (SECURITY DEFINER avoids recursive RLS on profiles)
--    is_staff() already exists in this project; re-created here unchanged.
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

-- Any authenticated user who has a profile row (CSMs / FDEs / IMPs / admins).
-- !! Verify the roles present in public.profiles; if team members are role-tagged
--    and you want to exclude some role, add a role filter here.
create or replace function public.is_team_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
  );
$$;

-- 2) Table
create table if not exists public.fulfillment_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  atlas_username text not null default '',
  poc_email text not null default '',

  stage text not null default 'pre'
    check (stage in ('pre','contact','kickoff','obprog','backlog','imp',
                     'review','launch','postlaunch','ongoing','hold','cancelled')),
  status text not null default 'none'
    check (status in ('ontrack','atrisk','offtrack','none')),
  status_date date,
  task_progress int not null default 0 check (task_progress between 0 and 100),

  csm text not null default '',   -- CSM / FDE (text name, v1)
  imp text not null default '',   -- Implementation Specialist
  csa text not null default '',

  priority text not null default 'Medium'
    check (priority in ('Low','Medium','High')),
  subscription text not null default 'Starter'
    check (subscription in ('Starter','Pro','White Label')),
  t_shirt text not null default 'Medium'
    check (t_shirt in ('Small','Medium','Large')),
  temperament text not null default 'Neutral'
    check (temperament in ('Happy','Neutral','Frustrated')),

  touchpoints int not null default 0,
  revision_count int not null default 0,
  ob_completion_time numeric,
  imp_escalation boolean not null default false,
  notes text not null default '',

  -- timeline (flat columns so KPIs stay queryable)
  payment_date date,
  ko_scheduling_date date,
  ko_due_date date,
  kickoff_date date,
  csm_meeting2_date date,
  imp_backlog_date date,
  ob_ks_start date,
  ob_ip_start date,
  imp_start date,
  imp_review_start date,
  imp_review_due date,
  launch_due date,
  launch_date date,
  post_launch_start date,
  ongoing_start date,
  support_call_latest date,
  hold_start date,
  hold_end date,
  cancellation_date date,

  -- white label config; keys stay camelCase to match the app object:
  -- appUrl, adminUrl, password, company, website, brandColors, dnsApp,
  -- dnsAdmin, twilioSid, twilioToken, emailAdmin, emailSupport, emailApp
  wl jsonb not null default '{}'::jsonb
);

create index if not exists fulfillment_clients_stage_idx
  on public.fulfillment_clients (stage);
create index if not exists fulfillment_clients_csm_idx
  on public.fulfillment_clients (csm);

-- 3) updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fulfillment_clients_updated_at on public.fulfillment_clients;
create trigger fulfillment_clients_updated_at
  before update on public.fulfillment_clients
  for each row execute function public.set_updated_at();

-- 4) Row Level Security — exactly ONE policy per action (no overlapping
--    SELECT policies; overlap caused recursive-evaluation login failures before)
alter table public.fulfillment_clients enable row level security;

drop policy if exists "fulfillment read"   on public.fulfillment_clients;
drop policy if exists "fulfillment insert" on public.fulfillment_clients;
drop policy if exists "fulfillment update" on public.fulfillment_clients;
drop policy if exists "fulfillment delete" on public.fulfillment_clients;

create policy "fulfillment read"
  on public.fulfillment_clients for select
  using (public.is_team_member());

create policy "fulfillment insert"
  on public.fulfillment_clients for insert
  with check (public.is_team_member());

create policy "fulfillment update"
  on public.fulfillment_clients for update
  using (public.is_team_member());

create policy "fulfillment delete"
  on public.fulfillment_clients for delete
  using (public.is_staff());
