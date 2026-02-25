-- ============================================================
-- FITNESS MODULE — Core Tables
-- All tables use user_id ownership (core planning module pattern)
-- vector extension already enabled by prior migrations
-- ============================================================

-- ============================================================
-- EXERCISES (user_id nullable — NULL = global template)
-- ============================================================
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text check (category in ('push','pull','legs','core','cardio','mobility')),
  equipment text,
  muscle_groups text[],
  is_compound boolean default false,
  video_url text,
  notes text,
  is_template boolean default true,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists exercises_user_id_idx on public.exercises(user_id);
create index if not exists exercises_category_idx on public.exercises(category);

alter table public.exercises enable row level security;

-- Global exercises (user_id IS NULL) readable by all; own exercises readable by owner
create policy "exercises_select" on public.exercises
  for select using (user_id is null or auth.uid() = user_id);

create policy "exercises_insert" on public.exercises
  for insert with check (auth.uid() = user_id);

create policy "exercises_update" on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "exercises_delete" on public.exercises
  for delete using (auth.uid() = user_id);

-- ============================================================
-- WORKOUT TEMPLATES (reusable structures)
-- ============================================================
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text check (type in ('strength','cardio','hiit','hybrid')),
  split_type text,
  structure jsonb not null default '[]'::jsonb,
  estimated_duration_min integer,
  ai_generated boolean default false,
  notes text,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists workout_templates_user_id_idx on public.workout_templates(user_id);
create index if not exists workout_templates_type_idx on public.workout_templates(type);

alter table public.workout_templates enable row level security;

create policy "workout_templates_owner" on public.workout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- TRAINING PLANS (periodized blocks)
-- ============================================================
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  cycle_weeks integer default 12,
  plan_type text,
  config jsonb not null default '{}'::jsonb,
  weekly_template jsonb,
  mesocycle_config jsonb,
  status text default 'active' check (status in ('draft','active','completed','archived')),
  ai_generated boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists training_plans_user_id_idx on public.training_plans(user_id);
create index if not exists training_plans_status_idx on public.training_plans(status);

alter table public.training_plans enable row level security;

create policy "training_plans_owner" on public.training_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- EQUIPMENT
-- ============================================================
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text check (type in ('shoes','bike','trainer','other')),
  brand text,
  model text,
  purchase_date date,
  max_distance_miles numeric,
  total_distance_miles numeric default 0,
  status text default 'active' check (status in ('active','retired','maintenance')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists equipment_user_id_idx on public.equipment(user_id);
create index if not exists equipment_type_idx on public.equipment(type);

alter table public.equipment enable row level security;

create policy "equipment_owner" on public.equipment
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- PLANNED WORKOUTS (prescribed sessions from a plan)
-- ============================================================
create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.training_plans(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  scheduled_date date not null,
  week_number integer,
  day_label text,
  workout_type text,
  prescribed jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz default now()
);

create index if not exists planned_workouts_user_id_idx on public.planned_workouts(user_id);
create index if not exists planned_workouts_date_idx on public.planned_workouts(scheduled_date);
create index if not exists planned_workouts_plan_idx on public.planned_workouts(plan_id);

alter table public.planned_workouts enable row level security;

create policy "planned_workouts_owner" on public.planned_workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- WORKOUT LOGS (actual completed sessions)
-- ============================================================
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  template_id uuid references public.workout_templates(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  workout_date timestamptz default now(),
  workout_type text not null,
  duration_minutes integer,
  tss numeric,
  intensity_factor numeric,
  compliance_pct numeric,
  compliance_color text,
  rpe_session numeric,
  notes text,
  ai_summary text,
  garmin_activity_id text,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists workout_logs_user_id_idx on public.workout_logs(user_id);
create index if not exists workout_logs_date_idx on public.workout_logs(workout_date);
create index if not exists workout_logs_type_idx on public.workout_logs(workout_type);

alter table public.workout_logs enable row level security;

create policy "workout_logs_owner" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- SET LOGS (individual sets within a strength workout)
-- ============================================================
create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  set_number integer not null,
  set_type text check (set_type in ('warmup','working','cooldown','drop','failure','amrap')),
  reps integer,
  weight_lbs numeric,
  rpe numeric,
  rest_seconds integer,
  superset_group text,
  superset_round integer,
  is_pr boolean default false,
  notes text,
  created_at timestamptz default now()
);

create index if not exists set_logs_workout_idx on public.set_logs(workout_log_id);
create index if not exists set_logs_exercise_idx on public.set_logs(exercise_id);

alter table public.set_logs enable row level security;

-- set_logs inherits security through workout_logs — join-based check
create policy "set_logs_owner" on public.set_logs
  for all using (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id
        and wl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id
        and wl.user_id = auth.uid()
    )
  );

-- ============================================================
-- CARDIO LOGS (HR zone data per cardio session)
-- ============================================================
create table if not exists public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  activity_type text default 'run',
  avg_hr integer,
  max_hr integer,
  min_hr integer,
  time_in_zone1_min numeric,
  time_in_zone2_min numeric,
  time_in_zone3_min numeric,
  time_in_zone4_min numeric,
  distance_miles numeric,
  avg_pace_per_mile text,
  calories integer,
  hr_recovery_1min integer,
  z2_drift_duration_min numeric,
  cardiac_drift_pct numeric,
  avg_power_watts integer,
  max_power_watts integer,
  normalized_power integer,
  garmin_data jsonb,
  weather_data jsonb,
  created_at timestamptz default now()
);

create index if not exists cardio_logs_workout_idx on public.cardio_logs(workout_log_id);

alter table public.cardio_logs enable row level security;

create policy "cardio_logs_owner" on public.cardio_logs
  for all using (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = cardio_logs.workout_log_id
        and wl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = cardio_logs.workout_log_id
        and wl.user_id = auth.uid()
    )
  );

-- ============================================================
-- BODY METRICS (daily tracking — manual + device sync)
-- Unique per user+date (not just date) to respect RLS
-- ============================================================
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date default current_date,
  resting_hr integer,
  hrv_ms integer,
  body_battery integer,
  sleep_score integer,
  sleep_duration_min integer,
  stress_avg integer,
  training_readiness integer,
  vo2_max numeric,
  weight_lbs numeric,
  body_fat_pct numeric,
  muscle_mass_lbs numeric,
  bone_mass_lbs numeric,
  body_water_pct numeric,
  bmi numeric,
  weight_source text default 'manual',
  notes text,
  garmin_data jsonb,
  withings_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint body_metrics_user_date_unique unique (user_id, metric_date)
);

create index if not exists body_metrics_user_id_idx on public.body_metrics(user_id);
create index if not exists body_metrics_date_idx on public.body_metrics(metric_date);

alter table public.body_metrics enable row level security;

create policy "body_metrics_owner" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- BLOOD PRESSURE READINGS
-- ============================================================
create table if not exists public.bp_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reading_date timestamptz default now(),
  systolic integer not null,
  diastolic integer not null,
  pulse integer,
  position text default 'seated',
  arm text default 'left',
  time_of_day text,
  pre_or_post_meds text,
  pre_or_post_workout text,
  flag_level text,
  notes text,
  source text default 'manual',
  withings_data jsonb,
  created_at timestamptz default now()
);

create index if not exists bp_readings_user_id_idx on public.bp_readings(user_id);
create index if not exists bp_readings_date_idx on public.bp_readings(reading_date);
create index if not exists bp_readings_flag_idx on public.bp_readings(flag_level);

alter table public.bp_readings enable row level security;

create policy "bp_readings_owner" on public.bp_readings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- FITNESS FORM (PMC — Performance Management Chart)
-- Unique per user+date
-- ============================================================
create table if not exists public.fitness_form (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calc_date date not null,
  daily_tss numeric default 0,
  fitness_ctl numeric,
  fatigue_atl numeric,
  form_tsb numeric,
  form_status text,
  ramp_rate_7d numeric,
  ramp_rate_28d numeric,
  created_at timestamptz default now(),
  constraint fitness_form_user_date_unique unique (user_id, calc_date)
);

create index if not exists fitness_form_user_id_idx on public.fitness_form(user_id);
create index if not exists fitness_form_date_idx on public.fitness_form(calc_date);

alter table public.fitness_form enable row level security;

create policy "fitness_form_owner" on public.fitness_form
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- AI INSIGHTS (generated weekly/on-demand)
-- ============================================================
create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_date date default current_date,
  insight_type text check (insight_type in (
    'weekly_summary','trend','recommendation','alert',
    'plan_adjustment','milestone','readiness'
  )),
  title text not null,
  content text not null,
  data_points jsonb,
  priority text default 'info' check (priority in ('info','positive','warning','critical')),
  acknowledged boolean default false,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists ai_insights_user_id_idx on public.ai_insights(user_id);
create index if not exists ai_insights_date_idx on public.ai_insights(insight_date);
create index if not exists ai_insights_type_idx on public.ai_insights(insight_type);
create index if not exists ai_insights_priority_idx on public.ai_insights(priority);

alter table public.ai_insights enable row level security;

create policy "ai_insights_owner" on public.ai_insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- PERSONAL RECORDS
-- ============================================================
create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  workout_log_id uuid references public.workout_logs(id) on delete set null,
  record_type text check (record_type in (
    'max_weight','max_reps','max_volume','estimated_1rm',
    'best_pace','longest_z2_drift','lowest_rhr','highest_hrv',
    'fastest_5k','longest_ride'
  )),
  value numeric not null,
  unit text,
  achieved_date date not null,
  notes text,
  created_at timestamptz default now()
);

create index if not exists personal_records_user_id_idx on public.personal_records(user_id);
create index if not exists personal_records_exercise_idx on public.personal_records(exercise_id);
create index if not exists personal_records_type_idx on public.personal_records(record_type);

alter table public.personal_records enable row level security;

create policy "personal_records_owner" on public.personal_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- ATHLETE PROFILE (user settings — FTP, zones, meds, targets)
-- Single row per user. Source of truth for all hardcoded values.
-- ============================================================
create table if not exists public.athlete_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  max_hr_ceiling integer default 155,
  lactate_threshold_hr integer default 140,
  ftp_watts integer,
  hr_zones jsonb default '{"z1":[100,115],"z2":[115,133],"z3":[133,145],"z4":[145,155]}'::jsonb,
  power_zones jsonb,
  sleep_target_min integer default 450,
  beta_blocker_multiplier numeric default 1.15,
  medications jsonb default '[{"name":"Carvedilol","dose":"12.5mg","frequency":"2x daily"}]'::jsonb,
  meds_schedule jsonb,
  rhr_baseline integer,
  hrv_baseline integer,
  weight_goal_lbs numeric,
  rhr_goal integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint athlete_profile_user_unique unique (user_id)
);

create index if not exists athlete_profile_user_id_idx on public.athlete_profile(user_id);

alter table public.athlete_profile enable row level security;

create policy "athlete_profile_owner" on public.athlete_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- DAILY READINESS (composite 0-100 score, Whoop-style)
-- Calculated morning after Garmin sync
-- ============================================================
create table if not exists public.daily_readiness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calc_date date not null,
  readiness_score integer not null,
  readiness_color text not null check (readiness_color in ('green','yellow','red')),
  readiness_label text not null,
  hrv_score integer,
  rhr_score integer,
  sleep_score integer,
  body_battery_score integer,
  form_score integer,
  bp_score integer,
  weather_score integer,
  inputs jsonb,
  recommendation text,
  created_at timestamptz default now(),
  constraint daily_readiness_user_date_unique unique (user_id, calc_date)
);

create index if not exists daily_readiness_user_id_idx on public.daily_readiness(user_id);
create index if not exists daily_readiness_date_idx on public.daily_readiness(calc_date);

alter table public.daily_readiness enable row level security;

create policy "daily_readiness_owner" on public.daily_readiness
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- DAILY STRAIN (0-21 logarithmic scale, Whoop-style)
-- Updated after each workout + end of day
-- ============================================================
create table if not exists public.daily_strain (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calc_date date not null,
  strain_score numeric(3,1) not null,
  strain_level text not null check (strain_level in ('light','moderate','high','all_out')),
  workout_strain numeric,
  daily_life_strain numeric,
  workout_contributions jsonb,
  inputs jsonb,
  created_at timestamptz default now(),
  constraint daily_strain_user_date_unique unique (user_id, calc_date)
);

create index if not exists daily_strain_user_id_idx on public.daily_strain(user_id);
create index if not exists daily_strain_date_idx on public.daily_strain(calc_date);

alter table public.daily_strain enable row level security;

create policy "daily_strain_owner" on public.daily_strain
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- LAB RESULTS (bloodwork, imaging, pathology — AI-analyzed)
-- ============================================================
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_date date not null,
  lab_type text not null check (lab_type in (
    'bloodwork','lipid_panel','cbc','cmp','thyroid','a1c',
    'cardiac_markers','imaging','stress_test','ecg','echo','other'
  )),
  provider text,
  file_url text,
  file_name text,
  raw_text text,
  parsed_results jsonb,
  ai_analysis text,
  ai_flags jsonb,
  notes text,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lab_results_user_id_idx on public.lab_results(user_id);
create index if not exists lab_results_date_idx on public.lab_results(lab_date);
create index if not exists lab_results_type_idx on public.lab_results(lab_type);

alter table public.lab_results enable row level security;

create policy "lab_results_owner" on public.lab_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- COLUMN ADDITIONS TO EXISTING TABLES
-- ============================================================

-- workout_logs: HR data for strength workouts (from Garmin Strength mode)
alter table public.workout_logs add column if not exists avg_hr integer;
alter table public.workout_logs add column if not exists max_hr integer;
alter table public.workout_logs add column if not exists garmin_data jsonb;
alter table public.workout_logs add column if not exists source text default 'manual';
alter table public.workout_logs add column if not exists strain_score numeric(3,1);

-- cardio_logs: cardiac efficiency metrics
alter table public.cardio_logs add column if not exists cardiac_efficiency numeric;
alter table public.cardio_logs add column if not exists cardiac_cost integer;
alter table public.cardio_logs add column if not exists efficiency_type text;
alter table public.cardio_logs add column if not exists hr_recovery_2min integer;

-- planned_workouts: completion tracking for Garmin matching
alter table public.planned_workouts add column if not exists status text default 'pending'
  check (status in ('pending','completed','skipped','substituted'));

-- body_metrics: medication timing
alter table public.body_metrics add column if not exists meds_taken_at time;
alter table public.body_metrics add column if not exists sleep_stages jsonb;

-- ============================================================
-- SLEEP DEBT VIEW (calculated from body_metrics, no separate table)
-- ============================================================
create or replace view public.sleep_debt_view as
select
  user_id,
  metric_date,
  sleep_duration_min,
  450 as sleep_target_min,
  coalesce(sleep_duration_min, 0) - 450 as nightly_balance_min,
  sum(coalesce(sleep_duration_min, 0) - 450) over (
    partition by user_id
    order by metric_date
    rows between 6 preceding and current row
  ) as rolling_7day_balance_min,
  sum(coalesce(sleep_duration_min, 0) - 450) over (
    partition by user_id
    order by metric_date
    rows between 13 preceding and current row
  ) as rolling_14day_balance_min
from public.body_metrics
where sleep_duration_min is not null;
