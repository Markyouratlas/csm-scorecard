-- ============================================================
-- src/40-commission-uuid-identity.sql
-- Phase 1 of the commission UUID-identity refactor: add profile-id columns to the
-- rep-attribution tables so commission no longer keys on first-name text (two reps
-- who share a first name currently collide + double-count).
--
-- ADDITIVE + behavior-preserving: adds nullable id columns and backfills them from
-- the existing name text WHERE the first name is unambiguous. Ambiguous names (two
-- reps sharing a first name — e.g. two Andrews) are intentionally left NULL for
-- disambiguation in the UI. The engine keeps matching on names until the Phase-1
-- app code switches to id-with-name-fallback. Idempotent. Paste into the SQL editor.
-- ============================================================

alter table public.commission_assignments  add column if not exists ae_id  uuid references public.profiles(id);
alter table public.commission_assignments  add column if not exists csm_id uuid references public.profiles(id);
alter table public.commission_rep_overrides add column if not exists rep_profile_id uuid references public.profiles(id);

-- Backfill ae_id where exactly one account_executive shares the first name.
update public.commission_assignments ca
set ae_id = m.id
from (select split_part(p.name,' ',1) as fn, (array_agg(p.id))[1] as id, count(*) as n
      from public.profiles p where p.role_type = 'account_executive'
      group by split_part(p.name,' ',1)) m
where ca.ae is not null and ca.ae_id is null and m.fn = ca.ae and m.n = 1;

-- Backfill csm_id where exactly one CSM/FDE shares the first name.
update public.commission_assignments ca
set csm_id = m.id
from (select split_part(p.name,' ',1) as fn, (array_agg(p.id))[1] as id, count(*) as n
      from public.profiles p where p.role_type in ('csm','forward_deployed_engineer','forward_deployed_engineer_lead')
      group by split_part(p.name,' ',1)) m
where ca.csm is not null and ca.csm_id is null and m.fn = ca.csm and m.n = 1;

-- Backfill override rep_profile_id where the first name is unique across AE + CSM/FDE.
update public.commission_rep_overrides ro
set rep_profile_id = m.id
from (select split_part(p.name,' ',1) as fn, (array_agg(p.id))[1] as id, count(*) as n
      from public.profiles p where p.role_type in ('account_executive','csm','forward_deployed_engineer','forward_deployed_engineer_lead')
      group by split_part(p.name,' ',1)) m
where ro.rep_name is not null and ro.rep_profile_id is null and m.fn = ro.rep_name and m.n = 1;
