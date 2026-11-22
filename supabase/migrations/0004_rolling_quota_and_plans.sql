-- Free AI actions refill on a rolling window (e.g. 10 every 6 hours) instead of once a day.
-- Non-destructive: old columns (free_daily_limit, pro_price_ngn, pro_days) are kept but no longer used.
alter table public.settings add column if not exists free_limit int not null default 10 check (free_limit >= 0);
alter table public.settings add column if not exists free_window_hours int not null default 6 check (free_window_hours between 1 and 48);
alter table public.settings add column if not exists plans jsonb not null default '[{"id":"week","label":"Week pass","days":7,"price_ngn":500},{"id":"month","label":"Month pass","days":30,"price_ngn":1500},{"id":"semester","label":"Semester pass","days":150,"price_ngn":3500}]';
alter table public.settings add column if not exists locker_free_items int not null default 30 check (locker_free_items >= 0);
alter table public.settings add column if not exists referral_every int not null default 3 check (referral_every >= 1);
alter table public.settings add column if not exists referral_days int not null default 7 check (referral_days >= 0);

create table if not exists public.ai_quota (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_start timestamptz not null default now(),
  used int not null default 0
);
alter table public.ai_quota enable row level security;
create policy "ai_quota read own" on public.ai_quota for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_quota from anon, authenticated;

alter table public.payments add column if not exists plan text not null default 'month';
alter table public.payments add column if not exists days int not null default 30;

create or replace function public.consume_ai_credit(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_limit int; v_hours int; v_pro boolean; q public.ai_quota%rowtype;
  v_day date := (now() at time zone 'Africa/Lagos')::date;
begin
  select free_limit, free_window_hours into v_limit, v_hours from public.settings where id = 1;
  select coalesce(pro_until > now(), false) or role in ('admin', 'moderator') into v_pro from public.profiles where id = p_user;
  if v_pro is null then return json_build_object('allowed', false, 'reason', 'no_profile'); end if;
  if v_pro then
    insert into public.ai_usage (user_id, day, count) values (p_user, v_day, 1)
      on conflict (user_id, day) do update set count = public.ai_usage.count + 1;
    return json_build_object('allowed', true, 'pro', true);
  end if;
  insert into public.ai_quota (user_id) values (p_user) on conflict do nothing;
  select * into q from public.ai_quota where user_id = p_user for update;
  if now() >= q.window_start + make_interval(hours => v_hours) then
    update public.ai_quota set window_start = now(), used = 0 where user_id = p_user returning * into q;
  end if;
  if q.used >= v_limit then
    return json_build_object('allowed', false, 'reason', 'limit', 'limit', v_limit, 'resets_at', q.window_start + make_interval(hours => v_hours));
  end if;
  update public.ai_quota set used = used + 1 where user_id = p_user returning * into q;
  insert into public.ai_usage (user_id, day, count) values (p_user, v_day, 1)
    on conflict (user_id, day) do update set count = public.ai_usage.count + 1;
  return json_build_object('allowed', true, 'pro', false, 'used', q.used, 'limit', v_limit, 'resets_at', q.window_start + make_interval(hours => v_hours));
end $$;

create or replace function public.my_ai_status_v2()
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_limit int; v_hours int; q public.ai_quota%rowtype; p public.profiles%rowtype; v_fresh boolean;
begin
  select free_limit, free_window_hours into v_limit, v_hours from public.settings where id = 1;
  select * into p from public.profiles where id = (select auth.uid());
  select * into q from public.ai_quota where user_id = (select auth.uid());
  v_fresh := q.user_id is null or now() >= q.window_start + make_interval(hours => v_hours);
  return json_build_object(
    'used', case when v_fresh then 0 else q.used end, 'limit', v_limit, 'window_hours', v_hours,
    'resets_at', case when v_fresh then null else q.window_start + make_interval(hours => v_hours) end,
    'pro', coalesce(p.pro_until > now(), false) or coalesce(p.role in ('admin', 'moderator'), false),
    'pro_until', p.pro_until);
end $$;
create or replace function public.my_ai_status()
returns json language sql stable security definer set search_path = '' as $$ select public.my_ai_status_v2(); $$;
revoke execute on function public.my_ai_status(), public.my_ai_status_v2() from public, anon;
grant execute on function public.my_ai_status(), public.my_ai_status_v2() to authenticated;

-- Pro is granted for the days recorded on the payment row (set from the chosen plan at checkout).
create or replace function public.grant_pro(p_reference text, p_user uuid, p_amount_kobo int)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_days int; v_until timestamptz; v_changed int;
begin
  update public.payments set status = 'success', paid_at = now()
    where reference = p_reference and user_id = p_user and status <> 'success'
    returning days into v_days;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then select pro_until into v_until from public.profiles where id = p_user; return v_until; end if;
  update public.profiles set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => v_days)
    where id = p_user returning pro_until into v_until;
  return v_until;
end $$;
revoke execute on function public.grant_pro(text, uuid, int) from public, anon, authenticated;
grant execute on function public.grant_pro(text, uuid, int) to service_role;
