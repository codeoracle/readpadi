-- ============ profiles: referral code, referrer, leaderboard opt-out ============
alter table public.profiles add column if not exists referral_code text unique default lower(substr(md5(gen_random_uuid()::text), 1, 7));
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists show_on_board boolean not null default true;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);
create index if not exists profiles_school_idx on public.profiles (lower(school));
grant update (show_on_board) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, role, referral_code)
  values (
    new.id, new.email,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), left(new.raw_user_meta_data ->> 'name', 80), ''),
    case when new.email = any ((select admin_emails from public.settings where id = 1)) then 'admin' else 'student' end,
    lower(substr(md5(new.id::text || clock_timestamp()::text), 1, 7))
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ============ XP log: earned server-side only, from real study activity ============
create table if not exists public.study_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'Africa/Lagos')::date),
  xp int not null default 0,
  read_xp int not null default 0,
  primary key (user_id, day)
);
alter table public.study_log enable row level security;
create policy "study_log read own" on public.study_log for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.study_log from anon, authenticated;

-- Tests: 10 XP per mark earned, +20 for a pass, capped at 300 per test.
create or replace function public.xp_from_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.study_log (user_id, xp) values (new.user_id, least(300, round(new.score * 10)::int + case when new.pct >= 50 then 20 else 0 end))
    on conflict (user_id, day) do update set xp = public.study_log.xp + excluded.xp;
  return new;
end $$;
create trigger attempts_xp after insert on public.attempts for each row execute function public.xp_from_attempt();

-- Reading: 1 XP per new page read, capped at 100 reading XP per day.
create or replace function public.xp_from_reading() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_new int; v_old int; v_gain int; v_day date := (now() at time zone 'Africa/Lagos')::date; v_have int;
begin
  v_new := length(new.seen) - length(replace(new.seen, '1', ''));
  v_old := case when tg_op = 'UPDATE' then length(old.seen) - length(replace(old.seen, '1', '')) else 0 end;
  if v_new <= v_old then return new; end if;
  select read_xp into v_have from public.study_log where user_id = new.user_id and day = v_day;
  v_gain := least(v_new - v_old, 100 - coalesce(v_have, 0));
  if v_gain > 0 then
    insert into public.study_log (user_id, day, xp, read_xp) values (new.user_id, v_day, v_gain, v_gain)
      on conflict (user_id, day) do update set xp = public.study_log.xp + v_gain, read_xp = public.study_log.read_xp + v_gain;
  end if;
  return new;
end $$;
create trigger progress_xp after insert or update of seen on public.progress for each row execute function public.xp_from_reading();
revoke execute on function public.xp_from_attempt(), public.xp_from_reading() from public, anon, authenticated;

-- Level ladder (XP thresholds) — mirrored in lib/levels.ts.
create or replace function public.level_for(p_xp int) returns int language sql immutable as $$
  select case when p_xp >= 12000 then 7 when p_xp >= 6000 then 6 when p_xp >= 3000 then 5 when p_xp >= 1500 then 4
              when p_xp >= 600 then 3 when p_xp >= 200 then 2 else 1 end;
$$;

create or replace function public.my_level()
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_total int; v_week int; v_today_xp int; v_streak int := 0; d date; v_refs int; p public.profiles%rowtype; s public.settings%rowtype;
begin
  select coalesce(sum(xp), 0) into v_total from public.study_log where user_id = v_uid;
  select coalesce(sum(xp), 0) into v_week from public.study_log where user_id = v_uid and day > v_today - 7;
  select coalesce(sum(xp), 0) into v_today_xp from public.study_log where user_id = v_uid and day = v_today;
  -- streak: consecutive days with XP, counting back from today (or yesterday if nothing yet today)
  d := case when v_today_xp > 0 then v_today else v_today - 1 end;
  while exists (select 1 from public.study_log where user_id = v_uid and day = d and xp > 0) loop
    v_streak := v_streak + 1; d := d - 1;
  end loop;
  select * into p from public.profiles where id = v_uid;
  select * into s from public.settings where id = 1;
  select count(*) into v_refs from public.profiles where referred_by = v_uid;
  return json_build_object('xp', v_total, 'week_xp', v_week, 'today_xp', v_today_xp, 'streak', v_streak,
    'level', public.level_for(v_total), 'referral_code', p.referral_code, 'referrals', v_refs,
    'referral_every', s.referral_every, 'referral_days', s.referral_days, 'show_on_board', p.show_on_board);
end $$;

-- Weekly leaderboard: last 7 days of XP. Names shown as "First L." only, opt-out respected.
create or replace function public.leaderboard(p_school_only boolean default true)
returns table (rank int, display_name text, school text, week_xp int, level int, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select id, lower(trim(school)) as school from public.profiles where id = (select auth.uid())),
  w as (
    select l.user_id, sum(l.xp)::int as week_xp from public.study_log l
    where l.day > (now() at time zone 'Africa/Lagos')::date - 7 group by l.user_id having sum(l.xp) > 0
  ),
  t as (select l.user_id, sum(l.xp)::int as total from public.study_log l group by l.user_id),
  ranked as (
    select p.id, p.name, p.school, w.week_xp, public.level_for(coalesce(t.total, 0)) as level,
      rank() over (order by w.week_xp desc)::int as rank
    from w join public.profiles p on p.id = w.user_id left join t on t.user_id = w.user_id, me
    where (p.show_on_board or p.id = me.id) and (not p_school_only or me.school = '' or lower(trim(p.school)) = me.school)
  )
  select r.rank,
    case when r.name = '' then 'Student' else split_part(trim(r.name), ' ', 1) || coalesce(' ' || nullif(left(split_part(trim(r.name), ' ', 2), 1), '') || '.', '') end,
    r.school, r.week_xp, r.level, r.id = (select id from me)
  from ranked r
  where r.rank <= 20 or r.id = (select id from me)
  order by r.rank limit 21;
$$;
revoke execute on function public.my_level(), public.leaderboard(boolean) from public, anon;
grant execute on function public.my_level(), public.leaderboard(boolean) to authenticated;

-- ============ referrals ============
create or replace function public.claim_referral(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_owner uuid; v_count int; s public.settings%rowtype; me public.profiles%rowtype;
begin
  select * into me from public.profiles where id = v_uid;
  if me.referred_by is not null or me.created_at < now() - interval '3 days' then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;
  select id into v_owner from public.profiles where referral_code = lower(trim(p_code));
  if v_owner is null or v_owner = v_uid then return json_build_object('ok', false, 'reason', 'bad_code'); end if;
  update public.profiles set referred_by = v_owner where id = v_uid;
  select * into s from public.settings where id = 1;
  select count(*) into v_count from public.profiles where referred_by = v_owner;
  if s.referral_days > 0 and v_count % s.referral_every = 0 then
    update public.profiles set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => s.referral_days) where id = v_owner;
  end if;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ============ Locker: a student's private documents by academic year ============
create table if not exists public.locker_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'other' check (category in ('receipt', 'course_form', 'result', 'admission', 'id_card', 'timetable', 'material', 'other')),
  academic_year text not null default '' check (char_length(academic_year) <= 20),
  semester text not null default '' check (char_length(semester) <= 20),
  level text not null default '' check (char_length(level) <= 30),
  amount_ngn numeric check (amount_ngn is null or amount_ngn >= 0),
  doc_date date,
  notes text not null default '' check (char_length(notes) <= 500),
  file_path text not null unique,
  file_bytes bigint not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists locker_user_year_idx on public.locker_items (user_id, academic_year, created_at desc);
alter table public.locker_items enable row level security;
create policy "locker own" on public.locker_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.locker_items from anon;

create or replace function public.locker_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pro boolean; v_n int; v_max int;
begin
  select coalesce(pro_until > now(), false) or role in ('admin', 'moderator') into v_pro from public.profiles where id = new.user_id;
  if v_pro then return new; end if;
  select locker_free_items into v_max from public.settings where id = 1;
  select count(*) into v_n from public.locker_items where user_id = new.user_id;
  if v_n >= v_max then raise exception 'locker_full' using hint = 'Free accounts can keep ' || v_max || ' documents. Get Pro for unlimited.'; end if;
  return new;
end $$;
create trigger locker_limit before insert on public.locker_items for each row execute function public.locker_limit();
revoke execute on function public.locker_limit() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locker', 'locker', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "locker files own" on storage.objects for all to authenticated
  using (bucket_id = 'locker' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'locker' and (storage.foldername(name))[1] = (select auth.uid())::text);
