-- Add activity-specific fields to cardio_logs
-- Running: elevation gain
-- Biking: speed, TSS

alter table public.cardio_logs
  add column if not exists elevation_gain_ft numeric,
  add column if not exists avg_speed_mph numeric,
  add column if not exists tss numeric; -- Training Stress Score

comment on column public.cardio_logs.elevation_gain_ft is 'Elevation gain in feet (for running/biking)';
comment on column public.cardio_logs.avg_speed_mph is 'Average speed in mph (for biking)';
comment on column public.cardio_logs.tss is 'Training Stress Score (for biking)';
