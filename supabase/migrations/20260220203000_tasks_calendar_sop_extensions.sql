-- Tasks: categories, recurrence, alignment
alter table public.tasks
  add column if not exists category text,
  add column if not exists why text,
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_anchor date;

-- Calendar: recurrence + linking
alter table public.calendar_events
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_until date,
  add column if not exists goal_id uuid,
  add column if not exists task_id uuid,
  add column if not exists note_id uuid,
  add column if not exists review_id uuid,
  add column if not exists alignment_tag text;

alter table public.calendar_events
  add constraint calendar_events_goal_id_fkey foreign key (goal_id) references public.goals(id) on delete set null;

alter table public.calendar_events
  add constraint calendar_events_task_id_fkey foreign key (task_id) references public.tasks(id) on delete set null;

alter table public.calendar_events
  add constraint calendar_events_note_id_fkey foreign key (note_id) references public.notes(id) on delete set null;

alter table public.calendar_events
  add constraint calendar_events_review_id_fkey foreign key (review_id) references public.monthly_reviews(id) on delete set null;

-- SOP checks due dates
alter table public.sop_checks
  add column if not exists due_date date;
