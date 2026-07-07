-- =============================================================================
--  Dialer SMS — Migration
--  Two-way texting from the dialer. Each message is stored here; a "thread" is
--  all messages between a rep and a contact_phone (derived, no separate table).
--  RLS mirrors call_logs: a rep sees their own messages; managers/execs see all.
--  Additive + idempotent. Paste into the SQL Editor.
-- =============================================================================

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  ae_deal_id uuid references public.ae_deals(id) on delete set null,
  contact_phone text not null,                       -- the prospect number (E.164)
  from_number text,                                  -- the rep's number used (outbound)
  direction text not null,                           -- outbound | inbound
  body text not null,
  status text not null default 'queued',             -- queued|sent|delivered|undelivered|failed|received
  twilio_sid text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_messages_rep_contact_idx on public.sms_messages (rep_id, contact_phone, created_at);
create index if not exists sms_messages_sid_idx on public.sms_messages (twilio_sid);

alter table public.sms_messages enable row level security;

drop policy if exists "Rep reads own sms" on public.sms_messages;
create policy "Rep reads own sms"
  on public.sms_messages for select to authenticated
  using (rep_id = auth.uid());

drop policy if exists "Managers read all sms" on public.sms_messages;
create policy "Managers read all sms"
  on public.sms_messages for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive' or p.is_team_lead = true)
  ));

-- Client only reads; edge functions (service role) do all inserts/updates so the
-- Twilio SID / status stays authoritative. (No client insert/update policy.)
