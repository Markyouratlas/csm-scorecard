-- ============================================================
-- src/19-attio-channel-deals.sql
-- Attio ↔ Scorecard sync — Pipe 1 (Attio deals → Heather's channel_deals).
--
-- Extends the existing (portal-populated) channel_deals table with sync columns so
-- native Attio channel deals live ALONGSIDE portal-registered ones in ONE table,
-- kept disjoint by external_id (portal rows have one; Attio-native rows don't).
-- Additive + idempotent — does not disturb the deals.youratlas.com portal's inserts.
--
-- Paste into the Supabase SQL editor.
-- ============================================================

alter table public.channel_deals
  add column if not exists attio_record_id  text,
  add column if not exists external_id      text,
  add column if not exists origin           text not null default 'portal',
  add column if not exists content_hash     text,
  add column if not exists attio_updated_at timestamptz,
  add column if not exists synced_at        timestamptz,
  add column if not exists attio_raw        jsonb;

-- channel_deals.id is NOT NULL with no default (the portal passes its own id). Pipe-1
-- inserts omit id, so give it a default — explicit portal inserts still override it.
alter table public.channel_deals alter column id set default gen_random_uuid();

-- Upsert keys. A UNIQUE index over a nullable column allows MANY nulls (all the portal
-- rows) yet stays unique for non-null Attio ids — so `onConflict:'attio_record_id'`
-- works for Pipe 1, and external_id is ready (unique) for Pipe 2.
create unique index if not exists channel_deals_attio_record_id_key on public.channel_deals (attio_record_id);
create unique index if not exists channel_deals_external_id_key     on public.channel_deals (external_id);

-- Failure log (backfill / webhook / reconciliation / future push) for inspection.
create table if not exists public.sync_dead_letter (
  id         bigserial primary key,
  source     text not null,   -- 'attio-sync' | 'attio-webhook' | 'attio-push'
  op         text,            -- 'backfill' | 'webhook' | 'reconcile' | 'push'
  ref        text,            -- attio_record_id / external_id / channel_deals.id
  error      text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
alter table public.sync_dead_letter enable row level security;
drop policy if exists "Managers read sync_dead_letter" on public.sync_dead_letter;
create policy "Managers read sync_dead_letter"
  on public.sync_dead_letter for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role = 'manager' or p.role_type = 'executive')
  ));

-- ============================================================
-- Verification
--   select origin, count(*) from channel_deals group by 1;   -- existing rows now 'portal'
--   select * from sync_dead_letter order by created_at desc limit 20;
-- ============================================================
