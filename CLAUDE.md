# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

The app deploys to Vercel; the same two env vars must be configured in the Vercel project. Schema changes live in `supabase-setup.sql` (initial) and `supabase-*-migration.sql` files — these are pasted by hand into the Supabase SQL Editor, not run by a migration tool.

## Architecture

Single-page Vite + React 18 app backed by Supabase (auth + Postgres + Storage). No router — view selection is a `viewMode` state machine in `src/App.jsx`, hydrated from `sessionStorage` so it survives reloads and tab switches.

### Routing model (`src/App.jsx`)

`App` resolves the rendered screen from three inputs:
1. `profile.team` + `profile.role_type` — which scorecard component to render in "self" mode.
2. `accessTier(profile)` from `src/teams.js` → `'executive' | 'team_lead' | 'member'` — gates manager-only and exec-only views.
3. `viewMode` string in sessionStorage (`atlas:viewMode`): `'self' | 'manager' | 'feature_requests' | 'integrations' | 'cancellations' | 'api_guide' | 'leadership'`.

`PersonalScorecard` (at the bottom of App.jsx) is a `switch` on `role_type` that picks one of the per-role view components (CsmView, AeView, GrowthView, etc.). **Adding a new role** means three coordinated edits: add it to `TEAMS` in `src/teams.js`, create `XxxView.jsx`, and add a `case` in `PersonalScorecard`. Leadership roles (`ceo`, `coo`, `cto`, `cfo`, `vp`, `other`) intentionally have no scorecard — they're routed to `LeadershipPendingView` until an exec promotes them.

### Access tiers (`src/teams.js`)

`accessTier(profile)` is the single source of truth for permissions. It checks both `profile.role` (legacy column, `'executive' | 'manager' | 'member'`) **and** `profile.role_type` (newer column carrying the job role) because the schema evolved through migrations and old rows still exist. Don't add a third permissions path — go through `accessTier`.

`is_team_lead` boolean grants team-scoped manager view. First user to sign up gets `role='executive'` automatically (see `AuthScreen.jsx`).

### Per-role scorecard data

Each role has a "blank week" factory in `src/roleConstants.js` (or `src/constants.js` for the original CSM shape). These define the shape stored in `weekly_scorecards.data` (jsonb). The `useScorecard` hook in `src/useScorecard.js` is generic — every role view calls it with `(userId, propWeekKey, BLANK_FACTORY)` and gets back loading state, week navigation, debounced auto-save (800ms), and submit/unsubmit. Most days are stored as a 7-element array indexed by JS `getDay()` (0=Sun..6=Sat); the view filters down to the user's `work_days` for display.

**Week submission and locking**: `weekly_scorecards.submitted_at` is set by `submit()`. A week is only `isLocked` after it stops being the current week — during the current week the user can unsubmit and re-edit freely. Auto-save is skipped when locked.

The `useScorecard` call has a dual-mode pattern: when called by a user viewing their own scorecard, `propWeekKey` is undefined and the hook owns week navigation; when called from `ScorecardViewer` (an exec drilling into someone else's scorecard), `propWeekKey` is a concrete string and `setWeekKey` becomes a no-op. Preserve this when extending.

### Manager / Leadership views

- `ManagerView.jsx` — exec or team-lead dashboard. Execs see all teams; leads see only `profile.team`. Drills into `ScorecardViewer` to read any user's week.
- `LeadershipDashboardView.jsx` — exec-only roll-up across the whole company.
- `SharedPagesView.jsx` — feature requests, integrations, cancellations pages (last is gated to executives + CS + FDE).
- `ScorecardShell.jsx` — common header/footer chrome (logo, submit footer, view-switcher buttons) used by every personal scorecard.

### Data model (see `supabase-setup.sql` and migrations)

- `profiles` — one row per `auth.users` row. Columns include `name`, `team`, `role_type`, `role`, `is_team_lead`, `work_days`, `color`.
- `weekly_scorecards` — `(user_id, week_key)` unique. `week_key` is the Monday of the week as `YYYY-MM-DD` (see `getWeekKey` in `src/dateUtils.js`). `data` is jsonb shaped by the role's blank factory.
- `monthly_scorecards` — month-level inputs (NRR, NPS, CAC) keyed by `month_key` `YYYY-MM`. Used by `useMtdData`.
- `metric_targets` — role defaults (`user_id IS NULL`) plus per-user overrides. `useTargets` merges them with overrides winning.
- `testimonial_candidates` + `testimonial-videos` storage bucket — added by `supabase-testimonials-migration.sql`.

RLS: users read/write their own rows; managers/executives read across the team. Some policies still check the legacy `role = 'manager'` column rather than `accessTier` — if you add a new policy, mirror the existing pattern in the same migration file rather than inventing a new one.

### Visual system

Tailwind utility classes plus a hand-written design system inline in `src/App.jsx` (the `<style>` block inside `Shell`). The "Liquid Glass" navigation chrome (`.glass-nav`, `.glass-tab`, `.glass-modal`) is composed from backdrop-filter blur, gradient tints, and an SVG displacement filter defined once at the top of `Shell`. There are explicit fallbacks for `prefers-reduced-transparency`, `prefers-contrast: more`, and `prefers-reduced-motion` — preserve them when adding new glass surfaces. `useGlassInteraction` (in `src/hooks/`) wires the pointer-tracked highlight on these surfaces.

Fonts (Instrument Serif + Manrope + JetBrains Mono) are loaded from Google Fonts inside `Shell` rather than a global `<link>` — keep them there so the auth screen also picks them up.
