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
--    4. pg_cron + pg_net enabled (already are — other syncs run on a schedule).
--    5. At least one OTHER scheduled job already embeds X-Cron-Secret (attio-sync,
--       ga4-sync, etc.) — this schedule reuses that shared secret at run time, so
--       there is nothing to paste. The Authorization bearer is the PUBLIC anon key.
--
--  Schedule: 10:00 UTC daily (~5–6am ET). Adjust the cron expression as desired.
--  Paste the whole block into the Supabase SQL editor.
-- =============================================================================

select cron.unschedule('ghl-webinar-signups-sync')
where exists (select 1 from cron.job where jobname = 'ghl-webinar-signups-sync');

select cron.schedule(
  'ghl-webinar-signups-sync',
  '0 10 * * *',
  $job$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/ghl-webinar-signups-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrb2JuenZnamVheHhndm1leGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTc2MzksImV4cCI6MjA5Mjg5MzYzOX0.G-kiHlhOUPf7fAYPqzIBn0Tg7047_U-X75tXrFw43fk',
      -- Reuse the shared cron secret already embedded in another scheduled job
      -- (matches the literal 'X-Cron-Secret','<value>' pattern, so it skips this
      --  job's own command, which stores the secret as a subquery, not a literal).
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
--   select jobname, schedule, active from cron.job where jobname = 'ghl-webinar-signups-sync';
--   select * from cron.job_run_details where jobname = 'ghl-webinar-signups-sync' order by start_time desc limit 5;
--
-- Manual one-off backfill (same call, run immediately) — swap cron.schedule(...) for
-- just the inner `select net.http_post(...)` statement above.
