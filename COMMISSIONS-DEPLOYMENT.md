# Commission Tracker — Deployment Guide

This package adds a full Commission Tracker to the Atlas internal scorecard app.

## What you get

**4 new source files** in `src/`:
- `commissionEngine.js` — pure calculation functions (no React/Supabase)
- `useCommissions.js` — React hook with real-time subscriptions
- `CommissionsView.jsx` — top-level view (Overview/Customers/By Rep/What-If/Annualize/Data/Settings)
- `CommissionsTab.jsx` — personal tab for AE/CSM scorecards (read-only)

**2 SQL files** in `sql/`:
- `01-commissions-migration.sql` — 4 tables, RLS policies, audit log triggers
- `02-commissions-seed.sql` — 530 customers + 120 existing CSM assignments + 23 unmatched entries + default config

**1 Edge Function** in `supabase/functions/stripe-sync/`:
- `index.ts` — pulls Stripe customers + subscriptions, computes monthly MRR, upserts

**3 App.jsx patches** (described below — apply by hand)

---

## Step 1 — Database migration (5 min)

In Supabase SQL Editor:

1. Paste **`01-commissions-migration.sql`** in full → Run.
   Should report 4 tables created, RLS enabled, helper functions installed.
2. Paste **`02-commissions-seed.sql`** in full → Run.
   Should report ~530 customers inserted, ~120 assignments, ~23 unmatched.
3. Sanity-check (optional):
   ```sql
   SELECT COUNT(*) AS customers FROM commission_customers;       -- expect 530
   SELECT COUNT(*) AS assignments FROM commission_assignments;   -- expect 120
   SELECT COUNT(*) AS unmatched FROM commission_unmatched;       -- expect 23
   SELECT settings FROM commission_config WHERE id = 1;
   ```

---

## Step 2 — Deploy the Edge Function (15 min, can defer)

You don't need to do this immediately — the seed gives you a working app with 530 customers as of May 12, 2026. When you're ready to enable live Stripe sync:

```bash
# Copy the function into your repo at:
#   supabase/functions/stripe-sync/index.ts

# Install Supabase CLI if you haven't:
npm install -g supabase

# Login + link to your project:
supabase login
supabase link --project-ref <your-project-ref>

# Deploy:
supabase functions deploy stripe-sync

# Set your Stripe secret key (this is the ONLY place it lives — never in client code):
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
```

After that, the "Sync from Stripe now" button on the Data Sync tab will work.

---

## Step 3 — Add source files (2 min)

Drop these into your repo:

```
src/commissionEngine.js
src/useCommissions.js
src/CommissionsView.jsx
src/CommissionsTab.jsx
```

If `papaparse` isn't already installed, add it:
```bash
npm install papaparse
```

---

## Step 4 — Patch `App.jsx` (5 min)

Three small edits. The patches assume the structure described in `CLAUDE.md`.

### 4a. Add the import

Near the other view imports:
```jsx
import CommissionsView from './CommissionsView'
```

### 4b. Add the route

In the `App()` component, alongside the other `viewMode` checks (`'feature_requests'`, `'integrations'`, etc.), add:

```jsx
if (viewMode === 'commissions') {
  return (
    <CommissionsView profile={profile} onSignOut={handleSignOut} />
  )
}
```

### 4c. Add the nav entry

In whatever component renders the view-switcher (likely `ScorecardShell.jsx` or wherever you have the Manager view / Feature Requests / Integrations buttons), add a "Commissions" entry conditional on access tier:

```jsx
import { accessTier } from './teams'
// ...
const tier = accessTier(profile)
const canSeeCommissions = tier === 'executive' || tier === 'team_lead'
// ...
{canSeeCommissions && (
  <button onClick={() => setViewMode('commissions')}>
    Commissions
  </button>
)}
```

The Commissions view itself further gates Settings to executives only (Q config changes are exec-only via `is_commission_executive()` RLS).

---

## Step 5 — Add the personal tab to AeView and CsmView (5 min)

In `src/AeView.jsx`:

```jsx
import CommissionsTab from './CommissionsTab'
// ...add 'commissions' to your tab list...
const tabs = [
  // existing tabs...
  { id: 'commissions', label: 'My Commission' },
]
// ...in the render switch:
{tab === 'commissions' && <CommissionsTab profile={profile} />}
```

Same pattern in `src/CsmView.jsx`. The component is fully self-contained — it scopes to the user's own data by matching `profile.name` first-token to `assignments.ae/csm` (e.g., "Matt Johnson" → 'Matt').

**Important**: this only works if Heather/Mason/Matt/Sean/Noah's Atlas profile `name` field starts with their first name as it appears in the assignment data. If their profile name is "Matthew" but the assignment data has "Matt", they won't see their own data. Check this in your profiles table.

---

## Step 6 — Test (5 min)

1. As an executive, sign in. Click the Commissions nav entry. You should see:
   - 530 customers in Overview
   - 120 existing CSM assignments visible
   - Per-rep YTD numbers populated
   - 197 AE-era customers flagged as needing AE assignment
2. Pick a customer on the Customers tab, assign an AE. Reload — assignment should persist.
3. As Matt (team lead, CSM), sign in. You should see:
   - The Commissions nav entry (because team_lead)
   - In the full view: only your team's customers visible (RLS filter)
4. As Matt's personal scorecard tab (My Commission): only your assigned customers, read-only.
5. Hit "Sync from Stripe now" on Data Sync (only works if Edge Function is deployed and `STRIPE_SECRET_KEY` is set).

---

## Architecture notes

- **Assignments survive re-sync**: the Edge Function upserts customers by `stripe_customer_id`. Assignments are keyed by `stripe_customer_id` too, so they don't get duplicated or lost when Stripe data refreshes. The fallback email-match is handled by the Edge Function: if it finds an assignment with no `stripe_customer_id` but a matching email, it fills in the ID. (See "Reconcile assignments" block in `index.ts`.)
- **RLS**: members only see customers they're attributed to; team leads see their team's; execs see everything. The `is_commission_manager()` and `is_commission_executive()` SQL functions are the single source of truth.
- **Realtime**: changes to assignments propagate to all open browsers via Supabase realtime (already enabled in the migration via `ALTER PUBLICATION supabase_realtime ADD TABLE ...`).
- **Audit log**: every assignment change is logged automatically by a trigger. Execs can `SELECT * FROM commission_audit_log` for compliance.
- **No client-side Stripe key**: the secret lives only in `STRIPE_SECRET_KEY` env var on the Edge Function. The browser invokes the function, which uses the user's Supabase JWT to verify they're a manager before touching Stripe.

---

## Known gotchas

1. **Name matching for the personal tab**: as above — if your team's profile names don't match the rep names in the data ("Matt" vs "Matthew", "Heather" vs "Heather Smith"), they won't see their own commission. Two fixes: edit their profile name to match, OR add a `commission_rep_name` column to profiles with the explicit mapping.

2. **The seed data is a May 12, 2026 snapshot.** Until you deploy the Edge Function and run a sync, the data will be stale. Click "Sync from Stripe now" once a month minimum.

3. **The 23 unmatched CSM-tracker entries**: these are customers in Matt/Sean/Noah's trackers but not in Stripe. They're surfaced on the Data Sync tab so you can reconcile. Most likely they're either onboarding (paid invoice not yet generated) or churned before payment.

4. **Pagination cap on Stripe**: the Edge Function paginates up to 20,000 records (200 pages × 100). If you ever exceed that, increase the limit in `stripePaginate()`.
