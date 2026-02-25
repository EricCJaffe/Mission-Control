-- Quick fix: Just add is_current column to health_documents
-- Run this if the migration is failing

-- Add the column
ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT true;

-- Update existing records
UPDATE health_documents
SET is_current = true
WHERE is_current IS NULL;

-- Create the index
CREATE INDEX IF NOT EXISTS health_documents_current_idx
  ON health_documents(user_id, is_current)
  WHERE is_current = true;

-- Verify it worked
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'health_documents'
  AND column_name = 'is_current';
