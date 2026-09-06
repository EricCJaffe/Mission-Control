-- Apple Health ingest via Health Auto Export.
--
-- Apple exposes HealthKit only on-device, so there is no server-side pull the
-- way Withings works. The phone POSTs to /api/fitness/apple-health/ingest and
-- that route writes here. Garmin Connect and Health Mate both mirror into
-- Apple Health, so this is intended to become the single inbound path.

-- 1. Let the existing daily/sleep tables record Apple as a source.
--    daily_summaries only permitted manual/Withings/Garmin; sleep_logs already
--    allowed 'Apple Watch' but we standardise on 'Apple Health' for both.
alter table public.daily_summaries drop constraint if exists daily_summaries_source_check;
alter table public.daily_summaries
  add constraint daily_summaries_source_check
  check (source in ('manual', 'Withings', 'Garmin', 'Apple Health'));

alter table public.sleep_logs drop constraint if exists sleep_logs_source_check;
alter table public.sleep_logs
  add constraint sleep_logs_source_check
  check (source in ('manual', 'Withings', 'Garmin', 'Apple Watch', 'Apple Health'));

-- 2. Idempotent workout ingest. HAE gives each workout a stable id; keying on
--    it means re-sending an overlapping date range updates rather than
--    duplicates. Partial index so the many null rows from other sources don't
--    collide with each other.
alter table public.workout_logs
  add column if not exists apple_workout_id text;

create unique index if not exists workout_logs_apple_workout_id_key
  on public.workout_logs (user_id, apple_workout_id)
  where apple_workout_id is not null;

-- 3. Sync log. Mirrors withings_sync_logs, plus the raw payload: the public
--    HAE docs don't publish the exact metric name strings, so keeping the
--    body lets us see what actually arrived and extend the mapping without
--    asking for a re-send.
create table if not exists public.apple_health_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  status text not null check (status in ('success', 'partial', 'failed')),
  automation_name text,
  session_id text,
  metrics_seen text[] not null default '{}',
  -- Metric names in the payload we have no mapping for yet.
  metrics_unmapped text[] not null default '{}',
  body_metrics_written integer not null default 0,
  daily_written integer not null default 0,
  sleep_written integer not null default 0,
  bp_written integer not null default 0,
  workouts_written integer not null default 0,
  workouts_skipped integer not null default 0,
  error_message text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists apple_health_sync_logs_user_received_idx
  on public.apple_health_sync_logs (user_id, received_at desc);

alter table public.apple_health_sync_logs enable row level security;

drop policy if exists "apple_health_sync_logs_owner" on public.apple_health_sync_logs;
create policy "apple_health_sync_logs_owner" on public.apple_health_sync_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
