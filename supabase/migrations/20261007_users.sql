-- Several users signed in with Google: one progress row per user, exam attempts per user, a daily AI quota.
-- Run AFTER 20261006_versioned_state_and_exams.sql. Idempotent: safe to run more than once.
-- The single-user row (drill.state, id 'anton') is kept as it is; the owner's first sign-in copies it.

-- 1. Users: id is Google's stable account id ("sub"), never the email.
create table if not exists drill.users (
  id text primary key,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
alter table drill.users enable row level security; -- no policies: only the security-definer functions touch it

-- 2. Progress, one versioned row per user (same compare-and-swap scheme as drill.state).
create table if not exists drill.progress (
  user_id text primary key references drill.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table drill.progress enable row level security;
drop trigger if exists progress_bump_version on drill.progress;
create trigger progress_bump_version before update on drill.progress
for each row execute function drill.bump_version();

-- 3. Exam attempts belong to a user; interview answers are marked.
alter table drill.exams add column if not exists user_id text references drill.users (id) on delete cascade;
alter table drill.exams add column if not exists kind text;
create index if not exists exams_user_ticket_at on drill.exams (user_id, ticket, at);

-- 4. AI calls per user per day (the owner has no limit; the API decides who is the owner).
create table if not exists drill.ai_usage (
  user_id text not null references drill.users (id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table drill.ai_usage enable row level security;

-- Sign-in: create or refresh the user. With p_owner, the first sign-in takes over the single-user progress
-- (drill.state 'anton') and the exam attempts that have no user yet.
create or replace function public.drill_user_login(p_key text, p_id text, p_email text, p_name text, p_owner boolean)
returns jsonb language plpgsql security definer set search_path = drill, public as $$
begin
  perform drill.check_key(p_key);
  insert into drill.users (id, email, name) values (p_id, p_email, coalesce(p_name, ''))
  on conflict (id) do update set email = excluded.email, name = excluded.name, seen_at = now();
  if p_owner then
    insert into drill.progress (user_id, data)
    select p_id, s.data from drill.state s where s.id = 'anton' and s.data is not null
    on conflict (user_id) do nothing;
    update drill.exams set user_id = p_id where user_id is null;
  end if;
  return jsonb_build_object('id', p_id, 'email', p_email);
end $$;

create or replace function public.drill_progress_get(p_key text, p_user text) returns jsonb
language plpgsql security definer set search_path = drill, public as $$
declare v jsonb;
begin
  perform drill.check_key(p_key);
  select jsonb_build_object('data', data, 'version', version) into v from drill.progress where user_id = p_user;
  return coalesce(v, jsonb_build_object('data', null, 'version', 0));
end $$;

-- Write only if nobody wrote since p_version was read. Returns the new version, or null on conflict.
create or replace function public.drill_progress_put(p_key text, p_user text, p_data jsonb, p_version bigint)
returns bigint language plpgsql security definer set search_path = drill, public as $$
declare v bigint;
begin
  perform drill.check_key(p_key);
  if p_version = 0 then
    insert into drill.progress (user_id, data) values (p_user, p_data)
    on conflict (user_id) do nothing returning version into v;
  else
    update drill.progress set data = p_data, updated_at = now()
     where user_id = p_user and version = p_version
    returning version into v;
  end if;
  return v;
end $$;

-- Every user's progress that holds push subscriptions (for the morning reminder).
create or replace function public.drill_progress_with_push(p_key text) returns jsonb
language plpgsql security definer set search_path = drill, public as $$
declare v jsonb;
begin
  perform drill.check_key(p_key);
  select coalesce(jsonb_agg(jsonb_build_object('user', user_id, 'data', data)), '[]'::jsonb) into v
    from drill.progress where jsonb_array_length(coalesce(data->'pushSubs', '[]'::jsonb)) > 0;
  return v;
end $$;

create or replace function public.drill_user_exam_add(p_key text, p_user text, p_exam jsonb) returns void
language plpgsql security definer set search_path = drill, public as $$
begin
  perform drill.check_key(p_key);
  insert into drill.exams (user_id, ticket, lang, day, at, score, per_question, chars, answer, verdict, kind)
  values (
    p_user,
    (p_exam->>'n')::int,
    case when p_exam->>'lang' = 'en' then 'en' else 'ru' end,
    coalesce((p_exam->>'d')::date, current_date),
    coalesce(to_timestamp((p_exam->>'t')::double precision / 1000), now()),
    greatest(0, least(10, coalesce((p_exam->>'score')::int, 0))),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_exam->'q', '[]'))::smallint), '{}'),
    coalesce((p_exam->>'chars')::int, 0),
    left(coalesce(p_exam->>'answer', ''), 1500),
    left(coalesce(p_exam->>'verdict', ''), 300),
    nullif(p_exam->>'kind', '')
  );
end $$;

-- A user's attempts in the client's shape, oldest first. p_ticket null = all; p_full = with answer and verdict.
create or replace function public.drill_user_exams(p_key text, p_user text, p_ticket int default null, p_full boolean default false)
returns jsonb language plpgsql security definer set search_path = drill, public as $$
declare v jsonb;
begin
  perform drill.check_key(p_key);
  select coalesce(jsonb_agg(
           jsonb_build_object('n', ticket, 'lang', lang, 'd', day, 't', (extract(epoch from at) * 1000)::bigint,
                              'score', score, 'q', to_jsonb(per_question), 'chars', chars)
           || case when kind is not null then jsonb_build_object('kind', kind) else '{}'::jsonb end
           || case when p_full then jsonb_build_object('answer', answer, 'verdict', verdict) else '{}'::jsonb end
           order by at), '[]'::jsonb)
    into v
    from drill.exams
   where user_id = p_user and (p_ticket is null or ticket = p_ticket);
  return v;
end $$;

-- Count one AI call. Returns the count so far today, or null when the limit is already reached.
create or replace function public.drill_ai_use(p_key text, p_user text, p_day date, p_limit int) returns int
language plpgsql security definer set search_path = drill, public as $$
declare v int;
begin
  perform drill.check_key(p_key);
  insert into drill.ai_usage (user_id, day, n) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set n = drill.ai_usage.n + 1 where drill.ai_usage.n < p_limit
  returning n into v;
  return v;
end $$;

grant execute on function
  public.drill_user_login(text, text, text, text, boolean),
  public.drill_progress_get(text, text),
  public.drill_progress_put(text, text, jsonb, bigint),
  public.drill_progress_with_push(text),
  public.drill_user_exam_add(text, text, jsonb),
  public.drill_user_exams(text, text, int, boolean),
  public.drill_ai_use(text, text, date, int)
to anon, authenticated;
