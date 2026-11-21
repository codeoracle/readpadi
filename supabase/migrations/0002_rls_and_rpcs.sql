alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.progress enable row level security;
alter table public.exams enable row level security;
alter table public.notes enable row level security;
alter table public.attempts enable row level security;
alter table public.ai_usage enable row level security;
alter table public.payments enable row level security;

create policy "settings readable" on public.settings for select to anon, authenticated using (true);
create policy "settings admin update" on public.settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, delete on public.settings from anon, authenticated;

create policy "profiles read own or staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, school, programme, level, centre, session) on public.profiles to authenticated;

create policy "courses read" on public.courses for select to anon, authenticated
  using (status = 'approved' or uploaded_by = (select auth.uid()) or (select public.is_staff()));
create policy "courses insert own pending" on public.courses for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and status = 'pending');
create policy "courses staff update" on public.courses for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "courses delete own pending or admin" on public.courses for delete to authenticated
  using ((uploaded_by = (select auth.uid()) and status <> 'approved') or (select public.is_admin()));
revoke insert, update on public.courses from anon;
revoke update on public.courses from authenticated;
grant update (code, title, school, description, status, reject_reason, reviewed_by, reviewed_at, pages) on public.courses to authenticated;

create policy "progress own" on public.progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "exams own" on public.exams for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notes own" on public.notes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "attempts own" on public.attempts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ai_usage read own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
create policy "payments read own" on public.payments for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage, public.payments from anon, authenticated;
revoke all on public.progress, public.exams, public.notes, public.attempts from anon;

create or replace function public.class_stats()
returns table (course_id uuid, students int, avg_best int)
language sql stable security definer set search_path = '' as $$
  select b.course_id, count(*)::int, round(avg(b.best))::int
  from (select a.course_id, a.user_id, max(a.pct) as best from public.attempts a group by 1, 2) b
  join public.courses c on c.id = b.course_id and c.status = 'approved'
  group by b.course_id;
$$;

create or replace function public.my_ai_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'used', coalesce((select u.count from public.ai_usage u where u.user_id = (select auth.uid()) and u.day = (now() at time zone 'Africa/Lagos')::date), 0),
    'limit', (select s.free_daily_limit from public.settings s where s.id = 1),
    'pro_until', (select p.pro_until from public.profiles p where p.id = (select auth.uid())),
    'pro', coalesce((select p.pro_until > now() from public.profiles p where p.id = (select auth.uid())), false)
  );
$$;

create or replace function public.consume_ai_credit(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_limit int; v_pro boolean; v_count int;
begin
  select free_daily_limit into v_limit from public.settings where id = 1;
  select coalesce(pro_until > now(), false) or role in ('admin', 'moderator') into v_pro from public.profiles where id = p_user;
  if v_pro is null then return json_build_object('allowed', false, 'reason', 'no_profile'); end if;
  insert into public.ai_usage (user_id, day, count) values (p_user, v_day, 0) on conflict do nothing;
  if v_pro then
    update public.ai_usage set count = count + 1 where user_id = p_user and day = v_day returning count into v_count;
    return json_build_object('allowed', true, 'pro', true, 'used', v_count, 'limit', v_limit);
  end if;
  update public.ai_usage set count = count + 1 where user_id = p_user and day = v_day and count < v_limit returning count into v_count;
  if v_count is null then return json_build_object('allowed', false, 'reason', 'limit', 'limit', v_limit); end if;
  return json_build_object('allowed', true, 'pro', false, 'used', v_count, 'limit', v_limit);
end $$;

create or replace function public.grant_pro(p_reference text, p_user uuid, p_amount_kobo int)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_days int; v_until timestamptz; v_inserted int;
begin
  select pro_days into v_days from public.settings where id = 1;
  insert into public.payments (reference, user_id, amount_kobo, status, paid_at)
    values (p_reference, p_user, p_amount_kobo, 'success', now())
    on conflict (reference) do update set status = 'success', paid_at = coalesce(public.payments.paid_at, now())
      where public.payments.status <> 'success';
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then select pro_until into v_until from public.profiles where id = p_user; return v_until; end if;
  update public.profiles set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => v_days)
    where id = p_user returning pro_until into v_until;
  return v_until;
end $$;

create or replace function public.admin_list_users(p_search text default '')
returns table (id uuid, email text, name text, school text, role text, pro_until timestamptz, created_at timestamptz, used_today int, attempts int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.email, p.name, p.school, p.role, p.pro_until, p.created_at,
      coalesce((select u.count from public.ai_usage u where u.user_id = p.id and u.day = (now() at time zone 'Africa/Lagos')::date), 0),
      (select count(*)::int from public.attempts a where a.user_id = p.id)
    from public.profiles p
    where p_search = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%'
    order by p.created_at desc limit 200;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('student', 'moderator', 'admin') then raise exception 'bad role'; end if;
  if p_user = (select auth.uid()) and p_role <> 'admin' then raise exception 'You cannot remove your own admin role'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.admin_grant_pro(p_user uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.profiles
    set pro_until = case when p_days <= 0 then null else greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days) end
    where id = p_user returning pro_until into v_until;
  return v_until;
end $$;

create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return json_build_object(
    'students', (select count(*) from public.profiles),
    'pro', (select count(*) from public.profiles where pro_until > now()),
    'courses', (select count(*) from public.courses where status = 'approved'),
    'pending', (select count(*) from public.courses where status = 'pending'),
    'tests_7d', (select count(*) from public.attempts where created_at > now() - interval '7 days'),
    'ai_today', (select coalesce(sum(count), 0) from public.ai_usage where day = (now() at time zone 'Africa/Lagos')::date),
    'revenue_kobo', (select coalesce(sum(amount_kobo), 0) from public.payments where status = 'success')
  );
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "materials upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials read if visible" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.courses c where c.file_path = name and (c.status = 'approved' or (select public.is_staff())))
  ));
create policy "materials delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
