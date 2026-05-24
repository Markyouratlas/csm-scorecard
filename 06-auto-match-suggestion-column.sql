-- ============================================================
-- Migration: Auto-Match Suggestion Persistence (Phase 4)
-- ============================================================
-- Adds:
--   suggested_match_stripe_customer_id — auto-matcher's best guess.
--     Lives separately from matched_stripe_customer_id so the manager can
--     still see + confirm the suggestion before it counts.
--   suggested_match_at — when the matcher last ran on this row
--   suggested_match_reason — human-readable explanation
--
-- match_method and match_confidence columns already exist from migration 03;
-- the auto-matcher fills them in when it makes a suggestion.
-- Safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_pending_deals'
      AND column_name = 'suggested_match_stripe_customer_id'
  ) THEN
    ALTER TABLE commission_pending_deals
      ADD COLUMN suggested_match_stripe_customer_id text
        REFERENCES commission_customers(stripe_customer_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_pending_deals'
      AND column_name = 'suggested_match_at'
  ) THEN
    ALTER TABLE commission_pending_deals
      ADD COLUMN suggested_match_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_pending_deals'
      AND column_name = 'suggested_match_reason'
  ) THEN
    ALTER TABLE commission_pending_deals
      ADD COLUMN suggested_match_reason text;
  END IF;
END $$;

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_pending_deals_suggested_match
  ON commission_pending_deals (suggested_match_stripe_customer_id)
  WHERE suggested_match_stripe_customer_id IS NOT NULL;

-- Refresh the enriched view to include the new columns
DROP VIEW IF EXISTS commission_pending_deals_enriched;
CREATE OR REPLACE VIEW commission_pending_deals_enriched AS
SELECT
  pd.*,
  cc.name AS stripe_customer_name,
  cc.email AS stripe_billing_email,
  cc.secondary_email AS stripe_secondary_email,
  cc.start_date AS stripe_start_date,
  cc.max_mrr AS stripe_peak_mrr,
  cc.is_self_serve AS stripe_is_self_serve,
  cc.is_ae_era AS stripe_is_ae_era,
  sc.name AS suggested_customer_name,
  sc.email AS suggested_customer_email
FROM commission_pending_deals pd
LEFT JOIN commission_customers cc
  ON cc.stripe_customer_id = pd.matched_stripe_customer_id
LEFT JOIN commission_customers sc
  ON sc.stripe_customer_id = pd.suggested_match_stripe_customer_id;

GRANT SELECT ON commission_pending_deals_enriched TO authenticated;

-- Sanity check
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'commission_pending_deals'
  AND column_name IN ('suggested_match_stripe_customer_id', 'suggested_match_at', 'suggested_match_reason')
ORDER BY column_name;
