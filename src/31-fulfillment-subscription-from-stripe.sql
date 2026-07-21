-- ============================================================================
--  31-fulfillment-subscription-from-stripe.sql
--  The "Subscription" field should hold the REAL Stripe plan (product_label),
--  not the hardcoded Starter/Pro/White-Label tier. Drop the CHECK, and populate
--  subscription from the same source as plan_label. Requires 29 + 30. Re-runnable.
-- ============================================================================

-- 1) Drop the Starter/Pro/White-Label CHECK (find it by definition, name-agnostic).
do $$
declare cn text;
begin
  select conname into cn
  from pg_constraint
  where conrelid = 'public.fulfillment_clients'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%subscription%';
  if cn is not null then
    execute format('alter table public.fulfillment_clients drop constraint %I', cn);
  end if;
end $$;

alter table public.fulfillment_clients alter column subscription set default '';

-- 2) Keep subscription in sync with the Stripe plan on the nightly commission sync.
--    Fill-if-blank ('' or the legacy 'Starter' default) so a real manual pick isn't clobbered.
create or replace function public.commission_customer_to_fulfillment_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare lbl text;
begin
  lbl := public.stripe_plan_label(new.stripe_customer_id, new.email);
  update public.fulfillment_clients f set
    plan_label   = lbl,
    subscription = case when coalesce(f.subscription, '') in ('', 'Starter')
                        then coalesce(lbl, f.subscription)
                        else f.subscription end
  where f.matched_stripe_customer_id = new.stripe_customer_id
     or lower(coalesce(nullif(f.atlas_username, ''), f.poc_email, '')) = lower(new.email);
  return new;
end;
$$;

-- 3) Backfill: subscription := the real Stripe plan wherever we have one.
update public.fulfillment_clients
  set subscription = plan_label
  where coalesce(plan_label, '') <> '';
