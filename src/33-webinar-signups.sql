-- ============================================================
-- src/33-webinar-signups.sql
-- Webinar opt-in tracking (Phase 1: GHL Forms Submissions backfill).
--
-- Stores signups from the GoHighLevel native form "Stop Hiring, Start Cloning
-- Workshop - Optin" (form id 3nmXZEM7jE796XhIsFVV, on blue.youratlas.com). The
-- `ghl-webinar-signups-sync` edge function pages the GHL v2 API
-- (GET /forms/submissions) and upserts here on ghl_submission_id (idempotent, so
-- the backfill doubles as a daily reconciliation job and Phase 2's webhook can
-- share the same dedupe key).
--
-- `raw` keeps the full submission (minus the huge signatureHash blob) so nothing
-- is ever lost; the flat columns are extracted for querying/joins. email + phone
-- are indexed for the future Stripe deposit/purchase join (opt-in -> paid funnel).
--
-- RLS: exec + growth_manager (Nick) + managers/leads READ; writes are service-role
-- only (the edge function), so no client insert/update policy.
-- Idempotent — safe to re-run. Paste into the Supabase SQL editor.
-- ============================================================

create table if not exists public.webinar_signups (
  id                uuid primary key default gen_random_uuid(),
  ghl_submission_id text not null unique,          -- GHL submission `id` (dedupe key)
  ghl_contact_id    text,                          -- GHL `contactId`
  form_id           text not null,
  form_name         text,                          -- set by the sync (constant per form)
  full_name         text,
  email             text,
  phone             text,                          -- others.phone (E.164)
  revenue_band      text,                          -- others qualifier ("Under $1M", ...)
  submitted_at      timestamptz,                   -- submission `createdAt`
  source            text,                          -- others.eventData.source
  medium            text,                          -- others.eventData.medium
  landing_page_url  text,                          -- others.eventData.page.url
  fb_event_id       text,                          -- others.eventData.fbEventId (future Meta match)
  raw               jsonb not null default '{}'::jsonb,
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists webinar_signups_submitted_at_idx on public.webinar_signups (submitted_at desc);
create index if not exists webinar_signups_email_idx        on public.webinar_signups (lower(email));
create index if not exists webinar_signups_phone_idx        on public.webinar_signups (phone);
create index if not exists webinar_signups_form_id_idx      on public.webinar_signups (form_id);

alter table public.webinar_signups enable row level security;

-- Read: exec + growth_manager + managers/leads (mirrors the atlas_* read policies).
drop policy if exists "Managers + growth read webinar_signups" on public.webinar_signups;
create policy "Managers + growth read webinar_signups"
  on public.webinar_signups for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager'
           or p.role_type = 'executive' or p.role_type = 'growth_manager'
           or p.is_team_lead = true)
  ));

-- No client insert/update/delete policy: only the service-role edge function writes.
