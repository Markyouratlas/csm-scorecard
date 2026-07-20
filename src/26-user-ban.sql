-- ============================================================================
--  26-user-ban.sql
--  "Ban" (revoke sign-in) for departed users — keeps all their data but blocks
--  them from logging in.
--
--  The REAL enforcement is the Supabase Auth ban (banned_until on auth.users),
--  set by the `set-user-ban` edge function via the service role. These columns
--  MIRROR that state so the roster UI can show it — auth.users is not
--  client-readable, but profiles is. They're written ONLY by the edge function
--  (service role); the client just reads them for the badge/toggle. Flipping the
--  mirror client-side would not restore auth access (the auth ban still applies).
--
--  Safe to re-run.
-- ============================================================================
alter table public.profiles add column if not exists banned     boolean not null default false;
alter table public.profiles add column if not exists banned_at   timestamptz;
alter table public.profiles add column if not exists banned_by   uuid;
