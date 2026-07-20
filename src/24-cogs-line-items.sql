-- ============================================================================
--  24-cogs-line-items.sql
--  COGS (cost of goods sold) inputs for the Odyssey Gross Margin tile.
--
--  Two tables:
--    cogs_line_items — one editable row per infra vendor / delivery-labor person.
--    cogs_config     — a single settings row (interim infra total + headline view).
--
--  The Gross Margin tile computes margin live from these inputs and the MRR
--  single-source-of-truth, then writes the headline % into
--  atlas_targets['gross-margin'] so the Investor view + Odyssey tiles pick it up
--  (the standard "fill actuals, don't rebuild UI" contract).
--
--  RLS: executive tier only — labor rows hold salaries. Investors never read this
--  table; they see the resulting margin % via atlas_targets (authenticated-read).
--
--  Safe to re-run (idempotent create + coalesce seed).
-- ============================================================================

-- 1. cogs_line_items -------------------------------------------------------
create table if not exists public.cogs_line_items (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (category in ('infra','labor')),
  name           text not null,
  monthly_amount numeric,          -- null = not yet entered (infra TBD). Canonical figure used in the math.
  annual_amount  numeric,          -- labor only: entry convenience (monthly = annual / 12). null for infra.
  sort_order     int  not null default 0,
  active         boolean not null default true,
  notes          text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  unique (category, name)
);

create index if not exists cogs_line_items_category_idx on public.cogs_line_items (category, sort_order);

-- 2. cogs_config (single row) ---------------------------------------------
create table if not exists public.cogs_config (
  id                  boolean primary key default true check (id),  -- one row only
  interim_infra_total numeric not null default 16498,               -- shown until all infra items are entered
  headline_view       text not null default 'infra' check (headline_view in ('infra','loaded')),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

-- 3. RLS — executive tier only (read + write) ------------------------------
alter table public.cogs_line_items enable row level security;
alter table public.cogs_config     enable row level security;

-- helper predicate is inlined per-policy to mirror atlas_targets' pattern.
drop policy if exists "Executives read cogs_line_items" on public.cogs_line_items;
create policy "Executives read cogs_line_items"
  on public.cogs_line_items for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

drop policy if exists "Executives write cogs_line_items" on public.cogs_line_items;
create policy "Executives write cogs_line_items"
  on public.cogs_line_items for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

drop policy if exists "Executives read cogs_config" on public.cogs_config;
create policy "Executives read cogs_config"
  on public.cogs_config for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

drop policy if exists "Executives write cogs_config" on public.cogs_config;
create policy "Executives write cogs_config"
  on public.cogs_config for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'executive' or p.role_type = 'executive')));

-- 4. Seed (editable afterward; never clobbers an amount already entered) ----
-- Infrastructure — 7 vendors, amounts TBD (Mark fills as invoices arrive).
insert into public.cogs_line_items (category, name, monthly_amount, sort_order) values
  ('infra', 'OpenAI',      null, 1),
  ('infra', 'Vapi',        null, 2),
  ('infra', 'Twilio',      null, 3),
  ('infra', 'LoopMessage', null, 4),
  ('infra', 'ElevenLabs',  null, 5),
  ('infra', 'Azure',       null, 6),
  ('infra', 'Auth0',       null, 7)
on conflict (category, name) do nothing;

-- Delivery labor — annual salary + derived monthly (annual / 12). Noah = annual.
insert into public.cogs_line_items (category, name, annual_amount, monthly_amount, sort_order) values
  ('labor', 'Haley Folsom (FDE)', 105000, 8750, 1),
  ('labor', 'Andrew Park (FDE)',  100000, 8333, 2),
  ('labor', 'Noah (CS)',           50000, 4167, 3)
on conflict (category, name) do nothing;

-- Config — one row.
insert into public.cogs_config (id, interim_infra_total, headline_view)
values (true, 16498, 'infra')
on conflict (id) do nothing;

-- 5. Seed the current-month gross-margin actual so the Investor gauge shows a
--    real number immediately (recomputed to the live MRR-based value on first
--    executive load of the tile). coalesce → never clobber an existing value.
insert into public.atlas_targets (metric_key, month_key, actual_value, actual_source)
values ('gross-margin', date_trunc('month', now())::date, 90.7, 'finance')
on conflict (metric_key, month_key) do update
  set actual_value  = coalesce(public.atlas_targets.actual_value, excluded.actual_value),
      actual_source = coalesce(public.atlas_targets.actual_source, excluded.actual_source);
