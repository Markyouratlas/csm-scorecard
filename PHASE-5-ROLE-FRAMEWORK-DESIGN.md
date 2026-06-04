# Phase 5 — Role Framework Design

**Status:** design only. No code or schema changes yet.
**Goal:** turn commission roles from hardcoded engine forks (AE / CSM) into configurable data, so adding a new role (BDR, Growth Manager, Marketing, etc.) is an in-app action — no engine code deploy.
**Constraint (non-negotiable):** the migrated framework must reproduce the current AE/CSM commission numbers **byte-identically** for the 5 existing reps. New roles earn money separately and additively.

---

## 1. Current state — how AE / CSM forks today

All commission math today is split into one of two branches by `const ae = isAE(rep, repList)`. The else-branch handles CSM. There is no third path.

### The fork sites — verbatim

| # | File:line | Fork |
|---|---|---|
| 1 | `commissionEngine.js:361` | `const ae = isAE(rep, repList);` in `calcRepCommission` |
| 2 | `commissionEngine.js:451` | same line in `calcRepCommissionByCustomer` |
| 3 | `commissionEngine.js:526` | same in `calcRepCommissionByCustomerByMonth` |
| 4 | `commissionEngine.js:864` | same in `calcOneoffCommissionByRep` |
| 5 | `commissionEngine.js:399, 474, 564` | `const cap = ae ? effCfg.aeResidualMonths : effCfg.csmResidualMonths;` — cap is **role-typed** |
| 6 | `commissionEngine.js:403-417, 478-490, 574-591` | The if/else math block (Initial CC vs residual-only) — see below |
| 7 | `commissionEngine.js:870-871` | `isThisRepAE = ae && o.assigned_ae === rep; isThisRepCSM = !ae && o.assigned_csm === rep;` — assignment-column-by-role |

### What each branch does

**AE branch** (`calcRepCommission:403-411`):
```js
if (ae) {
  if (m === firstCashMonth) {
    voiceAI += cash * effCfg.aeVoiceRate;                          // Initial CC, 10% on GROSS cash
    voiceAINetSales += cash;
    newDeals += 1;
    newMRR += mrr;
  } else {
    aeResidual += netCashForResidual(c, m, firstCashMonth) * effCfg.aeResidualRate;  // 3% on NET cash
  }
}
```

**CSM branch** (`calcRepCommission:412-417`):
```js
} else {
  // CSM earns nothing on the first cash month (initial CC is AE-only). Phase 4.2 base fix.
  if (m !== firstCashMonth) {
    csmResidual += netCashForResidual(c, m, firstCashMonth) * effCfg.csmRate;        // 3% on NET cash
  }
}
```

Same shape repeats in `calcRepCommissionByCustomer:478-490` and `calcRepCommissionByCustomerByMonth:574-591`.

### The 12-month cap — what date it anchors to

Confirmed by inspection at `commissionEngine.js:399-401`:
```js
const cap = ae ? effCfg.aeResidualMonths : effCfg.csmResidualMonths;
const diff = monthDiff(c.start_date, m);
if (cap != null && diff != null && diff >= cap) continue;
```

`monthDiff` is called with **`c.start_date`** as the anchor — i.e. the **customer's** start date, the same anchor used for both AE and CSM. So **today, AE and CSM share the same clock**: the customer's start_date. This is the key constraint to preserve in the migration AND the key thing to change for true per-role engagement.

### Initial CC vs residual — how decided

Three concepts coexist:

1. **`firstCashMonth`** (`commissionEngine.js:263-279`) — the first month where any cash arrived for this customer. Computed per customer:
   - If `initial_cash_override > 0` and `start_date` exists → return `start_date`'s month
   - Otherwise → walk `monthly_cash_received + monthly_cash_received_manual` in chronological order, return the first month with `combinedCash(c, m) > 0`
   - Returns `null` if no cash has ever arrived.

2. **The Initial CC trigger:** `if (m === firstCashMonth)` — **AE-only**. The CSM branch deliberately has no symmetric Initial CC (Phase 4.2 base fix; the comment "initial CC is AE-only" appears 3 times in the engine).

3. **Cash basis differs by branch:**
   - **AE Initial CC** uses **GROSS** cash → `cashForCommissionMonth(c, m, firstCashMonth)` at lines 392, 404, 469, 479, 556, 575
   - **All residuals** use **NET** cash → `netCashForResidual(c, m, firstCashMonth)` at lines 410, 415, 483, 488, 582, 588 — gross minus refunds/disputes, floored at $0 per (customer, month)

### What "type-of-role" really means today

The AE/CSM fork bundles three orthogonal behaviors per role:

| Behavior | AE today | CSM today | Generalized term |
|---|---|---|---|
| Has an Initial CC bonus on first cash month | yes, 10% on gross | no | **`initial_cc_pct`** (NULL or 0 = no Initial CC) |
| Earns residual on subsequent months | yes, 3% on net | yes, 3% on net (incl. first month? no — Phase 4.2 fix excludes it) | **`residual_pct`** |
| Cap on months from engagement | yes, 12 | yes, 12 | **`residual_months_cap`** |
| Reads from which `commission_assignments.*` column | `.ae` | `.csm` | **`assignment_column`** |
| Reads from which `oneoff_payments.assigned_*_id` column | `.assigned_ae_id` (post-B2) | `.assigned_csm_id` (post-B2) | **`oneoff_assigned_column`** |
| Has Initial CC included on first month for residual? | no (Initial CC IS that month's payout) | n/a (CSM has no Initial CC) | derived from `initial_cc_pct` |

A new role like BDR would be: `initial_cc_pct = 0.05` (say), `residual_pct = null` or `0` (BDRs typically only get a closing bonus, no residual), `residual_months_cap = null`.

A new role like "Growth Manager" could be: `initial_cc_pct = null` (no signing bonus), `residual_pct = 0.02`, `residual_months_cap = 24`.

### Existing rep override surface (the data we must NOT break)

The `commission_rep_overrides` table (per `src/07-rep-overrides-migration.sql:41-71`) has columns **named for the AE/CSM duality**:
- `ae_pct, ae_residual_pct, ae_residual_months` — AE-specific
- `csm_pct, csm_residual_months` — CSM-specific (note: no `csm_initial_pct` because CSM has no Initial CC)
- `accelerator_target, accel_1_5x_pct, accel_2x_pct, team_lead_override_pct` — cross-role

The engine reads these at `commissionEngine.js:179-194` (`resolveRepConfig`) and applies them by hardcoded mapping. The override naming is intentional but it leaks the AE/CSM duality into the schema. **Migration impact: we cannot simply rename — this is a deployed table with an audit trigger and committed migration history. We need a forward-compatible strategy.**

Currently `commission_rep_overrides` is **empty in production** as of June 3 (the form just shipped and your test row was deleted). So a one-time data migration to a generalized schema is now possible at near-zero risk.

---

## 2. Role data model — proposed

Two new tables. Both additive. Both keyed by a stable `role_key` text identifier.

### Table A: `commission_roles` (the role registry + defaults)

```sql
CREATE TABLE commission_roles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key                 text NOT NULL UNIQUE,            -- 'ae', 'csm', 'bdr', 'growth_manager', ...
  display_name             text NOT NULL,                   -- 'Account Executive', 'Customer Success Manager'
  display_order            integer NOT NULL DEFAULT 100,    -- for stable UI ordering
  is_active                boolean NOT NULL DEFAULT true,

  -- The role's commission behavior (DEFAULTS — per-rep overrides apply on top)
  earns_commission         boolean NOT NULL DEFAULT true,   -- a role like "implementation" might exist but not earn
  initial_cc_pct           numeric(5,4),                    -- DECIMAL 0<x≤1. NULL or 0 = no Initial CC bonus.
  initial_cc_basis         text NOT NULL DEFAULT 'gross',   -- 'gross' | 'net'. AE today = 'gross'.
  residual_pct             numeric(5,4),                    -- DECIMAL 0<x≤1. NULL or 0 = no residual.
  residual_basis           text NOT NULL DEFAULT 'net',     -- 'gross' | 'net'. All residuals today = 'net'.
  residual_months_cap      integer,                         -- months from engagement. NULL = no cap.
  residual_excludes_initial_cc_month boolean NOT NULL DEFAULT true,
                                                            -- AE behavior today: false (AE residual on every month after first; Initial CC IS month 1)
                                                            -- CSM behavior today: true (CSM earns nothing month 1)
                                                            -- (Drawn from the Phase 4.2 base fix)

  -- Which legacy text column in commission_assignments holds this role's rep name
  -- (so we don't break the existing assignment table). 'ae' or 'csm' today.
  -- For new roles, we'd add new columns to commission_assignments (or use a side table — see below).
  assignment_column        text NOT NULL,                   -- 'ae' | 'csm' | future new column

  -- Which column in oneoff_payments holds the assigned rep (post-B2 UUID columns)
  oneoff_assigned_id_column  text,                          -- 'assigned_ae_id' | 'assigned_csm_id' | NULL if no one-off support
  oneoff_rate_column         text,                          -- 'ae_commission_rate' | 'csm_commission_rate' | NULL
  oneoff_assigned_text_column text,                         -- 'assigned_ae' | 'assigned_csm' (legacy text columns)

  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

**Initial seed (matches today's behavior exactly):**
```sql
INSERT INTO commission_roles (role_key, display_name, display_order, earns_commission,
  initial_cc_pct, residual_pct, residual_months_cap, residual_excludes_initial_cc_month,
  assignment_column, oneoff_assigned_id_column, oneoff_rate_column, oneoff_assigned_text_column)
VALUES
  ('ae',  'Account Executive', 10, true,  0.10, 0.03, 12, false,
    'ae',  'assigned_ae_id',  'ae_commission_rate',  'assigned_ae'),
  ('csm', 'Customer Success', 20, true,  NULL, 0.03, 12, true,
    'csm', 'assigned_csm_id', 'csm_commission_rate', 'assigned_csm');
```

Reading this row, the engine has enough information to replicate every AE/CSM branch without hardcoded "ae" / "csm" strings inside calc functions.

### Table B: `commission_customer_engagements` (per-role per-customer clock)

Each customer can have one engagement record per role. The engagement_date is the anchor for that role's `residual_months_cap` for that customer. **This is what makes each role's 12-month clock independent.**

```sql
CREATE TABLE commission_customer_engagements (
  stripe_customer_id  text NOT NULL REFERENCES commission_customers(stripe_customer_id) ON DELETE CASCADE,
  role_key            text NOT NULL REFERENCES commission_roles(role_key) ON UPDATE CASCADE,
  engagement_date     date NOT NULL,
  is_house            boolean NOT NULL DEFAULT false,  -- see §7.4 (per-role-per-customer House)
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (stripe_customer_id, role_key),
  -- engagement_date cannot precede customer's first cash month — enforced by RPC,
  -- not by CHECK constraint (we don't have firstCashMonth visible to DDL). See §7.2.
  CONSTRAINT cce_house_xor_assignment CHECK (true)  -- semantic constraint enforced by form/RPC: is_house=true ↔ rep slot empty
);

CREATE INDEX idx_cce_customer ON commission_customer_engagements (stripe_customer_id);
CREATE INDEX idx_cce_role     ON commission_customer_engagements (role_key);
CREATE INDEX idx_cce_house    ON commission_customer_engagements (role_key) WHERE is_house = true;

-- A separate table holds cohort-based rate plans — see §8 for the full design.
-- Schema sketch:
--   commission_cohorts (id, role_key, cohort_start, cohort_end, initial_cc_pct,
--     residual_pct, residual_months_cap, notes, audit cols).
-- Cohort matching keys off findFirstCashMonth(customer), not engagement_date.
```

**Migration backfill (preserves today's math):** for every existing `commission_customers` row, insert two engagement records — one for `ae` and one for `csm` — both with `engagement_date = commission_customers.start_date`. After this backfill, the new engine reads engagement_date from this table and gets exactly today's start_date → 12-month cap behavior is preserved.

### How `commission_rep_overrides` interacts

Two options, in order of safety:

**Option Ω (recommended) — additive generic columns alongside the legacy ones.**
Add three new columns to `commission_rep_overrides`, leave the existing 9 in place untouched:

```sql
ALTER TABLE commission_rep_overrides ADD COLUMN role_key text REFERENCES commission_roles(role_key);
ALTER TABLE commission_rep_overrides ADD COLUMN override_initial_cc_pct  numeric(5,4);
ALTER TABLE commission_rep_overrides ADD COLUMN override_residual_pct    numeric(5,4);
ALTER TABLE commission_rep_overrides ADD COLUMN override_residual_months integer;
```

Engine reads new columns when `role_key IS NOT NULL`; falls back to the existing AE/CSM-named columns when `role_key IS NULL` (i.e. legacy rows from the old form). The form gets updated to write the new columns by role_key.

**Option Ψ — fresh table.**
Leave `commission_rep_overrides` strictly as the legacy AE/CSM override path. Create `commission_rep_overrides_v2` with generic columns and a `role_key` foreign key. Engine reads both, merging.

Recommendation: **Option Ω.** Single source of truth, no engine read-two-tables complexity. The audit trigger continues to capture every change. Existing override form (just shipped) keeps working; we extend it to populate `role_key` after the role framework lands.

### How `commission_assignments` interacts

This is where we hit the deferred UUID-everywhere migration. Today the assignment table has only `ae` and `csm` text columns. To add a new role's assignment, we have two options:

**Option α (least invasive, recommended for v1):** add a new text column per new role.
```sql
ALTER TABLE commission_assignments ADD COLUMN bdr text;
ALTER TABLE commission_assignments ADD COLUMN growth text;
```
Update `commission_roles.assignment_column` to `'bdr'`, `'growth'`, etc. Engine reads `assignment[role.assignment_column]` dynamically. Schema grows when adding a role, but adding a column is a small, safe DDL.

**Option β (long-term cleaner):** introduce a side table `commission_assignments_v2` with `(stripe_customer_id, role_key, rep_id, rep_name)` and drop the wide columns eventually. More invasive, would need to ship alongside the engine refactor.

Recommendation: **α** for Phase 5 v1. Each new role costs one `ALTER TABLE ADD COLUMN`. The UUID-everywhere refactor can come in a separate Phase 6 if first-name collisions become a real problem.

---

## 3. Per-role per-customer engagement dates

### The semantic shift

Today: one customer = one start_date = both AE clock and CSM clock anchor here. The engine implicitly assumes AE engagement = CSM engagement = customer.start_date.

After Phase 5: one customer = one start_date (for first-cash-month detection and historical reference) + N engagement_date values (one per role-rep relationship). Each role's 12-month residual cap counts from **that role's engagement_date** for **that customer**.

### `commission_customers.start_date` stays — but its role narrows

- **Keep:** `start_date` remains the anchor for `findFirstCashMonth` when there's an `initial_cash_override` (`commissionEngine.js:264-270`). It's the "customer's first month" in a calendar sense.
- **Keep:** `start_date` remains the historical/display "started date" for the customer.
- **No longer:** `start_date` is no longer the cap anchor. The cap now anchors to `commission_customer_engagements.engagement_date` for the (customer, role) pair.

### Storage shape — already covered above

`commission_customer_engagements (stripe_customer_id, role_key) → engagement_date`. Primary key on the pair. Indexed both directions.

### Engagement date semantics for the migration

For every (customer, role) pair in the AE/CSM-era data, we backfill:
```sql
engagement_date = commission_customers.start_date
```
This guarantees the new engine produces the same cap behavior as today. Going forward, engagement dates can diverge per role (e.g. an AE closes a customer in Jan, a CSM is assigned in March, an upsell BDR is assigned in June — three independent clocks).

### Edge: assignment exists but no engagement record

If a customer has `commission_assignments.csm = 'Matt'` but no row in `commission_customer_engagements` for `(stripe_customer_id, 'csm')`, the engine should fall back to `commission_customers.start_date`. This makes the migration safe even if a customer slips through the backfill.

```js
const engagement = lookupEngagement(c.stripe_customer_id, role.role_key) ?? c.start_date;
```

### Edge: engagement_date before customer.start_date

Theoretically valid (a BDR sourced the lead before the customer formally signed). Treatment: allow it. Cap math uses `monthDiff(engagement_date, m)`, which becomes negative for months before engagement → never exceeds the cap → no behavioral issue.

The form that sets engagement dates can warn but should not block.

---

## 4. Engine rearchitecture — concrete shape

### The unit of work: per-customer-per-month-per-role

A pure helper takes ONE customer, ONE month, ONE role, and returns the commission earned by that role's rep for that month from that customer:

```js
function calcRoleCommissionForCustomerMonth({
  customer,
  role,                      // commission_roles row
  m,                         // 'YYYY-MM'
  firstCashMonth,            // string | null
  engagementDate,            // 'YYYY-MM-DD' (date), the cap anchor
  isHouse,                   // boolean — engagement.is_house (see §7.4); explicit "no commission paid"
  effCfg,                    // resolved per-rep + role override (+ cohort, see §8)
}) {
  if (!role.earns_commission) return { initial: 0, residual: 0 };
  if (isHouse) return { initial: 0, residual: 0 };   // House engagement — see §7.4

  // Cap check — anchored to engagement_date (NOT customer.start_date)
  if (role.residual_months_cap != null) {
    const diff = monthDiff(engagementDate, m);
    if (diff != null && diff >= role.residual_months_cap) return { initial: 0, residual: 0 };
  }

  const isFirst = (m === firstCashMonth);

  // Initial CC (one-time first-cash-month bonus)
  let initial = 0;
  if (isFirst && role.initial_cc_pct && role.initial_cc_pct > 0) {
    const grossOrNet = role.initial_cc_basis === 'net'
      ? netCashForResidual(customer, m, firstCashMonth)
      : cashForCommissionMonth(customer, m, firstCashMonth);
    initial = grossOrNet * effCfg.initial_cc_pct;        // effCfg may override role default
  }

  // Residual (every other month, or every month, depending on role.residual_excludes_initial_cc_month)
  let residual = 0;
  const shouldRunResidual = role.residual_pct && role.residual_pct > 0 &&
    (!role.residual_excludes_initial_cc_month || !isFirst);
  if (shouldRunResidual) {
    const basis = role.residual_basis === 'gross'
      ? cashForCommissionMonth(customer, m, firstCashMonth)
      : netCashForResidual(customer, m, firstCashMonth);
    residual = basis * effCfg.residual_pct;
  }

  return { initial, residual };
}
```

That helper subsumes both the AE branch and the CSM branch. Behavior preserved per the seed values in §2.

### `calcRepCommission` becomes role-aware

```js
function calcRepCommission(rep, customers, indexedAssignments, config, monthCols,
                          indexedOverrides, matchedDealsByCustomer,
                          repList, roles, engagementsByCustomer) {
  // Look up which role this rep has (via profiles → role_type → roles[])
  const role = lookupRoleForRep(rep, repList, roles);
  if (!role) return { rep, role: null, book: [], monthly: monthCols.map(m => ({ month: m, total: 0 })) };

  // Build the book: customers where assignment[role.assignment_column] === rep
  const book = customers.filter((c) => {
    const a = resolveAssignment(c, indexedAssignments.byStripeId, indexedAssignments.byEmail);
    return a[role.assignment_column] === rep;
  });

  const monthly = monthCols.map((m) => {
    let initial = 0, residual = 0;
    for (const c of book) {
      const firstCashMonth = findFirstCashMonth(c, monthCols);
      const engagementDate = engagementsByCustomer[c.stripe_customer_id]?.[role.role_key]
                          ?? c.start_date;
      const effCfg = resolveRepConfigForRole(rep, role.role_key, engagementDate, indexedOverrides, config);
      const { initial: i, residual: r } = calcRoleCommissionForCustomerMonth({
        customer: c, role, m, firstCashMonth, engagementDate, effCfg,
      });
      initial += i;
      residual += r;
    }
    return { month: m, initial, residual, total: initial + residual };
  });

  return { rep, role, book, monthly };
}
```

Key changes:
- Branch on role's `initial_cc_pct` / `residual_pct` instead of `isAE(rep)`.
- Cap anchor is `engagementDate`, not `customer.start_date`.
- Assignment column is `role.assignment_column`, not hardcoded `.ae` / `.csm`.
- Result no longer has `voiceAI` / `aeResidual` / `csmResidual` as distinct fields — just `initial` + `residual`. UI translates per role display.

### `calcOneoffCommissionByRep` becomes role-aware

Identical pattern: look up the role for `rep`, then match `o[role.oneoff_assigned_text_column] === rep` (or the UUID column if we wire it through), use `o[role.oneoff_rate_column]` as the rate. One generic loop, no AE/CSM fork.

### What UI changes (preview, not in scope yet)

- Overview "Commission by Rep" — currently has fixed AE/CSM columns. Becomes one row per rep with `role.display_name` shown.
- By Rep tab — the tile labels and Monthly Breakdown column headers come from the role config (`role.display_name`, "Initial CC" if `initial_cc_pct > 0`, "Residual" always).
- The CSV export — column headers become role-driven.
- `RepOverridesPanel` — the effective-rates display reads from `commission_roles` defaults + per-rep overrides, instead of the hardcoded DEFAULT_CONFIG keys.

These UI changes ship in Phase 5's later sub-phases. The engine refactor doesn't immediately rip them out; the existing UI can keep working off the legacy result-shape during the transition by mapping the new `initial`/`residual` back to `voiceAICommission`/`aeResidual` / `csmResidual` based on `role.role_key`.

---

## 5. Equivalence proof — non-negotiable

The migrated engine must produce **byte-identical** subscription commission numbers for the 5 existing reps (Heather, Mason, Matt, Sean, Noah) across all existing cash months. New roles add money on top, never replace.

### What "byte-identical" means

For every (rep, month) pair currently displayed, the new engine's `monthly[i].total` must equal the old engine's `monthly[i].total` to the cent. We compare via `Math.abs(oldTotal - newTotal) < 0.005` to absorb floating-point noise that pre-exists in the old engine.

### Pre-flip verification — the SQL checklist

Same pattern as Phase 0 of the dynamic-reps flip. **Before flipping the engine**, run:

```sql
-- Q1. Confirm the seed for commission_roles matches today's behavior exactly:
SELECT role_key, initial_cc_pct, residual_pct, residual_months_cap,
       residual_excludes_initial_cc_month, assignment_column
FROM commission_roles
ORDER BY role_key;
-- Expected:
--   ae  | 0.1000 | 0.0300 | 12 | false | ae
--   csm | NULL   | 0.0300 | 12 | true  | csm

-- Q2. Confirm every customer has both an AE and a CSM engagement row,
--     with engagement_date = commission_customers.start_date:
SELECT COUNT(*) AS expected
FROM commission_customers
WHERE start_date IS NOT NULL;

SELECT COUNT(*) AS actual_ae
FROM commission_customer_engagements
WHERE role_key = 'ae';

SELECT COUNT(*) AS actual_csm
FROM commission_customer_engagements
WHERE role_key = 'csm';

-- expected == actual_ae == actual_csm. If not, the backfill missed customers.

SELECT COUNT(*) AS mismatches
FROM commission_customer_engagements e
JOIN commission_customers c ON c.stripe_customer_id = e.stripe_customer_id
WHERE e.engagement_date <> c.start_date;
-- Expected: 0 mismatches. Backfill must use start_date exactly.

-- Q3. Confirm commission_rep_overrides isn't currently populated with anything
--     that would alter behavior between old and new engine (the new engine
--     reads override_* columns; old engine reads ae_pct/csm_pct/etc.):
SELECT COUNT(*) FROM commission_rep_overrides;
-- Expected: 0 (table is empty as of 2026-06-03).
-- If non-zero by the time we flip, every override row needs migration to
-- populate override_* columns from the legacy columns.
```

If all three queries pass, the new engine reading from the new tables produces the same inputs as the old engine reading from start_date + DEFAULT_CONFIG + isAE.

### Runtime side-by-side proof — the canary

Before flipping consumers to the new engine, run the new engine in **shadow mode** in `CommissionsView`'s OverviewTab. For each rep, compute both ways:

```js
const oldResult = calcRepCommission_OLD(rep, ...);
const newResult = calcRepCommission_NEW(rep, ..., roles, engagementsByCustomer);

// Total YTD comparison
const oldYtd = oldResult.monthly.reduce((s, m) => s + m.total, 0);
const newYtd = newResult.monthly.reduce((s, m) => s + m.total, 0);
if (Math.abs(oldYtd - newYtd) >= 0.01) {
  console.warn(`[ENGINE DRIFT] ${rep}: old=${oldYtd}, new=${newYtd}, delta=${newYtd - oldYtd}`);
}

// Per-month comparison
for (let i = 0; i < oldResult.monthly.length; i++) {
  if (Math.abs(oldResult.monthly[i].total - newResult.monthly[i].total) >= 0.005) {
    console.warn(`[ENGINE DRIFT] ${rep} ${oldResult.monthly[i].month}: ...`);
  }
}
```

The old code path remains the ONE that's displayed. The new path's warnings surface drift in the browser console. We run this in production for at least one full payout cycle without a single drift warning before flipping consumers.

### Optional pre-flip regression script (Phase 0+)

A one-off Node script (not in the React app) that:
1. Loads ALL `commission_customers`, `commission_assignments`, `commission_config`, `commission_rep_overrides` rows from Supabase via service_role.
2. Runs the old engine over them for all 5 reps, snapshots the `(rep, month, total)` tuples.
3. Loads `commission_roles` + `commission_customer_engagements`.
4. Runs the new engine over them.
5. Diffs the snapshots. Exits 0 if identical, 1 otherwise.

Bake this script into the repo (out of `src/`, in a `scripts/` dir). Run it locally with service_role before the flip. Don't ship the service_role key anywhere; the script is dev-machine-only.

### What "byte-identical" might NOT mean (acceptable diffs)

- **Floating-point order-of-operations:** the new engine might sum `(initial + residual)` per month in a different order than the old `voiceAI + aeResidual + csmResidual`. JavaScript IEEE 754 can produce different last-digit results. We accept `Math.abs(delta) < 0.01` as equivalent — any commission line item under a cent is invisible to payroll.
- **Display label changes:** the old engine returns `voiceAICommission` and `aeResidual` as separate fields; the new engine returns `initial` and `residual`. The UI translation layer (during the transition) maps these and they should still ROUND-TRIP to the same UI display. Visual byte-identity is what Mark verifies in preview.

---

## 6. Phased build plan

Each phase below is independently shippable, independently verifiable, and never leaves the app in a "wrong paycheck" state. Phases marked **(money)** touch paycheck math and require equivalence proof. Phases marked **(additive)** are safe — schema or read-only code only.

### Phase A — schema for roles + engagements **(additive)**
- SQL: `commission_roles` table, seed with `ae` + `csm` rows matching today.
- SQL: `commission_customer_engagements` table, empty.
- SQL: backfill `commission_customer_engagements` with one row per (customer, AE) and (customer, CSM), `engagement_date = customer.start_date`.
- SQL: add `role_key` + `override_initial_cc_pct` + `override_residual_pct` + `override_residual_months` columns to `commission_rep_overrides` (nullable, no legacy rows affected).
- No engine change. No UI change.
- **Verify:** Q1, Q2, Q3 from §5 pass.

### Phase B — load the new tables in `useCommissions` **(additive)**
- Add to the `Promise.all` in `useCommissions.js`:
  - `supabase.from('commission_roles').select('*')`
  - `supabase.from('commission_customer_engagements').select('*')`
- Expose as `c.roles` and `c.engagementsByCustomer` (the latter pre-indexed by stripe_customer_id → { [role_key]: row }).
- No engine read of this yet. No UI consumer.
- **Verify:** `c.roles.length === 2`; `c.engagementsByCustomer[some_cus_id].ae.engagement_date === start_date`.

### Phase C — generic engine helpers, alongside the old engine **(additive code, no consumer)**
- Add `calcRoleCommissionForCustomerMonth(...)` to `commissionEngine.js`. Pure, no side effects.
- Add `calcRepCommission_v2(...)` — uses the new helper + role + engagement lookup.
- Add `resolveRepConfigForRole(...)` — reads the new `override_*` columns first, falls back to legacy `ae_pct`/`csm_pct` mapping if the role-matched override row uses legacy columns.
- **Do not** call the v2 functions from any UI consumer yet. They're imported but unused.
- **Verify:** code compiles; no behavior change.

### Phase D — shadow-mode comparison in OverviewTab **(equivalence proof)**
- In `OverviewTab.perRep` memo, after computing the existing `calcRepCommission(rep, ...)`, also call `calcRepCommission_v2(rep, ..., c.roles, c.engagementsByCustomer)`.
- Don't display v2 output. Just `console.warn` on any per-month delta > $0.005.
- Ship to production. Watch the browser console for one full payout cycle (Mark logs in, browses normally).
- **Verify:** zero `[ENGINE DRIFT]` warnings over 7 days of normal use including Stripe re-syncs and any override edits.

### Phase E — flip OverviewTab + ByRepTab + CommissionsTab to v2 **(money)**
- Replace `calcRepCommission` calls with `calcRepCommission_v2`. Same for the byCustomer / byCustomerByMonth variants. Same for `calcOneoffCommissionByRep`.
- Keep the result-shape compatibility layer: in the new engine result, also populate `voiceAICommission = (role.role_key === 'ae' ? initial : 0)` and `aeResidual / csmResidual` from the new fields, so UI keeps rendering the same labels.
- Re-tag rollback point, ship, hard-refresh preview, verify the 5 reps' YTD numbers match prod to the cent.
- Delete the v1 engine functions in a follow-up commit (cleanup).

### Phase F — UI for role management **(additive)**
- Add a "Roles" section to Settings (exec-only). CRUD form for `commission_roles` rows (display_name, percentages, cap, assignment_column).
- Add an engagement-date editor accessible from CustomersTab per (customer, role).
- Existing UI labels migrate from hardcoded "AE" / "CSM" to `role.display_name`.

### Phase G — add a third role **(additive)**
- Run `ALTER TABLE commission_assignments ADD COLUMN bdr text` (or whatever the new role's assignment column is).
- INSERT into `commission_roles` with the BDR config.
- The engine, dropdowns, and overview row automatically include the new role.
- First payout cycle with the new role generates a clean rollback path (no rep is assigned yet, so no commission moves).

**Cumulative blast radius:**
- Phases A, B, C, F, G: additive. Safe to ship in any order once their dependencies are met.
- Phase D: code change but math-neutral (only reads).
- Phase E: money path. Single ship with equivalence proof + tag + verification.

---

## 7. Resolved decisions (2026-06-04)

All 11 questions from the original design pass were resolved on 2026-06-04. Where an answer differs from the original proposal, the change is marked **CHANGED**.

### 7.1 Empty engagement records — confirmed

Only insert engagement rows where a rep is assigned OR the (customer, role) slot is explicitly marked **House** (see §7.4). Auto-creating empty engagements remains rejected. Engagement-without-assignment-and-without-house is meaningless and forbidden.

### 7.2 Engagement date relative to customer's first cash — CHANGED

**Original proposal:** allow backdating, warn-not-block.
**Resolved:** engagement_date **cannot precede the customer's first cash month** — it's structurally impossible. Customers don't exist in `commission_customers` until their first Stripe payment lands, so an earlier engagement date refers to a customer that doesn't (yet) exist in our system.

The form and the engagement-write RPC must reject `engagement_date < findFirstCashMonth(customer)`. Drop the warn-not-block branch entirely.

**Engine implication:** `monthDiff(engagement_date, m)` is guaranteed non-negative for any month with cash; no need to special-case negative diffs in the cap check.

### 7.3 Role linking via `profiles.role_type` — confirmed

Adding a role like `'bdr'` requires:
1. Adding `'bdr'` as a `role_type` value in `teams.js` (and a matching role row in the appropriate team's `roles` array).
2. Inserting a `commission_roles` row with a column linking to that role_type (e.g. `commission_roles.profile_role_type text NOT NULL`).
3. The collision detector and `repsFromProfiles` look up "earns commission" by joining on this column, rather than hardcoding `role_type IN ('account_executive', 'csm')`.

### 7.4 House accounts — CHANGED (per-role-per-customer, not whole-customer)

**Original proposal:** house = whole-customer (no commission to anyone, implied by both assignment slots being NULL).
**Resolved:** house is **per-role-per-customer**. The motivating case: a deal Mark or Omer (execs) close and then hand off to a CSM. The AE slot is House (no AE commission paid to anyone) but the CSM slot is normal (assigned CSM earns).

This is modeled as a boolean on the engagement record (already added to the schema in §3 / §2):

```sql
ALTER TABLE commission_customer_engagements
  ADD COLUMN is_house boolean NOT NULL DEFAULT false;
```

#### Semantics

- `is_house = false` (default): engagement names a rep via `commission_assignments[role.assignment_column]`. Engine computes commission normally.
- `is_house = true`: engagement is intentionally House. Engine pays ZERO commission for this (customer, role) pair. `commission_assignments[role.assignment_column]` must be NULL for the row to be valid (form/RPC enforced — they're mutually exclusive states).

#### Three distinct states per (customer, role) slot

| State | Engagement row | Assignment column | Engine | UI signal |
|---|---|---|---|---|
| **Needs assignment** | none | NULL | role skipped for this customer | red nag in Overview ("X customers need an AE assigned") |
| **House (explicit)** | exists, `is_house = true` | NULL | role skipped, zero commission paid | small "House" badge; **NOT** in nag list |
| **Assigned to rep** | exists, `is_house = false` | rep name | normal commission calc | rep name in CustomersTab |

This is the "needs a decision" vs "decision made, none owed" distinction. Both are valid end states; only the first is a TODO.

#### Engine helper change (already incorporated into §4's `calcRoleCommissionForCustomerMonth`)

```js
if (isHouse) return { initial: 0, residual: 0 };   // House engagement
```

This is checked BEFORE the cap math. A House engagement zeroes the role's contribution for that (customer, month) pair regardless of dates or rates.

#### "Needs an AE" nag list interaction (currently `OverviewTab.stats` near `CommissionsView.jsx:595-615`)

Today: checks `assignment.ae == null` for AE-era customers.
After Phase 5: checks "does an engagement exist for this (customer, ae)" — regardless of `is_house`.
- House for AE → engagement exists → NOT in nag list.
- No engagement for AE → still in nag list.
- AE engagement with rep assigned → already out of nag list (today's behavior).

#### Form UI

The engagement editor offers three states per (customer, role) slot:
- **Unassigned** — delete the engagement row.
- **House** — engagement row with `is_house = true`, no rep selected.
- **Assigned to rep** — engagement row with `is_house = false`, rep dropdown.

### 7.5 One-rep-one-role for v1 — confirmed (with new TL UI requirement)

One profile = one role for v1. Multi-role reps are deferred.

**NEW (2026-06-04):** the team-lead override flow currently **INFERS** reports from `profiles.manager_id` and `profiles.team` (calcTeamLeadOverride at `commissionEngine.js:651-657`). This is brittle.

**Phase F must add an explicit TL management UI:**
- For each TL profile, show a "Reports & Override" panel.
- Allow exec to add/remove which reps roll up to this TL.
- Allow exec to set the TL's override rate (currently mixed into `commission_rep_overrides.team_lead_override_pct` alongside rep rates — should have its own form).

Schema implication (decision deferred to Phase F design):
- **Option α:** keep `profiles.manager_id` + team fallback as the source of truth, build UI that writes to it.
- **Option β:** introduce explicit `commission_tl_reports(tl_profile_id, report_profile_id, effective_start, effective_end)` for cleaner ownership and history.

### 7.6 Cap configurable per-role and per-person — confirmed (and triggers cohort requirement)

`commission_roles.residual_months_cap` is the role-level default. `commission_rep_overrides.override_residual_months` overrides per-rep. CSM default = 12 in the seed (not NULL — preserves today's behavior at `commissionEngine.js:184` where `csmResidualMonths` falls back to 12).

**NEW REQUIREMENT (2026-06-04): cohort-based rates.** See **§8** for the full design. This adds a **fourth rate source** beyond:
1. Role default (`commission_roles`)
2. Per-rep override (`commission_rep_overrides`)
3. Effective dating on per-rep override (existing `effective_date` logic in `resolveRepConfig`)
4. **NEW:** Cohort-based (`commission_cohorts`) — rates can vary by the customer's first-payment cohort

The precedence among these four sources is a new open question (§9.1).

### 7.7 Initial CC basis configurable per role — confirmed

`commission_roles.initial_cc_basis` is 'gross' or 'net'. AE today = 'gross'. Exec-controlled per role.

### 7.8 One-off payments column-per-role for v1 — confirmed

Each new role adds two columns to `oneoff_payments`: `assigned_<role>_id` (uuid) and `<role>_commission_rate` (numeric). Side-table refactor stays deferred.

### 7.9 Team-lead override role-agnostic — confirmed

`team_lead_override_pct` stays as a cross-role rate. No per-role TL rates. The TL UI (§7.5) sets one rate per TL, applied to whatever role each report is.

### 7.10 Override form update scope is Phase F — confirmed

The `RepOverridesPanel` shipped 2026-06-03 writes the legacy AE/CSM-named columns. Phase F generalizes labels by role and shifts writes to the new `override_*` columns. Backward compatibility maintained by Option Ω in §2 (additive columns alongside legacy ones).

### 7.11 Audit log extended — confirmed

Phase A SQL must add audit triggers to:
- `commission_roles`
- `commission_customer_engagements`
- `commission_cohorts` (new — see §8)

Same trigger pattern as the existing one on `commission_rep_overrides` at `src/07-rep-overrides-migration.sql:125-160`. All three new tables route into the shared `commission_audit_log`.

---

## 8. Cohort-based rates (new — 2026-06-04)

A fourth rate-source: commission rate can vary by the **customer's first-payment cohort**.

### Motivating example

"All customers whose first Stripe payment lands on/after 2026-01-01 earn Initial CC at 12% (instead of 10%)" — used when pricing or commission plans change on a date boundary, applied without backfilling per-customer overrides.

### Proposed schema

```sql
CREATE TABLE commission_cohorts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key                 text NOT NULL REFERENCES commission_roles(role_key) ON UPDATE CASCADE,

  -- Cohort window — customers whose firstCashMonth falls in [cohort_start, cohort_end)
  cohort_start             date NOT NULL,            -- inclusive
  cohort_end               date,                     -- exclusive; NULL = open-ended

  -- Rate overrides for this cohort. NULL = inherit from next precedence level.
  initial_cc_pct           numeric(5,4),
  residual_pct             numeric(5,4),
  residual_months_cap      integer,

  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (role_key, cohort_start)
);

CREATE INDEX idx_cohorts_role_window ON commission_cohorts (role_key, cohort_start);
```

### How the engine consults cohorts

Given a (customer, role) pair and a month `m`:
1. Compute `firstCashMonth = findFirstCashMonth(customer)`.
2. Find the cohort row matching `role_key = role.role_key AND cohort_start <= firstCashMonth AND (cohort_end IS NULL OR firstCashMonth < cohort_end)`.
3. If a cohort matches and has non-NULL rate columns, those rates participate in the precedence chain (see §9.1 — precedence still undecided).

### What cohort does NOT affect

- The cap **anchor** stays as `engagement_date` (per-customer, per-role). Cohort can override the cap **length** (months value) but not the anchor.
- `findFirstCashMonth` detection unchanged. Cohort uses it as input.
- Customers whose `firstCashMonth` falls outside any cohort window: no cohort applies, existing precedence (per-rep override → role default) runs.

### What cohort enables

- New plans launching on a date boundary, applied automatically without backfilling per-customer overrides.
- A/B testing different rates against different customer batches (`cohort_end` caps the window).
- Retroactive cohort definitions (`cohort_start` in the past) — but this raises the retroactivity question (see §9.3).

---

## 9. NEW open questions (created by the 2026-06-04 resolutions)

These need decisions before Phase E (the engine flip). Phases A through D can proceed without them.

### 9.1 Cohort vs. per-rep override vs. role default — precedence

When a customer falls in a cohort AND the rep has a per-rep override AND the role has a default, which rate wins?

Four candidate orderings:

| Order | Reasoning | Implication |
|---|---|---|
| **Cohort > Rep override > Role default** | Customer-attribute-driven plans (cohorts) are typically business-policy decisions; they should override individual rep arrangements. | A rep raise via override is silently undone for cohort customers — possibly surprising. |
| **Rep override > Cohort > Role default** | An exec explicitly set the rep's rate for a reason. That intent should beat a broad cohort. | A new cohort rate doesn't apply to reps who have any override at all — possibly too narrow. |
| **Highest-rate-wins** | Whichever yields the most commission. Reduces fairness disputes. | Disconnects from intent. A typo in either could silently inflate paychecks. |
| **Most-specific-wins** | Customer-and-role-specific (engagement-level override, if we ever add one) > customer-cohort-specific > rep-specific > role default. Cleanest theoretical model. | Requires us to define "specificity" rigorously. May not match operational mental model. |

**Pick one before Phase E.** The cohort table can be empty until then, so this doesn't block Phases A-D.

### 9.2 House interaction with the "needs an AE" nag list

Resolved in §7.4: a House engagement satisfies the slot and the customer disappears from the AE nag list. Confirm by inspection of UI behavior, not just code:
- A customer Mark closes (so AE = House) should appear nowhere on the AE nag list ✓ (by design).
- The same customer's CSM slot, if unassigned, **should** still appear on the CSM nag list (slots are independent) ✓ (by design).
- Open question: do we want a separate "House count" display on the exec dashboard? "X customers are AE-House this year" might be useful for tax/comp planning but isn't Phase 5 critical.

### 9.3 Cohort retroactivity

If an exec creates a cohort with `cohort_start = 2025-01-01` today, the dashboard will retroactively recompute Q1–Q3 2025 commission on the next page load (the engine reads cohorts at render time, no caching).

Three options:
- **Full retroactivity:** clean math, but historical display changes for cycles that may already have been paid. Confusing for paid-out reps.
- **No retroactivity:** cohort only applies to months from cohort creation forward. But then `cohort_start` is misleading as a field name (it's not the cohort's customer-membership window, it's the cohort's effective-payout window).
- **Middle ground:** cohort applies to unpaid months from cohort creation forward, with `commission_audit_log` flagging any displayed historical change.

This is a paycheck-trust question. Defer to Mark.

### 9.4 TL management UI scope (Phase F)

§7.5 added an explicit TL management UI. Open sub-questions:
- Keep `profiles.manager_id` as the source of truth (Option α), or introduce `commission_tl_reports` (Option β)?
- Should the TL override rate be settable per-(TL, report) pair, or just per-TL? Today it's per-TL.
- Should rotation of reports be effective-dated (e.g. "Mason was Heather's report 2025-06 through 2026-03, then moved")?

Realistically deferrable to Phase F design. Flagging for visibility.

### 9.5 House engagement and one-off payments

A House engagement for AE means "no AE commission" for that customer. But the one-off form lets an exec assign a rep to a one-off charge for that customer. Should the form refuse to assign an AE one-off when AE is House?

**Recommendation:** **refuse, with a warning that explains.** House should be definitive across both subscription and one-off paths for that role. If the exec wants the one-off to pay an AE, they need to flip the engagement off-House first (or the one-off form treats House as a hard block — your call).

### 9.6 Override form during the transition

The `RepOverridesPanel` shipped 2026-06-03 with hardcoded "AE Initial CC rate" / "CSM residual rate" labels writing to legacy columns. During Phases A-E (additive + shadow + flip), the form should keep working untouched. Phase F generalizes labels.

Open: should the form, post-Phase F, be a different visual layout (one tab/section per role's reps), or stay as-is (one rep at a time, role inferred)? Recommend: stay-as-is. Each rep has one role; the form auto-fills labels from that role.

---

## Summary — what's locked, what's still open

**Locked for Phase A (the schema + seed + backfill SQL):**
- All 11 of §7's resolved decisions
- §7.4's per-role-per-customer House model (with `is_house` boolean on engagements)
- §8's cohort table schema (rates, but precedence rules unfilled)
- §7.11's audit trigger extension to 3 new tables

**Open before Phase E (the engine flip):**
- §9.1 cohort/override/default precedence (the big one — affects every paycheck once cohorts have rows)
- §9.3 cohort retroactivity policy

**Open before Phase F (the UI phase):**
- §9.4 TL management UI shape (α vs β, per-pair rates, effective dating)
- §9.5 House × one-off form interaction (refuse with warning recommended)
- §9.6 override form visual layout post-flip

**Open at any time (low risk to defer):**
- §9.2 "House count" exec dashboard display

Phase A becomes a single SQL file: schema for `commission_roles`, `commission_customer_engagements`, `commission_cohorts`; seed AE + CSM matching today's behavior; backfill engagement rows from `commission_customers.start_date`; extend audit trigger. No engine code, no UI. Independently verifiable via the queries in §5.

---

## Appendix — exact line-number index of what changes vs what doesn't

### Engine fork sites that go away (replaced by role-driven loop)

- `commissionEngine.js:361` — `const ae = isAE(rep, repList);` → looked up from `roles[]`
- `commissionEngine.js:399-401` — cap selection by `ae` → cap from `role.residual_months_cap`, anchored to engagement_date
- `commissionEngine.js:403-417` — if/else AE/CSM math → single role-driven helper
- `commissionEngine.js:451` — same pattern in `calcRepCommissionByCustomer`
- `commissionEngine.js:478-490` — same pattern
- `commissionEngine.js:526` — same in `calcRepCommissionByCustomerByMonth`
- `commissionEngine.js:574-591` — same
- `commissionEngine.js:864` — same in `calcOneoffCommissionByRep`
- `commissionEngine.js:870-871` — assignment column hardcode → `o[role.oneoff_assigned_text_column]`

### Engine paths that DO NOT change

- `findFirstCashMonth` (`commissionEngine.js:263-279`) — purely cash-driven, no role logic.
- `combinedCash`, `cashForCommissionMonth`, `reversedCash`, `netCashForResidual` (`commissionEngine.js:248-305`) — all role-agnostic helpers, stay verbatim.
- `resolveAssignment` (`commissionEngine.js:310-318`) — currently returns `{ ae, csm }`. After Phase G it might return a richer object, but `resolveAssignment(...)[role.assignment_column]` works on both shapes.
- `calcAccelerator` (`commissionEngine.js:717-737`) — AE-tied today but the math is YTD-and-target. Stays role-agnostic; just keyed off the AE role's results. (Or could be generalized to per-role accelerators later.)
- `monthDiff`, `monthLabel`, `addMonths` — pure date helpers, no change.
- Formatters (`fmtMoney`, `fmtPct`) — no change.
- `parseStripeCSV`, `projectCustomers` — no change.

### Data paths that DO NOT change

- `commission_customers` table — `start_date` keeps its narrow meaning (first-cash anchor for `initial_cash_override`; calendar "started" date).
- `oneoff_payments` table v1 (post-B2 with UUID columns) — column shape per role until/unless we restructure later.
- `commission_audit_log` — extended (new tables) but its shape unchanged.
- `commission_config` (the single jsonb row at id=1) — unchanged. Becomes the fallback when a role has no per-rep override AND `commission_roles` doesn't override the default.
- `useCommissions` hook — gains two new fetches (Phase B), no logic changes to existing data.

### Files that need to be touched eventually

| File | Phase | Why |
|---|---|---|
| `src/commissionEngine.js` | C, E | Add v2 functions, then flip consumers |
| `src/useCommissions.js` | B | Fetch new tables |
| `src/CommissionsView.jsx` | D, E, F | Shadow-mode wiring, flip, UI relabels |
| `src/CommissionsTab.jsx` | E, F | Flip personal view to v2, relabel |
| `src/teams.js` | F, G | Add new role_type values per new role |
| `src/RepOverridesPanel` (in CommissionsView.jsx) | F | Generalize labels by role |
| New SQL migrations | A | Schema + seed + backfill |

That's the full surface. Engine refactor is contained to one file; UI is the bigger work; new role onboarding is a 5-minute SQL + admin-form workflow once Phase G lands.

---

*Doc written 2026-06-03 as part of the Phase 5 design pass. No code changes were made during writing.*
