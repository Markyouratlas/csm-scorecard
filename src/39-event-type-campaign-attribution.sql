-- ============================================================
-- src/39-event-type-campaign-attribution.sql
-- Link a Cal.com event type to a specific Meta ad campaign, so booked meetings on
-- that event type can be attributed to the campaign that drove them. Surfaced in
-- the AB Webinar tab's "Booked Meeting Attribution" section.
--
-- Nullable — an ad-driven event type with no campaign_id is "ad-driven but not yet
-- linked to a campaign". Written via the existing cal_event_type_config upsert path
-- (useCalEventTypes.saveType), which growth_manager already has write access to.
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

alter table public.cal_event_type_config add column if not exists campaign_id text;
alter table public.cal_event_type_config add column if not exists campaign_name text;
