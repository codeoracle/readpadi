revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.consume_ai_credit(uuid) from public, anon, authenticated;
revoke execute on function public.grant_pro(text, uuid, int) from public, anon, authenticated;
revoke execute on function public.admin_grant_pro(uuid, int) from public, anon;
revoke execute on function public.admin_list_users(text) from public, anon;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.class_stats() from public, anon;
revoke execute on function public.my_ai_status() from public, anon;
grant execute on function public.admin_grant_pro(uuid, int), public.admin_list_users(text), public.admin_set_role(uuid, text),
  public.admin_stats(), public.class_stats(), public.my_ai_status() to authenticated;
-- is_staff / is_admin stay executable: RLS policies on courses and storage call them for every reader.
grant execute on function public.consume_ai_credit(uuid), public.grant_pro(text, uuid, int) to service_role;
