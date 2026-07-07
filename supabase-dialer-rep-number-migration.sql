-- =============================================================================
--  Dialer per-rep number — Migration
--  Each rep gets their own Twilio number, used as caller ID for outbound and as
--  the inbound route (a call to that number rings the rep in-app). Assigned by an
--  executive in the roster. Additive + idempotent. Paste into the SQL Editor.
-- =============================================================================

alter table public.profiles add column if not exists twilio_number text;

-- One number maps to one rep (inbound routing is by number). Multiple NULLs are
-- fine in Postgres, so unassigned reps don't conflict.
create unique index if not exists profiles_twilio_number_key
  on public.profiles (twilio_number) where twilio_number is not null;

-- (RLS: profiles are already world-readable; updates are gated to managers via the
--  existing profiles update policy, which the roster UI uses.)
