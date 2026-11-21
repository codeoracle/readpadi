-- ============ Class quiz challenges ============
-- A student turns a practice test into a quiz; classmates take the same questions via a link.
-- Takers spend no AI credits. The answer key lives in a table nobody can read directly;
-- grading happens inside submit_challenge().

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{6}$'),
  creator uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null check (char_length(title) between 2 and 120),
  questions jsonb not null,
  n int not null check (n between 3 and 40),
  time_limit_secs int not null default 0 check (time_limit_secs between 0 and 7200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index if not exists challenges_creator_idx on public.challenges (creator, created_at desc);
create index if not exists challenges_course_idx on public.challenges (course_id);

create table if not exists public.challenge_keys (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  key jsonb not null
);

create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score int, total int, secs int,
  answers jsonb,
  primary key (challenge_id, user_id)
);
create index if not exists challenge_entries_user_idx on public.challenge_entries (user_id);

alter table public.challenges enable row level security;
alter table public.challenge_keys enable row level security;
alter table public.challenge_entries enable row level security;
create policy "challenge entries read own" on public.challenge_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "challenges creator delete" on public.challenges for delete to authenticated using (creator = (select auth.uid()) or (select public.is_admin()));
revoke all on public.challenges, public.challenge_keys, public.challenge_entries from anon;
revoke insert, update on public.challenges from authenticated;
revoke all on public.challenge_keys from authenticated;
revoke insert, update, delete on public.challenge_entries from authenticated;

create or replace function public.norm_answer(p text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'), '\m(the|a|an)\M', ' ', 'g'));
$$;
create or replace function public.short_name(p_name text) returns text language sql immutable as $$
  select case when coalesce(trim(p_name), '') = '' then 'Student'
    else split_part(trim(p_name), ' ', 1) || coalesce(' ' || nullif(left(split_part(trim(p_name), ' ', 2), 1), '') || '.', '') end;
$$;

-- p_items: [{type:'mcq'|'fib', q, options?, answer, accept?, explanation?, topic?, page?}]
create or replace function public.create_challenge(p_title text, p_course uuid, p_items jsonb, p_time_limit int default 0)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_code text; v_id uuid; v_q jsonb := '[]'; v_k jsonb := '[]'; it jsonb; i int := 0; v_recent int;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select count(*) into v_recent from public.challenges where creator = v_uid and created_at > now() - interval '1 day';
  if v_recent >= 20 then raise exception 'You can create up to 20 quizzes a day.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if it ->> 'type' not in ('mcq', 'fib') or coalesce(it ->> 'q', '') = '' then continue; end if;
    if it ->> 'type' = 'mcq' and (jsonb_typeof(it -> 'options') <> 'array' or jsonb_array_length(it -> 'options') < 3) then continue; end if;
    i := i + 1;
    v_q := v_q || jsonb_build_object('n', i, 'type', it ->> 'type', 'q', left(it ->> 'q', 600), 'options', coalesce(it -> 'options', '[]'), 'topic', left(coalesce(it ->> 'topic', ''), 60), 'page', it -> 'page');
    v_k := v_k || jsonb_build_object('n', i, 'type', it ->> 'type', 'answer', it -> 'answer', 'accept', coalesce(it -> 'accept', '[]'), 'explanation', left(coalesce(it ->> 'explanation', ''), 600));
    exit when i >= 40;
  end loop;
  if i < 3 then raise exception 'A quiz needs at least 3 multiple-choice or fill-in-the-gap questions.'; end if;
  loop
    v_code := lower(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.challenges where code = v_code);
  end loop;
  insert into public.challenges (code, creator, course_id, title, questions, n, time_limit_secs)
    values (v_code, v_uid, p_course, left(coalesce(nullif(trim(p_title), ''), 'Class quiz'), 120), v_q, i, greatest(0, least(coalesce(p_time_limit, 0), 7200)))
    returning id into v_id;
  insert into public.challenge_keys (challenge_id, key) values (v_id, v_k);
  return v_code;
end $$;

-- Public preview + leaderboard (works signed out, so shared links show something useful).
create or replace function public.challenge_info(p_code text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'code', c.code, 'title', c.title, 'n', c.n, 'time_limit_secs', c.time_limit_secs, 'expires_at', c.expires_at,
    'expired', c.expires_at < now(), 'creator', public.short_name(p.name), 'is_creator', c.creator = (select auth.uid()),
    'course', case when co.id is null then null else json_build_object('id', co.id, 'code', co.code, 'title', co.title) end,
    'takers', (select count(*) from public.challenge_entries e where e.challenge_id = c.id and e.submitted_at is not null),
    'board', coalesce((select json_agg(b) from (
        select public.short_name(pp.name) as name, e.score, e.total, e.secs, e.user_id = (select auth.uid()) as is_me
        from public.challenge_entries e join public.profiles pp on pp.id = e.user_id
        where e.challenge_id = c.id and e.submitted_at is not null
        order by e.score desc, e.secs asc limit 20) b), '[]'),
    'mine', (select json_build_object('score', e.score, 'total', e.total, 'secs', e.secs, 'submitted', e.submitted_at is not null)
             from public.challenge_entries e where e.challenge_id = c.id and e.user_id = (select auth.uid()))
  )
  from public.challenges c join public.profiles p on p.id = c.creator left join public.courses co on co.id = c.course_id
  where c.code = lower(trim(p_code));
$$;

create or replace function public.start_challenge(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); c public.challenges%rowtype; e public.challenge_entries%rowtype;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select * into c from public.challenges where code = lower(trim(p_code));
  if c.id is null then raise exception 'Quiz not found'; end if;
  if c.expires_at < now() then raise exception 'This quiz has closed.'; end if;
  insert into public.challenge_entries (challenge_id, user_id) values (c.id, v_uid) on conflict do nothing;
  select * into e from public.challenge_entries where challenge_id = c.id and user_id = v_uid;
  if e.submitted_at is not null then return json_build_object('done', true); end if;
  return json_build_object('done', false, 'questions', c.questions, 'time_limit_secs', c.time_limit_secs, 'started_at', e.started_at, 'server_now', now());
end $$;

create or replace function public.submit_challenge(p_code text, p_answers jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); c public.challenges%rowtype; e public.challenge_entries%rowtype; k jsonb; it jsonb;
  v_given jsonb; v_ok boolean; v_score int := 0; v_review jsonb := '[]'; v_secs int; v_rank int; acc jsonb;
begin
  select * into c from public.challenges where code = lower(trim(p_code));
  if c.id is null then raise exception 'Quiz not found'; end if;
  select * into e from public.challenge_entries where challenge_id = c.id and user_id = v_uid for update;
  if e.user_id is null then raise exception 'Start the quiz first'; end if;
  select key into k from public.challenge_keys where challenge_id = c.id;
  if e.submitted_at is null then
    for it in select * from jsonb_array_elements(k) loop
      v_given := p_answers -> (it ->> 'n');
      if it ->> 'type' = 'mcq' then
        v_ok := v_given is not null and jsonb_typeof(v_given) = 'number' and (v_given)::text = (it -> 'answer')::text;
      else
        v_ok := false;
        if v_given is not null and public.norm_answer(v_given #>> '{}') <> '' then
          for acc in select * from jsonb_array_elements(jsonb_build_array(it -> 'answer') || coalesce(it -> 'accept', '[]')) loop
            if public.norm_answer(acc #>> '{}') = public.norm_answer(v_given #>> '{}') then v_ok := true; end if;
          end loop;
        end if;
      end if;
      if v_ok then v_score := v_score + 1; end if;
    end loop;
    v_secs := extract(epoch from now() - e.started_at)::int;
    if c.time_limit_secs > 0 then v_secs := least(v_secs, c.time_limit_secs); end if;
    update public.challenge_entries set submitted_at = now(), score = v_score, total = c.n, secs = v_secs, answers = p_answers
      where challenge_id = c.id and user_id = v_uid returning * into e;
  end if;
  for it in select * from jsonb_array_elements(k) loop
    v_review := v_review || jsonb_build_object('n', (it ->> 'n')::int, 'answer', it -> 'answer', 'accept', it -> 'accept', 'explanation', it ->> 'explanation', 'given', e.answers -> (it ->> 'n'));
  end loop;
  select count(*) + 1 into v_rank from public.challenge_entries x where x.challenge_id = c.id and x.submitted_at is not null and (x.score > e.score or (x.score = e.score and x.secs < e.secs));
  return json_build_object('score', e.score, 'total', e.total, 'secs', e.secs, 'rank', v_rank, 'questions', c.questions, 'review', v_review);
end $$;

create or replace function public.my_challenges()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'created', coalesce((select json_agg(x order by x.created_at desc) from (
      select c.code, c.title, c.n, c.created_at, c.expires_at, co.code as course_code,
        (select count(*) from public.challenge_entries e where e.challenge_id = c.id and e.submitted_at is not null) as takers
      from public.challenges c left join public.courses co on co.id = c.course_id where c.creator = (select auth.uid()) limit 50) x), '[]'),
    'joined', coalesce((select json_agg(x order by x.submitted_at desc) from (
      select c.code, c.title, c.n, e.score, e.total, e.secs, e.submitted_at, co.code as course_code, public.short_name(p.name) as creator
      from public.challenge_entries e join public.challenges c on c.id = e.challenge_id join public.profiles p on p.id = c.creator
      left join public.courses co on co.id = c.course_id
      where e.user_id = (select auth.uid()) and e.submitted_at is not null and c.creator <> (select auth.uid()) limit 50) x), '[]')
  );
$$;

-- XP for taking someone else's quiz: 10 per correct answer, capped at 200.
create or replace function public.xp_from_challenge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.submitted_at is null and new.submitted_at is not null
     and not exists (select 1 from public.challenges c where c.id = new.challenge_id and c.creator = new.user_id) then
    insert into public.study_log (user_id, xp) values (new.user_id, least(200, coalesce(new.score, 0) * 10))
      on conflict (user_id, day) do update set xp = public.study_log.xp + excluded.xp;
  end if;
  return new;
end $$;
drop trigger if exists challenge_xp on public.challenge_entries;
create trigger challenge_xp after update of submitted_at on public.challenge_entries for each row execute function public.xp_from_challenge();

revoke execute on function public.create_challenge(text, uuid, jsonb, int), public.start_challenge(text), public.submit_challenge(text, jsonb),
  public.my_challenges(), public.challenge_info(text), public.xp_from_challenge() from public;
grant execute on function public.create_challenge(text, uuid, jsonb, int), public.start_challenge(text), public.submit_challenge(text, jsonb), public.my_challenges() to authenticated;
grant execute on function public.challenge_info(text) to anon, authenticated;
