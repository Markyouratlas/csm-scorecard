# CLAUDE.md

This file provides guidance to Claude when working with code in this repository. **Read this entire file before suggesting changes.** It captures architectural decisions and current state that aren't obvious from the code alone.

## Project at a glance

Atlas internal scorecard app — weekly per-role data entry, a manager/exec roll-up, and the Atlas Odyssey executive dashboard (real-data + prototype variants). Single-page Vite + React + Supabase. Lives at **scorecard.youratlas.com**.

The product is shipped and used by the team. There is one branch — `main` — and it deploys to production on every push. There is no staging.

## Commands

```
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Production build → dist/
npm run preview      # Preview the production build locally
```

There is no test runner, linter, or formatter configured. Don't suggest commands that don't exist.

Environment variables (required at build/dev time) — put in `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The app deploys to Vercel; the same two env vars must be configured in the Vercel project. Schema changes live in `supabase-*.sql` files at the repo root — these are pasted by hand into the Supabase SQL Editor, not run by a migration tool. The relevant migration files are `supabase-setup.sql` (initial schema), `supabase-testimonials-migration.sql`, and `supabase-atlas-targets-migration.sql` (Odyssey targets + 7-month backfill).

## Deploy / branch model

- `main` is production. Push = deploy. Vercel builds from `main` and serves at csm-scorecard-gamma.vercel.app (Vercel URL) and **scorecard.youratlas.com** (the custom domain).
- For non-trivial work, use a feature branch and Vercel will auto-deploy a preview URL on every push. Merge to main only when the preview looks right.
- `vercel.json` exists at the repo root and pins the install command to `npm ci --force`. **Do not delete it** — it's the workaround for a node_modules permission bug we hit during the visual upgrade.
- `node_modules/` is in `.gitignore`. Do not commit it. (We had to surgically remove a previously-committed copy that was breaking Vercel; the fix is in commit `be1f51f`.)

## User mental model (important context)

The repo owner (Mark) is non-technical. Translate technical jargon into product terms when explaining. He works in PowerShell on Windows. When suggesting commands, use Windows-friendly paths (`C:\Users\markp\csm-scorecard\`) and assume he'll run things one at a time via the terminal, not in scripts.

Workflow he is comfortable with:
1. Download files Claude generates
2. Drop them into `C:\Users\markp\csm-scorecard\src\` (or appropriate subfolder)
3. `git status`, `git add .`, `git commit -m "..."`, `git push`
4. Watch Vercel build, test on the deployed URL

He is NOT comfortable with: editing files directly via terminal, npm script changes, or anything that requires installing new global tooling. Stay within the existing toolchain.

## Architecture

Single-page Vite + React 18 app backed by Supabase (auth + Postgres + Storage). No router — view selection is a `viewMode` state machine in `src/App.jsx`, hydrated from `sessionStorage` so it survives reloads and tab switches.

### Routing model (`src/App.jsx`)

`App` resolves the rendered screen from three inputs:
1. `profile.team` + `profile.role_type` — which scorecard component to render in "self" mode.
2. `accessTier(profile)` from `src/teams.js` → `'executive' | 'team_lead' | 'member'` — gates manager-only and exec-only views.
3. `viewMode` string in sessionStorage (`atlas:viewMode`): `'self' | 'manager' | 'feature_requests' | 'integrations' | 'cancellations' | 'api_guide' | 'leadership'`.

**Auto-landing on login** (added late 2026): Members → `self`, team leads → `manager`, executives → `leadership`. This only applies on first session load; subsequent navigation respects whatever the user clicked.

`PersonalScorecard` (at the bottom of `App.jsx`) is a `switch` on `role_type` that picks one of the per-role view components (`CsmView`, `AeView`, `GrowthView`, etc.). **Adding a new role** means three coordinated edits: add it to `TEAMS` in `src/teams.js`, create `XxxView.jsx`, and add a `case` in `PersonalScorecard`. Leadership roles (`ceo`, `coo`, `cto`, `cfo`, `vp`, `other`) intentionally have no scorecard — they're routed to `LeadershipPendingView` until an exec promotes them.

### Access tiers (`src/teams.js`)

`accessTier(profile)` is the single source of truth for permissions. It checks both `profile.role` (legacy column, `'executive' | 'manager' | 'member'`) **and** `profile.role_type` (newer column carrying the job role) because the schema evolved through migrations and old rows still exist. Don't add a third permissions path — go through `accessTier`.

`is_team_lead` boolean grants team-scoped manager view. First user to sign up gets `role='executive'` automatically (see `AuthScreen.jsx`).

### Per-role scorecard data

Each role has a "blank week" factory in `src/roleConstants.js` (or `src/constants.js` for the original CSM shape). These define the shape stored in `weekly_scorecards.data` (jsonb). The `useScorecard` hook in `src/useScorecard.js` is generic — every role view calls it with `(userId, propWeekKey, BLANK_FACTORY)` and gets back loading state, week navigation, debounced auto-save (800ms), and submit/unsubmit. Most days are stored as a 7-element array indexed by JS `getDay()` (0=Sun..6=Sat); the view filters down to the user's `work_days` for display.

**Week submission and locking**: `weekly_scorecards.submitted_at` is set by `submit()`. A week is only `isLocked` after it stops being the current week — during the current week the user can unsubmit and re-edit freely. Auto-save is skipped when locked.

The `useScorecard` call has a dual-mode pattern: when called by a user viewing their own scorecard, `propWeekKey` is undefined and the hook owns week navigation; when called from `ScorecardViewer` (an exec drilling into someone else's scorecard), `propWeekKey` is a concrete string and `setWeekKey` becomes a no-op. Preserve this when extending.

### Leadership Dashboard — three-mode display

`LeadershipDashboardView.jsx` is the executive landing page. It has a 3-button mode picker in the header:

- **Odyssey** (default on every load) → renders `OdysseyView.jsx`. Real Supabase data shaped like the Atlas Odyssey prototype.
- **Live data** → renders the original `DashboardBody` (uses `useExecutiveMetrics`).
- **Prototype** → renders `AtlasOdysseyPrototype.jsx` with sample data, labeled as a design preview.

Mode never persists — every page load starts on Odyssey. The two display-only modes are kept so designers + execs can compare actual data against the "what it could look like" design.

### Odyssey tab (`OdysseyView.jsx` + `useOdysseyMetrics.js` + `useAtlasTargets.js`)

The newest and most active part of the codebase. Five sub-tabs:

1. **Executive** — annual goals (Total MRR + Customers + LTV:CAC + Gross Margin + NRR), Strategic Initiatives, OKRs placeholder, unit economics row. The MRR hero is a single unified card with monthly trajectory chart + 3 inline sub-stats (Customers / ARPU / MRR Target), matching the prototype's visual treatment.
2. **Atlas Odyssey (weekly)** — Marketing / Sales / CS / Product / Growth scorecards. Real this-week + 8-week trend data per metric. Each metric card is clickable to open the target edit modal.
3. **Daily Pulse** — today's totals across roles. Pulls from `weekly_scorecards.data.daily[dayIdx]` where `dayIdx` is the current `Date().getDay()`. Some role tables don't track daily granularity (CS, Engineering, Support) — those metrics show "Awaiting Daily logging" badges.
4. **Quick Log** — a directory of role cards that route to that role's scorecard view via `onSwitchToScorecard`.
5. **Tracking Guide** — static documentation listing every data source (live or awaiting) and what metrics it feeds.

**Two hooks back this tab:**

- `useOdysseyMetrics` — pulls 8 weeks of `weekly_scorecards`, computes today's daily totals, this-week + this-month rollups, and 8-week sparkline arrays. Returns `awaiting` map noting which metrics need external integrations.
- `useAtlasTargets` — fetches the `atlas_targets` table (described below), exposes `getMonthValue / getLatestActual / getAnnualTarget / getMonthHistory / save`. Returns a normalized shape (`{[metricKey]: {[YYYY-MM]: {actual, target, source, updatedAt}}}`).

Most metric cards in Odyssey accept a `metricKey` + `openModal` prop pair. When both are present, the card becomes a button that opens `TargetEditModal.jsx`. Cards without `metricKey` are display-only.

### Target edit modal (`TargetEditModal.jsx`)

Opens on click of any clickable metric card. Shows:
- Big current-month actual + editable target (top section)
- Awaiting-source banner if the actual comes from an external system not yet wired
- Sparkline + line chart of actual vs target over all months we have history for
- Scrollable history table with **inline target editing per row** (click any target cell → it becomes an input → Enter or check button saves → row flashes green)
- Optional notes field (current month only)

Only `accessTier === 'executive'` users see the Save controls. Everyone else sees read-only display. RLS in Supabase enforces the same.

Inline saves write directly to `atlas_targets` via `useAtlasTargets.save()`. The top "current month" target field and the inline rows stay in sync — saving one updates the other.

### `atlas_targets` table — the editable monthly targets + manual actuals

```
atlas_targets (
  id uuid pk,
  metric_key text,        -- e.g. 'total-mrr', 'arpu', 'sales-calls-booked'
  month_key date,         -- always first-of-month (YYYY-MM-01)
  actual_value numeric,
  target_value numeric,
  actual_source text,     -- null, 'manual', 'manual_backfill', 'stripe', 'profitwell', etc.
  notes text,
  updated_at, updated_by,
  unique(metric_key, month_key)
)
```

Seeded with **27 months of data** from a one-time spreadsheet import (see `supabase-atlas-targets-migration.sql`):
- **7 months of historical actuals** Nov 2025 → May 2026 (`actual_source='manual_backfill'`)
- **20 months of forward MRR/ARPU/customer/calls targets** Jun 2026 → Dec 2027 (forward targets)

Re-running the migration is safe — it uses `coalesce(...)` so user edits to `target_value` are never clobbered by re-seed.

**Metric catalog** — `METRIC_CATALOG` constant in `useAtlasTargets.js` is the source of truth for which `metric_key`s are recognized + their display format + their description + their awaiting-provider label. Add a new metric → add to this catalog + (probably) add a row to the seed.

When Stripe / ProfitWell / Amplitude / HubSpot integrations come online, they should write to this same table with their own `actual_source` value. The Odyssey UI doesn't care where the data came from — it just reads `actual_value`. So future integrations are **fill in actuals, don't rebuild UI**.

### Manager / Leadership views (other than Odyssey)

- `ManagerView.jsx` — exec or team-lead dashboard. Execs see all teams; leads see only `profile.team`. Drills into `ScorecardViewer` to read any user's week.
- `LeadershipDashboardView.jsx` — exec-only roll-up across the whole company (described above).
- `SharedPagesView.jsx` — feature requests, integrations, cancellations pages (last is gated to executives + CS + FDE).
- `ScorecardShell.jsx` — common header/footer chrome (logo, submit footer, view-switcher buttons) used by every personal scorecard.

### Data model (see `supabase-setup.sql` and migrations)

- `profiles` — one row per `auth.users` row. Columns include `name`, `team`, `role_type`, `role`, `is_team_lead`, `work_days`, `color`.
- `weekly_scorecards` — `(user_id, week_key)` unique. `week_key` is the Monday of the week as `YYYY-MM-DD` (see `getWeekKey` in `src/dateUtils.js`). `data` is jsonb shaped by the role's blank factory.
- `monthly_scorecards` — month-level inputs (NRR, NPS, CAC) keyed by `month_key` `YYYY-MM`. Used by `useMtdData`.
- `metric_targets` — role defaults (`user_id IS NULL`) plus per-user overrides. `useTargets` merges them with overrides winning. **Distinct from `atlas_targets`** — that's the Odyssey monthly targets table.
- `atlas_targets` — described above. Powers OdysseyView + TargetEditModal.
- `cancellations` — customer cancellation log. Used by Odyssey monthly rollups.
- `testimonial_candidates` + `testimonial-videos` storage bucket — added by `supabase-testimonials-migration.sql`.

RLS: users read/write their own rows; managers/executives read across the team. Some policies still check the legacy `role = 'manager'` column rather than `accessTier` — if you add a new policy, mirror the existing pattern in the same migration file rather than inventing a new one. For `atlas_targets`, write access is restricted to executive tier via dedicated policies in the targets migration.

### Visual system

Tailwind utility classes plus a hand-written design system inline in `src/App.jsx` (the `<style>` block inside `Shell`). The "Liquid Glass" navigation chrome (`.glass-nav`, `.glass-tab`, `.glass-modal`) is composed from backdrop-filter blur, gradient tints, and an SVG displacement filter defined once at the top of `Shell`. There are explicit fallbacks for `prefers-reduced-transparency`, `prefers-contrast: more`, and `prefers-reduced-motion` — preserve them when adding new glass surfaces. `useGlassInteraction` (in `src/hooks/`) wires the pointer-tracked highlight on these surfaces.

Atlas Odyssey + Odyssey view use a different visual language than the legacy live dashboard:
- **Brand purple** `#6639A6` is the primary throughout
- **Display font**: Instrument Serif (the big numbers, hero titles)
- **Body font**: Manrope
- **Mono**: JetBrains Mono (eyebrows, mono-text class for tabular numbers)

Don't import or use Inter, Roboto, or system defaults. Fonts (Instrument Serif + Manrope + JetBrains Mono) are loaded from Google Fonts inside `Shell` rather than a global `<link>` — keep them there so the auth screen also picks them up.

## Awaiting integrations (the roadmap-in-the-UI)

Many metrics in Odyssey show "Awaiting [Provider]" badges instead of values. These are the planned integrations, in roughly the right order of business value:

- **Stripe** → Total MRR, Total Customers, ARPU, Net New MRR/Sales, MRR Churned, daily cash collected
- **ProfitWell** → LTV:CAC, CAC payback, Gross Margin, NRR, cohort churn
- **Amplitude (or product analytics)** → Trial → Paid %, User Activation Rate, User Adoption Rate
- **HubSpot / CRM** → Partner pipeline, partner-sourced opps, partner calls
- **OKR system** (Asana goals / dedicated OKR tool / new table) → Quarterly OKR progress + ownership

When wiring any of these, the contract is: write `actual_value` to `atlas_targets` with your integration's `actual_source` label. The UI auto-updates. Don't replace existing components — the awaiting badges go away automatically once `actual_value` is populated.

The Tracking Guide tab in Odyssey is the user-facing version of this list.

## Patterns to follow

- **Prefer extending the existing pattern over inventing a new one.** Several things in this codebase look slightly inconsistent because they evolved through migrations (the `role` / `role_type` dual columns, the legacy `metric_targets` vs the new `atlas_targets`). Resist the urge to "clean these up" without an explicit reason — they're load-bearing for backward compatibility.
- **Single-file React components.** Each view is its own file. Don't refactor into a folder-of-files architecture.
- **Tailwind utility classes + inline `<style>` blocks for scoped CSS.** No CSS modules, no styled-components.
- **No new dependencies without asking.** The toolchain is intentionally small: React, recharts, lucide-react, papaparse, canvas-confetti, three (for one effect), tone, lodash, and the Supabase client. Adding more requires justification.
- **No localStorage / sessionStorage in artifacts/components, unless mirroring the existing `atlas:viewMode` pattern in App.jsx.** Supabase is the source of truth.
- **Auth + RLS, not client-side gating.** Even though `accessTier` gates UI in components, every Supabase policy must independently enforce who can read/write what. If you add a new table, write its RLS policies in the same migration.

## Files you should read first if you're new to the codebase

In this order, for a complete mental model:

1. `src/App.jsx` — routing, auth, the Shell + global styles
2. `src/teams.js` — `TEAMS` config, `accessTier`, role taxonomy
3. `src/OdysseyView.jsx` — the new executive dashboard (50KB, the biggest single file)
4. `src/hooks/useAtlasTargets.js` — the data hook that powers Odyssey targets
5. `src/TargetEditModal.jsx` — the click-to-edit modal
6. `supabase-atlas-targets-migration.sql` — schema + seed for the targets table
7. Any specific role view (e.g. `src/CsmView.jsx`) — to see the per-role scorecard pattern

## Known oddities and gotchas

- The old `atlas-dashboard-upgrade` branch was merged into main and then deleted. Don't be surprised it's not there.
- An old standalone prototype exists at github.com/Markyouratlas/atlas-odyssey — that's a separate Vercel project, kept for historical reference, NOT connected to this app's deploys.
- The "Prototype" mode in Leadership Dashboard renders `AtlasOdysseyPrototype.jsx`, which is a self-contained ~2500-line file with its own DataContext and sample data. It's intentionally siloed from the rest of the app — don't try to share state between it and OdysseyView.
- `useOdysseyMetrics` returns null for many metrics that genuinely don't have data sources yet. The UI handles null gracefully via the awaiting map. Don't fill nulls with 0 — they have different meanings (0 = "the team did nothing this week", null = "we have no way to measure this yet").
- Daily granularity exists in `weekly_scorecards.data.daily[dayIdx]` for AE, Growth, and Ad Strategist roles only. CS, Engineering, Support, Implementation store week-level totals. The Daily Pulse tab handles this asymmetry with "Awaiting Daily logging" badges where appropriate.
- The numbers on the Atlas Odyssey weekly tab can look slightly different from the legacy "Live data" tab. That's expected — Odyssey pulls historical actuals from `atlas_targets` (which were backfilled from a spreadsheet), while Live data computes from raw `weekly_scorecards` only. Once Stripe is wired, both will converge.

## What's NOT done yet (the obvious next work)

- Stripe integration — see Awaiting integrations above
- ProfitWell integration
- Amplitude (or another product analytics tool) integration
- HubSpot integration for partner pipeline metrics
- OKR tracking — needs a decision on the tool/table first
- Daily granularity for CS metrics (currently weekly-only)
- A scheduled job to refresh `atlas_targets.actual_value` from integrations (when they exist) without overwriting manual edits

If the user asks you to start any of these, expect to write both a Supabase migration AND the integration code. The `atlas_targets` table is the integration target for all of them.
