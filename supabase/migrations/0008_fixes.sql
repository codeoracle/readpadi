-- Fix: sign-up trigger compared email to an array incorrectly (every sign-up failed). Case-insensitive admin match.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_admins text[];
begin
  select admin_emails into v_admins from public.settings where id = 1;
  insert into public.profiles (id, email, name, role, referral_code)
  values (
    new.id, new.email,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), left(new.raw_user_meta_data ->> 'name', 80), ''),
    case when lower(coalesce(new.email, '')) = any (coalesce(v_admins, '{}')) then 'admin' else 'student' end,
    lower(substr(md5(new.id::text || clock_timestamp()::text), 1, 7))
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Supabase grants EXECUTE to anon by default on new functions; quiz RPCs are for signed-in users only.
revoke execute on function public.create_challenge(text, uuid, jsonb, int, text, boolean), public.my_challenges(), public.public_quizzes(uuid, int),
  public.start_challenge(text), public.submit_challenge(text, jsonb) from anon;
revoke execute on function public.xp_from_challenge() from anon, authenticated;
alter function public.level_for(int) set search_path = '';
alter function public.norm_answer(text) set search_path = '';
alter function public.short_name(text) set search_path = '';
comment on table public.challenge_keys is 'Quiz answer keys. Intentionally no RLS policies: only SECURITY DEFINER functions (create_challenge, submit_challenge) read or write it.';
