-- Add scheduled_time column to planned_workouts table

alter table public.planned_workouts add column if not exists scheduled_time time;

comment on column public.planned_workouts.scheduled_time is 'Time of day for the workout (HH:MM format). Defaults to 09:00 if not specified.';

-- Update the trigger function to use scheduled_time
create or replace function sync_planned_workout_to_calendar()
returns trigger as $$
declare
  event_title text;
  event_start timestamptz;
  event_end timestamptz;
  duration_minutes int;
  workout_time time;
begin
  -- Generate title from day_label or workout_type
  event_title := coalesce(NEW.day_label, NEW.workout_type, 'Workout');

  -- Extract duration from prescribed JSON or default to 60 minutes
  duration_minutes := coalesce((NEW.prescribed->>'duration_min')::int, 60);

  -- Use scheduled_time if provided, otherwise default to 9 AM
  workout_time := coalesce(NEW.scheduled_time, '09:00'::time);

  -- Combine date and time for event start
  event_start := (NEW.scheduled_date::date + workout_time::time)::timestamptz;
  event_end := event_start + (duration_minutes || ' minutes')::interval;

  -- Insert or update calendar event
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
  values (
    NEW.user_id,
    event_title,
    event_start,
    event_end,
    'Workout',
    'planned_workout:' || NEW.id,
    NEW.notes,
    false
  )
  on conflict (user_id, alignment_tag)
  do update set
    title = excluded.title,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    notes = excluded.notes;

  return NEW;
end;
$$ language plpgsql security definer;
