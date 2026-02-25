-- ============================================================
-- Fix: Add missing columns to existing health context tables
-- ============================================================

-- Add is_current column to health_documents
ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT true;

-- Set is_current = true for all existing records
-- (Later we can implement proper version tracking, but for now just mark all as current)
UPDATE health_documents
SET is_current = true
WHERE is_current IS NULL;

-- Create index for is_current
CREATE INDEX IF NOT EXISTS health_documents_current_idx
  ON public.health_documents(user_id, is_current)
  WHERE is_current = true;

-- Update health_document_changes to match new schema
-- Rename columns if they exist from old schema
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_document_changes'
    AND column_name = 'change_type'
  ) THEN
    ALTER TABLE health_document_changes
      ADD COLUMN change_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_document_changes'
    AND column_name = 'changed_by'
  ) THEN
    ALTER TABLE health_document_changes
      ADD COLUMN changed_by text;
  END IF;

  -- Map old column values to new schema if needed
  -- If change_trigger exists, copy to change_type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_document_changes'
    AND column_name = 'change_trigger'
  ) THEN
    UPDATE health_document_changes
    SET change_type = COALESCE(change_type, change_trigger);
  END IF;

  -- Default changed_by to 'user' for existing records
  UPDATE health_document_changes
  SET changed_by = COALESCE(changed_by, 'user');

  -- Add NOT NULL constraints
  ALTER TABLE health_document_changes
    ALTER COLUMN change_type SET NOT NULL;

  ALTER TABLE health_document_changes
    ALTER COLUMN changed_by SET NOT NULL;

  -- Add check constraints
  ALTER TABLE health_document_changes
    DROP CONSTRAINT IF EXISTS health_document_changes_change_type_check;

  ALTER TABLE health_document_changes
    ADD CONSTRAINT health_document_changes_change_type_check
    CHECK (change_type IN ('manual_edit','ai_update','lab_import','med_change','appointment_prep'));

  ALTER TABLE health_document_changes
    DROP CONSTRAINT IF EXISTS health_document_changes_changed_by_check;

  ALTER TABLE health_document_changes
    ADD CONSTRAINT health_document_changes_changed_by_check
    CHECK (changed_by IN ('user','ai','system'));
END $$;

-- Rename document_id column if it's named health_doc_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_document_changes'
    AND column_name = 'health_doc_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_document_changes'
    AND column_name = 'document_id'
  ) THEN
    ALTER TABLE health_document_changes
      RENAME COLUMN health_doc_id TO document_id;
  END IF;
END $$;

-- Fix health_file_uploads table name mismatch
-- Old schema uses file_url, new uses file_path
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'file_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'file_path'
  ) THEN
    ALTER TABLE health_file_uploads
      RENAME COLUMN file_url TO file_path;
  END IF;
END $$;

-- Fix medications table column name mismatch
-- Old schema uses 'name', new uses 'medication_name'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medications'
    AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medications'
    AND column_name = 'medication_name'
  ) THEN
    ALTER TABLE medications
      RENAME COLUMN name TO medication_name;
  END IF;

  -- Rename 'type' to 'medication_type'
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medications'
    AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medications'
    AND column_name = 'medication_type'
  ) THEN
    ALTER TABLE medications
      RENAME COLUMN type TO medication_type;
  END IF;
END $$;

-- Fix medication_changes column name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medication_changes'
    AND column_name = 'change_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medication_changes'
    AND column_name = 'action'
  ) THEN
    ALTER TABLE medication_changes
      RENAME COLUMN change_type TO action;
  END IF;

  -- Add change_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medication_changes'
    AND column_name = 'change_date'
  ) THEN
    ALTER TABLE medication_changes
      ADD COLUMN change_date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Fix lab_panels column names
DO $$
BEGIN
  -- Rename ordering_provider to provider_name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'ordering_provider'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'provider_name'
  ) THEN
    ALTER TABLE lab_panels
      RENAME COLUMN ordering_provider TO provider_name;
  END IF;

  -- Rename source_file_id to file_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'source_file_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'file_id'
  ) THEN
    ALTER TABLE lab_panels
      RENAME COLUMN source_file_id TO file_id;
  END IF;

  -- Rename processing_status to status if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'processing_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_panels'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE lab_panels
      RENAME COLUMN processing_status TO status;
  END IF;
END $$;

-- Fix lab_results column names
DO $$
BEGIN
  -- Rename test_name_normalized to normalized_test_name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_results'
    AND column_name = 'test_name_normalized'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_results'
    AND column_name = 'normalized_test_name'
  ) THEN
    ALTER TABLE lab_results
      RENAME COLUMN test_name_normalized TO normalized_test_name;
  END IF;

  -- Convert value column from NUMERIC to TEXT if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lab_results'
    AND column_name = 'value'
    AND data_type = 'numeric'
  ) THEN
    ALTER TABLE lab_results
      ALTER COLUMN value TYPE text USING value::text;
  END IF;
END $$;

-- Fix genetic_markers column names
DO $$
BEGIN
  -- Rename variant to snp_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'variant'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'snp_id'
  ) THEN
    ALTER TABLE genetic_markers
      RENAME COLUMN variant TO snp_id;
  END IF;

  -- Rename source_file_id to file_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'source_file_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'file_id'
  ) THEN
    ALTER TABLE genetic_markers
      RENAME COLUMN source_file_id TO file_id;
  END IF;

  -- Add clinical_significance column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'clinical_significance'
  ) THEN
    ALTER TABLE genetic_markers
      ADD COLUMN clinical_significance text;
  END IF;

  -- Add supplement_implications column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'supplement_implications'
  ) THEN
    ALTER TABLE genetic_markers
      ADD COLUMN supplement_implications text;
  END IF;
END $$;
