-- =============================================================================
--  Dialer M7 — RCS channel tracking
-- =============================================================================
--  Records which channel each message actually went out on. RCS is opt-in and
--  brand-level (the Atlas RCS agent), while SMS stays per-rep. When RCS isn't
--  enabled yet (TWILIO_RCS_FROM unset) an 'rcs' request gracefully falls back to
--  SMS, and dialer-send writes the channel it truly used — so this column is the
--  source of truth for the UI's RCS/SMS badge.
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

alter table public.sms_messages
  add column if not exists channel text not null default 'sms';  -- 'sms' | 'rcs'

comment on column public.sms_messages.channel is 'Delivery channel actually used: sms (per-rep number) or rcs (Atlas brand agent).';
