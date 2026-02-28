-- Withings Import Schema Extensions
-- Prepares database for importing historical data from Withings Health Mate export

-- ============================================================================
-- Blood Pressure: Add pulse field
-- ============================================================================

alter table public.bp_readings
  add column if not exists pulse integer;

comment on column public.bp_readings.pulse is 'Heart rate during BP measurement (bpm)';

-- ============================================================================
-- Body Metrics: Ensure all weight/composition fields exist
-- ============================================================================

-- body_metrics table already exists from fitness module
-- Just ensure all needed columns are present

alter table public.body_metrics
  add column if not exists hydration_lbs numeric(5,1);

comment on column public.body_metrics.hydration_lbs is 'Body water in pounds (from Withings scale)';

-- ============================================================================
-- Daily Summaries: Steps, calories, distance aggregates
-- ============================================================================

create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,

  -- Activity
  total_steps integer,
  step_goal integer,
  distance_miles numeric(6,2),
  floors_climbed integer,

  -- Calories
  total_calories integer,
  active_calories integer,
  bmr_calories integer,

  -- Heart Rate
  resting_hr integer,
  min_hr integer,
  max_hr integer,

  -- Stress (Garmin-specific, null for Withings)
  avg_stress integer,
  max_stress integer,
  stress_duration_mins integer,
  rest_duration_mins integer,

  -- Metadata
  source text default 'manual' check (source in ('manual', 'Withings', 'Garmin')),
  created_at timestamptz default now(),

  unique(user_id, summary_date)
);

create index daily_summaries_user_date_idx
  on public.daily_summaries(user_id, summary_date desc);

alter table public.daily_summaries enable row level security;

create policy "daily_summaries_owner" on public.daily_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.daily_summaries is 'Daily activity summaries (steps, calories, distance, HR)';
comment on column public.daily_summaries.total_steps is 'Total steps for the day';
comment on column public.daily_summaries.active_calories is 'Calories burned through activity';
comment on column public.daily_summaries.bmr_calories is 'Basal metabolic rate calories';
comment on column public.daily_summaries.resting_hr is 'Resting heart rate for the day (bpm)';

-- ============================================================================
-- Sleep Logs: Nightly sleep tracking
-- ============================================================================

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,

  -- Sleep Duration (seconds)
  total_sleep_seconds integer not null,
  light_sleep_seconds integer,
  deep_sleep_seconds integer,
  rem_sleep_seconds integer,
  awake_seconds integer,

  -- Sleep Quality
  sleep_score integer, -- 0-100 score

  -- Heart Rate Variability
  avg_hrv numeric(5,1),
  hrv_status text,

  -- Heart Rate During Sleep
  avg_hr integer,
  min_hr integer,
  max_hr integer,
  resting_hr integer,

  -- Other Metrics
  avg_respiration numeric(4,1), -- breaths per minute
  avg_stress numeric(4,1),
  body_battery_change integer, -- Garmin-specific

  -- Sleep Latency
  duration_to_sleep_seconds integer, -- Time to fall asleep
  duration_to_wake_seconds integer, -- Time to fully wake

  -- Disturbances
  wake_up_count integer,
  snoring_seconds integer,
  snoring_episodes integer,

  -- Metadata
  source text default 'manual' check (source in ('manual', 'Withings', 'Garmin', 'Apple Watch')),
  notes text,
  created_at timestamptz default now(),

  unique(user_id, sleep_date)
);

create index sleep_logs_user_date_idx
  on public.sleep_logs(user_id, sleep_date desc);

alter table public.sleep_logs enable row level security;

create policy "sleep_logs_owner" on public.sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.sleep_logs is 'Nightly sleep tracking with heart rate, HRV, and sleep stage breakdown';
comment on column public.sleep_logs.total_sleep_seconds is 'Total time asleep (light + deep + REM)';
comment on column public.sleep_logs.sleep_score is 'Overall sleep quality score (0-100)';
comment on column public.sleep_logs.avg_hrv is 'Average heart rate variability during sleep (ms)';
comment on column public.sleep_logs.body_battery_change is 'Garmin Body Battery change during sleep';

-- ============================================================================
-- Enhance Existing Tables for Withings Import
-- ============================================================================

-- Add external_id to workout_logs for tracking import source
alter table public.workout_logs
  add column if not exists external_id text,
  add column if not exists import_source text;

create index if not exists workout_logs_external_id_idx
  on public.workout_logs(external_id) where external_id is not null;

comment on column public.workout_logs.external_id is 'External system ID (Withings activity ID, Garmin activity ID)';
comment on column public.workout_logs.import_source is 'Import source (Withings, Garmin, manual)';

-- Add HR zone data to cardio_logs
alter table public.cardio_logs
  add column if not exists hr_zone_0_seconds integer,
  add column if not exists hr_zone_1_seconds integer,
  add column if not exists hr_zone_2_seconds integer,
  add column if not exists hr_zone_3_seconds integer;

comment on column public.cardio_logs.hr_zone_0_seconds is 'Time in HR zone 0 (very light) - seconds';
comment on column public.cardio_logs.hr_zone_1_seconds is 'Time in HR zone 1 (light) - seconds';
comment on column public.cardio_logs.hr_zone_2_seconds is 'Time in HR zone 2 (moderate) - seconds';
comment on column public.cardio_logs.hr_zone_3_seconds is 'Time in HR zone 3 (hard) - seconds';
