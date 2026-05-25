-- ============================================================
-- Migration 08: monthly_cash_received column
-- ============================================================
-- Tracks actual cash collected per customer per month, sourced from Stripe
-- paid invoices (not subscription state). This is the basis for computing
-- residual commission going forward.
--
-- Until the next Stripe sync runs and populates this column, existing rows
-- have monthly_cash_received = {} (empty object) and the engine falls back
-- to its previous behavior (residual on MRR). After a sync, the column is
-- populated and the engine switches to cash-based residual.
--
-- Safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_customers'
      AND column_name = 'monthly_cash_received'
  ) THEN
    ALTER TABLE commission_customers
      ADD COLUMN monthly_cash_received jsonb NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added monthly_cash_received column';
  ELSE
    RAISE NOTICE 'monthly_cash_received column already exists';
  END IF;
END $$;

-- Sanity check
SELECT
  'monthly_cash_received column' AS check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_customers' AND column_name = 'monthly_cash_received'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'commission_customers row count',
  (SELECT COUNT(*)::text FROM commission_customers)
UNION ALL
SELECT 'rows with empty monthly_cash_received',
  (SELECT COUNT(*)::text FROM commission_customers
   WHERE monthly_cash_received = '{}'::jsonb OR monthly_cash_received IS NULL);
