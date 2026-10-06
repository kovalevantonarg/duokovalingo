-- Versioned progress (no lost writes from two devices) + a separate table for graded exam attempts.
-- Idempotent: safe to run more than once. Run in Supabase → SQL Editor, or `supabase db push`.
-- The app works before and after this runs (app/api/_store.js falls back to the old RPCs).

-- Safety copy of the progress row before changing anything.
create table if not exists drill.state_backup as select *, now() as backed_up_at from drill.state;

-- 1. Every update bumps a version; writers send the version they read (compare-and-swap).
alter table drill.state add column if not exists version bigint not null default 0;

create or replace function drill.bump_version() returns trigger
language plpgsql set search_path = drill, public as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  return new;
end $$;

drop trigger if exists state_bump_version on drill.state;
create trigger state_bump_version before update on drill.state
for each row execute function drill.bump_version();

-- Progress together with its version.
create or replace function public.drill_state_get(p_key text) returns jsonb
language plpgsql security definer set search_path = drill, public as $$
declare v jsonb;
begin
  perform drill.check_key(p_key);
  select jsonb_build_object('data', data, 'version', version) into v from drill.state where id = 'anton';
  return coalesce(v, jsonb_build_object('data', null, 'version', 0));
end $$;

-- Write only if nobody wrote since p_version was read. Returns the new version, or null on conflict.
create or replace function public.drill_state_put(p_key text, p_data jsonb, p_version bigint) returns bigint
language plpgsql security definer set search_path = drill, public as $$
declare v bigint;
begin
  perform drill.check_key(p_key);
  update drill.state set data = p_data, updated_at = now()
   where id = 'anton' and version = p_version
  returning version into v;
  if v is null and p_version = 0 and not exists (select 1 from drill.state where id = 'anton') then
    insert into drill.state (id, data, updated_at, version) values ('anton', p_data, now(), 1) returning version into v;
  end if;
  return v;
end $$;

-- 2. Graded exam attempts: own table instead of growing the progress row.
create table if not exists drill.exams (
  id bigint generated always as identity primary key,
  ticket int not null,
  lang text not null check (lang in ('ru', 'en')),
  day date not null,
  at timestamptz not null default now(),
  score smallint not null check (score between 0 and 10),
  per_question smallint[] not null default '{}',
  chars int not null default 0,
  answer text not null default '',
  verdict text not null default ''
);
create index if not exists exams_ticket_at on drill.exams (ticket, at);
alter table drill.exams enable row level security; -- no policies: only the security-definer functions touch it

create or replace function public.drill_exam_add(p_key text, p_exam jsonb) returns void
language plpgsql security definer set search_path = drill, public as $$
begin
  perform drill.check_key(p_key);
  insert into drill.exams (ticket, lang, day, at, score, per_question, chars, answer, verdict)
  values (
    (p_exam->>'n')::int,
    case when p_exam->>'lang' = 'en' then 'en' else 'ru' end,
    coalesce((p_exam->>'d')::date, current_date),
    coalesce(to_timestamp((p_exam->>'t')::double precision / 1000), now()),
    greatest(0, least(10, coalesce((p_exam->>'score')::int, 0))),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_exam->'q', '[]'))::smallint), '{}'),
    coalesce((p_exam->>'chars')::int, 0),
    left(coalesce(p_exam->>'answer', ''), 1500),
    left(coalesce(p_exam->>'verdict', ''), 300)
  );
end $$;

-- Attempts in the client's shape, oldest first. p_ticket null = all; p_full = include answer and verdict text.
create or replace function public.drill_exams(p_key text, p_ticket int default null, p_full boolean default false) returns jsonb
language plpgsql security definer set search_path = drill, public as $$
declare v jsonb;
begin
  perform drill.check_key(p_key);
  select coalesce(jsonb_agg(
           jsonb_build_object('n', ticket, 'lang', lang, 'd', day, 't', (extract(epoch from at) * 1000)::bigint,
                              'score', score, 'q', to_jsonb(per_question), 'chars', chars)
           || case when p_full then jsonb_build_object('answer', answer, 'verdict', verdict) else '{}'::jsonb end
           order by at), '[]'::jsonb)
    into v
    from drill.exams
   where p_ticket is null or ticket = p_ticket;
  return v;
end $$;

-- 3. Move attempts already stored inside the progress row into the table.
insert into drill.exams (ticket, lang, day, at, score, per_question, chars, answer, verdict)
select (e->>'n')::int,
       case when e->>'lang' = 'en' then 'en' else 'ru' end,
       coalesce((e->>'d')::date, current_date),
       coalesce(to_timestamp((e->>'t')::double precision / 1000), now()),
       greatest(0, least(10, coalesce((e->>'score')::int, 0))),
       coalesce(array(select jsonb_array_elements_text(coalesce(e->'q', '[]'))::smallint), '{}'),
       coalesce((e->>'chars')::int, 0),
       left(coalesce(e->>'answer', ''), 1500),
       left(coalesce(e->>'verdict', ''), 300)
  from drill.state s, jsonb_array_elements(coalesce(s.data->'exams', '[]')) e
 where s.id = 'anton';
update drill.state set data = data - 'exams' where id = 'anton' and data ? 'exams';

grant execute on function public.drill_state_get(text), public.drill_state_put(text, jsonb, bigint),
  public.drill_exam_add(text, jsonb), public.drill_exams(text, int, boolean) to anon, authenticated;

-- After the new app version has been live for a while, the old functions can go:
-- drop function public.drill_load(text); drop function public.drill_save(text, jsonb);
