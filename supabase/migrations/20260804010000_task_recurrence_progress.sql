-- Progress through a recurring task's series.
--
-- Completing a recurring task now rolls its due date forward rather than
-- closing it: the task IS the series, and spawning a row per occurrence would
-- turn "bins out weekly" into a hundred rows nobody can read.
--
-- recurrence_count is how many occurrences have been completed, which is what
-- COUNT= in an RRULE is measured against. Without it a bounded series ("10
-- times") could never know when to stop.

alter table public.tasks
  add column if not exists recurrence_count integer not null default 0,
  add column if not exists last_completed_at timestamptz;

comment on column public.tasks.recurrence_count is
  'Occurrences completed so far, checked against COUNT= in recurrence_rule.';
comment on column public.tasks.last_completed_at is
  'When the most recent occurrence was ticked off. The task itself stays open while the series continues.';
