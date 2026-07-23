-- ============================================================
-- src/41-deal-payment-fix.sql
-- "Payment needs fixing in Stripe" ticket on a deal. AEs sometimes close on
-- verbally-negotiated terms that don't match the Stripe payment link, so an exec
-- has to adjust Stripe after the fact. This is the little AE → exec → AE workflow:
--
--   AE flags (+ note on the real terms)  -> pay_fix_status = 'flagged'  (shows in exec My View)
--   Exec fixes Stripe, marks completed   -> pay_fix_status = 'fixed'    (notifies the AE)
--   AE acknowledges                       -> pay_fix_status = 'done'     (drops back to Closed Won)
--
-- Once ever flagged, the deal keeps a permanent "Modified payment" badge
-- (pay_fix_status is not null).
--
-- Additive + nullable. Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

alter table public.ae_deals add column if not exists pay_fix_status       text;                          -- null | flagged | fixed | done
alter table public.ae_deals add column if not exists pay_fix_note         text;                          -- AE's note on the real terms
alter table public.ae_deals add column if not exists pay_fix_flagged_by   uuid references public.profiles(id);
alter table public.ae_deals add column if not exists pay_fix_flagged_at   timestamptz;
alter table public.ae_deals add column if not exists pay_fix_completed_by uuid references public.profiles(id);
alter table public.ae_deals add column if not exists pay_fix_completed_at timestamptz;
alter table public.ae_deals add column if not exists pay_fix_ack_at       timestamptz;                   -- AE acknowledged the fix
