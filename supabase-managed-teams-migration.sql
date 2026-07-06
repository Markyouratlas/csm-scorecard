-- =============================================================================
--  Managed Teams — Migration
--  Lets a team lead view the manager dashboard for teams OTHER than their own
--  (e.g. Nick on Growth viewing the Sales team). A per-user list of team keys a
--  lead may manage, in addition to their own team.
--
--  VIEW-ONLY by design: this grants READ of those teams' weekly_scorecards; it
--  does NOT make the person a 'manager' (which would allow editing any profile).
--  profiles are already world-readable; ae_deals already allows any team lead to
--  read — so only weekly_scorecards' SELECT policy needs widening.
--
--  Paste into the SQL Editor and Run. Safe to re-run.
-- =============================================================================

alter table public.profiles add column if not exists managed_teams text[];

-- Widen weekly_scorecards read: a lead can read scorecards of any user whose
-- team is in the lead's managed_teams (in ADDITION to the existing own +
-- role='manager' rules — additive, never restricts existing access).
drop policy if exists "Users read own scorecards, managers read all" on public.weekly_scorecards;
create policy "Users read own scorecards, managers read all"
  on public.weekly_scorecards for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
    or exists (
      select 1
      from public.profiles me
      join public.profiles target on target.id = weekly_scorecards.user_id
      where me.id = auth.uid()
        and target.team = any (me.managed_teams)
    )
  );

-- Grant Nick (Marketing team) view access to the Sales team.
-- STEP 1 — verify exactly which row is Nick before granting:
--   select id, name, team, role, role_type, is_team_lead, managed_teams
--   from public.profiles where name ilike 'Nick%';
-- STEP 2 — grant (scoped to the marketing team to avoid hitting another Nick).
--   is_team_lead=true gives the team-lead tier + ae_deals read; managed_teams
--   routes the manager view to Sales. Does NOT set role='manager' (view-only).
update public.profiles
set is_team_lead = true,
    managed_teams = array(select distinct unnest(coalesce(managed_teams, '{}') || '{sales}'))
where name ilike 'Nick%' and team = 'marketing';
