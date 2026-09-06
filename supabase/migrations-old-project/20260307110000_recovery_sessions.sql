create table if not exists public.recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  modality text not null check (modality in ('sauna', 'cold_plunge', 'stretching', 'mobility')),
  duration_min integer not null check (duration_min > 0 and duration_min <= 240),
  temperature_f numeric(5,1),
  rounds integer check (rounds is null or rounds > 0),
  timing_context text not null default 'standalone' check (timing_context in ('pre_workout', 'post_workout', 'standalone', 'morning', 'afternoon', 'evening')),
  linked_workout_id uuid references public.workout_logs(id) on delete set null,
  perceived_recovery integer check (perceived_recovery is null or perceived_recovery between 1 and 10),
  energy_before integer check (energy_before is null or energy_before between 1 and 10),
  energy_after integer check (energy_after is null or energy_after between 1 and 10),
  soreness_before integer check (soreness_before is null or soreness_before between 1 and 10),
  soreness_after integer check (soreness_after is null or soreness_after between 1 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recovery_sessions_user_date_idx
  on public.recovery_sessions(user_id, session_date desc);

create index if not exists recovery_sessions_modality_idx
  on public.recovery_sessions(user_id, modality, session_date desc);

alter table public.recovery_sessions enable row level security;

drop policy if exists recovery_sessions_owner on public.recovery_sessions;
create policy recovery_sessions_owner on public.recovery_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
