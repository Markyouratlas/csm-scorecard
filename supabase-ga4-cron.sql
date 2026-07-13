-- =============================================================================
--  GA4 sync — daily schedule
--
--  Schedules the `ga4-sync` edge function to run every morning and re-pull a
--  rolling 90-day window of GA4 data into ga4_daily_metrics / ga4_daily_events.
--  Re-pulling the window lets GA4's 24–48h data finalization self-correct.
--
--  PREREQUISITES (one-time):
--    1. Deploy the function:   supabase functions deploy ga4-sync
--    2. Secrets exist:  GA4_SA_KEY_B64 (base64 of the service-account JSON) and
--       CRON_SHARED_SECRET (already used by the other syncs).
--    3. Extensions pg_cron + pg_net enabled (they already are if Stripe/Meta/Cal
--       syncs run on a schedule).
--
--  BEFORE RUNNING: replace the two <PLACEHOLDERS>:
--    <ANON_KEY>            → the project's anon/publishable key (same as
--                            VITE_SUPABASE_ANON_KEY; it's public).
--    <CRON_SHARED_SECRET>  → the value of the CRON_SHARED_SECRET secret.
--
--  EASIER ALTERNATIVE (no SQL): schedule it in the Supabase Dashboard → Edge
--  Functions / Cron — pick ga4-sync, schedule "0 11 * * *", add header
--  X-Cron-Secret: <secret>.
--
--  Schedule: 11:00 UTC daily (~6am ET in winter / 7am ET in summer — GA4 doesn't
--  care about the exact minute; adjust the cron expression if you want 6am ET
--  year-round). runReport is quick, but keep pg_net's timeout generous.
-- =============================================================================

select cron.unschedule('ga4-sync')
where exists (select 1 from cron.job where jobname = 'ga4-sync');

select cron.schedule(
  'ga4-sync',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/ga4-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'X-Cron-Secret', '<CRON_SHARED_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify / manage:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'ga4-sync';
--   select * from cron.job_run_details order by start_time desc limit 10;
