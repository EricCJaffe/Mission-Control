-- Fix health_file_uploads table schema
-- Add missing columns if they don't exist

DO $$
BEGIN
  -- Add processing_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'processing_status'
  ) THEN
    ALTER TABLE health_file_uploads
      ADD COLUMN processing_status text NOT NULL DEFAULT 'pending'
      CHECK (processing_status IN ('pending','processing','completed','needs_review','failed'));

    RAISE NOTICE 'Added processing_status column';
  END IF;

  -- Add error_message column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'error_message'
  ) THEN
    ALTER TABLE health_file_uploads
      ADD COLUMN error_message text;

    RAISE NOTICE 'Added error_message column';
  END IF;

  -- Add processed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE health_file_uploads
      ADD COLUMN processed_at timestamptz;

    RAISE NOTICE 'Added processed_at column';
  END IF;

  -- Rename ai_processing_status to processing_status if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'ai_processing_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'processing_status'
  ) THEN
    ALTER TABLE health_file_uploads
      RENAME COLUMN ai_processing_status TO processing_status;

    RAISE NOTICE 'Renamed ai_processing_status to processing_status';
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS health_file_uploads_status_idx
  ON public.health_file_uploads(user_id, processing_status);

-- Show current schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'health_file_uploads'
ORDER BY ordinal_position;
