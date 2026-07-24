-- ============================================================
-- src/43-collected-not-closed.sql
-- "Collected but not closed" — surface (and later auto-close) deals whose customer
-- is already paying in Stripe but whose ae_deal is still open. Detection RPC +
-- an auto_closed_at flag for the Phase-B daily job.
--
-- collected_not_closed() returns each open deal whose customer has collected Stripe
-- cash, with: collected amount, the customer's Stripe id, and already_closed (does
-- this customer ALREADY have a Closed Won deal — the "don't double-close" guard we
-- learned from Ryan). is_full (collected >= expected upfront) is derived client-side.
--
-- Gated: executives see all; an AE sees only their own deals. SECURITY DEFINER
-- because AEs can't read commission_customers directly. Idempotent.
-- ============================================================

alter table public.ae_deals add column if not exists auto_closed_at timestamptz;

drop function if exists public.collected_not_closed();
create or replace function public.collected_not_closed()
returns table (
  deal_id uuid, customer_name text, customer_email text, status text,
  one_time numeric, mrr numeric, ae_id uuid, ae_name text,
  stripe_customer_id text, collected numeric, already_closed boolean
)
language plpgsql security definer set search_path to 'public'
as $cnc$
declare v_role text; v_role_type text; v_is_exec boolean;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  v_is_exec := (v_role = 'executive' or v_role_type = 'executive' or v_role_type in ('ceo','coo','cto','cfo'));

  return query
  with open_deals as (
    select d.id, d.customer_name, d.customer_email, d.payment_email, d.status,
           d.one_time, d.mrr, d.ae_id, d.matched_stripe_customer_id
    from public.ae_deals d
    where d.status not in ('Closed Won','Closed Lost','Deposit collected','Deleted','Unqualified','No-show','Intro','Rescheduled')
      and (v_is_exec or d.ae_id = auth.uid())
  ),
  linked as (
    select distinct on (od.id)
           od.id as deal_id, od.customer_name, od.customer_email, od.status, od.one_time, od.mrr, od.ae_id,
           cc.stripe_customer_id, cc.monthly_cash_received, cc.monthly_cash_received_manual
    from open_deals od
    join public.commission_customers cc
      on cc.stripe_customer_id = od.matched_stripe_customer_id
      or lower(cc.email) = lower(coalesce(od.customer_email,''))
      or lower(cc.email) = lower(coalesce(od.payment_email,''))
    order by od.id
  )
  select l.deal_id, l.customer_name, l.customer_email, l.status, l.one_time, l.mrr, l.ae_id,
         (select p2.name from public.profiles p2 where p2.id = l.ae_id) as ae_name,
         l.stripe_customer_id,
         coalesce((select sum(x.v::numeric) from jsonb_each_text(coalesce(l.monthly_cash_received,'{}'::jsonb)) as x(k,v)), 0)
       + coalesce((select sum(x.v::numeric) from jsonb_each_text(coalesce(l.monthly_cash_received_manual,'{}'::jsonb)) as x(k,v)), 0) as collected,
         exists(
           select 1 from public.ae_deals w
           where w.status = 'Closed Won'
             and (w.matched_stripe_customer_id = l.stripe_customer_id
                  or lower(coalesce(w.customer_email,'')) = lower(coalesce(l.customer_email,'')))
         ) as already_closed
  from linked l;
end;
$cnc$;
grant execute on function public.collected_not_closed() to authenticated;
