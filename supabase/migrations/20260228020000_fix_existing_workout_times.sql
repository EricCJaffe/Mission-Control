-- Fix existing workout calendar events that have 00:00 times
-- Set them to 9 AM so they show in week/day views

-- Update logged workouts (alignment_tag like 'workout:%') with 00:00 times
update public.calendar_events
set
  start_at = (date(start_at) + time '09:00:00')::timestamptz,
  end_at = (date(end_at) + time '10:00:00')::timestamptz
where alignment_tag like 'workout:%'
  and extract(hour from start_at) = 0
  and extract(minute from start_at) = 0;

-- Update planned workouts (alignment_tag like 'planned_workout:%') with 00:00 times
update public.calendar_events
set
  start_at = (date(start_at) + time '09:00:00')::timestamptz,
  end_at = (date(end_at) + time '10:00:00')::timestamptz
where alignment_tag like 'planned_workout:%'
  and extract(hour from start_at) = 0
  and extract(minute from start_at) = 0;
