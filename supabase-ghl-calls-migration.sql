-- =============================================================================
--  GHL call tracking — dials made through GoHighLevel's phone
-- =============================================================================
--  Human reps dial through GHL; a GHL Workflow (Call Details trigger, direction
--  Outgoing) → Custom Webhook posts each call to the ghl-calls-inbound edge
--  function, which maps the dialing GHL user to the rep and inserts a row here.
--  The scorecard combines these with the in-app dialer's call_logs.
--
--  Dedupe: GHL's Call Details trigger exposes no call id in the Phone Call folder,
--  so we dedupe on `natural_key` = Message Id (if present) else the composite
--  ghl_user_id|contact_id|called_at. Attribution: rep by login email (from
--  {{user.email}}); fallback to profiles.ghl_user_id matched on Phone Call User Id.
--
--  RLS mirrors call_logs: rep sees own; managers/execs see all. Service-role writes.
--  Paste into the Supabase SQL Editor and Run. Safe to re-run (additive).
-- =============================================================================

create table if not exists public.ghl_call_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references public.profiles(id) on delete set null,
  ghl_user_email text,
  ghl_user_id text,
  ghl_user_name text,
  contact_id text,
  direction text not null default 'outbound',
  call_status text,
  called_at timestamptz not null,
  ghl_message_id text,
  natural_key text,
  created_at timestamptz not null default now()
);

-- Additive (for installs created before these columns existed).
alter table public.ghl_call_events add column if not exists ghl_user_id text;
alter table public.ghl_call_events add column if not exists ghl_user_name text;
alter table public.ghl_call_events add column if not exists call_status text;
alter table public.ghl_call_events add column if not exists natural_key text;

create unique index if not exists ghl_call_events_natural_key_idx on public.ghl_call_events (natural_key);
create index if not exists ghl_call_events_rep_idx on public.ghl_call_events (rep_id, called_at);

-- Optional cross-dialing fallback: set a rep's GHL user id here so calls they make
-- to OTHER reps' contacts still attribute correctly (when the assigned-user email
-- would otherwise misattribute). Leave null if reps only dial their own leads.
alter table public.profiles add column if not exists ghl_user_id text;

alter table public.ghl_call_events enable row level security;

drop policy if exists "Rep reads own ghl_call_events" on public.ghl_call_events;
create policy "Rep reads own ghl_call_events"
  on public.ghl_call_events for select to authenticated
  using (rep_id = auth.uid());

drop policy if exists "Managers read all ghl_call_events" on public.ghl_call_events;
create policy "Managers read all ghl_call_events"
  on public.ghl_call_events for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive' or p.is_team_lead = true)
  ));
