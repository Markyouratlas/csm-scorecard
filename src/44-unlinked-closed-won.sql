-- ============================================================
-- src/44-unlinked-closed-won.sql
-- "Unlinked Closed Won" linker — Closed Won ae_deals that never got matched to a
-- Stripe customer (matched_stripe_customer_id IS NULL), usually because the deal's
-- contact email ≠ the Stripe payment email (the Greg McCue case). Until linked,
-- their cash is invisible to commission + the Fulfillment TTFV/billing panel.
--
-- Three exec-gated SECURITY DEFINER functions (AEs/CSMs can't read
-- commission_customers directly):
--   unlinked_closed_won()               -> the deals that need linking
--   stripe_candidates_for_deal(p_deal)  -> ranked Stripe customers to pick from
--   link_deal_to_stripe(p_deal, p_sid)  -> writes the id onto the deal AND its
--                                          fulfillment_clients row (propagates)
-- Idempotent to re-run.
-- ============================================================

-- Helper: is the caller an executive?
create or replace function public._is_exec()
returns boolean language sql stable security definer set search_path to 'public' as $isx$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'executive' or p.role_type = 'executive' or p.role_type in ('ceo','coo','cto','cfo'))
  );
$isx$;

-- ------------------------------------------------------------
-- 1. Closed Won deals with no Stripe link.
-- ------------------------------------------------------------
drop function if exists public.unlinked_closed_won();
create or replace function public.unlinked_closed_won()
returns table (
  deal_id uuid, customer_name text, customer_email text, payment_email text,
  one_time numeric, mrr numeric, ae_id uuid, ae_name text, closed_at timestamptz
)
language sql security definer set search_path to 'public' as $ucw$
  select d.id, d.customer_name, d.customer_email, d.payment_email, d.one_time, d.mrr,
         d.ae_id, (select p.name from public.profiles p where p.id = d.ae_id) as ae_name, d.closed_at
  from public.ae_deals d
  where public._is_exec()
    and d.status = 'Closed Won'
    and d.matched_stripe_customer_id is null
  order by d.closed_at desc nulls last;
$ucw$;
grant execute on function public.unlinked_closed_won() to authenticated;

-- ------------------------------------------------------------
-- 2. Ranked Stripe-customer candidates for one deal (email / name / domain signal).
-- ------------------------------------------------------------
drop function if exists public.stripe_candidates_for_deal(uuid);
create or replace function public.stripe_candidates_for_deal(p_deal_id uuid)
returns table (stripe_customer_id text, name text, email text, collected numeric, score int)
language plpgsql security definer set search_path to 'public' as $scd$
declare d_name text; d_email text; d_pemail text;
begin
  if not public._is_exec() then return; end if;
  select lower(coalesce(customer_name,'')), lower(coalesce(customer_email,'')), lower(coalesce(payment_email,''))
    into d_name, d_email, d_pemail
  from public.ae_deals where id = p_deal_id;

  return query
  with scored as (
    select cc.stripe_customer_id, cc.name, cc.email,
      coalesce((select sum(x.v::numeric) from jsonb_each_text(coalesce(cc.monthly_cash_received,'{}'::jsonb)) as x(k,v)),0)
    + coalesce((select sum(x.v::numeric) from jsonb_each_text(coalesce(cc.monthly_cash_received_manual,'{}'::jsonb)) as x(k,v)),0) as collected,
      (case
        when d_email <> '' and lower(coalesce(cc.email,'')) = d_email then 100
        when d_pemail <> '' and lower(coalesce(cc.email,'')) = d_pemail then 95
        when d_name <> '' and lower(coalesce(cc.name,'')) = d_name then 80
        when d_name <> '' and (lower(coalesce(cc.name,'')) like '%'||d_name||'%' or d_name like '%'||lower(coalesce(cc.name,''))||'%') then 60
        when d_email <> '' and split_part(lower(coalesce(cc.email,'')),'@',2) = split_part(d_email,'@',2)
             and split_part(d_email,'@',2) not in ('gmail.com','outlook.com','hotmail.com','yahoo.com','icloud.com') then 40
        else 0
      end) as score
    from public.commission_customers cc
  )
  select s.stripe_customer_id, s.name, s.email, s.collected, s.score
  from scored s
  where s.score > 0
  order by s.score desc, s.collected desc
  limit 8;
end;
$scd$;
grant execute on function public.stripe_candidates_for_deal(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Link a deal to a Stripe customer — writes the id onto the deal AND its
--    fulfillment_clients row so billing/TTFV pick it up too.
-- ------------------------------------------------------------
drop function if exists public.link_deal_to_stripe(uuid, text);
create or replace function public.link_deal_to_stripe(p_deal_id uuid, p_stripe_customer_id text)
returns void language plpgsql security definer set search_path to 'public' as $lds$
begin
  if not public._is_exec() then raise exception 'not authorized'; end if;
  update public.ae_deals set matched_stripe_customer_id = p_stripe_customer_id where id = p_deal_id;
  update public.fulfillment_clients set matched_stripe_customer_id = p_stripe_customer_id where ae_deal_id = p_deal_id;
end;
$lds$;
grant execute on function public.link_deal_to_stripe(uuid, text) to authenticated;
