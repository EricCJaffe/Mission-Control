-- ============================================================
-- GARMIN CONNECT INTEGRATION
-- Add support for storing Garmin OAuth credentials and sync logs
-- ============================================================

-- Add Garmin credential columns to athlete_profile
alter table public.athlete_profile
  add column if not exists garmin_email text,
  add column if not exists garmin_tokens jsonb,
  add column if not exists garmin_last_sync timestamptz;

comment on column public.athlete_profile.garmin_email is 'Garmin Connect account email';
comment on column public.athlete_profile.garmin_tokens is 'Encrypted OAuth tokens for Garmin Connect API';
comment on column public.athlete_profile.garmin_last_sync is 'Timestamp of last successful Garmin data sync';

-- Create sync log table for debugging and monitoring
create table if not exists public.garmin_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_started_at timestamptz not null default now(),
  sync_completed_at timestamptz,
  status text not null check (status in ('running','success','failed')),
  metrics_synced integer default 0,
  activities_synced integer default 0,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists garmin_sync_logs_user_id_idx on public.garmin_sync_logs(user_id);
create index if not exists garmin_sync_logs_status_idx on public.garmin_sync_logs(status);

alter table public.garmin_sync_logs enable row level security;

create policy "garmin_sync_logs_owner" on public.garmin_sync_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.garmin_sync_logs is 'Log of Garmin Connect sync operations for debugging';
