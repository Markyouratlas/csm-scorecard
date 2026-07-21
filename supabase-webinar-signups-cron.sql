-- =============================================================================
--  Webinar signups sync — daily reconciliation
--
--  Re-runs `ghl-webinar-signups-sync` each day to catch any submissions a missed
--  Phase-2 webhook didn't deliver. Upsert on ghl_submission_id makes it idempotent,
--  so re-pulling never creates duplicates.
--
--  PREREQUISITES (one-time):
--    1. Table exists (src/33-webinar-signups.sql).
--    2. Function deployed:  supabase functions deploy ghl-webinar-signups-sync --no-verify-jwt
--    3. Secrets exist: GHL_API_KEY, GHL_LOCATION_ID, CRON_SHARED_SECRET.
--    4. pg_cron + pg_net enabled (already are if the other syncs run on a schedule).
--
--  BEFORE RUNNING: replace the two <PLACEHOLDERS>:
--    <ANON_KEY>     → the project's anon/publishable key (public).
--    <CRON_SHARED_SECRET>  → the value of the CRON_SECRET secret.
--
--  EASIER ALTERNATIVE (no SQL): Dashboard → Edge Functions / Cron — pick
--  ghl-webinar-signups-sync, schedule "0 10 * * *", add header X-Cron-Secret: <secret>.
--
--  Schedule: 10:00 UTC daily (~5–6am ET). Adjust as desired.
-- =============================================================================

select cron.unschedule('ghl-webinar-signups-sync')
where exists (select 1 from cron.job where jobname = 'ghl-webinar-signups-sync');

select cron.schedule(
  'ghl-webinar-signups-sync',
  '0 10 * * *',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/ghl-webinar-signups-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'X-Cron-Secret', '<CRON_SHARED_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- One-off immediate backfill (run this once now to load all history). Same call
-- the schedule makes; net.http_post is async, so check results with:
--   select count(*), max(submitted_at) from public.webinar_signups;
--
-- select net.http_post(
--   url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/ghl-webinar-signups-sync',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_KEY>','X-Cron-Secret','<CRON_SHARED_SECRET>'),
--   body    := '{}'::jsonb, timeout_milliseconds := 120000);

-- Verify / manage:
--   select jobname, schedule, active from cron.job where jobname = 'ghl-webinar-signups-sync';
--   select * from cron.job_run_details order by start_time desc limit 10;
