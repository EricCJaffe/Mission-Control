-- Check recent file uploads and their processing status
SELECT
  id,
  file_name,
  file_type,
  processing_status,
  error_message,
  uploaded_at,
  processed_at
FROM health_file_uploads
ORDER BY uploaded_at DESC
LIMIT 5;

-- Check if any lab panels were created
SELECT
  id,
  lab_name,
  panel_date,
  status,
  ai_summary,
  created_at
FROM lab_panels
ORDER BY created_at DESC
LIMIT 5;

-- Check for lab results
SELECT COUNT(*) as result_count
FROM lab_results;
