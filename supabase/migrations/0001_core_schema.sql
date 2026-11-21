-- Study Carrel core schema (applied to project dbhricybfhpnayzctwry)
create table public.settings (
  id int primary key default 1 check (id = 1),
  free_daily_limit int not null default 15 check (free_daily_limit >= 0),
  pro_price_ngn int not null default 1500 check (pro_price_ngn >= 100),
  pro_days int not null default 30 check (pro_days between 1 and 366),
  admin_emails text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.settings (id, admin_emails) values (1, array['yunusmustapha2@gmail.com']);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '' check (char_length(name) <= 80),
  school text not null default '' check (char_length(school) <= 120),
  programme text not null default '' check (char_length(programme) <= 120),
  level text not null default '' check (char_length(level) <= 30),
  centre text not null default '' check (char_length(centre) <= 80),
  session text not null default '' check (char_length(session) <= 30),
  role text not null default 'student' check (role in ('student', 'moderator', 'admin')),
  pro_until timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id, new.email,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), left(new.raw_user_meta_data ->> 'name', 80), ''),
    case when new.email = any ((select admin_emails from public.settings where id = 1)) then 'admin' else 'student' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('moderator', 'admin'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) between 2 and 24),
  title text not null check (char_length(title) between 2 and 160),
  school text not null default '' check (char_length(school) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  pages int not null default 0 check (pages >= 0),
  file_path text not null unique,
  file_bytes bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text not null default '',
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index courses_status_idx on public.courses (status, code);
create index courses_uploaded_by_idx on public.courses (uploaded_by);
create index courses_reviewed_by_idx on public.courses (reviewed_by);

create table public.progress (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  seen text not null default '',
  last_page int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index progress_course_idx on public.progress (course_id);

create table public.exams (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_date date not null,
  exam_time text not null default '',
  mode text not null default 'cbt' check (mode in ('cbt', 'pop')),
  venue text not null default '' check (char_length(venue) <= 120),
  notes text not null default '' check (char_length(notes) <= 200),
  primary key (user_id, course_id)
);
create index exams_course_idx on public.exams (course_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 160),
  body text not null check (char_length(body) <= 60000),
  page_from int,
  page_to int,
  created_at timestamptz not null default now()
);
create index notes_user_course_idx on public.notes (user_id, course_id);
create index notes_course_idx on public.notes (course_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null check (kind in ('cbt', 'mcq', 'fib', 'theory')),
  level text not null default 'standard',
  page_from int not null default 1,
  page_to int not null default 1,
  score numeric not null default 0,
  total numeric not null default 0,
  pct int not null check (pct between 0 and 100),
  secs int not null default 0,
  items jsonb not null default '[]',
  ai_note text not null default '',
  created_at timestamptz not null default now()
);
create index attempts_user_course_idx on public.attempts (user_id, course_id, created_at desc);
create index attempts_course_idx on public.attempts (course_id);

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'Africa/Lagos')::date),
  count int not null default 0,
  primary key (user_id, day)
);

create table public.payments (
  reference text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_kobo int not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id);
