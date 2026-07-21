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

The repo owner (Mark) is non-technical. Translate technical jargon into product terms when explaining. He works in PowerShell on Windows. Use Windows-friendly paths (`C:\Users\markp\csm-scorecard\`).

### Division of labor (current — updated 2026-07)

Claude does the hands-on work directly; Mark stays the reviewer + runs the few things that need his environment. Concretely:

- **Claude runs directly:** all file edits; git (`checkout -b` / `add <paths>` / `commit` / `merge` / `push` — including merge+push to `main`, which surfaces a one-tap approval prompt); and `supabase functions deploy <name>` (the Supabase CLI is installed, authed, and linked to project `ckobnzvgjeaxxgvmexaz` on Mark's machine). **Stage specific paths, never `git add .`** — the repo root has standing scratch files.
- **Mark runs (Claude hands him the exact command/steps):** pasting SQL migrations into the Supabase SQL editor (one labeled ```sql block at a time), `npm run build`, `supabase secrets set`, and any interactive login (`supabase login`, `vercel login`).
- **Standard feature loop:** Claude builds on a branch → Mark pastes the one SQL block (if any) → Claude deploys any edge function + pushes → Mark eyeballs the Vercel preview → Claude merges to `main`.

Public webhooks (dialer-*, attio-webhook, atlas-events-inbound, cal-booking-inbound, ghl-calls-inbound) must be deployed with `--no-verify-jwt` on **every** redeploy; signed-in-user functions (dialer-token, set-user-ban, atlas-handoff/send/start) deploy without it.

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

- `ManagerView.jsx` — exec or team-lead dashboard. Execs see all teams; leads see only `profile.team`. Drills into `ScorecardViewer` to read any user's week. Also hosts the **Roster** tab (below).
- **Roster (`RosterTab`/`RosterCard` in `ManagerView.jsx`)** — the team-management view (redesigned 2026-07). Access: **executives** (whole company) + **team leads** (own team only); members can't reach it. There's an access-explainer banner at the top. Members are a **compact single-column list grouped by team** (fixed order: Leadership → Sales → Marketing → FDE → CS → any other → **Investors last**), each row **click-to-expand** to reveal controls: edit role/team, make/remove lead, dialer number, make/demote exec, make investor, and an **exec-only Compensation field** (annual salary + "delivery labor" flag → `employee_compensation`; see the Gross/Operating Margin note). Controls row also has **Show scorecard previews** + **Show archived** (which opens an inline Archived panel). User lifecycle = **archive → ban → delete**, three distinct things: **Archive** (hide, keep data, can still sign in) from the card; **Revoke access / ban** (blocks sign-in via `set-user-ban`, auto-archives) from the card; and in the **Archived panel** each person has Restore (unarchive) *or* Restore-access (unban) + **Delete** (permanent). Delete + ban both use **centered portal confirmation modals** (not `window.confirm`). See the `profiles`/`employee_compensation` data-model notes.
- `LeadershipDashboardView.jsx` — exec-only roll-up across the whole company (described above).
- `SharedPagesView.jsx` — feature requests, integrations, cancellations pages (last is gated to executives + CS + FDE).
- `ScorecardShell.jsx` — common header/footer chrome (logo, submit footer, view-switcher buttons) used by every personal scorecard.

### Data model (see `supabase-setup.sql` and migrations)

- `profiles` — one row per `auth.users` row. Columns include `name`, `team`, `role_type`, `role`, `is_team_lead`, `work_days`, `color`, `archived_at`, `banned`/`banned_at`/`banned_by`, `channel_partner_enabled`, `tracks_channel_intros`, `twilio_number`, `ghl_user_id`, `email`. **`profiles` is world-readable** (`select using(true)`), so anything sensitive (e.g. salaries) must live in a separate exec-only table, NOT a profiles column.
  - **User ban (revoke sign-in)** — for departed staff. The real enforcement is the Supabase Auth ban (`banned_until` on `auth.users`), set by the **`set-user-ban`** edge function (JWT-on, exec-only) via `admin.auth.admin.updateUserById(id, { ban_duration })` (`'876000h'` ≈ permanent, `'none'` to unban). It also archives the profile + mirrors `profiles.banned` for the roster UI (badge + Revoke/Restore-access buttons; `src/26-user-ban.sql`). `App.jsx` signs out any `profile.banned` user on load as an instant client-side backstop (auth ban catches an active token within ~1h). Ban ≠ archive ≠ delete: archive hides (still can log in), ban blocks sign-in (data kept), delete wipes data.
- `weekly_scorecards` — `(user_id, week_key)` unique. `week_key` is the Monday of the week as `YYYY-MM-DD` (see `getWeekKey` in `src/dateUtils.js`). `data` is jsonb shaped by the role's blank factory.
- `monthly_scorecards` — month-level inputs (NRR, NPS, CAC) keyed by `month_key` `YYYY-MM`. Used by `useMtdData`.
- `metric_targets` — role defaults (`user_id IS NULL`) plus per-user overrides. `useTargets` merges them with overrides winning. **Distinct from `atlas_targets`** — that's the Odyssey monthly targets table.
- `atlas_targets` — described above. Powers OdysseyView + TargetEditModal.
- `cogs_line_items` + `cogs_config` — editable COGS inputs behind the Odyssey **Gross Margin** tile
  (`src/24-cogs-line-items.sql`). `cogs_line_items` = one row per infra vendor (`category='infra'`,
  amounts filled as invoices arrive) or delivery-labor person (`category='labor'`, `annual_amount` +
  derived `monthly_amount`). `cogs_config` = single row (`interim_infra_total` shown until all infra
  items entered, `headline_view` 'infra'|'loaded'). **RLS executive-only** (salaries). `src/hooks/useCogs.js`
  computes both margins vs the MRR single-source (`mrrStat.value`) and **writes the headline margin % into
  `atlas_targets['gross-margin']` (source 'finance')** so the Investor gauge (`useExecutiveStats.econ.grossMargin`
  → `InvestorView`) + both Odyssey tiles update with no extra wiring. UI: `src/GrossMarginModal.jsx`
  (COGS breakdown, opened via the tiles' `onBreakdownClick` in `OdysseyView` ExecutiveView).
- `employee_compensation` — per-employee salaries (`src/25-employee-compensation.sql`), **executive-only RLS**,
  keyed by `profile_id` (NOT on `profiles`, which is world-readable `using(true)` — a salary column there would
  leak). Entered on the **Roster** via an exec-only field on each `RosterCard` (`src/hooks/useEmployeeComp.js`
  → `setComp`). `counts_in_cogs` = the per-person "delivery labor" flag. Feeds `useCogs`: delivery-flagged
  salaries roll into **gross-margin** labor (still written to `atlas_targets['gross-margin']`); ALL salaries +
  infra + contractors + `cogs_config.other_opex_monthly` drive a **new Operating Margin** tile. **Operating
  margin is executive-only and is deliberately NOT written to `atlas_targets`** (that table is authenticated-read
  → would leak to investors); it's computed live in the Odyssey ExecutiveView tile + `GrossMarginModal` only.
- `cancellations` — customer cancellation log. Used by Odyssey monthly rollups.
- `fulfillment_clients` — the **Fulfillment** view (customer onboarding tracker, Asana/Jira-style: 12-stage
  board + KPI dashboard + master table + per-client drawer). Schema `src/27-fulfillment.sql` (flat 19 date
  cols, `wl jsonb` white-label config, stage/status CHECK constraints; **RLS: staff read/write, executives
  delete** — inlined to `accessTier`, NOT the `admin/super_admin`/`is_staff()` model the original handoff
  assumed, which doesn't exist here). UI: `src/FulfillmentView.jsx` (ported ~1:1 from
  `docs/fulfillment/atlas-fulfillment-tracker-light.jsx`, kept its self-contained zinc/Space-Grotesk look) +
  `src/hooks/useFulfillment.js` (fetch-on-mount, snake↔camel mapper, optimistic debounced persist,
  client-side stage auto-stamping). Assignee dropdowns (CSM/FDE, Implementation, CSA) come from **live
  profiles** (CS + FDE teams; `implementation` role); the drawer has in-app dialer buttons on `poc_phone`.
  Nav: it's a `viewMode` (`'fulfillment'`) with a `HeaderNav` button, **ungated** (all staff; investors are
  hard-routed away) — `onSwitchToFulfillment` is threaded through every HeaderNav/ScorecardShell-rendering view.
  - **Closed Won → Fulfillment routing** (`src/28-fulfillment-from-closed-won.sql`): a trigger on `ae_deals`
    (mirrors `trg_ae_deals_stamp_closed_at`) auto-creates a `fulfillment_clients` row (stage `pre`,
    `ae_deal_id` unique for idempotency) on transition to Closed Won, + a one-time backfill. `csm` starts blank;
    an exec/lead assigns the customer to a CS/FDE person in the Fulfillment view.
  - **CS/FDE "New customers from Sales" panel** (`CsHandoffPanel` in CsmView/FdeView) is now **per-person**:
    `useCsHandoffs(profile.name)` reads `fulfillment_clients WHERE csm = <my name>` (was the shared Closed Won
    `ae_deals` queue). Call/text + "Open in Fulfillment". The old `mark_cs_onboarded` RPC + `cs_onboarded_*`
    columns are now unused (left in place; onboarding state lives in the Fulfillment stages).
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
- **ProfitWell** → LTV:CAC, CAC payback, NRR, cohort churn  *(Gross Margin is now LIVE — computed from editable COGS + salaries, not ProfitWell; see the `cogs_line_items`/`employee_compensation` notes)*
- **Amplitude (or product analytics)** → Trial → Paid %, User Activation Rate, User Adoption Rate
- **HubSpot / CRM** → Partner pipeline, partner-sourced opps, partner calls
- **OKR system** (Asana goals / dedicated OKR tool / new table) → Quarterly OKR progress + ownership

When wiring any of these, the contract is: write `actual_value` to `atlas_targets` with your integration's `actual_source` label. The UI auto-updates. Don't replace existing components — the awaiting badges go away automatically once `actual_value` is populated.

The Tracking Guide tab in Odyssey is the user-facing version of this list.

## Integration data — schema sources of truth (READ THIS BEFORE PLANNING)

When planning any feature that touches data we sync from an external API (Stripe,
Cal.com, Meta, ProfitWell, or anything added later), establish the **real schema of
every table involved first**. Do **not** infer a table's columns from a React hook's
`.select(...)` — hooks routinely select a small subset. (A real bug from this: an
explore pass read `useCalBookings` (5 columns) and wrongly concluded `cal_bookings`
had no host/attendee info, when the table actually has 23 columns including
`host_email`, `attendee_name`, `attendee_email`.)

For each relevant table, read the **source of truth**, in this order:
1. The **migration SQL** that creates it (root `*.sql` / `supabase-*.sql`).
2. The **`supabase/functions/<provider>-sync/index.ts`** edge function that writes it
   — its row-mapping object (e.g. cal-sync's `mapBooking`) lists every column we
   actually populate, which is the most complete picture.
3. Confirm against the live DB in the Supabase SQL editor:
   `select column_name, data_type from information_schema.columns where table_name = '<table>' order by ordinal_position;`

Only plan against the full, confirmed column list.

**Where each integration's data lives (sync function → tables, schema files):**
- **Stripe** → `stripe-sync` writes `commission_customers` (incl. `subscriptions`
  jsonb, `monthly_mrr`, `monthly_cash_received`) and `oneoff_payments`. Related:
  `manual_revenue` (wire/ACH), `commission_assignments` (customer→AE), and
  `commission_pending_deals`. Schema: `01-commissions-migration.sql`,
  `03-pending-deals-migration.sql`, `08-monthly-cash-received-migration.sql`,
  `src/09-manual-revenue.sql`. Live per-customer/day lookups (no full sync):
  `stripe-daily-cash`, `stripe-customer-match`.
- **Cal.com** → `cal-sync` writes `cal_bookings` (23 cols — `host_name/host_email`,
  `attendee_name/attendee_email`, `start_time`, `status`, `event_type_slug`, `raw`,
  …) and reads `cal_event_type_config`; state in `cal_sync_state`.
- **Meta** → `meta-sync` writes `meta_ads_metrics`.
- **GA4** (Google Analytics 4) → `ga4-sync` (daily cron `supabase-ga4-cron.sql`) mints a
  service-account RS256 token via Web Crypto (NOT `@google-analytics/data` — Node/gRPC won't run
  in Deno) and calls the Data API over REST; writes `ga4_daily_metrics` (date×channel) +
  `ga4_daily_events` (date×opt-in-event). Property id `443554875` (never the `G-` id); secret
  `GA4_SA_KEY_B64`. Schema `src/18-ga4-metrics.sql`. Read by `src/hooks/useGa4Metrics.js` →
  the GrowthView "Website (GA4)" tab (`Ga4Section`).
- **ProfitWell** → `profitwell-sync`.
- **Attio (CRM)** → **Pipe 1 (read, LIVE):** `attio-sync` (nightly cron `supabase-attio-cron.sql`
  + manual backfill) pages the Attio Data API (`POST /v2/objects/deals/records/query`, Bearer
  `ATTIO_API_KEY`) and `attio-webhook` (public, `--no-verify-jwt`, verifies `Attio-Signature`
  HMAC-SHA256 over the raw body with `ATTIO_WEBHOOK_SECRET`) upsert native Attio channel-partner
  deals into the existing **`channel_deals`** table (Heather's Channel Partner Deals view in
  `AeView.jsx`). Rows are tagged `origin='attio'` (vs `'portal'`); the real Attio **stage** is
  stored in `channel_deals.status` (the view is pipeline-aware: Open/Won/Lost + per-stage badges);
  `avg_value` ← Attio `value`→`mrc`→`projected_arr`; full record kept in `attio_raw`. Loop-safe:
  only deals with an EMPTY `external_id` are ingested (guard is in our code, not an Attio filter).
  Schema `src/19-attio-channel-deals.sql` (extends `channel_deals` + `sync_dead_letter`). **Pipe 2
  (write, LIVE):** `attio-push` pushes `origin='portal'` rows UP to Attio — assert person (by email)
  → assert deal (`PUT /v2/objects/deals/records?matching_attribute=external_id`, external_id = the
  channel_deals uuid). Attio requires name+stage+owner on a deal, so on CREATE only it sets
  `stage='Intro Call / Pre-Demo'` + `owner` = `ATTIO_DEAL_OWNER_EMAIL` secret (heather@youratlas.com);
  on UPDATE it omits them so Heather's Attio edits aren't clobbered. Triggered by a Supabase Database
  Webhook on `channel_deals` insert/update (passes `X-Cron-Secret`); `content_hash` skips no-ops;
  `{setup:true}` self-provisions the unique `external_id` + the channel-context attributes;
  `{diag:true}` lists deal attributes. Enriched: E.164 phone, company matched by the contact's email
  domain (`associated_company`), and the portal's channel fields (`partner_company`, `tsd`,
  `call_volume`, `pain_point`, `crm`, `deal_registered`) pushed into custom Attio attributes. Owner =
  `ATTIO_DEAL_OWNER_EMAIL`. Heather's channel-deals view shows an `OriginBadge` (Portal vs Attio).
- **Attio ⇄ Deals Portal ⇄ Scorecard bidirectional status sync (Phase B, LIVE):** a status change in
  any of the three propagates to the other two, keyed by `external_id = channel_deals.id = deals.id`
  (the Deals Portal is a SEPARATE Supabase project `hkpglfdslglrjcgzbqpx`). Hops: (1) portal `deals` →
  scorecard `channel_deals` (pre-existing dashboard webhook, status verbatim); (2) `channel_deals`
  (portal rows) → Attio via `attio-push` — now pushes **status→stage on UPDATE** (`SLUG_TO_STAGE`) with
  `status` in its change-hash; (3) Attio → `channel_deals` write-back: `attio-webhook`/`attio-sync` now
  UPDATE the matching portal row (`STAGE_TO_SLUG`, write-if-changed via `.neq`) for deals WITH an
  `external_id` instead of skipping — the entry stage `Intro Call / Pre-Demo` is IGNORED so it can't
  wipe a `pending`/`qualified` review status; (4) `channel_deals` → portal `deal-sync-inbound` edge fn
  via a scorecard Database Webhook (`channel_deals_to_portal_sync`, header `X-Sync-Secret`). Status-only
  (v1). **Native Attio deals never reach the portal** (write-back only fires with an `external_id`;
  `deal-sync-inbound` is UPDATE-by-id gated to `origin='portal'`). Loop-safe: every writer is
  write-if-changed, converges after ≤1 redundant round-trip. Portal statuses are 1:1 slugs
  (`intro_call_pre_demo`/`demo_scheduled`/`demo_complete`/`poc_proposal_sent`/`closed_*`) + portal-only
  review states `pending`/`qualified`/`declined`; no sync-driven emails. Contract:
  `docs/phase-b-integration.md`. **The `STAGE_TO_SLUG`/`SLUG_TO_STAGE` maps live in FOUR places
  (attio-webhook, attio-sync, attio-push + AeView's `CHANNEL_STATUS` badges) — keep them in sync.**
- **AE meetings** → `ae-meetings-sync` (cron, every 3h) imports each AE's Cal.com
  meetings (`cal_bookings`, matched by `host_name`) into `ae_deals` as status
  `Scheduled`, THEN recomputes the AE Daily Funnel from those `ae_deals` statuses
  and writes it back into `weekly_scorecards.data.daily[]` (`demosBooked` =
  not-Rescheduled, `demosCompleted` = attended incl. `Unqualified`,
  `demosUnqualified` = `Unqualified`, `trialSignups` = `Closed Won`), bucketing by
  America/Toronto. **Closes (`trialSignups`) bucket by the CLOSE week
  (`ae_deals.closed_at` = the cash-collected date — defaults to the Stripe cash date
  from `stripe-customer-match`, AE-editable via the "Closed date" field, guarded by
  `closed_at_source`); every other metric buckets by the meeting week.** So the cron
  now dual-buckets and fetches deals by meeting-OR-close week. Schema:
  `src/15-ae-closed-at.sql`. `{backfill:true}` recomputes every AE-week. The client mirror is
  `src/aeFunnel.js` (`deriveFunnelWeek`/`closeableHeld`/`weekKeyOfMeeting`) — keep
  the two in sync. Schema: `supabase-ae-deals-migration.sql` (`ae_deals`, incl.
  `expected_mrr` for open-deal pipeline forecast), `supabase-ae-meetings-cron.sql`.
  **⚠️ The funnel math lives in BOTH `aeFunnel.js` (client) and `ae-meetings-sync`
  `funnelUpsertRow` (server) — any status/derivation change must be made in both AND
  the function redeployed (`--no-verify-jwt`), or the nightly cron clobbers the
  client's numbers.** The `Intro` status (channel-partner intro meetings) is
  **fully backed out** of the demo funnel there — counted only in `daily[].intros`,
  excluded from `demosBooked`/completed/show-up/close. Intro tracking + channel-
  partner deal attribution (`ae_deals.referred_by_partner`, the "Referred by" picker,
  and the Partner Referrals rollup) are **gated to `profiles.tracks_channel_intros`**
  (Heather only; distinct from the older `channel_partner_enabled`/`channel_deals`
  portal). Schema: `src/14-ae-channel-attribution.sql`. The AE Daily Funnel
  (`AeFunnelDrilldownModal`) and the Growth Atlas Blue funnel
  (`AtlasBlueDrilldownModal`) both have click-a-number **drill-down modals** listing
  the deals behind each count — rendered via `createPortal` to `<body>` (+ clickable
  numbers keep `pointer-events:auto`) so they work on locked/submitted past weeks.
- **Investor Daily/Weekly Update** (crons, fill-only-blank, never clobber exec edits)
  → `daily-update-autofill` writes `atlas_daily_updates` (incl. `cash_stripe`, and
  AE-funnel-derived `calls_booked/calls_held/calls_unqualified/deals_closed`);
  `weekly-update-autofill` writes `atlas_weekly_updates` (live committed MRR +
  customers, and `pipeline_amount/count` summed from `ae_deals.expected_mrr` of open
  deals). Schema: `supabase-daily-updates-migration.sql`,
  `supabase-weekly-updates-migration.sql` (`atlas_weekly_updates`, incl.
  `metric_overrides` jsonb), `supabase-weekly-update-cron.sql`. Close rate everywhere
  backs out unqualified: `deals_closed ÷ (calls_held − calls_unqualified)` —
  centralized in `dailyUpdateFormat.derivedFor` / `aeFunnel.closeableHeld`.
- **App-internal** (not external sync, but same "read the migration" rule):
  `weekly_scorecards` (AE `data.daily[]` funnel fields are now derived from
  `ae_deals`, not hand-typed), `atlas_targets`, `weekly_mrr`, `ae_deals`,
  `atlas_daily_updates`, `atlas_weekly_targets`, `atlas_weekly_updates`.
- **Open partner pipeline** (sum of open channel-partner deal values) → the single
  server definition is `open_partner_pipeline()` (SQL, `src/20-open-partner-pipeline.sql`,
  tolerant matcher in `src/21-partner-pipeline-tolerant-status.sql`); a statement-level
  trigger on `channel_deals` recomputes it near-live into
  `atlas_weekly_updates.partner_pipeline_amount` (investor-readable, `select using(true)`),
  also seeded by `weekly-update-autofill`. **Open = anything except (normalized) `closed won`
  / `closed lost` / `closed churned` / `declined`.** Status is matched **normalized**
  (lowercased, runs of space/underscore/hyphen/slash → one space) so Attio display strings
  (`Closed won`) AND portal slugs (`closed_won`) both bucket correctly — the client mirror
  `src/channelDeals.js` (`normStatus` + `isOpen/Won/LostChannelDeal`) MUST stay identical to
  the SQL normalization (footgun, like `aeFunnel.js` ↔ server). The **investor** Channel
  Partnerships card (`InvestorView.jsx`) reads the ONE stored global value via
  `useOpenPartnerPipeline`. **The Channel Partner Deals view's stat + tiles now compute client-side
  over the viewing PERSON's assigned+scoped deals** (per-person slice, not the global) — see the
  channel-deal assignment note below. Bidirectional Attio↔portal status sync (Heather's Attio edits
  → portal + scorecard; portal status → Attio stage) is **LIVE** — see the Attio bidirectional-sync
  bullet above + `docs/phase-b-integration.md`.
- **Channel-deal assignment / per-person channel-sales views** (`src/22-channel-deal-assignment.sql`,
  `src/23-profiles-email.sql`): `channel_deals.assigned_to` = the assignee's **Atlas email**. Portal
  deals are assigned in the Deals Portal (auto by TSD — Sandler→Omer, else Heather — + manual override,
  synced into `channel_deals`; see `DEALS-PORTAL-ASSIGNMENT-HANDOFF.md`); **native Attio deals default to
  their Attio OWNER's email** (resolved via `GET /v2/workspace_members` id→email in attio-sync/webhook,
  fallback `heather@youratlas.com`). The **`ChannelPartnerDeals`** view (exported from `AeView.jsx`)
  filters to deals assigned to the **TARGET `profile.email`** (NOT the auth session — so an exec drilling
  into someone sees THAT person's deals; ⚠️ never revert to `supabase.auth.getUser()`), with a Super-Admin
  "All deals" toggle + clickable status-bucket tiles + a portaled, button-tracking per-status multi-select
  menu + click-to-call/text dialer. **`profiles.email`** was added (mirror of `auth.users.email`, kept in
  sync by a before-insert trigger) so a profile can be matched to `assigned_to` without reading
  `auth.users` (RLS-blocked for other users). **Omer is a CEO** — his channel scorecard is **flag-based,
  NOT a role**: `channel_partner_enabled` + a leadership `role_type` → `ScorecardViewer.pickComponent`
  renders `ChannelSalesView` (focused channel-only view) when you drill into him via Manager view; his
  landing stays the leadership dashboard. The **dialer is gated on `channel_partner_enabled`** too
  (`dialer-token`).

When you add a new integration, add its sync function + table(s) + schema file(s) to
this list so the next session knows where to look.

- **Twilio dialer** (in-app calling + SMS/RCS for AEs, CSMs, FDEs). Multi-tenant
  softphone on Supabase edge functions + `@twilio/voice-sdk` in the browser. See the
  dedicated "In-app dialer" section below for the full picture. Tables: `call_logs`,
  `sms_messages`, plus dialer columns on `ae_deals` (`customer_phone`, `follow_up_at`,
  `cs_onboarded_at/by`) and `profiles.twilio_number`. Schema: `supabase-dialer-*.sql`.

### Metrics architecture — investor ↔ executive lineage

The Investor view (`role_type='investor'`, hard-routed) reads **only** investor-readable
aggregate tables — never raw tables. The investor-readable source of truth is:
- `atlas_targets` (monthly, per `metric_key`, `actual_value`+`target_value`; edited via
  `TargetEditModal`),
- `atlas_daily_updates` (daily pace metrics; edited via `DailyUpdateModal`),
- `atlas_weekly_updates` + `atlas_weekly_targets` (weekly; `WeeklyUpdateModal`).

Raw tables (`meta_ads_metrics`, `profitwell_metrics`, `commission_customers`,
`weekly_scorecards`, `ae_deals`, `cal_bookings`) are RLS-blocked for investors; their data
reaches investors only after being aggregated into the `atlas_*` tables in the
executive/service context (the autofill crons + ProfitWell backfill). **Effective value =
executive edit wins** (manual entry into `atlas_*`) over the computed/synced value.

The Investor Weekly **department** tiles are computed read-only from those investor-readable
tables (`src/hooks/useInvestorWeeklyTrends.js`: weekly sums of `atlas_daily_updates` +
latest-month `atlas_targets` actuals). Tiles with **no** data source are collapsed under a
`ComingSoonBanner` (`src/ComingSoonBanner.jsx`) with a tooltip naming the exact missing
integration; the Odyssey (Executive) view shows the same not-yet-available metrics via its
native `AwaitingBadge`. Note `meta_ads_metrics` stores only rolling-window presets (no daily
rows), so it can't produce calendar-weekly figures — weekly ad spend comes from
`atlas_daily_updates.ad_spend`, not Meta.

## In-app dialer (Twilio) — calling, SMS, RCS, recording

A multi-tenant softphone built INTO this app (ported from a standalone prototype). Reps
call/text prospects in-app instead of a `tel:` hand-off. Backend is **Supabase edge
functions** (not a separate server); the browser uses `@twilio/voice-sdk`. Shipped in
milestones M1–M7 (all merged; see the plan file). Allowed roles: `account_executive`,
`csm`, `executive`, `forward_deployed_engineer(_lead)`.

**Per-rep model.** Each rep has their own Twilio number in `profiles.twilio_number`
(E.164). The Voice AccessToken identity = `profile.id`; that number is the outbound
caller ID and the inbound ring target. Exec assigns numbers in the ManagerView roster
("Dialer number" field), which also carries a `TwilioSetupGuide` with the exact per-number
webhook steps.

**Edge functions** (`supabase/functions/dialer-*`):
- `dialer-token` — mints the Twilio Voice AccessToken (HS256 JWT via `jose`, not the Node
  `twilio` SDK — it can't run in Deno). JWT verify **ON** (signed-in rep). Nested claim
  shape `grants.voice.outgoing.application_sid` + `cty:"twilio-fpa;v=1"` header.
- `dialer-voice` — the TwiML App Voice URL. Outbound `<Dial callerId=rep#><Number>`;
  inbound `<Dial><Client>repId</Client></Dial>` (routed by `To` = rep's number). Adds
  `record="record-from-answer-dual"` when `DIALER_RECORDING_URL` is set.
- `dialer-status` — call status/duration callback → `call_logs` (by `client_ref` or CallSid).
- `dialer-recording` — recordingStatusCallback → stores `call_logs.recording_url`
  (outbound matched by client `ref`, inbound by CallSid).
- `dialer-recording-media` — **auth proxy** for playback. JWT verify **ON**; reads the
  `call_logs` row with the CALLER's client so RLS decides access, then streams the Twilio
  media (returns `application/octet-stream` so `functions.invoke` yields a real Blob —
  `audio/*` gets parsed as text and corrupts). Nothing public.
- `dialer-send` — sends SMS from the rep's own number; optional `channel:'rcs'` sends from
  the brand RCS agent when `TWILIO_RCS_FROM` is set, else **falls back to per-rep SMS** and
  returns the real channel. JWT verify **ON**.
- `dialer-sms-inbound` — per-number "A message comes in" webhook; matches rep by `To` and
  the deal by last-10-digit phone; `from_number`=sender, `line_number`=our Atlas line.
- `dialer-sms-status` — message delivery/read callback (RCS `read` receipts flow through
  here unchanged).

**Public webhooks** (`dialer-voice`, `dialer-status`, `dialer-recording`,
`dialer-sms-inbound`, `dialer-sms-status`) are deployed `--no-verify-jwt` and authenticated
by validating `X-Twilio-Signature` (HMAC-SHA1 over the EXACT configured URL + sorted params).
**The `--no-verify-jwt` flag is NOT sticky — pass it on EVERY redeploy** or the function
returns 401 before our code runs and Twilio plays "an application error has occurred."
Each webhook's signature URL comes from its own env var (`DIALER_VOICE_URL`,
`DIALER_STATUS_URL`, `DIALER_RECORDING_URL`, `DIALER_SMS_INBOUND_URL`, `DIALER_SMS_STATUS_URL`)
so a trailing char / wrong path breaks the signature → 403.

**SMS routing is per-NUMBER, not per-service.** The Messaging Service stays on "Defer to
sender's webhook" (GHL numbers share it — flipping it to a service-level webhook hijacks
GHL). So `dialer-sms-inbound` + `dialer-voice` are set on EACH number's config; the sender
pool only provides A2P 10DLC registration + throughput. Same two URLs on every number — the
functions resolve the rep from `To`. Phone numbers are normalized to E.164 everywhere
(inbound is always E.164, deal/typed numbers may be bare 10-digit) and threads/deal-links
match by last-10 digits.

**Client** (`src/DialerContext.jsx`): `DialerProvider` mounted ONCE in `App.jsx`'s `Shell`
(survives view switches). Owns the Device lifecycle (register on mount for inbound), token
refresh, client-owned `call_logs` logging (insert on start, finalize on end; webhooks
enrich), the floating glass call widget (LiveCall / IncomingCall / WrapUp), and the
`SmsThread` panel (polls for inbound, RCS opt-in toggle + pill + read receipts).
`useDialer()` exposes `openDialer(number,{name,dealId})`, `openMessages(...)`,
`logOutcome({disposition,notes,followUpDate})` (writes the disposition to `call_logs`,
appends a dated note to `ae_deals.notes`, and optionally sets deal status `Follow-up` +
`follow_up_at`). Triggered from `AeView` prospect rows (phone/💬 icons) and the CS/FDE
hand-off panel.

**Sales → CS/FDE hand-off (M5).** When an AE sets a deal `status='Closed Won'`, it surfaces
as a callable contact for CSMs + FDEs (shared queue) via `useCsHandoffs` + `CsHandoffPanel`
(rendered in CsmView + FdeView pipeline sections): click-to-call/text, "Mark onboarded" to
clear, collapsed "Onboarded" section. RLS lets CS/FDE READ Closed Won `ae_deals`; the
`mark_cs_onboarded()` SECURITY DEFINER rpc is the ONLY write they get (toggles just the
onboarded flag — never sales fields).

**Tables + schema:** `call_logs` (`supabase-dialer-call-logs-migration.sql`), `sms_messages`
(`supabase-dialer-sms-migration.sql` + `-linenumber-` + `-rcs-` for the `channel` column),
`profiles.twilio_number` (`supabase-dialer-rep-number-migration.sql`), `ae_deals` dialer
columns (`supabase-ae-contact-phone-migration.sql`, `supabase-dialer-m5-cs-handoff-migration.sql`).
RLS on `call_logs`/`sms_messages` mirrors `ae_deals`: rep sees own, managers/execs all; the
edge functions write via the service role (no client insert policy).

**Secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER` (shared fallback), the five `DIALER_*_URL` signature URLs, and
`TWILIO_RCS_FROM` (unset = RCS off; set it after the Atlas RCS agent is verified to activate
RCS — no code change/deploy needed).

## Atlas Blue (iMessage) integration

Atlas Blue is Atlas's own iMessage AI agent ("Emma") that runs on Atlas phone numbers —
**separate from the Twilio dialer**. This integration surfaces those AI-run pre-meeting
conversations inside the AE deal view and lets an AE take the conversation over and reply
as a human. (Atlas is the company's own product; its API is at `api.youratlas.com/v1/api`,
auth header `api-key: <ATLAS_API_KEY>`, server-side only — never call it from the browser.)

Shipped in phases (all complete): **P1** history + prospect search, **P4** human handoff +
iPhone-styled messenger, **P2** realtime webhook, **P3** Cal.com `BOOKING_CREATED` webhook
(`cal-booking-inbound`) that instantly upserts the `ae_deal` and links the prospect's Atlas
conversation to the deal + AE — **reusing `ae_deals`** (link by phone), no separate bookings
table. For **phoneless bookings**, it falls back to a **GoHighLevel email→phone bridge** (GHL
v2 LeadConnector contacts search by email → phone) since Atlas contacts are phone-keyed with
no email; the resolved phone fills the deal and links the phone-keyed Atlas session.

**Two distinct messaging surfaces — do NOT merge them** (a merged thread caused an "AI is
handling this" bug on SMS-only contacts):
- **SMS dialer thread** — `SmsThread` in `DialerContext.jsx`, violet, Twilio only (SMS/RCS),
  opened by the 💬 icon (`openMessages`).
- **Atlas Blue messenger** — `src/AtlasMessenger.jsx`, iPhone-styled (adapted from the
  `glassphone` prototype but on a LIGHT canvas: blue = you, gray = them), opened by the blue
  iMessage icon/badge (`useDialer().openAtlas`). Take over / Resume AI, human reply, start a
  new iMessage, and a header showing the campaign name + sending number.

**Tables** (`supabase-atlas-blue-*.sql`): `atlas_sessions` (one row per Atlas chat session;
`contact_phone`/`contact_email`, `status`, `human_handoff`, `campaign_name`, `line_number`,
`rep_id`, `ae_deal_id`) and `atlas_messages` (per message; `role`, `content`, `channel`,
denormalized `rep_id`+`contact_phone` for flat RLS). RLS: an AE sees only sessions whose
`rep_id` = them; managers/execs see all. No client writes — edge functions use the service
role. Linking is by phone (last-10) or email to existing `ae_deals` — there is **no**
`atlas_bookings` table.

**Edge functions** (`supabase/functions/atlas-*`):
- `atlas-sync` — seed/backfill (exec OR `x-cron-secret`); pulls sessions + messages for the
  Blue campaign, links to `ae_deals`, stamps campaign name/number. `--no-verify-jwt`.
- `atlas-handoff` / `atlas-send` / `atlas-start` — JWT-on, rep-authed: toggle handoff, send a
  human reply, or start a brand-new iMessage. Atlas Blue outbound goes ONLY through these
  (`send-human-response`), never `dialer-send` (that's Twilio).
- `atlas-events-inbound` — the realtime webhook (`--no-verify-jwt`, gated by a `?token=`
  secret since Atlas doesn't sign webhooks). On any message event it does a targeted REST
  re-pull of that contact's current session + messages (events lack a sessionId), keeping the
  thread fresh without a manual re-sync. Subscribe with `POST /events-gateway/trigger/subscribe`.
- `cal-booking-inbound` — Cal.com `BOOKING_CREATED` webhook (`--no-verify-jwt`, verifies
  `X-Cal-Signature-256` / `CAL_WEBHOOK_SECRET`). Upserts the `ae_deal` (host→AE) and links the
  prospect's Atlas conversation instantly; phoneless bookings use the GHL email→phone bridge.

**⚠️ Atlas API contracts differ from Atlas's own published docs** (verified live — see the
[[atlas-blue-integration]] memory for the running list): handoff body is `{"enabled":bool}`
(not `{}`); `send-human-response` must target the CURRENT session (a stale session returns a
misleading "Human handoff is not enabled for this campaign" 400); REST GET responses are
PascalCase Azure-Table shaped (`RowKey`, `PartitionKey`, `ContactIdentification`, `Tittle`
[sic], `Role`/`Content`/`Channel`); phone-numbers are `{RowKey, PhoneNumber, CampaignId}`.
The Atlas Blue campaign id + sending number live in the memory file.

**Secrets:** `ATLAS_API_KEY`, `ATLAS_CAMPAIGN_IDS`, `CRON_SECRET`, `ATLAS_WEBHOOK_TOKEN`,
`CAL_WEBHOOK_SECRET`, and (for the phoneless-booking bridge) `GHL_API_KEY` (v2 Private
Integration token) + `GHL_LOCATION_ID`.

### Growth "Atlas Blue" funnel tab (`GrowthView.jsx` + `useAtlasBlueFunnel.js`)

Nick's (role_type `growth_manager`) ad-driven funnel tab. Growth is NOT manager/exec, so
raw tables are RLS-blocked; data comes through SECURITY DEFINER rpcs gated to
executive + growth_manager. Sources:
- **Bottom funnel** (Booked/Completed/New Customers/Cash/Deal Value) → `atlas_blue_deals(p_since)`
  rpc (`src/13-atlas-blue-funnel.sql`): ad-driven `ae_deals` (`booking_uid → cal_bookings →
  cal_event_type_config.is_ad_driven`). Returns `meeting_at`, `booked_at` (=
  `cal_bookings.created_at_cal`), `rep_name` (= `cal_bookings.host_name`), status/one_time/mrr/
  customer. Status math mirrors `aeFunnel.js`.
- **Ad Spend + Visitors** → `meta_ads_daily`, **filtered to `campaign_id =
  '120240301558250144'` ("Atlas Blue (iMessage)")** via `ATLAS_BLUE_CAMPAIGN_ID` (only that
  campaign is Atlas Blue). Visitors = the `landing_page_view` action out of the raw `actions`
  jsonb. The whole top-of-funnel is live (no manual inputs; `abVisitors`/`abTestDrives` are gone).
- **Test Drives** → `atlas_blue_test_drives()` rpc (`src/16-…`): distinct customers who chatted
  with campaign name `'Atlas Blue Paid Ads Funnel Agent'` (an `atlas_sessions` name, distinct
  from the Meta campaign_id), counted on their first-conversation day.

**Bucketing gotcha:** top-of-funnel **"Booked Calls" buckets by `booked_at`** (the day the call
was booked) so it never lands on a future day; the bottom-of-funnel **"Booked" buckets by
`meeting_at`** (it's the show-up/close cohort denominator). The hook keeps these as two fields —
`callsBooked` vs `demosBooked` — don't collapse them.

**Drill-downs:** `AtlasBlueDrilldownModal` (portal-rendered). Test Drives rows show a blue
iMessage bubble (phone contacts) → `useDialer().openAtlas` opens the Atlas Blue conversation.
This is **full interactive for `growth_manager`**: read granted in `src/17-atlas-blue-growth-read.sql`
(added growth_manager to the "Managers read all atlas_*" policies) and `atlas-handoff`/
`atlas-send`/`atlas-start` include `growth_manager` in `DIALER_ROLES` + let it act on ANY session
(not just its own) — redeploy those three (JWT-on, normal deploy) on any change.

**"AB Webinar" tab** (`atlas-blue-webinar` section + `useAtlasBlueWebinar.js`) is a SEPARATE
Meta campaign — `'Atlas Blue - Workshop'` (`campaign_id = '120246016759050144'`). Meta-only:
live Ad Spend + Visitors (`landing_page_view`) + derived Cost/Visitor + a weekly chart. Later
funnel stages (registrations/attendees/booked calls) are intentionally NOT rendered — the
test-drive agent belongs to the iMessage campaign and deals aren't Meta-campaign-attributable.
Don't confuse the two campaign_ids: iMessage funnel = `…250144`, webinar = `…050144`.

## Combined dial tracking (GHL + in-app dialer)

Each role scorecard (AE Funnel / CSM Meetings / FDE Activity) shows a **"Dials this
week"** card (`src/CombinedDialsCard.jsx`): **Scorecard dialer** dials (from `call_logs`,
outbound) on top, **GoHighLevel** dials below (from `ghl_call_events`), and a combined
**Total** — daily (Mon–Sun) + weekly. Placed once per view, in the default section.

**Why a webhook, not the API:** GHL exposes no public endpoint for human dialer calls per
user/date (only Voice-AI call logs; the Call Reporting widgets are UI-only). So GHL dials
are captured via a **GHL Workflow** (trigger **Call Details**, filter Call Direction =
Outgoing) → **Custom Webhook** → `ghl-calls-inbound` (deploy `--no-verify-jwt`, gated by a
`?token=` secret since GHL doesn't sign). The workflow body maps GHL tokens to
`{ userEmail, ghlUserId, ghlUserName, direction:"outbound", contactId, calledAt, callStatus }`
(the Phone Call folder has no call-id and no dialer-email token; "Answered By" ≠ dialer).

**Attribution** (precedence): `userEmail` → `auth.users` login email → profile; else
`ghl_user_id` → `profiles.ghl_user_id`; else `ghl_user_name` → `profiles.name` (the
zero-config path — GHL users == scorecard people). `profiles` has no email column (it's on
`auth.users`). **Dedupe** on `natural_key` = Message Id (if present) else composite
`ghlUserId|contactId|calledAt`. Table `ghl_call_events` (+ `profiles.ghl_user_id`), schema
`supabase-ghl-calls-migration.sql`; RLS mirrors `call_logs`. Secret: `GHL_CALLS_TOKEN`.
Executives have no role scorecard, so their own dials record but don't display. See the
[[ghl-call-tracking]] memory.

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
- `MeetingRow` in `AeView.jsx` is rendered in **two** separate components — the Daily Funnel section and `AeDealsPipeline` ("Deals from meetings") — and each must supply ALL of its props independently. They don't share scope, so a prop backed by a hook/query (e.g. `atlasTails`, the Atlas Blue iMessage-badge lookup) has to be declared in *both* call sites. Adding a copy to only one is what caused a `ReferenceError: atlasTails is not defined` that blanked the whole AE Pipeline tab. If you add a new `MeetingRow` prop, wire it in both places.

## What's NOT done yet (the obvious next work)

- Stripe integration — see Awaiting integrations above
- ProfitWell integration
- Amplitude (or another product analytics tool) integration
- HubSpot integration for partner pipeline metrics
- OKR tracking — needs a decision on the tool/table first
- Daily granularity for CS metrics (currently weekly-only)
- A scheduled job to refresh `atlas_targets.actual_value` from integrations (when they exist) without overwriting manual edits

If the user asks you to start any of these, expect to write both a Supabase migration AND the integration code. The `atlas_targets` table is the integration target for all of them.
