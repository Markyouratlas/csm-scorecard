-- =============================================================================
--  Per-person channel-deal assignment (Omer = Sandler deals, Heather = the rest)
--
--  channel_deals.assigned_to = the assignee's Atlas email (matches scorecard auth login).
--  Synced from the Deals Portal (deals.assigned_to; see DEALS-PORTAL-ASSIGNMENT-HANDOFF.md)
--  and defaulted to Heather for Attio-native deals. Each person's Channel Sales / Channel
--  Partner view filters to their own email, with a Super-Admin "all deals" toggle.
--
--  Run in: Supabase Dashboard → SQL Editor (scorecard project). Idempotent.
-- =============================================================================

alter table public.channel_deals add column if not exists assigned_to text;

-- Backfill: every current deal is Heather's (all Telarus/non-Sandler portal deals + all
-- Attio-native deals). The portal populates assigned_to for new deals going forward.
update public.channel_deals set assigned_to = 'heather@youratlas.com' where assigned_to is null;

-- RLS check (run separately, don't need to change unless it's role-gated):
--   select policyname, cmd, qual from pg_policies where tablename = 'channel_deals';
-- The channel_sales role needs plain SELECT on channel_deals (filtering is client-side +
-- the Super-Admin toggle reads all). If the SELECT policy is broad authenticated-read, no
-- change; if it's role-gated, add channel_sales to it.
