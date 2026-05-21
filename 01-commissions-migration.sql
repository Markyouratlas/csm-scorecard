-- ============================================================
-- Atlas Commission Tracker — Schema Migration
-- ============================================================
-- Paste into Supabase SQL Editor and run.
-- This is idempotent: safe to re-run; uses IF NOT EXISTS / ON CONFLICT.
--
-- Tables:
--   commission_customers   — one row per Stripe customer, with monthly MRR matrix
--   commission_assignments — AE/CSM attribution, survives Stripe re-syncs
--   commission_config      — single-row jsonb config (rates, caps, accelerator tiers)
--   commission_unmatched   — CSM-tracker entries with no matching Stripe customer
--   commission_audit_log   — change history for assignments + config (compliance)
-- ============================================================

-- --------------------------------------------------------
-- 1. commission_customers
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_customers (
  stripe_customer_id  text PRIMARY KEY,
  email               text NOT NULL,
  name                text,
  start_date          date,
  end_date            date,
  max_mrr             numeric DEFAULT 0,
  is_self_serve       boolean DEFAULT false,
  is_ae_era           boolean DEFAULT false,
  is_active_ever      boolean DEFAULT false,
  monthly_mrr         jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "2025-05": 399, "2025-06": 0, ... }
  last_synced_at      timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_customers_email      ON commission_customers (lower(email));
CREATE INDEX IF NOT EXISTS idx_commission_customers_start_date ON commission_customers (start_date);
CREATE INDEX IF NOT EXISTS idx_commission_customers_is_ae_era  ON commission_customers (is_ae_era) WHERE is_ae_era = true;

-- --------------------------------------------------------
-- 2. commission_assignments
-- --------------------------------------------------------
-- Linked to stripe_customer_id (preferred) AND email (fallback for re-syncs
-- where Stripe customer ID might change but email stays). When the Edge
-- Function re-syncs, it tries stripe_customer_id first; if no match it tries
-- email; if found by email it updates the row's stripe_customer_id.
CREATE TABLE IF NOT EXISTS commission_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id  text,
  email               text NOT NULL,
  ae                  text,          -- 'Heather' | 'Mason' | null
  csm                 text,          -- 'Matt' | 'Sean' | 'Noah' | null
  assigned_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         timestamptz DEFAULT now(),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- One assignment per customer. Two unique indexes:
--   1. stripe_customer_id is globally unique (non-partial, so ON CONFLICT can
--      use it as an arbiter). NULLs are treated as distinct by Postgres, so
--      multiple legacy rows with NULL stripe_customer_id are still allowed.
--   2. email is unique ONLY when stripe_customer_id is NULL (partial, so we
--      can have multiple Stripe rows with the same email — e.g. one customer
--      with two Stripe records — while still preventing legacy-row dupes).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commission_assignments_stripe_id
  ON commission_assignments (stripe_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commission_assignments_email_no_stripe
  ON commission_assignments (lower(email)) WHERE stripe_customer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_commission_assignments_ae    ON commission_assignments (ae)  WHERE ae IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_assignments_csm   ON commission_assignments (csm) WHERE csm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_assignments_email ON commission_assignments (lower(email));

-- --------------------------------------------------------
-- 3. commission_config
-- --------------------------------------------------------
-- Single-row table for the org's comp settings. `id` is fixed to 1.
CREATE TABLE IF NOT EXISTS commission_config (
  id         smallint PRIMARY KEY CHECK (id = 1),
  settings   jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed default config (matches the compensation_plans block from your original data)
INSERT INTO commission_config (id, settings)
VALUES (1, '{
  "aeVoiceRate": 0.10,
  "upfrontMultiplier": 3,
  "aeResidualRate": 0.03,
  "aeResidualMonths": 12,
  "csmRate": 0.03,
  "acceleratorTarget": 60000,
  "accelerator120Multiplier": 1.5,
  "accelerator150Multiplier": 2.0,
  "selfServeMaxMrr": 100,
  "aeEraStartDate": "2025-11-01"
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------
-- 4. commission_unmatched
-- --------------------------------------------------------
-- CSM-tracker entries that don't match anything in Stripe.
-- Surfaced to admins on the Overview tab so they can reconcile.
CREATE TABLE IF NOT EXISTS commission_unmatched (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep         text NOT NULL,                -- 'Matt' | 'Sean' | 'Noah' | 'Heather' | 'Mason'
  rep_type    text NOT NULL DEFAULT 'csm',  -- 'csm' or 'ae'
  email       text NOT NULL,
  username    text,
  customer_name text,
  status      text DEFAULT 'pending',       -- 'pending' | 'resolved' | 'ignored'
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_unmatched_status ON commission_unmatched (status);
CREATE INDEX IF NOT EXISTS idx_commission_unmatched_rep    ON commission_unmatched (rep);

-- --------------------------------------------------------
-- 5. commission_audit_log
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,        -- 'assign_ae' | 'assign_csm' | 'unassign' | 'config_change' | 'stripe_sync'
  target_type text NOT NULL,        -- 'customer' | 'config' | 'unmatched'
  target_id   text,                  -- stripe_customer_id, '1' for config, etc.
  before_value jsonb,
  after_value  jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_audit_log_target ON commission_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_commission_audit_log_actor  ON commission_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_commission_audit_log_at     ON commission_audit_log (created_at DESC);

-- --------------------------------------------------------
-- Updated-at triggers
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION commission_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_customers_touch    ON commission_customers;
DROP TRIGGER IF EXISTS trg_commission_assignments_touch  ON commission_assignments;
DROP TRIGGER IF EXISTS trg_commission_config_touch       ON commission_config;

CREATE TRIGGER trg_commission_customers_touch
  BEFORE UPDATE ON commission_customers
  FOR EACH ROW EXECUTE FUNCTION commission_touch_updated_at();

CREATE TRIGGER trg_commission_assignments_touch
  BEFORE UPDATE ON commission_assignments
  FOR EACH ROW EXECUTE FUNCTION commission_touch_updated_at();

CREATE TRIGGER trg_commission_config_touch
  BEFORE UPDATE ON commission_config
  FOR EACH ROW EXECUTE FUNCTION commission_touch_updated_at();

-- ============================================================
-- BACKWARD-COMPAT FIX (for installs that ran the original migration)
-- ============================================================
-- The original migration created the stripe_customer_id index as a PARTIAL
-- unique index (WHERE stripe_customer_id IS NOT NULL), which Postgres won't
-- use as an ON CONFLICT arbiter. If you already ran the old migration, drop
-- and recreate the index. Safe to run on fresh installs too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'uniq_commission_assignments_stripe_id'
      AND indexdef LIKE '%WHERE%stripe_customer_id IS NOT NULL%'
  ) THEN
    DROP INDEX uniq_commission_assignments_stripe_id;
    CREATE UNIQUE INDEX uniq_commission_assignments_stripe_id
      ON commission_assignments (stripe_customer_id);
  END IF;
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- Mirrors the existing pattern in the repo: check profile.role OR profile.role_type
-- for permissions because the schema evolved. accessTier() is the client-side
-- equivalent, but DB-side we duplicate the logic here.
--
-- Read access:
--   commission_customers — execs + team_leads see all; members see only
--                          rows where they're the assigned AE or CSM.
--   commission_assignments — same as above.
--   commission_config — execs + team_leads only.
--   commission_unmatched — execs + team_leads only.
--   commission_audit_log — execs only.
--
-- Write access:
--   commission_customers — service_role only (Edge Function sync).
--   commission_assignments — execs + team_leads (scoped to their team).
--   commission_config — execs only.
--   commission_unmatched — execs + team_leads.
--   commission_audit_log — server-only inserts via triggers / Edge Function.
-- ============================================================

ALTER TABLE commission_customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_unmatched   ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_audit_log   ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an executive or team_lead?
CREATE OR REPLACE FUNCTION is_commission_manager()
RETURNS boolean AS $$
DECLARE
  v_role        text;
  v_is_lead     boolean;
  v_role_type   text;
BEGIN
  SELECT p.role, p.is_team_lead, p.role_type
    INTO v_role, v_is_lead, v_role_type
    FROM profiles p
   WHERE p.id = auth.uid()
   LIMIT 1;

  RETURN v_role = 'executive'
      OR v_role = 'manager'                    -- legacy
      OR v_is_lead = true
      OR v_role_type IN ('ceo', 'coo', 'cto', 'cfo', 'vp');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: is the current user an executive specifically?
CREATE OR REPLACE FUNCTION is_commission_executive()
RETURNS boolean AS $$
DECLARE
  v_role      text;
  v_role_type text;
BEGIN
  SELECT p.role, p.role_type
    INTO v_role, v_role_type
    FROM profiles p
   WHERE p.id = auth.uid()
   LIMIT 1;

  RETURN v_role = 'executive'
      OR v_role_type IN ('ceo', 'coo', 'cto', 'cfo');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: the rep name(s) this user maps to, based on profile.name first token.
-- e.g. profile.name = "Matt Johnson" → returns 'Matt'. Used to scope member
-- access to rows where their first name matches assignments.ae or .csm.
CREATE OR REPLACE FUNCTION current_user_rep_name()
RETURNS text AS $$
DECLARE
  v_name text;
BEGIN
  SELECT split_part(p.name, ' ', 1)
    INTO v_name
    FROM profiles p
   WHERE p.id = auth.uid()
   LIMIT 1;
  RETURN v_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---- commission_customers ----
DROP POLICY IF EXISTS commission_customers_read_manager ON commission_customers;
DROP POLICY IF EXISTS commission_customers_read_self    ON commission_customers;

CREATE POLICY commission_customers_read_manager ON commission_customers
  FOR SELECT
  USING (is_commission_manager());

CREATE POLICY commission_customers_read_self ON commission_customers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM commission_assignments a
       WHERE (a.stripe_customer_id = commission_customers.stripe_customer_id
              OR lower(a.email) = lower(commission_customers.email))
         AND (a.ae = current_user_rep_name() OR a.csm = current_user_rep_name())
    )
  );

-- ---- commission_assignments ----
DROP POLICY IF EXISTS commission_assignments_read_manager   ON commission_assignments;
DROP POLICY IF EXISTS commission_assignments_read_self      ON commission_assignments;
DROP POLICY IF EXISTS commission_assignments_write_manager  ON commission_assignments;

CREATE POLICY commission_assignments_read_manager ON commission_assignments
  FOR SELECT USING (is_commission_manager());

CREATE POLICY commission_assignments_read_self ON commission_assignments
  FOR SELECT USING (ae = current_user_rep_name() OR csm = current_user_rep_name());

CREATE POLICY commission_assignments_write_manager ON commission_assignments
  FOR ALL USING (is_commission_manager())
            WITH CHECK (is_commission_manager());

-- ---- commission_config ----
DROP POLICY IF EXISTS commission_config_read_manager  ON commission_config;
DROP POLICY IF EXISTS commission_config_write_exec    ON commission_config;

CREATE POLICY commission_config_read_manager ON commission_config
  FOR SELECT USING (is_commission_manager());

CREATE POLICY commission_config_write_exec ON commission_config
  FOR ALL USING (is_commission_executive())
            WITH CHECK (is_commission_executive());

-- ---- commission_unmatched ----
DROP POLICY IF EXISTS commission_unmatched_all_manager ON commission_unmatched;

CREATE POLICY commission_unmatched_all_manager ON commission_unmatched
  FOR ALL USING (is_commission_manager())
            WITH CHECK (is_commission_manager());

-- ---- commission_audit_log ----
DROP POLICY IF EXISTS commission_audit_log_read_exec ON commission_audit_log;

CREATE POLICY commission_audit_log_read_exec ON commission_audit_log
  FOR SELECT USING (is_commission_executive());
-- writes happen via SECURITY DEFINER functions or service_role only

-- --------------------------------------------------------
-- Audit-log trigger for assignments
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION commission_log_assignment_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO commission_audit_log (actor_id, action, target_type, target_id, after_value)
    VALUES (auth.uid(), 'assign', 'customer', COALESCE(NEW.stripe_customer_id, NEW.email),
            jsonb_build_object('ae', NEW.ae, 'csm', NEW.csm));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.ae IS DISTINCT FROM NEW.ae OR OLD.csm IS DISTINCT FROM NEW.csm THEN
      INSERT INTO commission_audit_log (actor_id, action, target_type, target_id, before_value, after_value)
      VALUES (auth.uid(), 'reassign', 'customer', COALESCE(NEW.stripe_customer_id, NEW.email),
              jsonb_build_object('ae', OLD.ae, 'csm', OLD.csm),
              jsonb_build_object('ae', NEW.ae, 'csm', NEW.csm));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO commission_audit_log (actor_id, action, target_type, target_id, before_value)
    VALUES (auth.uid(), 'unassign', 'customer', COALESCE(OLD.stripe_customer_id, OLD.email),
            jsonb_build_object('ae', OLD.ae, 'csm', OLD.csm));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_commission_assignments_audit ON commission_assignments;
CREATE TRIGGER trg_commission_assignments_audit
  AFTER INSERT OR UPDATE OR DELETE ON commission_assignments
  FOR EACH ROW EXECUTE FUNCTION commission_log_assignment_change();

-- --------------------------------------------------------
-- Realtime: enable Supabase realtime on assignments + customers
-- so multi-user assignment updates propagate live.
-- --------------------------------------------------------
-- Use a DO block so re-running the migration doesn't fail if the table
-- is already in the publication.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE commission_customers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE commission_assignments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE commission_unmatched;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================
-- DONE. Run the seed file next:
--   02-commissions-seed.sql
-- ============================================================
