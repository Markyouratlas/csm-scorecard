-- =============================================================================
--  Atlas Blue — Phase 2: realtime + surface campaign/line
-- =============================================================================
--  Adds the campaign name + sending phone number to each session so the
--  messenger can show which Atlas Blue campaign + number a conversation is on.
--  Populated by atlas-sync and the atlas-events-inbound webhook.
--
--  Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- =============================================================================

alter table public.atlas_sessions add column if not exists campaign_name text;
alter table public.atlas_sessions add column if not exists line_number text;  -- the Atlas Blue sending number (E.164)

comment on column public.atlas_sessions.campaign_name is 'Atlas campaign display name (resolved from campaign_id).';
comment on column public.atlas_sessions.line_number is 'The Atlas Blue sending phone number for the campaign (E.164).';
