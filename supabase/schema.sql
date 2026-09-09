
-- Graduate Assignment Tracker
-- Run this entire file in Supabase SQL Editor.
-- The schema is intentionally normalized so the app can grow with you.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  code text not null,
  name text not null,
  credits numeric(4,1) not null default 3,
  color text not null default '#7c3aed',
  instructor text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, semester_id, code)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  assignment_type text not null default 'Assignment',
  status text not null default 'Not Started'
    check (status in ('Not Started','In Progress','Complete')),
  due_at timestamptz,
  estimated_minutes integer,
  priority text not null default 'Normal'
    check (priority in ('Low','Normal','High','Urgent')),
  points_earned numeric(10,2),
  points_possible numeric(10,2),
  weight_percent numeric(6,2),
  is_todo boolean not null default true,
  notes text,
  recurring_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  assignment_type text not null default 'Assignment',
  recurrence_rule text not null default 'weekly'
    check (recurrence_rule in ('daily','weekly','biweekly','monthly')),
  day_of_week integer check (day_of_week between 0 and 6),
  due_time time,
  next_due_at timestamptz,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  exam_type text not null default 'Exam',
  starts_at timestamptz not null,
  location text,
  weight_percent numeric(6,2),
  points_earned numeric(10,2),
  points_possible numeric(10,2),
  status text not null default 'Upcoming'
    check (status in ('Upcoming','Studying','Complete')),
  study_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grade_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  category text not null default 'Assignment',
  points_earned numeric(10,2),
  points_possible numeric(10,2),
  weight_percent numeric(6,2),
  graded_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  kind text not null check (kind in ('assignment_due_soon','assignment_overdue','exam_soon','exam_today')),
  title text not null,
  body text,
  scheduled_for timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists assignments_user_due_idx on public.assignments(user_id, due_at);
create index if not exists exams_user_start_idx on public.exams(user_id, starts_at);
create index if not exists grades_course_idx on public.grade_items(course_id);
create index if not exists notifications_user_idx on public.notifications(user_id, scheduled_for);

-- Create profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Updated-at helper.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists semesters_updated_at on public.semesters;
create trigger semesters_updated_at before update on public.semesters for each row execute procedure public.set_updated_at();
drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses for each row execute procedure public.set_updated_at();
drop trigger if exists assignments_updated_at on public.assignments;
create trigger assignments_updated_at before update on public.assignments for each row execute procedure public.set_updated_at();
drop trigger if exists recurring_updated_at on public.recurring_templates;
create trigger recurring_updated_at before update on public.recurring_templates for each row execute procedure public.set_updated_at();
drop trigger if exists exams_updated_at on public.exams;
create trigger exams_updated_at before update on public.exams for each row execute procedure public.set_updated_at();
drop trigger if exists grades_updated_at on public.grade_items;
create trigger grades_updated_at before update on public.grade_items for each row execute procedure public.set_updated_at();

-- RLS: every user's data is private to that user.
do $$
declare t text;
begin
  foreach t in array array['profiles','semesters','courses','assignments','recurring_templates','exams','grade_items','notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own rows" on public.profiles for all to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "semesters own rows" on public.semesters;
create policy "semesters own rows" on public.semesters for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "courses own rows" on public.courses;
create policy "courses own rows" on public.courses for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "assignments own rows" on public.assignments;
create policy "assignments own rows" on public.assignments for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "recurring own rows" on public.recurring_templates;
create policy "recurring own rows" on public.recurring_templates for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "exams own rows" on public.exams;
create policy "exams own rows" on public.exams for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "grades own rows" on public.grade_items;
create policy "grades own rows" on public.grade_items for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "notifications own rows" on public.notifications;
create policy "notifications own rows" on public.notifications for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Useful view for dashboard/course grade calculations.
create or replace view public.course_grade_summary
with (security_invoker=true)
as
select
  c.id as course_id,
  c.user_id,
  c.code,
  c.name,
  c.credits,
  coalesce(sum(g.points_earned) filter (where g.points_earned is not null and g.points_possible is not null),0) as earned_points,
  coalesce(sum(g.points_possible) filter (where g.points_earned is not null and g.points_possible is not null),0) as possible_points,
  case
    when coalesce(sum(g.points_possible) filter (where g.points_earned is not null and g.points_possible is not null),0) > 0
    then round(
      100 * sum(g.points_earned) filter (where g.points_earned is not null and g.points_possible is not null)
      / sum(g.points_possible) filter (where g.points_earned is not null and g.points_possible is not null), 1)
    else null
  end as percent_grade
from public.courses c
left join public.grade_items g on g.course_id=c.id and g.user_id=c.user_id
group by c.id;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles, public.semesters, public.courses,
  public.assignments, public.recurring_templates, public.exams, public.grade_items, public.notifications to authenticated;
grant select on public.course_grade_summary to authenticated;


-- V4 migration: assignment hierarchy (safe to run on an existing database)
alter table public.assignments
  add column if not exists parent_id uuid references public.assignments(id) on delete cascade;

alter table public.assignments
  add column if not exists sort_order integer not null default 0;

create index if not exists assignments_parent_sort_idx
  on public.assignments(parent_id, sort_order);

-- V4 course management: the frontend uses the existing courses table.
-- No destructive changes are required.
