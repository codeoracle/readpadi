-- Phone (SMS OTP) sign-in support: store the phone on the profile and show it to admins when there is no email.
alter table public.profiles add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_admins text[];
begin
  select admin_emails into v_admins from public.settings where id = 1;
  insert into public.profiles (id, email, phone, name, role, referral_code)
  values (
    new.id, new.email, nullif(new.phone, ''),
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), left(new.raw_user_meta_data ->> 'name', 80), ''),
    case when lower(coalesce(new.email, '')) = any (coalesce(v_admins, '{}')) then 'admin' else 'student' end,
    lower(substr(md5(new.id::text || clock_timestamp()::text), 1, 7))
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.admin_list_users(p_search text default '')
returns table (id uuid, email text, name text, school text, role text, pro_until timestamptz, created_at timestamptz, used_today int, attempts int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select p.id, coalesce(p.email, p.phone), p.name, p.school, p.role, p.pro_until, p.created_at,
      coalesce((select u.count from public.ai_usage u where u.user_id = p.id and u.day = (now() at time zone 'Africa/Lagos')::date), 0),
      (select count(*)::int from public.attempts a where a.user_id = p.id)
    from public.profiles p
    where p_search = '' or p.email ilike '%' || p_search || '%' or p.phone ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit 200;
end $$;
revoke execute on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;
