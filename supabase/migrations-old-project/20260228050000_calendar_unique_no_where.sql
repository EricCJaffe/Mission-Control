-- FINAL FIX: Create completely non-partial unique index
-- ON CONFLICT cannot use partial indexes AT ALL - no WHERE clause allowed

DO $$
BEGIN
  -- Drop ALL previous attempts
  DROP INDEX IF EXISTS public.calendar_events_workout_tag_unique;
  DROP INDEX IF EXISTS public.calendar_events_alignment_tag_unique;

  -- Create COMPLETELY non-partial unique index
  -- NULL values are naturally excluded from uniqueness checks in PostgreSQL
  CREATE UNIQUE INDEX calendar_events_user_alignment_unique
    ON public.calendar_events(user_id, alignment_tag);

  RAISE NOTICE 'Created completely non-partial unique index';
END $$;
