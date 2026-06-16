-- =============================================================================
--  2P-c: ProfitWell Curated Backfill → atlas_targets
--
--  Writes ProfitWell's VERIFIED May-2026 metrics into atlas_targets so the
--  Executive + weekly Odyssey tiles can display them.
--
--  - Pulls straight from the profitwell_metrics table (NO hand-typed numbers).
--  - Stores whole-number percents (formatMetricValue treats values > 1 as
--    already-a-percentage, so 80.22 renders "80.2%").
--  - abs() on churn (ProfitWell returns it negative; we display positive).
--  - Stamps actual_source = 'profitwell' (powers the per-tile source label).
--  - WILL NOT overwrite a row a human has marked actual_source = 'manual'.
--
--  Verified against ProfitWell's dashboard before running:
--    Net Revenue Retention (PW "MRR Retention Rate"), May 2026 = 80.2%
--    Revenue Churn Rate,                              May 2026 = 13.6%
--
--  Backup taken first: backup_atlas_targets_20260615_profitwell
--  Safe to re-run (idempotent upsert on metric_key, month_key).
--  Paste into Supabase SQL Editor and click "Run".
-- =============================================================================

-- Net Revenue Retention (PW "MRR Retention Rate") — 80.2%
insert into atlas_targets (metric_key, month_key, actual_value, actual_source, updated_at)
select 'net-rev-retention', date '2026-05-01', pw.value, 'profitwell', now()
from profitwell_metrics pw
where pw.metric_name = 'revenue_retention_rate' and pw.month_key = date '2026-05-01'
on conflict (metric_key, month_key) do update
  set actual_value  = excluded.actual_value,
      actual_source = excluded.actual_source,
      updated_at    = excluded.updated_at
  where atlas_targets.actual_source is distinct from 'manual';

-- Revenue Churn Rate — 13.6% (PW stores it negative; abs() for display)
insert into atlas_targets (metric_key, month_key, actual_value, actual_source, updated_at)
select 'churn-pct', date '2026-05-01', abs(pw.value), 'profitwell', now()
from profitwell_metrics pw
where pw.metric_name = 'revenue_churn_rate' and pw.month_key = date '2026-05-01'
on conflict (metric_key, month_key) do update
  set actual_value  = excluded.actual_value,
      actual_source = excluded.actual_source,
      updated_at    = excluded.updated_at
  where atlas_targets.actual_source is distinct from 'manual';

-- Verify what landed:
-- select metric_key, month_key, actual_value, actual_source
-- from atlas_targets
-- where metric_key in ('net-rev-retention','churn-pct') and month_key = '2026-05-01';
