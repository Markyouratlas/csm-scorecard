-- =============================================================================
--  Attio sync — nightly reconciliation
--
--  Re-runs `attio-sync` each night to repair any Pipe-1 drift (missed webhooks,
--  deletes) between Attio native deals and Heather's channel_deals table.
--
--  PREREQUISITES (one-time):
--    1. Deploy the function:   supabase functions deploy attio-sync
--    2. Secrets exist:  ATTIO_API_KEY and CRON_SHARED_SECRET.
--    3. pg_cron + pg_net enabled (already are if the other syncs run on a schedule).
--
--  BEFORE RUNNING: replace the two <PLACEHOLDERS>:
--    <ANON_KEY>            → the project's anon/publishable key (public).
--    <CRON_SHARED_SECRET>  → the value of the CRON_SHARED_SECRET secret.
--
--  EASIER ALTERNATIVE (no SQL): schedule it in the Dashboard → Edge Functions / Cron —
--  pick attio-sync, schedule "0 9 * * *", add header X-Cron-Secret: <secret>.
--
--  Schedule: 09:00 UTC daily (~4–5am ET). Adjust the cron expression as desired.
-- =============================================================================

select cron.unschedule('attio-sync')
where exists (select 1 from cron.job where jobname = 'attio-sync');

select cron.schedule(
  'attio-sync',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/attio-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'X-Cron-Secret', '<CRON_SHARED_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify / manage:
--   select jobname, schedule, active from cron.job where jobname = 'attio-sync';
--   select * from cron.job_run_details order by start_time desc limit 10;
