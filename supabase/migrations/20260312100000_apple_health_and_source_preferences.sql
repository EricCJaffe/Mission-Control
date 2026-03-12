-- Health source preferences: per-category preferred source for hybrid device setups
-- Workouts are always accepted from any source (you only wear one device per activity)
create table if not exists health_source_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Preferred source per metric category
  sleep_source text not null default 'any',           -- 'Garmin', 'Apple Health', 'Withings', 'any'
  daily_summary_source text not null default 'any',   -- steps, calories, resting HR
  body_metrics_source text not null default 'any',    -- weight, body comp (usually Withings)
  resting_hr_source text not null default 'any',      -- standalone RHR preference
  hrv_source text not null default 'any',             -- standalone HRV preference
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_source_preferences_user_unique unique (user_id)
);

alter table health_source_preferences enable row level security;

create policy "Users can manage own source preferences"
  on health_source_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Apple Health connection tracking (similar to withings_connections)
create table if not exists apple_health_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_date timestamptz not null default now(),
  file_name text,
  import_mode text not null default 'manual',  -- 'manual', 'auto_export'
  status text not null default 'processing',   -- 'processing', 'success', 'failed'
  -- Per-domain counts
  workouts_imported int not null default 0,
  workouts_skipped int not null default 0,
  sleep_imported int not null default 0,
  sleep_skipped int not null default 0,
  daily_imported int not null default 0,
  daily_skipped int not null default 0,
  body_imported int not null default 0,
  body_skipped int not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table apple_health_imports enable row level security;

create policy "Users can manage own apple health imports"
  on apple_health_imports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
