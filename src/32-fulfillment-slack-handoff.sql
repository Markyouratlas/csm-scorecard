-- ============================================================================
--  32-fulfillment-slack-handoff.sql
--  Per-customer link to the Slack "Sales CS hand-off" message. Pasted in the
--  Fulfillment client drawer; becomes a clickable button. Requires 27. Re-runnable.
-- ============================================================================
alter table public.fulfillment_clients add column if not exists slack_handoff_url text;
