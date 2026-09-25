-- The RV: trips, and the arrival / departure checklists that run on every
-- travel day.
--
-- Eric, 2026-09-25: "a new sidebar item that has a RV and this instructions
-- for the RV ... track trips that we're going on and help manage trips ...
-- and then we need the startup shutdown checklist that we could reset."
--
-- The build spec (docs/rv-checklists.md) names the defect this exists to fix:
-- the checklist artifact kept its ticks in browser storage and lost them. So
-- check state lives here, one row per ticked item, keyed by a RUN. A run is one
-- pass through a checklist; Reset closes it with its numbers and opens the
-- next, so the history of every arrival and departure survives.
--
-- Checklist CONTENT is not in the database. It is src/lib/rv/checklists.json,
-- versioned with the code, and `item_id` here matches the ids in that file.
-- An id that later disappears from the file simply stops counting.

-- ---------------------------------------------------------------------------
-- Trips and their stops.
-- ---------------------------------------------------------------------------
create table if not exists mission.rv_trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- planned -> active -> done. `cancelled` keeps the record of what was booked.
  status      text not null default 'planned',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rv_trips_status_check
    check (status in ('planned', 'active', 'done', 'cancelled'))
);

create index if not exists rv_trips_user_idx on mission.rv_trips (user_id, status);

-- A trip is a sequence of campgrounds. One-stop trips are just a trip with one
-- stop; the dates of the trip are the span of its stops, never stored twice.
create table if not exists mission.rv_trip_stops (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references mission.rv_trips(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  campground    text not null,
  location      text,            -- city, state
  site          text,
  arrive_on     date not null,
  depart_on     date,
  confirmation  text,
  cost          numeric(10, 2),
  -- Full hookups, 30/50 amp, pull-through: whatever decides the setup.
  hookups       text,
  url           text,
  phone         text,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint rv_trip_stops_dates_check check (depart_on is null or depart_on >= arrive_on)
);

create index if not exists rv_trip_stops_trip_idx on mission.rv_trip_stops (trip_id, arrive_on);
create index if not exists rv_trip_stops_user_idx on mission.rv_trip_stops (user_id, arrive_on);

-- ---------------------------------------------------------------------------
-- Checklist runs and their ticks.
-- ---------------------------------------------------------------------------
create table if not exists mission.rv_checklist_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  checklist_id  text not null,           -- 'arrival' | 'departure', from the JSON
  -- The stop this run was for, when there was one: the history then reads
  -- "departure from Anastasia State Park" rather than a bare timestamp.
  stop_id       uuid references mission.rv_trip_stops(id) on delete set null,
  location      text,
  started_at    timestamptz not null default now(),
  -- Set when the last item is ticked; cleared if one is unticked again.
  completed_at  timestamptz,
  -- Set by Reset. A run with archived_at null is the one on screen.
  archived_at   timestamptz,
  -- Frozen at Reset so the history does not change when the JSON does.
  items_total   integer,
  items_checked integer
);

-- Exactly one open run per checklist. Two would mean two phones ticking two
-- different lists, and a departure half-done on each.
create unique index if not exists rv_checklist_runs_open_idx
  on mission.rv_checklist_runs (user_id, checklist_id)
  where archived_at is null;
create index if not exists rv_checklist_runs_history_idx
  on mission.rv_checklist_runs (user_id, checklist_id, started_at desc);
create index if not exists rv_checklist_runs_stop_idx on mission.rv_checklist_runs (stop_id);

create table if not exists mission.rv_checklist_checks (
  run_id      uuid not null references mission.rv_checklist_runs(id) on delete cascade,
  item_id     text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  primary key (run_id, item_id)
);

create index if not exists rv_checklist_checks_user_idx on mission.rv_checklist_checks (user_id);

-- ---------------------------------------------------------------------------
-- RLS. Owner-only, like the rest of the schema. Mary Jo checks the list on
-- Eric's phone, not her own account; sharing is a later decision.
-- ---------------------------------------------------------------------------
alter table mission.rv_trips            enable row level security;
alter table mission.rv_trip_stops       enable row level security;
alter table mission.rv_checklist_runs   enable row level security;
alter table mission.rv_checklist_checks enable row level security;

drop policy if exists rv_trips_owner on mission.rv_trips;
create policy rv_trips_owner on mission.rv_trips
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists rv_trip_stops_owner on mission.rv_trip_stops;
create policy rv_trip_stops_owner on mission.rv_trip_stops
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists rv_checklist_runs_owner on mission.rv_checklist_runs;
create policy rv_checklist_runs_owner on mission.rv_checklist_runs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists rv_checklist_checks_owner on mission.rv_checklist_checks;
create policy rv_checklist_checks_owner on mission.rv_checklist_checks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
