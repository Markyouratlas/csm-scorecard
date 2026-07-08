-- =============================================================================
--  Atlas Blue (iMessage) — Phase 1: conversation history
-- =============================================================================
--  Brings Atlas Blue chat sessions + messages into the app so AEs can read the
--  pre-meeting correspondence for a prospect inside their deal view. Atlas Blue
--  runs on Atlas's own numbers over iMessage — SEPARATE from the Twilio dialer.
--  A merged thread is fine, but channel stays authoritative for send routing.
--
--  Linking: NO atlas_bookings table. Atlas conversations attach to existing
--  ae_deals BY PHONE (last-10, same rule as the dialer thread). The atlas-sync
--  function stamps rep_id/ae_deal_id on each session by matching contact_phone to
--  ae_deals; rep_id is denormalized onto messages so RLS stays flat + fast.
--
--  Written by the atlas-sync edge function via the service role (no client write).
--  Reads: AE sees only their own (rep_id = auth.uid()); managers/execs see all.
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

create table if not exists public.atlas_sessions (
  id text primary key,                 -- Atlas session RowKey
  campaign_id text,                    -- parsed from PartitionKey ("<accountId> <campaignId>")
  contact_phone text,                  -- E.164 when ContactIdentification is a phone (else null)
  contact_email text,                  -- when ContactIdentification is an email / Apple ID (else null)
  title text,                          -- Atlas "Tittle" (their typo)
  status text,                         -- active | queued | failed | completed | pending_human_response
  previous_session_id text,            -- Atlas PreviousSessionId (conversation threading)
  ae_deal_id uuid references public.ae_deals(id) on delete set null,
  rep_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz,              -- Atlas Timestamp
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_messages (
  id text primary key,                 -- Atlas message RowKey
  session_id text references public.atlas_sessions(id) on delete cascade,
  contact_phone text,                  -- E.164, denormalized for thread queries (null if email-addressed)
  contact_email text,                  -- denormalized email/Apple ID (null if phone-addressed)
  rep_id uuid references public.profiles(id) on delete set null,  -- denormalized for RLS
  role text,                           -- assistant | user | human (agent)
  content text,
  channel text not null default 'imessage',   -- imessage | sms
  status text,
  atlas_phone_number_id text,          -- ChatPhoneNumberId (the Atlas Blue number)
  created_at timestamptz,              -- Atlas CreatedAt
  inserted_at timestamptz not null default now()
);

create index if not exists atlas_sessions_phone_idx on public.atlas_sessions (contact_phone);
create index if not exists atlas_sessions_email_idx on public.atlas_sessions (contact_email);
create index if not exists atlas_sessions_rep_idx   on public.atlas_sessions (rep_id);
create index if not exists atlas_messages_phone_idx on public.atlas_messages (contact_phone);
create index if not exists atlas_messages_rep_idx   on public.atlas_messages (rep_id);
create index if not exists atlas_messages_session_idx on public.atlas_messages (session_id);

-- Row-level security ----------------------------------------------------------
alter table public.atlas_sessions enable row level security;
alter table public.atlas_messages enable row level security;

drop policy if exists "AE reads own atlas_sessions" on public.atlas_sessions;
create policy "AE reads own atlas_sessions"
  on public.atlas_sessions for select to authenticated
  using (rep_id = auth.uid());

drop policy if exists "Managers read all atlas_sessions" on public.atlas_sessions;
create policy "Managers read all atlas_sessions"
  on public.atlas_sessions for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive' or p.is_team_lead = true)
  ));

drop policy if exists "AE reads own atlas_messages" on public.atlas_messages;
create policy "AE reads own atlas_messages"
  on public.atlas_messages for select to authenticated
  using (rep_id = auth.uid());

drop policy if exists "Managers read all atlas_messages" on public.atlas_messages;
create policy "Managers read all atlas_messages"
  on public.atlas_messages for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive' or p.is_team_lead = true)
  ));

-- No client INSERT/UPDATE policies: atlas-sync + atlas-events-inbound write via
-- the service role (which bypasses RLS). Verify reads as an AUTHENTICATED user,
-- not as Role postgres (which bypasses RLS and hides mistakes).
