-- Hydration + Nutrition module

create table if not exists public.hydration_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_target_oz integer not null default 96,
  min_target_oz integer not null default 85,
  max_target_oz integer not null default 128,
  workout_adjustment_per_hour_oz integer not null default 24,
  heat_adjustment_oz integer not null default 12,
  reminder_enabled boolean not null default true,
  alert_weight_gain_lbs numeric(4,1) not null default 2.0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint hydration_targets_user_unique unique (user_id)
);

create index if not exists hydration_targets_user_idx on public.hydration_targets(user_id);
alter table public.hydration_targets enable row level security;
drop policy if exists hydration_targets_owner on public.hydration_targets;
create policy hydration_targets_owner on public.hydration_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  intake_oz numeric(6,1) not null default 0,
  output_oz numeric(6,1) not null default 0,
  net_balance_oz numeric(6,1) generated always as (coalesce(intake_oz, 0) - coalesce(output_oz, 0)) stored,
  workout_minutes integer not null default 0,
  sweat_level text not null default 'moderate'
    check (sweat_level in ('low', 'moderate', 'high')),
  sodium_mg integer,
  potassium_mg integer,
  symptoms jsonb not null default '[]'::jsonb,
  vitals_context jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint hydration_logs_user_date_unique unique (user_id, log_date)
);

create index if not exists hydration_logs_user_idx on public.hydration_logs(user_id);
create index if not exists hydration_logs_date_idx on public.hydration_logs(log_date desc);
alter table public.hydration_logs enable row level security;
drop policy if exists hydration_logs_owner on public.hydration_logs;
create policy hydration_logs_owner on public.hydration_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sodium_max_mg integer not null default 2000,
  potassium_target_mg integer not null default 3000,
  phosphorus_max_mg integer not null default 1000,
  protein_target_g integer not null default 150,
  fiber_target_g integer not null default 30,
  calorie_target integer,
  pattern text not null default 'mediterranean_dash'
    check (pattern in ('mediterranean', 'dash', 'mediterranean_dash', 'cardiac_ckd')),
  logging_enabled boolean not null default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint nutrition_targets_user_unique unique (user_id)
);

create index if not exists nutrition_targets_user_idx on public.nutrition_targets(user_id);
alter table public.nutrition_targets enable row level security;
drop policy if exists nutrition_targets_owner on public.nutrition_targets;
create policy nutrition_targets_owner on public.nutrition_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text not null default 'meal'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'drink', 'meal')),
  food_name text not null,
  serving_size text,
  calories integer,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  fiber_g numeric(6,1),
  sugar_g numeric(6,1),
  sodium_mg integer,
  potassium_mg integer,
  phosphorus_mg integer,
  saturated_fat_g numeric(6,1),
  barcode text,
  source text not null default 'manual'
    check (source in ('manual', 'barcode', 'search', 'ai_plan')),
  food_rating text not null default 'yellow'
    check (food_rating in ('green', 'yellow', 'red')),
  tags text[] not null default array[]::text[],
  notes text,
  created_at timestamptz default now()
);

create index if not exists nutrition_logs_user_idx on public.nutrition_logs(user_id);
create index if not exists nutrition_logs_logged_at_idx on public.nutrition_logs(logged_at desc);
alter table public.nutrition_logs enable row level security;
drop policy if exists nutrition_logs_owner on public.nutrition_logs;
create policy nutrition_logs_owner on public.nutrition_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
