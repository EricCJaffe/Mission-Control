-- Check if health tables exist and their schemas
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('health_file_uploads', 'lab_panels', 'lab_results')
ORDER BY table_name, ordinal_position;
