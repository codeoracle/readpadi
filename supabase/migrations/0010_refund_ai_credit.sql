-- Give back a credit when the AI provider fails, so students don't lose free actions to outages.
create or replace function public.refund_ai_credit(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'Africa/Lagos')::date;
begin
  update public.ai_quota set used = greatest(used - 1, 0) where user_id = p_user;
  update public.ai_usage set count = greatest(count - 1, 0) where user_id = p_user and day = v_day;
end $$;
revoke execute on function public.refund_ai_credit(uuid) from public, anon, authenticated;
grant execute on function public.refund_ai_credit(uuid) to service_role;
