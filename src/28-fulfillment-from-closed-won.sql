-- ============================================================================
--  28-fulfillment-from-closed-won.sql
--  Route Closed Won deals into the Fulfillment tracker.
--
--  A trigger on ae_deals (mirrors trg_ae_deals_stamp_closed_at in
--  src/15-ae-closed-at.sql) creates one fulfillment_clients row the moment a deal
--  becomes 'Closed Won'. It's the writer-agnostic choke point — Closed Won is set
--  client-side today via useAeDeals.save(), but a trigger also catches any future
--  server writer. Idempotent via the ae_deal_id unique key.
--
--  Requires 27-fulfillment.sql (fulfillment_clients.ae_deal_id). Safe to re-run.
-- ============================================================================

create or replace function public.ae_deal_to_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the transition INTO Closed Won (insert already-won, or update crossing over).
  if new.status = 'Closed Won'
     and (tg_op = 'INSERT' or old.status is distinct from 'Closed Won') then
    insert into public.fulfillment_clients
      (ae_deal_id, name, poc_email, poc_phone, mrr, stage, status, status_date, payment_date)
    values
      (new.id,
       coalesce(new.customer_name, ''),
       coalesce(new.customer_email, ''),
       coalesce(new.customer_phone, ''),
       new.mrr,
       'pre', 'ontrack', now()::date,
       coalesce(new.closed_at::date, now()::date))
    on conflict (ae_deal_id) do nothing;
  end if;
  return new;
end;
$$;

-- AFTER so it runs after the BEFORE closed_at-stamp trigger (new.closed_at is set by then).
drop trigger if exists trg_ae_deal_to_fulfillment on public.ae_deals;
create trigger trg_ae_deal_to_fulfillment
  after insert or update on public.ae_deals
  for each row execute function public.ae_deal_to_fulfillment();

-- Backfill: route every EXISTING Closed Won deal in now (idempotent).
insert into public.fulfillment_clients
  (ae_deal_id, name, poc_email, poc_phone, mrr, stage, status, status_date, payment_date)
select d.id,
       coalesce(d.customer_name, ''),
       coalesce(d.customer_email, ''),
       coalesce(d.customer_phone, ''),
       d.mrr,
       'pre', 'ontrack', now()::date,
       coalesce(d.closed_at::date, now()::date)
from public.ae_deals d
where d.status = 'Closed Won'
on conflict (ae_deal_id) do nothing;
