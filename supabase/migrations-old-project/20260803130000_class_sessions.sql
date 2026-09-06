-- Coached class sessions — jiu-jitsu first, but the shape fits any class where
-- what matters is time, effort and what was worked on rather than sets and reps.
--
-- Detail table hanging off workout_logs, the same pattern cardio_logs uses, so
-- a class still counts as a workout everywhere workouts are counted (training
-- balance, streaks, the dashboard) without forcing class-specific columns onto
-- every row in workout_logs.

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  /** Jiu-Jitsu, Boxing, Muay Thai, Yoga … kept free-text rather than an enum
      so a new discipline doesn't need a migration. */
  discipline text not null default 'Jiu-Jitsu',
  /** Professor / coach who taught it. */
  instructor text,
  /** Gym, academy or school. */
  school text,
  /** What the class covered — the detail worth searching later. */
  focus text,
  /** Gi, No-Gi, open mat, competition class, etc. */
  session_type text,
  rounds integer check (rounds is null or rounds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_log_id)
);

create index if not exists class_sessions_user_idx
  on public.class_sessions (user_id, created_at desc);

alter table public.class_sessions enable row level security;
drop policy if exists "class_sessions_owner" on public.class_sessions;
create policy "class_sessions_owner" on public.class_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
