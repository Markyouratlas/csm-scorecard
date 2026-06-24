-- =============================================================================
--  Daily Update — morning auto-write schedule
--
--  Schedules the `daily-update-autofill` edge function to run every weekday
--  morning and seed the PREVIOUS day's row in atlas_daily_updates from live
--  sources (Stripe cash, Cal.com calls, scorecards, atlas_targets snapshot).
--  It only fills blank fields, so an exec's manual edits are never overwritten.
--
--  PREREQUISITES (one-time):
--    1. Deploy the function:   supabase functions deploy daily-update-autofill
--    2. The CRON_SHARED_SECRET secret must exist (the other *-sync functions
--       already use it). If not:   supabase secrets set CRON_SHARED_SECRET=<random>
--    3. Extensions pg_cron + pg_net must be enabled (Dashboard → Database →
--       Extensions). They already are if your Stripe/Meta/Cal syncs run on a
--       schedule.
--
--  BEFORE RUNNING: replace the two <PLACEHOLDERS> below:
--    <ANON_KEY>            → your project's anon/publishable key (the same
--                            VITE_SUPABASE_ANON_KEY the app uses; it's public).
--    <CRON_SHARED_SECRET>  → the value you set for the CRON_SHARED_SECRET secret.
--
--  EASIER ALTERNATIVE (no SQL): schedule it exactly like your other syncs in the
--  Supabase Dashboard → Edge Functions / Cron — pick daily-update-autofill, set
--  the schedule "0 13 * * 1-5", and add a header  X-Cron-Secret: <secret>.
--
--  Schedule: 13:00 UTC, Mon–Fri  (~6am Pacific / 9am Eastern) — well before the
--  9am-Pacific posting deadline, and after the prior day is complete. Adjust the
--  cron expression if you want a different time.
-- =============================================================================

-- Remove any prior version of this job so re-running is safe.
select cron.unschedule('daily-update-autofill')
where exists (select 1 from cron.job where jobname = 'daily-update-autofill');

select cron.schedule(
  'daily-update-autofill',
  '0 13 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/daily-update-autofill',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'X-Cron-Secret', '<CRON_SHARED_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To verify / manage afterwards:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'daily-update-autofill';
--   select * from cron.job_run_details order by start_time desc limit 10;   -- run history
