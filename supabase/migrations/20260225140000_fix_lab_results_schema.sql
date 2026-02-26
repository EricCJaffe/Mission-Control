-- Fix lab_results schema to match code expectations

-- Add missing columns
ALTER TABLE public.lab_results
ADD COLUMN IF NOT EXISTS normalized_test_name text,
ADD COLUMN IF NOT EXISTS reference_range text;

-- Update flag check constraint to accept 'critical' value
ALTER TABLE public.lab_results
DROP CONSTRAINT IF EXISTS lab_results_flag_check;

ALTER TABLE public.lab_results
ADD CONSTRAINT lab_results_flag_check
CHECK (flag IN ('normal', 'low', 'high', 'critical', 'critical_low', 'critical_high'));

-- Copy data from reference_range_text to reference_range for existing records
UPDATE public.lab_results
SET reference_range = reference_range_text
WHERE reference_range IS NULL AND reference_range_text IS NOT NULL;

-- Copy test_name to normalized_test_name for existing records
UPDATE public.lab_results
SET normalized_test_name = test_name
WHERE normalized_test_name IS NULL;
