-- Check health_documents table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'health_documents'
ORDER BY ordinal_position;

-- Check if is_current column exists
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'health_documents'
      AND column_name = 'is_current'
  ) as is_current_exists;

-- Check health_document_changes structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'health_document_changes'
ORDER BY ordinal_position;

-- Check if vector extension is enabled
SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'vector'
) as vector_extension_enabled;
