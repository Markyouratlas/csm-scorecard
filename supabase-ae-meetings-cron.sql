-- =============================================================================
--  AE Meetings — auto-import schedule
--
--  Runs `ae-meetings-sync` so every AE's current-week calendar meetings import
--  into ae_deals automatically (no "Sync meetings" click needed). Idempotent —
--  only inserts meetings that aren't already rows, never overwrites AE edits.
--
--  PREREQUISITES:
--    1. Deploy with JWT verification OFF (so the cron gateway doesn't block it):
--         supabase functions deploy ae-meetings-sync --no-verify-jwt
--    2. CRON_SHARED_SECRET already exists (same secret the other crons use).
--
--  BEFORE RUNNING: replace PASTE_REAL_SECRET with the actual CRON_SHARED_SECRET
--  value (copy it from an existing job: select command from cron.job where
--  jobname = 'nightly-stripe-sync';).
--
--  Schedule: 15 min past every 3rd hour, just after cal-sync (30 */3) refreshes
--  the calendar, so newly-booked meetings show up within the hour. Adjust freely.
-- =============================================================================

select cron.unschedule('ae-meetings-sync')
where exists (select 1 from cron.job where jobname = 'ae-meetings-sync');

select cron.schedule(
  'ae-meetings-sync',
  '45 */3 * * *',
  $$
  select net.http_post(
    url     := 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1/ae-meetings-sync',
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
--   select jobname, schedule, active from cron.job where jobname = 'ae-meetings-sync';
--   select id, status_code, created from net._http_response order by created desc limit 5;
