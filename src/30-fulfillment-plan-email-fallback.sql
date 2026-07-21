-- ============================================================================
--  30-fulfillment-plan-email-fallback.sql
--  Plan (Stripe) was only populating for customers whose DEAL had a matched
--  Stripe customer id (e.g. STEVEN DIETZ). Customers closed without a Stripe
--  match (e.g. Rob Hannah — matched_stripe_customer_id null) got no plan even
--  though they're in commission_customers under their payment EMAIL.
--
--  Fix: match commission_customers by stripe_customer_id OR by email. Also
--  backfill the missing matched_stripe_customer_id from the email match.
--  Requires 29. Safe to re-run.
-- ============================================================================

-- Broaden the plan lookup: match by Stripe id OR email.
drop function if exists public.stripe_plan_label(text);
create or replace function public.stripe_plan_label(p_customer_id text, p_email text default null)
returns text
language sql
security definer
set search_path = public
as $$
  select nullif(string_agg(distinct (s->>'product_label'), ', '), '')
  from public.commission_customers cc
  cross join lateral jsonb_array_elements(coalesce(cc.subscriptions, '[]'::jsonb)) s
  where coalesce(s->>'product_label', '') <> ''
    and (
      (p_customer_id is not null and cc.stripe_customer_id = p_customer_id)
      or (p_email is not null and p_email <> '' and lower(cc.email) = lower(p_email))
    );
$$;

-- Closed-won trigger: pass the payment email as the fallback key.
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
         coalesce(nullif(new.payment_email, ''), new.customer_email, ''),
         new.mrr, new.one_time,
         new.matched_stripe_customer_id,
         public.stripe_plan_label(new.matched_stripe_customer_id,
                                  coalesce(nullif(new.payment_email, ''), new.customer_email)),
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

-- commission_customers → refresh plan on any fulfillment row matching by id OR email.
create or replace function public.commission_customer_to_fulfillment_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fulfillment_clients f
    set plan_label = public.stripe_plan_label(new.stripe_customer_id, new.email)
    where f.matched_stripe_customer_id = new.stripe_customer_id
       or lower(coalesce(nullif(f.atlas_username, ''), f.poc_email, '')) = lower(new.email);
  return new;
end;
$$;

-- Backfill: (1) fill the missing Stripe id from an email match, (2) recompute plan.
update public.fulfillment_clients f
  set matched_stripe_customer_id = cc.stripe_customer_id
  from public.commission_customers cc
  where f.matched_stripe_customer_id is null
    and coalesce(nullif(f.atlas_username, ''), f.poc_email, '') <> ''
    and lower(cc.email) = lower(coalesce(nullif(f.atlas_username, ''), f.poc_email));

update public.fulfillment_clients f
  set plan_label = public.stripe_plan_label(f.matched_stripe_customer_id,
                                            coalesce(nullif(f.atlas_username, ''), f.poc_email));
