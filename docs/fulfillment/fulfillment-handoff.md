# Fulfillment Tracker → Scorecard: Integration Handoff

**For:** Claude Code, working in `Markyouratlas/csm-scorecard`
**Reference file:** `docs/fulfillment/atlas-fulfillment-tracker-light.jsx` — it is the design and behavior spec, not code to import as-is. This handoff doc and `fulfillment-schema.sql` live in the same folder.
**Goal:** Add a "Fulfillment" section to the Scorecard app (scorecard.youratlas.com) that recreates the reference prototype exactly, backed by the existing Supabase project (`ckobnzvgjeaxxgvmexaz`) instead of in-memory seed data.

---

## 1. What the reference file contains (treat as the spec)

The prototype is a single-file React app. Do not redesign it — adapt its structure to this repo's conventions while preserving the UI, interactions, and math:

- **Three views:** Visual DB (11 KPI tiles with count-up numbers, month-over-month delta chips, and 6-month sparklines; a stage bar chart; a status donut with hover-linked legend), a drag-and-drop Board across 12 pipeline stages, and a Master Dashboard table grouped by stage with sticky header and sticky name column.
- **Client drawer:** every field editable — overview, CSM / FDE + Implementation Specialist + CSA selects, computed timeline metric tiles, 19 date fields, collapsible White Label config (jsonb-shaped), notes, two-step delete.
- **Stage auto-stamping (`changeStage`):** entering a stage stamps its start date if empty (see `STAGE_STAMP`), leaving Hold stamps `hold_end`, entering Cancelled stamps `cancellation_date`. **Keep this logic client-side and identical** — it is what keeps the KPIs honest. Persist the whole updated row in one Supabase update.
- **All KPI/sparkline math** lives in `clientMetrics`, `fmtDur`, and the `DashboardView` bucket helpers. These compute client-side from the full row set. At current volume (~226 clients) that is fine — do not move this into SQL views yet.
- The Atlas logo is inlined as an SVG component (`AtlasLogo`) — carry it over.
- Team roster note: `CSMS` is the combined CSM / FDE list (Noah Malcolm, Mark Patterson, Haley Folsom, Andrew Park); `IMPS` is Ahmed Khan and Ahmed Shawar. The TV Ads product was removed — do not reintroduce anything CTV/TV-related.

## 2. Repo conventions to follow

Inspect the existing csm-scorecard structure before writing anything, then match it:

- Reuse the existing Supabase client, auth/session handling, and router/nav patterns. Do not create a second client.
- **Every admin check must include `super_admin`** alongside `admin`. This has been missed before in this codebase.
- Keep sub-components defined at module level (never inside a parent's render) — the reference file already does this; preserve it. This prevents input focus loss on controlled inputs.
- Hover/tooltip CSS that must survive the production build goes in explicit `<style>` blocks with real class selectors (the reference file's `.ainput` / `.atable` / `.arow` pattern) — Tailwind `group-hover` has been purged in prod builds here before.
- Tailwind core utility classes only; Recharts and lucide-react are already in the stack.
- Mark prefers full-file replacements over surgical patches for non-trivial changes, and one combined deploy over several small ones.

## 3. Database (Mark runs `fulfillment-schema.sql` manually)

The companion file `fulfillment-schema.sql` creates everything. Schema decisions already made:

- **Table `fulfillment_clients`** — deliberately namespaced to avoid colliding with any existing commission/scorecard tables. Verify no name conflict before running; rename with the same prefix pattern if needed.
- **Flat date columns** (19 of them) rather than jsonb, so overdue/duration KPIs stay queryable in SQL later.
- **`wl jsonb`** for the 13 White Label fields — the app already treats them as one object; keys stay camelCase exactly as in the reference file.
- **Team members as text names** for v1 (matches the prototype and the upcoming Asana import). A later migration can move to profile FKs.
- **Stage and status values are check-constrained** to exactly the app's ids: stages `pre, contact, kickoff, obprog, backlog, imp, review, launch, postlaunch, ongoing, hold, cancelled`; statuses `ontrack, atrisk, offtrack, none`. If you rename anything in the app, the constraint and the app constants must move together.
- **RLS:** one policy per action (consolidated — never multiple overlapping SELECT policies; that pattern caused recursive-policy login failures here before). Read/insert/update for any authenticated user with a `profiles` row via a `public.is_team_member()` SECURITY DEFINER helper; delete restricted to `public.is_staff()` (admin/super_admin).
- ⚠️ **Verify the actual `role` values in `public.profiles` before finalizing.** `is_staff()` exists in this project and checks `role in ('admin','super_admin')`. If CSMs/FDEs have a different role value than expected, adjust `is_team_member()` accordingly so non-admin team members can read and write clients but not delete them.

## 4. App wiring (build in this order)

**Phase A — read path.** New route/tab renders from `select * from fulfillment_clients`. Write a single snake_case ↔ camelCase mapper (see Appendix) so the reference components stay untouched internally. Remove the `SEED` array once the fetch works — do not ship demo data to production.

**Phase B — write path.**
- Add/edit/delete against Supabase with optimistic local state (the prototype's `patch`/`patchDates`/`patchWL` setters are the optimistic layer — keep them, then persist).
- **Debounce is mandatory:** the drawer currently patches state on every keystroke. Persist text/number/notes fields on ~500ms debounce or on blur; selects, checkboxes, dates, and stage moves persist immediately. Without this, every keystroke becomes an UPDATE.
- Stage moves (drawer select and board drag-drop) run the client-side stamping logic, then one UPDATE with the full changed row.
- Two-step delete stays in the UI; the RLS delete policy is the real backstop.

**Phase C — nothing else.** CSV import, webhook auto-create, and role tags are Phase 2 (Section 7). Do not build them in this pass.

## 5. Navigation and access

Add "Fulfillment" as a top-level tab in the Scorecard nav (match existing tab styling). All logged-in team members see it. The Remove-client button should only render for admin/super_admin, mirroring the RLS delete policy — remember `super_admin` in the check.

## 6. Ship-it workflow (Mark's standard process)

1. Before writing code, present Mark a short file plan (files to create/modify) and wait for approval.
2. Branch `feature/fulfillment-tracker`; build the whole feature as one combined change.
3. Push → Vercel preview URL for Mark's review.
4. Mark runs `fulfillment-schema.sql` in the Supabase dashboard SQL Editor (one "+ New query") against `ckobnzvgjeaxxgvmexaz` **before** testing writes on the preview.
5. Testing is done by user impersonation, per usual practice.
6. Merge to main → auto-deploy (~90 seconds). Hard refresh (`Ctrl+Shift+R`) to clear cache.

## 7. Phase 2 backlog (documented, not in scope now)

- **Asana CSV import** to load the real ~226 clients (column mapping to be provided; Asana export headers → Appendix fields).
- **Auto-create on deal won:** the deal portal already pushes to this project's `receive-channel-deal` Edge Function — a follow-up can create a `fulfillment_clients` row (stage `pre`, payment date stamped) from that flow or from Stripe payment events. Any new Edge Function needs CORS headers (`Access-Control-Allow-Origin: *`) and JWT verification OFF, per this project's established pattern.
- **FDE badge** on people chips / role field to distinguish CSM vs FDE in filters and reporting.
- **"My clients" default filter** keyed to the logged-in profile.

## Appendix: field map (app ↔ DB)

| App (reference jsx) | DB column |
|---|---|
| `name` | `name` |
| `atlasUsername` | `atlas_username` |
| `pocEmail` | `poc_email` |
| `stage` | `stage` |
| `status` / `statusDate` | `status` / `status_date` |
| `taskProgress` | `task_progress` |
| `csm` / `imp` / `csa` | `csm` / `imp` / `csa` |
| `priority` / `subscription` | `priority` / `subscription` |
| `tShirt` / `temperament` | `t_shirt` / `temperament` |
| `touchpoints` / `revisionCount` | `touchpoints` / `revision_count` |
| `obCompletionTime` | `ob_completion_time` |
| `impEscalation` | `imp_escalation` |
| `notes` | `notes` |
| `dates.payment` | `payment_date` |
| `dates.koScheduling` | `ko_scheduling_date` |
| `dates.koDue` | `ko_due_date` |
| `dates.kickoff` | `kickoff_date` |
| `dates.csmMeeting2` | `csm_meeting2_date` |
| `dates.impBacklog` | `imp_backlog_date` |
| `dates.obKsStart` | `ob_ks_start` |
| `dates.obIpStart` | `ob_ip_start` |
| `dates.impStart` | `imp_start` |
| `dates.impReviewStart` | `imp_review_start` |
| `dates.impReviewDue` | `imp_review_due` |
| `dates.launchDue` | `launch_due` |
| `dates.launch` | `launch_date` |
| `dates.postLaunchStart` | `post_launch_start` |
| `dates.ongoingStart` | `ongoing_start` |
| `dates.supportCall` | `support_call_latest` |
| `dates.holdStart` / `dates.holdEnd` | `hold_start` / `hold_end` |
| `dates.cancellation` | `cancellation_date` |
| `wl.*` (13 keys, camelCase) | `wl` jsonb (same keys) |
