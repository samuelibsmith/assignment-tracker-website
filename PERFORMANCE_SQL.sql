-- Optional Supabase indexes for the Assignment Tracker.
-- Run these once in Supabase SQL Editor. They are safe to run with IF NOT EXISTS.
-- These indexes are especially helpful as the assignment list grows.

create index if not exists semesters_user_current_idx
  on public.semesters (user_id, is_current, start_date desc);

create index if not exists courses_user_code_idx
  on public.courses (user_id, code);

create index if not exists assignments_user_due_idx
  on public.assignments (user_id, due_at);

create index if not exists assignments_user_status_due_idx
  on public.assignments (user_id, status, due_at);

create index if not exists assignments_user_todo_due_idx
  on public.assignments (user_id, is_todo, due_at);

create index if not exists assignments_user_course_due_idx
  on public.assignments (user_id, course_id, due_at);

create index if not exists exams_user_starts_idx
  on public.exams (user_id, starts_at);

create index if not exists exams_user_course_starts_idx
  on public.exams (user_id, course_id, starts_at);

create index if not exists grade_items_user_course_idx
  on public.grade_items (user_id, course_id, graded_at desc);

create index if not exists notifications_user_read_schedule_idx
  on public.notifications (user_id, read_at, scheduled_for);
