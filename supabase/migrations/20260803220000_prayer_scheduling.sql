-- Prayer scheduling and a real log of when each prayer was prayed.
--
-- Three things this fixes.
--
-- 1. SCHEDULING. Rotation alone assumes everything deserves the same cadence,
--    which is not how the journal works: "Spending time with God" is daily,
--    the school board is not, and "safe travels this weekend" is once. Cadence
--    matches the calendar's vocabulary (daily / weekly / monthly) so the two
--    schedulers do not disagree about what "weekly" means, plus 'once' for
--    one-off petitions and 'rotation' for everything you just want to come
--    round to eventually.
--
--    'rotation' is the default so the 26 seeded requests keep behaving exactly
--    as they did — a migration that silently rescheduled an existing prayer
--    list would be worse than one that did nothing.
--
-- 2. THE LOG. last_prayed_at only ever held the most recent timestamp, so
--    "when did I pray for Dad" could only ever answer "most recently". Each
--    press of the checkmark now also writes a row here, which makes the
--    history real and lets prayed_count be a consequence of records rather
--    than a number that drifts if an update is retried.
--
-- 3. ANSWERED LEAVES THE LIST. That is a behaviour change in the app rather
--    than the schema — answered requests were being filtered out of the
--    rotation but still rendered in the full tree.

alter table public.prayer_requests
  add column if not exists cadence text not null default 'rotation'
    check (cadence in ('daily', 'weekly', 'monthly', 'once', 'rotation')),
  -- For weekly this fixes the weekday; for monthly, the day of month. Null
  -- means "relative to when it was last prayed" rather than a fixed calendar
  -- slot, which is the gentler default for a prayer list.
  add column if not exists cadence_anchor date,
  -- Set when a 'once' request is scheduled for a specific day.
  add column if not exists due_date date;

comment on column public.prayer_requests.cadence is
  'daily | weekly | monthly | once | rotation. Rotation = no fixed schedule, surfaced least-recently-prayed first.';
comment on column public.prayer_requests.cadence_anchor is
  'Fixes the weekday (weekly) or day of month (monthly). Null means the cadence counts from last_prayed_at instead.';

create table if not exists public.prayer_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  prayed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists prayer_logs_request_idx on public.prayer_logs (request_id, prayed_at desc);
create index if not exists prayer_logs_user_date_idx on public.prayer_logs (user_id, prayed_at desc);

alter table public.prayer_logs enable row level security;
drop policy if exists prayer_logs_owner on public.prayer_logs;
create policy prayer_logs_owner on public.prayer_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Backfill one log entry per request that has already been prayed, so the
-- history does not start empty for anything with a prayed_count.
insert into public.prayer_logs (user_id, request_id, prayed_at, note)
select r.user_id, r.id, r.last_prayed_at, 'Backfilled from last_prayed_at'
from public.prayer_requests r
where r.last_prayed_at is not null
  and not exists (select 1 from public.prayer_logs l where l.request_id = r.id);
