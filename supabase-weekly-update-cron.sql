-- =============================================================================
--  Weekly Update — Friday auto-write schedule
--
--  Runs `weekly-update-autofill` each Friday to stamp the current week's live
--  MRR/Customers snapshot into atlas_weekly_updates so the investor Weekly Update
--  row appears automatically and WoW deltas work. The 8 weekly metrics + targets
--  + derived ratios compute live in the app; the exec adds the narrative / Core
--  Rocks / Asks / cash-on-hand / runway. Fill-only-blank — never overwrites edits.
--
--  PREREQUISITES:
--    1. Deploy JWT-off:  supabase functions deploy weekly-update-autofill --no-verify-jwt
--    2. CRON_SHARED_SECRET already exists (the other crons use it).
--
--  BEFORE RUNNING: replace PASTE_REAL_SECRET with the actual CRON_SHARED_SECRET
--  (copy it from an existing job: select command from cron.job where
--   jobname = 'nightly-stripe-sync';).
--
--  Schedule: Friday 21:00 UTC (~1–2pm Pacific), before the 4pm-Pacific post.
-- =============================================================================

select cron.unschedule('weekly-update-autofill')
where exists (select 1 from cron.job where jobname = 'weekly-update-autofill');

select cron.schedule(
  'weekly-update-autofill',
  '0 21 * * 5',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/weekly-update-autofill',
    headers := jsonb_build_object(
      'X-Cron-Secret', 'PASTE_REAL_SECRET',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify / history:
--   select jobname, schedule, active from cron.job where jobname = 'weekly-update-autofill';
--   select id, status_code, created from net._http_response order by created desc limit 5;
