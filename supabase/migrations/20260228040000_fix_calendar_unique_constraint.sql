-- Fix calendar unique constraint - make it non-partial
-- The ON CONFLICT clause can't use a partial index

DO $$
BEGIN
  -- Drop the partial index
  DROP INDEX IF EXISTS public.calendar_events_workout_tag_unique;

  -- Create a full unique index (no WHERE clause)
  -- This allows ON CONFLICT (user_id, alignment_tag) to work
  CREATE UNIQUE INDEX calendar_events_alignment_tag_unique
    ON public.calendar_events(user_id, alignment_tag)
    WHERE alignment_tag IS NOT NULL;

  RAISE NOTICE 'Created non-partial unique index calendar_events_alignment_tag_unique';
END $$;
