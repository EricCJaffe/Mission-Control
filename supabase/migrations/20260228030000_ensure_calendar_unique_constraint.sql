-- Ensure unique constraint for calendar_events workout tags exists
-- This is needed for the ON CONFLICT clause in sync_planned_workout_to_calendar()

DO $$
BEGIN
  -- Drop if exists (in case it was created incorrectly)
  DROP INDEX IF EXISTS public.calendar_events_workout_tag_unique;

  -- Create the unique index for planned workout tags
  CREATE UNIQUE INDEX calendar_events_workout_tag_unique
    ON public.calendar_events(user_id, alignment_tag)
    WHERE alignment_tag LIKE 'planned_workout:%';

  RAISE NOTICE 'Created unique index calendar_events_workout_tag_unique';
END $$;
