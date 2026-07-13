-- ============================================================
-- src/17-atlas-blue-growth-read.sql
-- Let the Growth Manager (Nick) READ Atlas Blue conversations so the Test Drives
-- drill-down bubble can open the real iMessage thread (AtlasMessenger reads
-- atlas_sessions / atlas_messages directly). Growth is not executive/manager, so
-- the phase-1 "Managers read all" policies excluded them.
--
-- This re-issues those two SELECT policies with growth_manager added. Take-over /
-- reply for growth_manager is handled server-side in the atlas-handoff / atlas-send
-- / atlas-start edge functions (which already allow it) — this migration only opens
-- the READ path. Idempotent (drop + recreate). Paste into the Supabase SQL editor.
-- ============================================================

drop policy if exists "Managers read all atlas_sessions" on public.atlas_sessions;
create policy "Managers read all atlas_sessions"
  on public.atlas_sessions for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager'
           or p.role_type = 'executive' or p.role_type = 'growth_manager'
           or p.is_team_lead = true)
  ));

drop policy if exists "Managers read all atlas_messages" on public.atlas_messages;
create policy "Managers read all atlas_messages"
  on public.atlas_messages for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager'
           or p.role_type = 'executive' or p.role_type = 'growth_manager'
           or p.is_team_lead = true)
  ));
