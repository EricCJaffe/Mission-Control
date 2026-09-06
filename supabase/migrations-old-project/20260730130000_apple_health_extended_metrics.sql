-- Extended Apple Health metrics: gives a home to data that was arriving in the
-- Health Auto Export payload but had nowhere to land. Units below match what
-- HAE actually sends (verified against a 2026-03-01 → 2026-07-30 export).

-- ——— Point-in-time body metrics ———
alter table public.body_metrics
  add column if not exists blood_oxygen_pct numeric(4,1),   -- %
  add column if not exists respiratory_rate numeric(4,1);   -- breaths/min

comment on column public.body_metrics.blood_oxygen_pct is 'SpO2 %, Apple Health blood_oxygen_saturation';
comment on column public.body_metrics.respiratory_rate is 'Breaths per minute, Apple Health respiratory_rate';

-- ——— Apple activity rings ———
alter table public.daily_summaries
  add column if not exists exercise_minutes integer,        -- apple_exercise_time
  add column if not exists stand_minutes integer,           -- apple_stand_time
  add column if not exists stand_hours integer,             -- apple_stand_hour
  add column if not exists daylight_minutes integer;        -- time_in_daylight

comment on column public.daily_summaries.exercise_minutes is 'Apple exercise ring, minutes';
comment on column public.daily_summaries.stand_hours is 'Apple stand ring, hours with standing';

-- ——— Running dynamics ———
-- Apple reports these as daily aggregates (one point per run day), not
-- per-workout, so this is keyed by date rather than hung off workout_logs.
create table if not exists public.running_dynamics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  ground_contact_ms numeric(6,1),          -- running_ground_contact_time
  stride_length_m numeric(4,2),            -- running_stride_length
  vertical_oscillation_cm numeric(4,1),    -- running_vertical_oscillation
  power_watts numeric(6,1),                -- running_power
  speed_mph numeric(5,2),                  -- running_speed
  source text default 'Apple Health',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date)
);

create index if not exists running_dynamics_user_date_idx
  on public.running_dynamics (user_id, metric_date desc);

alter table public.running_dynamics enable row level security;
drop policy if exists "running_dynamics_owner" on public.running_dynamics;
create policy "running_dynamics_owner" on public.running_dynamics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ——— Mobility / gait metrics ———
-- Apple's Mobility group. Walking asymmetry is the share of walking time where
-- left and right steps differ in duration: under ~3% is typical, sustained
-- higher values track injury, pain, or gait change. Double support is the
-- share of time with both feet planted — it rises when balance is poor.
create table if not exists public.mobility_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  walking_asymmetry_pct numeric(5,2),        -- walking_asymmetry_percentage
  double_support_pct numeric(5,2),           -- walking_double_support_percentage
  walking_speed_mph numeric(4,2),            -- walking_speed
  step_length_in numeric(5,2),               -- walking_step_length
  walking_hr_avg integer,                    -- walking_heart_rate_average
  stair_speed_up_fps numeric(4,2),           -- stair_speed_up
  stair_speed_down_fps numeric(4,2),         -- stair_speed_down
  six_minute_walk_m numeric(7,1),            -- six_minute_walking_test_distance
  cardio_recovery_bpm integer,               -- cardio_recovery (1-min HR drop)
  source text default 'Apple Health',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date)
);

create index if not exists mobility_metrics_user_date_idx
  on public.mobility_metrics (user_id, metric_date desc);

alter table public.mobility_metrics enable row level security;
drop policy if exists "mobility_metrics_owner" on public.mobility_metrics;
create policy "mobility_metrics_owner" on public.mobility_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ——— Workout route maps ———
-- GPS traces for outdoor workouts. Points are stored as jsonb rather than
-- PostGIS geometry: no spatial querying is needed today, and this keeps the
-- payload round-trippable for drawing a map. One route per workout.
create table if not exists public.workout_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  point_count integer not null default 0,
  start_lat numeric(9,6),
  start_lon numeric(9,6),
  -- Bounding box, so a map can be framed without reading every point.
  min_lat numeric(9,6),
  max_lat numeric(9,6),
  min_lon numeric(9,6),
  max_lon numeric(9,6),
  elevation_gain_m numeric(7,1),
  elevation_loss_m numeric(7,1),
  /* [{lat, lon, alt, ts, speed}] in chronological order */
  points jsonb not null default '[]'::jsonb,
  source text default 'Apple Health',
  created_at timestamptz not null default now(),
  unique (workout_log_id)
);

create index if not exists workout_routes_user_idx
  on public.workout_routes (user_id);

alter table public.workout_routes enable row level security;
drop policy if exists "workout_routes_owner" on public.workout_routes;
create policy "workout_routes_owner" on public.workout_routes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
