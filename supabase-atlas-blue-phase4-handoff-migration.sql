-- =============================================================================
--  Atlas Blue — Phase 4: human handoff flag
-- =============================================================================
--  The AE "takes over" an Atlas Blue conversation: the AI pauses and the AE
--  replies as a human from the same Atlas Blue number (iMessage).
--
--  Atlas's toggle-human-handoff endpoint ALTERNATES state (no read), so we keep
--  our own authoritative flag here. atlas-handoff flips it in lockstep with the
--  Atlas call; the composer enables human replies only when it's true.
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

alter table public.atlas_sessions
  add column if not exists human_handoff boolean not null default false;

comment on column public.atlas_sessions.human_handoff is 'True when an AE has taken over (AI paused); set by the atlas-handoff edge function.';
