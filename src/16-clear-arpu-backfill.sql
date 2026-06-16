-- =============================================================================
--  16: Clear orphaned manual_backfill ARPU actuals
--
--  ARPU is now sourced from LIVE Stripe (committed MRR ÷ customers), shown on
--  the hero + Unit Economics tiles. The old hand-loaded monthly ARPU series
--  (actual_source = 'manual_backfill', a different basis) is no longer used, so
--  we clear those actuals to remove the tile-vs-modal inconsistency at the root.
--
--  - Nulls actual_value + actual_source for ARPU's manual_backfill rows ONLY.
--  - Does NOT delete rows (any target_value is preserved).
--  - Touches no other metric.
--  - Recoverable: original values live in backup_atlas_targets_20260615_profitwell.
--  - Safe to re-run (idempotent).
--
--  Paste into Supabase SQL Editor and click "Run".
-- =============================================================================

update atlas_targets
set actual_value  = null,
    actual_source = null,
    updated_at    = now()
where metric_key = 'arpu'
  and actual_source = 'manual_backfill';

-- Verify (should return ZERO rows after the update):
-- select month_key, actual_value, actual_source
-- from atlas_targets
-- where metric_key = 'arpu' and actual_value is not null;
