-- Calendar Workout Auto-Sync
-- Automatically sync planned_workouts to calendar_events via database triggers

-- =============================================================================
-- 1. Add completed column to calendar_events if it doesn't exist
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calendar_events'
      and column_name = 'completed'
  ) then
    alter table public.calendar_events add column completed boolean default false;
  end if;
end $$;

-- =============================================================================
-- 2. Add unique constraint for workout alignment tags
-- =============================================================================

-- Only create the unique index if alignment_tag column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calendar_events'
      and column_name = 'alignment_tag'
  ) then
    -- Drop existing index if it exists (to handle recreate)
    drop index if exists public.calendar_events_workout_tag_unique;

    -- Create unique index
    create unique index calendar_events_workout_tag_unique
      on public.calendar_events(user_id, alignment_tag)
      where alignment_tag like 'planned_workout:%';
  end if;
end $$;

-- =============================================================================
-- 3. Sync function: Create/update calendar event when planned workout changes
-- =============================================================================

create or replace function sync_planned_workout_to_calendar()
returns trigger as $$
declare
  event_title text;
  event_start timestamptz;
  event_end timestamptz;
begin
  -- Generate title from day_label or workout_type
  event_title := coalesce(NEW.day_label, NEW.workout_type, 'Workout');

  -- Set start_at to scheduled_date + 6 hours (6 AM default)
  event_start := NEW.scheduled_date::timestamptz + interval '6 hours';

  -- Set end_at based on prescribed duration or default 60 min
  event_end := event_start + interval '60 minutes';

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

-- =============================================================================
-- 4. Trigger: Sync on insert or update
-- =============================================================================

drop trigger if exists planned_workout_calendar_sync on public.planned_workouts;

create trigger planned_workout_calendar_sync
  after insert or update on public.planned_workouts
  for each row
  execute function sync_planned_workout_to_calendar();

-- =============================================================================
-- 5. Cleanup function: Delete calendar event when planned workout is deleted
-- =============================================================================

create or replace function delete_planned_workout_calendar_event()
returns trigger as $$
begin
  delete from public.calendar_events
  where user_id = OLD.user_id
    and alignment_tag = 'planned_workout:' || OLD.id;

  return OLD;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- 6. Trigger: Cleanup on delete
-- =============================================================================

drop trigger if exists planned_workout_calendar_cleanup on public.planned_workouts;

create trigger planned_workout_calendar_cleanup
  after delete on public.planned_workouts
  for each row
  execute function delete_planned_workout_calendar_event();

-- =============================================================================
-- 7. Backfill: Create calendar events for existing planned workouts
-- =============================================================================

-- Only backfill if the unique index was successfully created
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'calendar_events'
      and indexname = 'calendar_events_workout_tag_unique'
  ) then
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
      user_id,
      coalesce(day_label, workout_type, 'Workout') as title,
      scheduled_date::timestamptz + interval '6 hours' as start_at,
      scheduled_date::timestamptz + interval '7 hours' as end_at,
      'Workout' as event_type,
      'planned_workout:' || id as alignment_tag,
      notes,
      false as completed
    from public.planned_workouts
    where not exists (
      select 1 from public.calendar_events ce
      where ce.user_id = planned_workouts.user_id
        and ce.alignment_tag = 'planned_workout:' || planned_workouts.id
    );
  end if;
end $$;

-- =============================================================================
-- 8. Grant permissions
-- =============================================================================

grant execute on function sync_planned_workout_to_calendar() to authenticated;
grant execute on function delete_planned_workout_calendar_event() to authenticated;
