-- ============================================================================
--  27-fulfillment.sql
--  Customer onboarding tracker (the "Fulfillment" view). One row per customer
--  being onboarded, 12-stage pipeline. Closed Won ae_deals auto-route in via the
--  trigger in 28-fulfillment-from-closed-won.sql.
--
--  Rebased from docs/fulfillment/fulfillment-schema.sql: that draft assumed
--  admin/super_admin roles + is_staff()/is_team_member() helpers that DO NOT
--  exist in this app. This app uses profiles.role ('executive'|'manager'|'member')
--  + role_type via accessTier. RLS here is inlined to that model (like
--  src/24-cogs-line-items.sql): staff read/write, executives delete.
--
--  Safe to re-run.
-- ============================================================================

create table if not exists public.fulfillment_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Link back to the source deal (idempotency key for the closed-won trigger).
  ae_deal_id uuid unique references public.ae_deals(id) on delete set null,

  name text not null default '',
  atlas_username text not null default '',
  poc_email text not null default '',
  poc_phone text not null default '',        -- carried from the deal → dialer buttons
  mrr numeric,                                -- carried from the deal

  stage text not null default 'pre'
    check (stage in ('pre','contact','kickoff','obprog','backlog','imp',
                     'review','launch','postlaunch','ongoing','hold','cancelled')),
  status text not null default 'none'
    check (status in ('ontrack','atrisk','offtrack','none')),
  status_date date,
  task_progress int not null default 0 check (task_progress between 0 and 100),

  csm text not null default '',   -- CSM / FDE (text name; assigned in the view)
  imp text not null default '',   -- Implementation Specialist
  csa text not null default '',

  priority text not null default 'Medium'  check (priority in ('Low','Medium','High')),
  subscription text not null default 'Starter' check (subscription in ('Starter','Pro','White Label')),
  t_shirt text not null default 'Medium'   check (t_shirt in ('Small','Medium','Large')),
  temperament text not null default 'Neutral' check (temperament in ('Happy','Neutral','Frustrated')),

  touchpoints int not null default 0,
  revision_count int not null default 0,
  ob_completion_time numeric,
  imp_escalation boolean not null default false,
  notes text not null default '',

  -- timeline (flat columns so KPIs stay queryable later)
  payment_date date, ko_scheduling_date date, ko_due_date date, kickoff_date date,
  csm_meeting2_date date, imp_backlog_date date, ob_ks_start date, ob_ip_start date,
  imp_start date, imp_review_start date, imp_review_due date, launch_due date,
  launch_date date, post_launch_start date, ongoing_start date, support_call_latest date,
  hold_start date, hold_end date, cancellation_date date,

  -- white-label config; keys stay camelCase to match the app object (appUrl,
  -- adminUrl, password, company, website, brandColors, dnsApp, dnsAdmin,
  -- twilioSid, twilioToken, emailAdmin, emailSupport, emailApp)
  wl jsonb not null default '{}'::jsonb
);

create index if not exists fulfillment_clients_stage_idx on public.fulfillment_clients (stage);
create index if not exists fulfillment_clients_csm_idx   on public.fulfillment_clients (csm);

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists fulfillment_clients_updated_at on public.fulfillment_clients;
create trigger fulfillment_clients_updated_at
  before update on public.fulfillment_clients
  for each row execute function public.set_updated_at();

-- ---- RLS (one policy per action; inlined to this app's role model) ----------
alter table public.fulfillment_clients enable row level security;

drop policy if exists "fulfillment read"   on public.fulfillment_clients;
drop policy if exists "fulfillment insert" on public.fulfillment_clients;
drop policy if exists "fulfillment update" on public.fulfillment_clients;
drop policy if exists "fulfillment delete" on public.fulfillment_clients;

-- Staff = any authenticated profile that isn't an investor.
create policy "fulfillment read" on public.fulfillment_clients for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
                 and coalesce(p.role_type,'') not in ('investor','investor_pending')));

create policy "fulfillment insert" on public.fulfillment_clients for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()
                      and coalesce(p.role_type,'') not in ('investor','investor_pending')));

create policy "fulfillment update" on public.fulfillment_clients for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
                 and coalesce(p.role_type,'') not in ('investor','investor_pending')));

-- Delete = executives only (this app's elevated tier; no admin/super_admin exist).
create policy "fulfillment delete" on public.fulfillment_clients for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
                 and (p.role = 'executive' or p.role_type = 'executive')));
