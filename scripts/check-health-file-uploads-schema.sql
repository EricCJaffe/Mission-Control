-- Check health_file_uploads table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'health_file_uploads'
ORDER BY ordinal_position;
