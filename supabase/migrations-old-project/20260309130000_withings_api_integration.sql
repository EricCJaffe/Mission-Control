-- Withings OAuth integration and sync observability

create table if not exists public.withings_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  provider_user_id text,
  encrypted_tokens text,
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('running', 'success', 'failed')),
  last_error text,
  sync_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists withings_connections_status_idx
  on public.withings_connections(status);

alter table public.withings_connections enable row level security;

drop policy if exists "withings_connections_owner" on public.withings_connections;
create policy "withings_connections_owner" on public.withings_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.withings_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.withings_connections(id) on delete set null,
  sync_mode text not null check (sync_mode in ('initial', 'incremental', 'manual')),
  sync_started_at timestamptz not null default now(),
  sync_completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  bp_imported integer not null default 0,
  bp_updated integer not null default 0,
  bp_skipped integer not null default 0,
  bp_errors integer not null default 0,
  body_imported integer not null default 0,
  body_updated integer not null default 0,
  body_skipped integer not null default 0,
  body_errors integer not null default 0,
  sleep_imported integer not null default 0,
  sleep_updated integer not null default 0,
  sleep_skipped integer not null default 0,
  sleep_errors integer not null default 0,
  daily_imported integer not null default 0,
  daily_updated integer not null default 0,
  daily_skipped integer not null default 0,
  daily_errors integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists withings_sync_logs_user_idx
  on public.withings_sync_logs(user_id, sync_started_at desc);

create index if not exists withings_sync_logs_status_idx
  on public.withings_sync_logs(status);

alter table public.withings_sync_logs enable row level security;

drop policy if exists "withings_sync_logs_owner" on public.withings_sync_logs;
create policy "withings_sync_logs_owner" on public.withings_sync_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at_withings_connections()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists withings_connections_set_updated_at on public.withings_connections;
create trigger withings_connections_set_updated_at
before update on public.withings_connections
for each row execute function public.set_updated_at_withings_connections();
