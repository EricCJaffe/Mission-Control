-- Fix Garmin distance conversion (was using meters, should be centimeters)
-- Old conversion: distance * 0.000621371 (meters to miles)
-- New conversion: distance / 160934 (centimeters to miles)
-- Factor to fix: divide by (0.000621371 * 160934) = 100

-- Update all cardio logs from Garmin imports where distance seems too high
UPDATE public.cardio_logs
SET distance_miles = distance_miles / 100
WHERE workout_log_id IN (
  SELECT id FROM public.workout_logs WHERE import_source = 'Garmin'
)
AND distance_miles > 50; -- Only fix obviously wrong values (> 50 miles)

-- Show updated records
SELECT
  w.workout_date::date,
  w.workout_type,
  c.distance_miles,
  c.avg_hr,
  c.calories
FROM public.cardio_logs c
JOIN public.workout_logs w ON c.workout_log_id = w.id
WHERE w.import_source = 'Garmin'
ORDER BY w.workout_date DESC
LIMIT 20;
