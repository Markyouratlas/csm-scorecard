-- ============================================================
-- src/11-mrr-snapshots.sql
-- Monthly MRR history for the Odyssey hero sparkline.
-- ============================================================
-- One row per month, holding that month's committed MRR (end-of-month basis)
-- plus optional customer count. The sparkline plots these stored snapshots and
-- appends the LIVE current-month figure on top, so history accrues for real
-- from the moment we start capturing it.
--
--   source = 'manual'  -> hand-entered (backfill of prior months by an exec)
--   source = 'auto'    -> captured automatically (the monthly 1st-of-month job, Step 2d)
--
-- month_key is 'YYYY-MM' and UNIQUE, so each month has exactly one row; writes
-- upsert on month_key (re-entering a month overwrites it). All writes go through
-- the exec-gated upsert_mrr_snapshot RPC (src/12-mrr-snapshots-rpc.sql); the RLS
-- policies here are exec-only belt-and-suspenders.
--
-- Idempotent and additive: creates a new table, touches nothing existing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mrr_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key       text NOT NULL UNIQUE,                          -- 'YYYY-MM'
  mrr             numeric NOT NULL CHECK (mrr >= 0),              -- committed MRR for the month
  customers       integer CHECK (customers IS NULL OR customers >= 0),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto')),
  note            text,
  created_by      uuid REFERENCES public.profiles(id),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mrr_snapshots ENABLE ROW LEVEL SECURITY;

-- Execs only — read and write. (Writes also funnel through the Step 2b RPC.)
DROP POLICY IF EXISTS mrr_snapshots_exec_select ON public.mrr_snapshots;
CREATE POLICY mrr_snapshots_exec_select ON public.mrr_snapshots
  FOR SELECT USING (public.is_commission_executive());

DROP POLICY IF EXISTS mrr_snapshots_exec_write ON public.mrr_snapshots;
CREATE POLICY mrr_snapshots_exec_write ON public.mrr_snapshots
  FOR ALL USING (public.is_commission_executive()) WITH CHECK (public.is_commission_executive());

-- ============================================================
-- Verification (one row)
-- ============================================================
SELECT
  to_regclass('public.mrr_snapshots')::text AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'mrr_snapshots') AS rls_enabled,
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.mrr_snapshots'::regclass) AS policy_count,
  (SELECT count(*) FROM public.mrr_snapshots) AS row_count;
-- Expect: mrr_snapshots · true · 2 · 0
