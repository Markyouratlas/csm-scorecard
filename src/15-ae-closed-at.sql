-- ============================================================
-- src/15-ae-closed-at.sql
-- Give AE deals a close/cash date so "Closes" roll up under the week the sale
-- actually closed (cash collected), not the week the meeting happened.
--
--  • ae_deals.closed_at        — the effective close/cash date used to bucket the
--                                Close in the funnel (client aeFunnel.js + the
--                                ae-meetings-sync cron both read it).
--  • ae_deals.closed_at_source — 'stripe' | 'manual' | 'won' | 'backfill'. Lets a
--                                Stripe re-match avoid clobbering an AE's manual edit.
--
-- A BEFORE trigger stamps a fallback close date (now()) whenever a deal is marked
-- Closed Won without one — covers every writer. Stripe match / manual edits set
-- closed_at explicitly (non-null), so the trigger leaves those alone.
--
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

ALTER TABLE public.ae_deals ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.ae_deals ADD COLUMN IF NOT EXISTS closed_at_source text;

CREATE OR REPLACE FUNCTION public.ae_deals_stamp_closed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Closed Won' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
    NEW.closed_at_source := COALESCE(NEW.closed_at_source, 'won');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ae_deals_stamp_closed_at ON public.ae_deals;
CREATE TRIGGER trg_ae_deals_stamp_closed_at
  BEFORE INSERT OR UPDATE ON public.ae_deals
  FOR EACH ROW EXECUTE FUNCTION public.ae_deals_stamp_closed_at();

-- One-time historical backfill (approximate — updated_at moves on any edit):
-- give existing Closed-Won deals a close date so history re-buckets by close week.
UPDATE public.ae_deals
   SET closed_at = updated_at,
       closed_at_source = 'backfill'
 WHERE status = 'Closed Won'
   AND closed_at IS NULL;

-- ============================================================
-- Verification
-- ============================================================
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ae_deals' AND column_name IN ('closed_at', 'closed_at_source')
ORDER BY column_name;
-- Expect 2 rows.

SELECT count(*) AS closed_won_with_date
FROM public.ae_deals
WHERE status = 'Closed Won' AND closed_at IS NOT NULL;
-- Expect = the number of Closed Won deals (all now dated).
