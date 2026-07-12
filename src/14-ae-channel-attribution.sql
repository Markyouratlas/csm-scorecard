-- ============================================================
-- src/14-ae-channel-attribution.sql
-- Intro meetings + channel-partner attribution for AEs (gated to Heather).
--
--  • profiles.tracks_channel_intros — feature flag. When true, the AE's scorecard
--    exposes the 'Intro' meeting status, the Intros funnel column + hero card, the
--    "Referred by" partner picker, and the Channel Partner Attribution panel.
--  • ae_deals.referred_by_partner — the intro partner (wholesaler) a deal is
--    attributed to, for compensation. Nullable; a normal column on a row the AE
--    already owns, so existing ae_deals RLS covers reads/writes.
--
-- Idempotent (add column if not exists). Paste into the Supabase SQL editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tracks_channel_intros boolean NOT NULL DEFAULT false;

ALTER TABLE public.ae_deals
  ADD COLUMN IF NOT EXISTS referred_by_partner text;

-- Turn the flag on for Heather. Confirm this matches exactly one row before/after.
UPDATE public.profiles
   SET tracks_channel_intros = true
 WHERE role_type = 'account_executive'
   AND name ILIKE 'heather%';

-- ============================================================
-- Verification
-- ============================================================
SELECT id, name, role_type, tracks_channel_intros
FROM public.profiles
WHERE name ILIKE 'heather%';
-- Expect Heather's row with tracks_channel_intros = true.

SELECT column_name FROM information_schema.columns
WHERE table_name = 'ae_deals' AND column_name = 'referred_by_partner';
-- Expect 1 row.
