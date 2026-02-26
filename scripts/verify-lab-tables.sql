-- Verify all health/lab tables exist
SELECT
  table_name,
  CASE
    WHEN table_name IN (
      'health_documents',
      'health_document_changes',
      'health_file_uploads',
      'lab_panels',
      'lab_results',
      'lab_test_definitions',
      'genetic_markers',
      'medications',
      'medication_changes',
      'appointments'
    ) THEN '✅'
    ELSE '❌'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'health_documents',
    'health_document_changes',
    'health_file_uploads',
    'lab_panels',
    'lab_results',
    'lab_test_definitions',
    'genetic_markers',
    'medications',
    'medication_changes',
    'appointments'
  )
ORDER BY table_name;

-- Also check for the storage bucket
SELECT
  id,
  name,
  public,
  CASE WHEN id = 'health-files' THEN '✅' ELSE '❌' END as status
FROM storage.buckets
WHERE id = 'health-files';
