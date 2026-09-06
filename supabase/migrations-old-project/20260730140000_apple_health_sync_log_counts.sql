-- Record the extended-metric write counts too, so a sync log row accounts for
-- everything the ingest route touched rather than just the original tables.
alter table public.apple_health_sync_logs
  add column if not exists running_written integer not null default 0,
  add column if not exists mobility_written integer not null default 0,
  add column if not exists routes_written integer not null default 0;
