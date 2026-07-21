-- ============================================================================
--  29-fulfillment-sales-context.sql
--  Carry the sales/Stripe context the AE already captured into the fulfillment
--  row, so CS/FDE see it on the client drawer + we can measure Time-to-First-Value.
--
--  New fulfillment_clients columns + an enriched (and FAIL-SAFE) closed-won
--  trigger. Requires 27 + 28. Safe to re-run.
-- ============================================================================

alter table public.fulfillment_clients add column if not exists one_time numeric;
alter table public.fulfillment_clients add column if not exists matched_stripe_customer_id text;
alter table public.fulfillment_clients add column if not exists plan_label text;          -- real Stripe plan(s), read-only
alter table public.fulfillment_clients add column if not exists closed_by text;            -- AE who closed it
alter table public.fulfillment_clients add column if not exists referred_by_partner text;

-- Stripe plan label(s) for a customer, from the nightly stripe-sync data.
-- (commission_customers.subscriptions is a jsonb array of { product_label, ... }.)
create or replace function public.stripe_plan_label(p_customer_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select nullif(string_agg(distinct (s->>'product_label'), ', '), '')
  from public.commission_customers cc
  cross join lateral jsonb_array_elements(coalesce(cc.subscriptions, '[]'::jsonb)) s
  where p_customer_id is not null
    and cc.stripe_customer_id = p_customer_id
    and coalesce(s->>'product_label', '') <> '';
$$;

-- Enriched closed-won → fulfillment routing. Wrapped in an exception handler so a
-- fulfillment insert can NEVER block an AE from closing a deal.
create or replace function public.ae_deal_to_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Closed Won'
     and (tg_op = 'INSERT' or old.status is distinct from 'Closed Won') then
    begin
      insert into public.fulfillment_clients
        (ae_deal_id, name, poc_email, poc_phone, atlas_username, mrr, one_time,
         matched_stripe_customer_id, plan_label, closed_by, referred_by_partner,
         stage, status, status_date, payment_date)
      values
        (new.id,
         coalesce(new.customer_name, ''),
         coalesce(new.customer_email, ''),
         coalesce(new.customer_phone, ''),
         coalesce(nullif(new.payment_email, ''), new.customer_email, ''),   -- ATLAS username = payment email
         new.mrr, new.one_time,
         new.matched_stripe_customer_id,
         public.stripe_plan_label(new.matched_stripe_customer_id),
         (select p.name from public.profiles p where p.id = new.ae_id),
         new.referred_by_partner,
         'pre', 'ontrack', now()::date,
         coalesce(new.closed_at::date, now()::date))
      on conflict (ae_deal_id) do nothing;
    exception when others then
      raise warning 'ae_deal_to_fulfillment failed for deal %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create index if not exists fulfillment_clients_stripe_idx
  on public.fulfillment_clients (matched_stripe_customer_id);

-- Keep plan_label fresh: when the nightly stripe-sync upserts a customer, refresh
-- the plan on any fulfillment row linked to that Stripe customer. Decoupled from
-- the stripe-sync function itself (pure SQL) so nothing about the revenue sync changes.
create or replace function public.commission_customer_to_fulfillment_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fulfillment_clients
    set plan_label = public.stripe_plan_label(new.stripe_customer_id)
    where matched_stripe_customer_id = new.stripe_customer_id;
  return new;
end;
$$;
drop trigger if exists trg_commission_customer_fulfillment_plan on public.commission_customers;
create trigger trg_commission_customer_fulfillment_plan
  after insert or update on public.commission_customers
  for each row execute function public.commission_customer_to_fulfillment_plan();

-- Backfill the new columns onto rows that already exist (created by 28's backfill).
update public.fulfillment_clients f set
  one_time                   = d.one_time,
  matched_stripe_customer_id = d.matched_stripe_customer_id,
  referred_by_partner        = d.referred_by_partner,
  closed_by                  = coalesce(f.closed_by, (select p.name from public.profiles p where p.id = d.ae_id)),
  atlas_username             = case when coalesce(f.atlas_username, '') = ''
                                    then coalesce(nullif(d.payment_email, ''), d.customer_email, '')
                                    else f.atlas_username end,
  plan_label                 = coalesce(nullif(f.plan_label, ''), public.stripe_plan_label(d.matched_stripe_customer_id))
from public.ae_deals d
where f.ae_deal_id = d.id;
