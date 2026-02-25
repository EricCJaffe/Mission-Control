-- Check lab_panels table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'lab_panels'
ORDER BY ordinal_position;
