-- Repair planned workout calendar events
--
-- Symptoms:
-- - Some scheduled workouts appear as "normal" calendar events (missing alignment_tag),
--   which breaks edit/start behavior.
--
-- Strategy:
-- 1) Delete orphan workout events that look like planned-workout artifacts but lost alignment_tag.
-- 2) Recreate any missing planned_workout calendar_events rows.
--
-- NOTE: We only delete rows where event_type='Workout' AND alignment_tag IS NULL.
-- Logged workouts use alignment_tag like 'workout:<id>' and are not affected.

delete from public.calendar_events
where event_type = 'Workout'
  and alignment_tag is null;

-- Insert missing planned workout events
with pw as (
  select
    id,
    user_id,
    scheduled_date,
    coalesce(scheduled_time, '09:00'::time) as scheduled_time,
    coalesce(day_label, workout_type, 'Workout') as title,
    coalesce((prescribed->>'duration_min')::int, 60) as duration_minutes,
    notes
  from public.planned_workouts
), computed as (
  select
    pw.id,
    pw.user_id,
    pw.title,
    ((pw.scheduled_date::date + pw.scheduled_time)::timestamp at time zone 'America/New_York') as start_at,
    (((pw.scheduled_date::date + pw.scheduled_time)::timestamp at time zone 'America/New_York')
      + (pw.duration_minutes || ' minutes')::interval) as end_at,
    pw.notes
  from pw
)
insert into public.calendar_events (
  user_id,
  title,
  start_at,
  end_at,
  event_type,
  alignment_tag,
  notes,
  completed
)
select
  c.user_id,
  c.title,
  c.start_at,
  c.end_at,
  'Workout',
  'planned_workout:' || c.id,
  c.notes,
  false
from computed c
where not exists (
  select 1
  from public.calendar_events ce
  where ce.user_id = c.user_id
    and ce.alignment_tag = 'planned_workout:' || c.id
);
