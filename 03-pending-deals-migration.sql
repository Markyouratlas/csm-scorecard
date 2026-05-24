-- ============================================================
-- Migration: AE Deal Submission + Stripe Matching
-- ============================================================
-- Adds:
--   1. commission_pending_deals table — AEs submit closed deals here
--      with name/email/amounts. Each deal flows through a status
--      lifecycle and eventually gets matched (or not) to a Stripe customer.
--   2. secondary_email column on commission_customers — so customers
--      whose AE-known email differs from their Stripe billing email
--      can still be linked.
--
-- Safe to run multiple times — all statements use IF NOT EXISTS guards.
-- ============================================================

-- ============================================================
-- 1. SECONDARY EMAIL on commission_customers
-- ============================================================
-- The AE may know a customer by one email (the one they communicate
-- with), but Stripe stores a different email (billing). Both should be
-- searchable so AEs and managers can find customers via either.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_customers' AND column_name = 'secondary_email'
  ) THEN
    ALTER TABLE commission_customers
      ADD COLUMN secondary_email text;
    -- Index for fast lookup when matching pending deals
    CREATE INDEX idx_commission_customers_secondary_email
      ON commission_customers (lower(secondary_email))
      WHERE secondary_email IS NOT NULL;
  END IF;
END $$;

-- Also make sure we have a case-insensitive index on the primary email
-- (the Stripe billing email) for fast matching
CREATE INDEX IF NOT EXISTS idx_commission_customers_email_lower
  ON commission_customers (lower(email));

-- ============================================================
-- 2. commission_pending_deals TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_pending_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who submitted it (foreign key to profiles)
  ae_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ae_name text NOT NULL,  -- denormalized for fast display

  -- What the AE entered about the customer
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,

  -- The deal financials
  -- mrr_amount = recurring monthly portion (3% residual base)
  -- upfront_amount = initial cash collected (months prepaid × MRR, the 10% base)
  -- Both can coexist on the same deal.
  mrr_amount numeric(10, 2) NOT NULL DEFAULT 0,
  upfront_amount numeric(10, 2) NOT NULL DEFAULT 0,

  -- When the AE closed the sale (their date, not the Stripe payment date)
  closed_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Free-text notes from the AE
  notes text,

  -- Lifecycle:
  --   draft       — AE created but hasn't clicked Submit yet
  --   submitted   — AE clicked Submit, awaiting match
  --   matched     — manager confirmed match to a Stripe customer
  --   needs_review — auto-matcher found a candidate but it's ambiguous, or
  --                  AE marked it for review, or initial match was rejected
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'matched', 'needs_review')),

  -- Match result fields (filled when status = 'matched')
  matched_stripe_customer_id text REFERENCES commission_customers(stripe_customer_id) ON DELETE SET NULL,
  matched_at timestamptz,
  matched_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  matched_by_name text,  -- denormalized

  -- Auto-match audit trail: what did the auto-matcher find?
  -- 'exact_email_primary' | 'exact_email_secondary' | 'fuzzy_name' | 'manual' | null
  match_method text,
  match_confidence numeric(3, 2),  -- 0.00 to 1.00, used for fuzzy matches

  -- Standard timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent accidental duplicate submissions: an AE can't submit the same
-- email + closed_date twice. (Defined as a separate index because Postgres
-- doesn't allow function calls inside inline UNIQUE constraints.)
CREATE UNIQUE INDEX IF NOT EXISTS pending_deals_no_dup_per_ae
  ON commission_pending_deals (ae_id, lower(customer_email), closed_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION commission_pending_deals_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commission_pending_deals_updated_at ON commission_pending_deals;
CREATE TRIGGER commission_pending_deals_updated_at
  BEFORE UPDATE ON commission_pending_deals
  FOR EACH ROW
  EXECUTE FUNCTION commission_pending_deals_set_updated_at();

-- Indexes for the common query paths
CREATE INDEX IF NOT EXISTS idx_pending_deals_ae_id
  ON commission_pending_deals (ae_id);

CREATE INDEX IF NOT EXISTS idx_pending_deals_status
  ON commission_pending_deals (status);

CREATE INDEX IF NOT EXISTS idx_pending_deals_email_lower
  ON commission_pending_deals (lower(customer_email));

CREATE INDEX IF NOT EXISTS idx_pending_deals_closed_date
  ON commission_pending_deals (closed_date DESC);

CREATE INDEX IF NOT EXISTS idx_pending_deals_matched_stripe
  ON commission_pending_deals (matched_stripe_customer_id)
  WHERE matched_stripe_customer_id IS NOT NULL;

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
-- AEs can:
--   - INSERT their own deals
--   - SELECT their own deals
--   - UPDATE their own deals (only if status IN ('draft', 'submitted'))
--   - DELETE their own deals (only if status IN ('draft', 'submitted'))
--   AEs CANNOT modify a deal once it's matched — protects audit trail.
--
-- Managers + Executives can:
--   - SELECT all deals
--   - UPDATE all deals (including status changes)
--   - DELETE all deals
-- ============================================================

ALTER TABLE commission_pending_deals ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS pending_deals_select_own ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_select_manager ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_insert_own ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_insert_manager ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_update_own ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_update_manager ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_delete_own ON commission_pending_deals;
DROP POLICY IF EXISTS pending_deals_delete_manager ON commission_pending_deals;

-- AE: SELECT own
CREATE POLICY pending_deals_select_own
  ON commission_pending_deals
  FOR SELECT
  TO authenticated
  USING (ae_id = auth.uid());

-- Manager/Exec: SELECT all
-- Uses the existing is_commission_manager() helper from earlier migration
CREATE POLICY pending_deals_select_manager
  ON commission_pending_deals
  FOR SELECT
  TO authenticated
  USING (is_commission_manager() OR is_commission_executive());

-- AE: INSERT own
CREATE POLICY pending_deals_insert_own
  ON commission_pending_deals
  FOR INSERT
  TO authenticated
  WITH CHECK (ae_id = auth.uid());

-- Manager/Exec: INSERT any (lets them submit deals on behalf of an AE,
-- and also lets executives test the flow while impersonating)
CREATE POLICY pending_deals_insert_manager
  ON commission_pending_deals
  FOR INSERT
  TO authenticated
  WITH CHECK (is_commission_manager() OR is_commission_executive());

-- AE: UPDATE own (only if not yet matched)
CREATE POLICY pending_deals_update_own
  ON commission_pending_deals
  FOR UPDATE
  TO authenticated
  USING (
    ae_id = auth.uid()
    AND status IN ('draft', 'submitted', 'needs_review')
  )
  WITH CHECK (
    ae_id = auth.uid()
    AND status IN ('draft', 'submitted', 'needs_review')
  );

-- Manager/Exec: UPDATE all
CREATE POLICY pending_deals_update_manager
  ON commission_pending_deals
  FOR UPDATE
  TO authenticated
  USING (is_commission_manager() OR is_commission_executive())
  WITH CHECK (is_commission_manager() OR is_commission_executive());

-- AE: DELETE own (only if not yet matched)
CREATE POLICY pending_deals_delete_own
  ON commission_pending_deals
  FOR DELETE
  TO authenticated
  USING (
    ae_id = auth.uid()
    AND status IN ('draft', 'submitted', 'needs_review')
  );

-- Manager/Exec: DELETE all
CREATE POLICY pending_deals_delete_manager
  ON commission_pending_deals
  FOR DELETE
  TO authenticated
  USING (is_commission_manager() OR is_commission_executive());

-- ============================================================
-- 4. AUDIT LOG INTEGRATION
-- ============================================================
-- Hook pending_deals into the existing commission_audit_log so we have
-- a paper trail of who matched what, who edited what, etc.
--
-- The commission_audit_log schema (from 01-commissions-migration.sql) is:
--   id, actor_id, action, target_type, target_id, before_value, after_value, created_at

CREATE OR REPLACE FUNCTION log_pending_deal_change()
RETURNS trigger AS $$
DECLARE
  v_action text;
  v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'pending_deal_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'pending_deal_deleted';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'pending_deal_status_' || NEW.status;
  ELSIF OLD.matched_stripe_customer_id IS DISTINCT FROM NEW.matched_stripe_customer_id THEN
    v_action := 'pending_deal_match_changed';
  ELSE
    v_action := 'pending_deal_edited';
  END IF;

  INSERT INTO commission_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    before_value,
    after_value
  )
  VALUES (
    v_actor_id,
    v_action,
    'pending_deal',
    COALESCE(NEW.id, OLD.id)::text,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE null END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE null END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS pending_deals_audit ON commission_pending_deals;
CREATE TRIGGER pending_deals_audit
  AFTER INSERT OR UPDATE OR DELETE ON commission_pending_deals
  FOR EACH ROW
  EXECUTE FUNCTION log_pending_deal_change();

-- ============================================================
-- 5. CONVENIENCE VIEW for the manager dashboard
-- ============================================================
-- Joins pending_deals with the matched Stripe customer (if any)
-- so the manager view can render everything in one query.

CREATE OR REPLACE VIEW commission_pending_deals_enriched AS
SELECT
  pd.*,
  cc.name AS stripe_customer_name,
  cc.email AS stripe_billing_email,
  cc.secondary_email AS stripe_secondary_email,
  cc.start_date AS stripe_start_date,
  cc.max_mrr AS stripe_peak_mrr,
  cc.is_self_serve AS stripe_is_self_serve,
  cc.is_ae_era AS stripe_is_ae_era
FROM commission_pending_deals pd
LEFT JOIN commission_customers cc
  ON cc.stripe_customer_id = pd.matched_stripe_customer_id;

-- Grant SELECT on view to authenticated; RLS on the underlying table
-- still controls who sees what.
GRANT SELECT ON commission_pending_deals_enriched TO authenticated;

-- ============================================================
-- 6. REALTIME (optional but useful for live UI updates)
-- ============================================================
-- Add to the realtime publication so the manager view can subscribe
-- to changes and update without a manual refresh.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'commission_pending_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE commission_pending_deals;
  END IF;
END $$;

-- ============================================================
-- DONE
-- ============================================================
-- Quick sanity check — run after to verify:
--   SELECT COUNT(*) FROM commission_pending_deals;        -- should be 0
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'commission_customers'
--       AND column_name = 'secondary_email';              -- should return 1 row
-- ============================================================
