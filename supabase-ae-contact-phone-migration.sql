-- =============================================================================
--  AE contact phone — Migration
--  Adds a prospect phone number so AEs can click-to-call from their meetings +
--  pipeline (email is already captured as customer_email). Phone is auto-captured
--  from the Cal.com payload when present (cal_bookings.attendee_phone → ae_deals
--  .customer_phone) and is also manually editable on the deal as a fallback.
--  Additive + idempotent. No RLS change (AEs already update their own ae_deals;
--  cal_bookings is service-written). Paste into the SQL Editor and Run.
-- =============================================================================

alter table public.cal_bookings add column if not exists attendee_phone text;
alter table public.ae_deals    add column if not exists customer_phone text;

-- One-time backfill of existing bookings' phone from the raw Cal.com payload.
-- Tries the common paths; safe no-op where none match. (Re-run after Phase 0
-- confirms the exact path if the coverage looks low.)
update public.cal_bookings
set attendee_phone = coalesce(
  nullif(raw->'attendees'->0->>'phoneNumber', ''),
  nullif(raw->'responses'->>'attendeePhoneNumber', ''),
  nullif(raw->'responses'->'attendeePhoneNumber'->>'value', ''),
  nullif(raw->'responses'->>'smsReminderNumber', ''),
  nullif(raw->'responses'->>'phone', ''),
  case when raw->>'location' ~ '^\+?[0-9][0-9 ()\-]{6,}$' then raw->>'location' end
)
where attendee_phone is null;

-- Carry the backfilled phone into existing ae_deals (matched by booking_uid).
update public.ae_deals d
set customer_phone = b.attendee_phone
from public.cal_bookings b
where d.booking_uid = b.uid
  and d.customer_phone is null
  and b.attendee_phone is not null;
