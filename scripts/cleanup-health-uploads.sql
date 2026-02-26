-- Clean up all health file uploads and related data
-- Run this in Supabase SQL Editor

-- Delete lab results first (foreign key)
DELETE FROM lab_results;

-- Delete lab panels (foreign key)
DELETE FROM lab_panels;

-- Delete health file upload records
DELETE FROM health_file_uploads;

-- Show counts
SELECT 'health_file_uploads' as table_name, COUNT(*) as remaining_rows FROM health_file_uploads
UNION ALL
SELECT 'lab_panels', COUNT(*) FROM lab_panels
UNION ALL
SELECT 'lab_results', COUNT(*) FROM lab_results;
