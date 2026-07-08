-- =============================================================================
--  Dialer M5 — Sales → CS/FDE hand-off queue
-- =============================================================================
--  When an AE marks a deal 'Closed Won', it should surface as a callable contact
--  for CSMs + FDEs in their Pipeline section. This migration:
--    1. Adds cs_onboarded_at / cs_onboarded_by to ae_deals (the "handled" flag).
--    2. Lets CSM + FDE roles READ Closed Won ae_deals (shared queue — all see all).
--    3. Adds a SECURITY DEFINER rpc mark_cs_onboarded() so CS/FDE can toggle ONLY
--       the onboarded flag (they must NOT be able to edit MRR/notes/etc. — a plain
--       UPDATE policy can't restrict columns, so we gate the write through an rpc).
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

-- 1. Hand-off flag ------------------------------------------------------------
alter table public.ae_deals add column if not exists cs_onboarded_at timestamptz;
alter table public.ae_deals add column if not exists cs_onboarded_by uuid references public.profiles(id) on delete set null;

-- Partial index for the active-queue read (Closed Won, not yet onboarded).
create index if not exists ae_deals_cs_handoff_idx
  on public.ae_deals (status) where status = 'Closed Won';

-- 2. CS/FDE read access to Closed Won rows (shared queue) ----------------------
--    Additive to the existing AE-own + manager/exec read policies.
drop policy if exists "CS and FDE read Closed Won ae_deals" on public.ae_deals;
create policy "CS and FDE read Closed Won ae_deals"
  on public.ae_deals for select to authenticated
  using (
    status = 'Closed Won'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role_type in ('csm', 'forward_deployed_engineer', 'forward_deployed_engineer_lead')
    )
  );

-- 3. Secure "mark onboarded" toggle -------------------------------------------
--    SECURITY DEFINER: runs as owner so it can write the two flag columns, but
--    only after verifying the caller is CS/FDE (or manager/exec) and the deal is
--    actually Closed Won. Nothing else on the row is touched.
create or replace function public.mark_cs_onboarded(p_deal_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role_type in ('csm', 'forward_deployed_engineer', 'forward_deployed_engineer_lead')
        or p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive'
        or p.is_team_lead = true
      )
  ) into v_ok;
  if not v_ok then
    raise exception 'not authorized to mark onboarded';
  end if;

  update public.ae_deals
  set cs_onboarded_at = case when p_done then now() else null end,
      cs_onboarded_by = case when p_done then auth.uid() else null end,
      updated_at = now()
  where id = p_deal_id and status = 'Closed Won';
end;
$$;

revoke all on function public.mark_cs_onboarded(uuid, boolean) from public;
grant execute on function public.mark_cs_onboarded(uuid, boolean) to authenticated;
