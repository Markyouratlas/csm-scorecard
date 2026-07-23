-- ============================================================
-- src/42-pay-fix-complete-rpc.sql
-- Exec marks a payment-fix ticket completed (after fixing Stripe). Exec-gated
-- SECURITY DEFINER because an exec updates another AE's deal (RLS wouldn't allow a
-- direct client write). Moves 'flagged' -> 'fixed', which then notifies the AE.
-- Idempotent. Paste into the Supabase SQL editor.
-- ============================================================

drop function if exists public.pay_fix_complete(uuid);
create or replace function public.pay_fix_complete(p_deal_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $pfc$
declare v_role text; v_role_type text;
begin
  select p.role, p.role_type into v_role, v_role_type from public.profiles p where p.id = auth.uid() limit 1;
  if not (v_role = 'executive' or v_role_type = 'executive' or v_role_type in ('ceo','coo','cto','cfo')) then
    raise exception 'Not authorized to complete payment fixes' using errcode = '42501';
  end if;
  update public.ae_deals
     set pay_fix_status = 'fixed', pay_fix_completed_by = auth.uid(), pay_fix_completed_at = now(), updated_at = now()
   where id = p_deal_id and pay_fix_status = 'flagged';
end;
$pfc$;
grant execute on function public.pay_fix_complete(uuid) to authenticated;
