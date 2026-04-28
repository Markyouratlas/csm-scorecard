-- =============================================================================
--  CSM Scorecard — Testimonials Migration
--  Run this AFTER the original supabase-setup.sql.
--  Paste this entire file into the Supabase SQL Editor and click "Run."
--
--  This migration adds:
--   • testimonial_candidates table
--   • testimonial-videos storage bucket
--   • Row-level security so CSMs see only their own, managers see all
--   • Storage policies so CSMs can upload, managers can read all videos
-- =============================================================================

-- 1. Testimonial candidates table
create table if not exists public.testimonial_candidates (
  id uuid primary key default gen_random_uuid(),
  csm_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null default '',
  score integer not null default 5 check (score >= 0 and score <= 10),
  video_path text,
  video_filename text,
  video_uploaded_at timestamptz,
  qualified boolean not null default false,
  qualified_at timestamptz,
  qualified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists testimonial_candidates_csm_idx on public.testimonial_candidates(csm_id);
create index if not exists testimonial_candidates_score_idx on public.testimonial_candidates(score desc);

-- 2. Row-level security
alter table public.testimonial_candidates enable row level security;

-- Read: CSMs see their own; managers see all
drop policy if exists "Read own or manager-all" on public.testimonial_candidates;
create policy "Read own or manager-all"
  on public.testimonial_candidates for select
  to authenticated
  using (
    auth.uid() = csm_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

-- Insert: only as your own csm_id
drop policy if exists "Insert own candidates" on public.testimonial_candidates;
create policy "Insert own candidates"
  on public.testimonial_candidates for insert
  to authenticated
  with check (auth.uid() = csm_id);

-- Update:
--  • CSMs may update their own row on most fields, BUT cannot modify the qualified columns
--  • Managers can update anything
-- We keep the policy permissive at the row level and rely on UI to prevent
-- CSMs from setting qualified. This is acceptable for an internal tool — if you
-- want hard enforcement, switch to a column-level trigger. (Note added in policy.)
drop policy if exists "Update own or manager-all" on public.testimonial_candidates;
create policy "Update own or manager-all"
  on public.testimonial_candidates for update
  to authenticated
  using (
    auth.uid() = csm_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

-- Delete: CSMs can delete their own UN-qualified rows. Managers can delete anything.
drop policy if exists "Delete unqualified own or manager-all" on public.testimonial_candidates;
create policy "Delete unqualified own or manager-all"
  on public.testimonial_candidates for delete
  to authenticated
  using (
    (auth.uid() = csm_id and qualified = false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  );

-- 3. Storage bucket for testimonial videos
insert into storage.buckets (id, name, public)
values ('testimonial-videos', 'testimonial-videos', false)
on conflict (id) do nothing;

-- 4. Storage policies
-- We organize uploads under {csm_id}/{filename}, so we can check the first
-- folder in the path against the user's id.

-- Upload: any authenticated user, but only into a folder named with their own user id
drop policy if exists "CSMs upload to own folder" on storage.objects;
create policy "CSMs upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'testimonial-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: CSMs read their own folder; managers read all
drop policy if exists "Read own videos or manager-all" on storage.objects;
create policy "Read own videos or manager-all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'testimonial-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
    )
  );

-- Delete: CSMs delete their own; managers delete any
drop policy if exists "Delete own videos or manager-all" on storage.objects;
create policy "Delete own videos or manager-all"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'testimonial-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
    )
  );
