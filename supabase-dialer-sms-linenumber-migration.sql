-- ============================================================
-- Dialer SMS: add line_number to sms_messages
-- ============================================================
-- Clarifies From/To semantics on sms_messages:
--   contact_phone  = the prospect/other party (both directions) — what the thread keys on
--   from_number    = the actual sender of THIS message
--                      (outbound: the rep's Atlas number; inbound: the prospect's number)
--   line_number    = OUR Atlas line involved in the message (both directions)
-- Safe to re-run.
-- ============================================================

alter table public.sms_messages
  add column if not exists line_number text;

comment on column public.sms_messages.from_number is 'Actual sender of this message (outbound: rep Atlas #, inbound: prospect #).';
comment on column public.sms_messages.line_number is 'Our Atlas line involved in the message (rep number), both directions.';
