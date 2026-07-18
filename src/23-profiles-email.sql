-- =============================================================================
--  profiles.email — a mirror of auth.users.email so the app can identify a user by
--  email without querying auth.users (which is RLS-blocked for other users). Needed to
--  filter channel_deals by assigned_to (an Atlas email) for the TARGET profile — including
--  when an exec drills into someone else's scorecard (where the auth session ≠ the target).
--
--  Run in: Supabase Dashboard → SQL Editor (scorecard project). Idempotent.
-- =============================================================================

alter table public.profiles add column if not exists email text;

-- Backfill existing profiles from auth.users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is distinct from u.email);

-- Keep new profiles populated: on insert, pull the email from auth.users if not set.
create or replace function public.set_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    select u.email into new.email from auth.users u where u.id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists set_profile_email_trg on public.profiles;
create trigger set_profile_email_trg
  before insert on public.profiles
  for each row execute function public.set_profile_email();
