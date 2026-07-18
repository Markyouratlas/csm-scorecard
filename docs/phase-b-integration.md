# Phase B — Attio ⇄ Deals Portal ⇄ Scorecard sync contract

**Status:** finalized, not yet built. This is the shared contract between the **Deals Portal** repo
(`atlas-deal-portal`) and the **Scorecard** repo (`csm-scorecard`). Keep an identical copy in both.

## What we're building

A deal lives in three places, all keyed by the same id:
`external_id` (Attio) = `channel_deals.id` (scorecard) = `deals.id` (portal). **Verified 2026-07:**
the ids match across projects (scorecard `ckobnzvgjeaxxgvmexaz`, portal `hkpglfdslglrjcgzbqpx`).

Goal: a status change in **any** of the three propagates to the other two, near-live, without loops.

## Current flow (what exists)

- Portal `deals` → scorecard `channel_deals`: dashboard DB webhook, status **verbatim**, `origin='portal'`. ✅
- Scorecard `channel_deals` (portal rows) → Attio: `attio-push` (Pipe 2), on `external_id`. ✅
- Attio → scorecard: Pipe 1 **skips** deals with an `external_id`. ❌ (Phase B changes this.)
- Scorecard → portal: **doesn't exist.** ❌ (Phase B adds this.)

## The two new hops

| Hop | Owner | What |
|---|---|---|
| **Attio → scorecard write-back** | Scorecard | Pipe 1 (`attio-webhook`/`attio-sync`): for a deal **with** `external_id`, UPDATE the matching `channel_deals` (portal) row — map Attio stage → portal slug, write-if-changed — instead of skipping. |
| **Scorecard → portal down-sync** | Portal | Supabase DB webhook on `channel_deals` → new portal edge function `deal-sync-inbound`, updates `deals` by `id`, write-if-changed. |

Plus: `attio-push` also pushes **status → stage on UPDATE** (map portal slug → Attio stage title), so
portal status changes reach Attio — and it must add `status` to its change-hash.

### Directionality guarantee — Attio never CREATES a portal deal

Attio can only ever **update** portal-originated deals in the portal, never create new ones:
- The Attio→scorecard write-back fires **only for deals with an `external_id`** (portal-originated).
  Native Attio deals (Heather's own, no `external_id`) stay `origin='attio'` in the scorecard and are
  never sent toward the portal.
- `deal-sync-inbound` does **UPDATE by `id` only — never INSERT**, and is gated to `origin='portal'`.
  A native Attio deal's `id` isn't in `deals`, so it no-ops. There is no insert path.

## Status mapping (exact 1:1, both directions)

| Attio stage | Portal slug |
|---|---|
| `Intro Call / Pre-Demo` | `intro_call_pre_demo` |
| `Demo scheduled` | `demo_scheduled` |
| `Demo complete` | `demo_complete` |
| `POC proposal sent` | `poc_proposal_sent` |
| `Closed won` | `closed_won` |
| `Closed lost` | `closed_lost` |
| `Closed - Churned` | `closed_churned` |

**Portal-only review statuses** (no Attio equivalent, never set by sync): `pending`, `qualified`, `declined`.
**Legacy:** migrate existing `demo_booked` → `demo_scheduled`.
**Stored form:** `channel_deals.status` for portal rows holds the **portal slug** (the write-back maps Attio→slug before writing); `deal-sync-inbound` copies it verbatim.

## Emails

- **No sync-driven change ever emails — v1 relies on the mapping, no mechanism needed.** Sync only
  writes `demo_scheduled`/`demo_complete`/`poc_proposal_sent`/`closed_*` (intro excluded by the
  entry-stage guard), none of which hit an email branch. (Future guard, only if a mapping ever lands
  on `qualified`/`declined`: `deal-sync-inbound` calls an RPC doing `SET LOCAL app.sync_source='sync'`
  + the UPDATE, and the trigger checks `current_setting('app.sync_source', true)`.)
- Portal-*initiated* emails unchanged: `deal_submitted` (registration), `deal_qualified` (→`qualified`), `deal_declined` (→`declined`). Closing-email flag (`app_settings.closed_deal_emails`) stays **OFF**.
- (Attio only lands on pipeline/closed slugs, never `qualified`/`declined`, so sync can't hit those triggers anyway — suppression is belt-and-suspenders.)

## Tooltips (portal UI)

Each status tooltip states **(1)** whether it emails the partner — only `pending` (on submit),
`qualified`, `declined` do; all pipeline/closed statuses do not — and **(2)** "Linked to Attio & the
Scorecard: changing this here, or in Attio, updates everywhere automatically."

## Loop safety (non-negotiable)

Every writer is **write-only-if-changed**. Then a change travels the ring once and stops.
- `attio-push` change-hash must include `status` (once stage-on-update is on).
- Write-back (`attio-webhook`) compares before writing `channel_deals`.
- `deal-sync-inbound` compares before writing `deals`.
Value changes converge after one extra round-trip; status changes converge immediately.
- **4th writer:** the portal→scorecard ingest (dashboard webhook) is a raw upsert, **not**
  write-if-changed. A `deal-sync-inbound` write echoes back through it once, but the downstream writers
  (`attio-push` content-hash, `deal-sync-inbound`) no-op, so it converges after one redundant round-trip
  — one extra `updated_at` churn, not a loop. Accepted for v1; a hub-level no-op suppressor on
  `channel_deals` can be added later if churn matters.
- **`intro_call_pre_demo`** is a real admin-selectable portal status (admin can set it → pushes to
  Attio); the entry-stage guard only affects the DOWN direction. The scorecard adds all pipeline slugs
  to its `CHANNEL_STATUS` badge map so portal deals render with proper labels.

## Transport / secret contract

- Scorecard → portal: a Supabase **DB webhook** on `channel_deals` sends the **native payload**
  `{ type, table, record, old_record, schema }` to `deal-sync-inbound`, with header
  **`X-Sync-Secret: <secret>`** (portal holds the matching Supabase secret; scorecard sets the header —
  same mechanism as `attio-push`'s `X-Cron-Secret`).
- `deal-sync-inbound` runs `verify_jwt=false` and authenticates on `X-Sync-Secret`.

## Value contract

**v1 = status only.** Value sync deferred (both `channel_deals.avg_value` and portal `deals.avg_value`
are free text like `"$4,500"`). If added later: scorecard sends the raw `avg_value` text, portal owns
parsing/formatting, and does **not** recompute its green/red fit flag on sync.

## Entry-stage guard (scorecard side)

Every portal deal Pipe 2 pushes enters Attio at `Intro Call / Pre-Demo`. To stop that from
overwriting a fresh `pending`/`qualified` deal back to `intro_call_pre_demo`, the down-sync/write-back
**ignores the bare `Intro Call / Pre-Demo` entry stage** and only propagates `Demo scheduled` and
later. (Alternative not taken: only push deals to Attio once `qualified`.)

## Build order

1. Portal: expand vocabulary (add the 7 pipeline slugs + relax `deals_status_check`, migrate `demo_booked`), add tooltips.
2. Portal: build `deal-sync-inbound` (write-if-changed, `X-Sync-Secret`, `source=sync` email suppression).
3. Scorecard: Pipe 1 write-back (map + write-if-changed, ignore entry stage); `attio-push` stage-on-update + status in change-hash.
4. Scorecard: DB webhook `channel_deals` → `deal-sync-inbound` (with `X-Sync-Secret`).
5. Test end-to-end: move a deal in Attio → scorecard + portal update, pipeline metric adjusts, value stabilizes (no loop). Repeat from portal, and from scorecard.
