-- Hand-written quizzes: true/false (2 options) up to 6 options, a description, and optional public listing.
alter table public.challenges add column if not exists description text not null default '' check (char_length(description) <= 500);
alter table public.challenges add column if not exists is_public boolean not null default false;
create index if not exists challenges_public_idx on public.challenges (is_public, course_id, created_at desc) where is_public;

create or replace function public.create_challenge(p_title text, p_course uuid, p_items jsonb, p_time_limit int default 0, p_description text default '', p_public boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_code text; v_id uuid; v_q jsonb := '[]'; v_k jsonb := '[]'; it jsonb; i int := 0; v_recent int; v_nopt int; v_ans int;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select count(*) into v_recent from public.challenges where creator = v_uid and created_at > now() - interval '1 day';
  if v_recent >= 20 then raise exception 'You can create up to 20 quizzes a day.'; end if;
  if p_course is not null and not exists (select 1 from public.courses where id = p_course and status = 'approved') then p_course := null; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if it ->> 'type' not in ('mcq', 'fib') or coalesce(trim(it ->> 'q'), '') = '' then continue; end if;
    if it ->> 'type' = 'mcq' then
      if jsonb_typeof(it -> 'options') <> 'array' then continue; end if;
      v_nopt := jsonb_array_length(it -> 'options');
      if v_nopt < 2 or v_nopt > 6 or jsonb_typeof(it -> 'answer') <> 'number' then continue; end if;
      v_ans := (it ->> 'answer')::int;
      if v_ans < 0 or v_ans >= v_nopt then continue; end if;
    elsif coalesce(trim(it ->> 'answer'), '') = '' then continue;
    end if;
    i := i + 1;
    v_q := v_q || jsonb_build_object('n', i, 'type', it ->> 'type', 'q', left(it ->> 'q', 600), 'options', coalesce(it -> 'options', '[]'), 'topic', left(coalesce(it ->> 'topic', ''), 60), 'page', it -> 'page');
    v_k := v_k || jsonb_build_object('n', i, 'type', it ->> 'type', 'answer', it -> 'answer', 'accept', coalesce(it -> 'accept', '[]'), 'explanation', left(coalesce(it ->> 'explanation', ''), 600));
    exit when i >= 40;
  end loop;
  if i < 3 then raise exception 'A quiz needs at least 3 complete questions (each with its correct answer).'; end if;
  loop
    v_code := lower(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.challenges where code = v_code);
  end loop;
  insert into public.challenges (code, creator, course_id, title, description, is_public, questions, n, time_limit_secs)
    values (v_code, v_uid, p_course, left(coalesce(nullif(trim(p_title), ''), 'Class quiz'), 120), left(coalesce(p_description, ''), 500), coalesce(p_public, false),
            v_q, i, greatest(0, least(coalesce(p_time_limit, 0), 7200)))
    returning id into v_id;
  insert into public.challenge_keys (challenge_id, key) values (v_id, v_k);
  return v_code;
end $$;

-- Open quizzes students chose to list publicly, optionally for one course.
create or replace function public.public_quizzes(p_course uuid default null, p_limit int default 30)
returns table (code text, title text, description text, n int, time_limit_secs int, creator text, course_code text, takers int, created_at timestamptz, mine_score int)
language sql stable security definer set search_path = '' as $$
  select c.code, c.title, c.description, c.n, c.time_limit_secs, public.short_name(p.name), co.code,
    (select count(*)::int from public.challenge_entries e where e.challenge_id = c.id and e.submitted_at is not null),
    c.created_at,
    (select e.score from public.challenge_entries e where e.challenge_id = c.id and e.user_id = (select auth.uid()) and e.submitted_at is not null)
  from public.challenges c join public.profiles p on p.id = c.creator left join public.courses co on co.id = c.course_id
  where c.is_public and c.expires_at > now() and (p_course is null or c.course_id = p_course)
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- challenge_info now also returns the description.
create or replace function public.challenge_info(p_code text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'code', c.code, 'title', c.title, 'description', c.description, 'n', c.n, 'time_limit_secs', c.time_limit_secs, 'expires_at', c.expires_at,
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

revoke execute on function public.create_challenge(text, uuid, jsonb, int, text, boolean), public.public_quizzes(uuid, int), public.challenge_info(text) from public;
grant execute on function public.create_challenge(text, uuid, jsonb, int, text, boolean), public.public_quizzes(uuid, int) to authenticated;
grant execute on function public.challenge_info(text) to anon, authenticated;
