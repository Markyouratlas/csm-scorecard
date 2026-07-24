-- =============================================================================
--  Collected-but-not-closed — daily auto-close
--
--  Runs `collected-not-closed-autoclose` each morning. It flips OPEN ae_deals to
--  Closed Won when the customer is already paying IN FULL in Stripe (collected
--  cash >= the deal's expected upfront, or >= one full month of MRR when there is
--  no upfront). Deposits / partial payments are left alone; a customer who already
--  has a Closed Won deal is never touched (double-close guard). Each auto-close
--  stamps ae_deals.auto_closed_at + an audit note and fires the existing Closed-Won
--  triggers (closed_at stamp + Fulfillment routing).
--
--  PREREQUISITES (one-time):
--    1. Column + rpc exist (src/43-collected-not-closed.sql).
--    2. Function deployed:  supabase functions deploy collected-not-closed-autoclose --no-verify-jwt
--    3. Secret exists: CRON_SHARED_SECRET (already set — the other crons use it).
--    4. Recommended FIRST: run it once with {"dryRun":true} and eyeball `wouldClose`
--       before scheduling the live job (see the manual call at the bottom).
--
--  Schedule: 11:00 UTC daily (~6–7am ET) — after the nightly Stripe sync so
--  collected-cash figures are current. Adjust the cron expression as desired.
--  Paste the whole block into the Supabase SQL editor.
-- =============================================================================

select cron.unschedule('collected-not-closed-autoclose')
where exists (select 1 from cron.job where jobname = 'collected-not-closed-autoclose');

select cron.schedule(
  'collected-not-closed-autoclose',
  '0 11 * * *',
  $job$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/collected-not-closed-autoclose',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrb2JuenZnamVheHhndm1leGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTc2MzksImV4cCI6MjA5Mjg5MzYzOX0.G-kiHlhOUPf7fAYPqzIBn0Tg7047_U-X75tXrFw43fk',
      -- Reuse the shared cron secret already embedded in another scheduled job.
      'X-Cron-Secret', (
        select (regexp_match(command, $re$'X-Cron-Secret',\s*'([^']+)'$re$))[1]
        from cron.job
        where command ~ $re$'X-Cron-Secret',\s*'[^']+'$re$
        limit 1
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Verify / manage:
--   select jobname, schedule, active from cron.job where jobname = 'collected-not-closed-autoclose';
--   select * from cron.job_run_details where jobname = 'collected-not-closed-autoclose' order by start_time desc limit 5;
