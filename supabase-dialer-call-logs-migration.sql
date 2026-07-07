-- =============================================================================
--  Dialer call logs — Migration
--  Records every dialer call (outbound now; inbound in M3), its outcome, and an
--  optional follow-up. Linked to the prospect deal (ae_deals) when the call was
--  placed from a pipeline row. RLS mirrors ae_deals: a rep sees their own calls;
--  managers/executives see all. Additive + idempotent. Paste into the SQL Editor.
-- =============================================================================

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,  -- who placed the call
  ae_deal_id uuid references public.ae_deals(id) on delete set null,      -- the prospect deal (nullable)
  customer_name text,
  customer_phone text not null,
  direction text not null default 'outbound',                            -- outbound | inbound
  status text not null default 'initiated',                              -- initiated | in-progress | completed | no-answer | busy | failed | canceled
  disposition text,                                                      -- Connected | No answer | Voicemail | Wrong number | Callback | Not interested | Interested
  notes text,
  duration_seconds int,
  twilio_call_sid text,
  client_ref text unique,                                                -- client correlation id → lets the status webhook + client find the same row
  recording_url text,                                                    -- populated in M4
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists call_logs_rep_idx on public.call_logs (rep_id, started_at desc);
create index if not exists call_logs_deal_idx on public.call_logs (ae_deal_id);
create index if not exists call_logs_ref_idx on public.call_logs (client_ref);

alter table public.call_logs enable row level security;

-- Read: own calls, or all for managers/execs (mirror ae_deals).
drop policy if exists "Rep reads own call_logs" on public.call_logs;
create policy "Rep reads own call_logs"
  on public.call_logs for select to authenticated
  using (rep_id = auth.uid());

drop policy if exists "Managers read all call_logs" on public.call_logs;
create policy "Managers read all call_logs"
  on public.call_logs for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive' or p.is_team_lead = true)
  ));

-- Write: a rep inserts/updates their own rows.
drop policy if exists "Rep inserts own call_logs" on public.call_logs;
create policy "Rep inserts own call_logs"
  on public.call_logs for insert to authenticated
  with check (rep_id = auth.uid());

drop policy if exists "Rep updates own call_logs" on public.call_logs;
create policy "Rep updates own call_logs"
  on public.call_logs for update to authenticated
  using (rep_id = auth.uid());

-- Follow-up date on the deal (set when a call schedules a follow-up). Surfaces in
-- the pipeline "Follow-up" status tab alongside status = 'Follow-up'.
alter table public.ae_deals add column if not exists follow_up_at date;
