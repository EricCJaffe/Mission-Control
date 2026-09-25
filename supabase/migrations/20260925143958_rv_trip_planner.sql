-- RV, phase 2: the trip planner, the rig profile, open issues, and
-- Mary Jo's read access.
--
-- Source: the handoff pack exported from the claude.ai project "Travel RV and
-- Vacations" (2026-09-25), docs/rv/00-START-HERE.md in spirit. The pack
-- proposed its own `rv` schema with text ids; this keeps Mission Control's
-- convention instead — `mission` schema, uuid keys, `user_id` + RLS — and
-- keeps the pack's ids as `slug` so a re-seed updates rather than duplicates.
--
-- ⚠️ THE REPO IS PUBLIC. The pack carries VINs, plates, a ferry password, a
-- card's last four and friends' home addresses. All of that lives in these
-- tables only, behind RLS, and is seeded by a script reading a local copy of
-- the pack. None of it is committed.

-- ---------------------------------------------------------------------------
-- Trips: the pack's status vocabulary, a summary, and a jsonb bag for the
-- trip-level lists that are read whole and never queried into (legs, hazards,
-- fuel rules, people). Trips table is empty, so the status swap is free.
-- ---------------------------------------------------------------------------
alter table mission.rv_trips
  add column if not exists slug    text,
  add column if not exists summary text,
  add column if not exists data    jsonb not null default '{}'::jsonb;

alter table mission.rv_trips drop constraint if exists rv_trips_status_check;
update mission.rv_trips set status = case status
  when 'planned' then 'planning' when 'active' then 'in-progress' when 'done' then 'complete' else status end;
alter table mission.rv_trips alter column status set default 'planning';
alter table mission.rv_trips add constraint rv_trips_status_check
  check (status in ('planning', 'booking', 'booked', 'in-progress', 'complete', 'canceled'));

create unique index if not exists rv_trips_slug_idx on mission.rv_trips (user_id, slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Stops: not only campgrounds. A ferry crossing, a day trip, a hotel with the
-- RV in storage, home at either end. The arrival date may be unknown (the
-- Nantucket ferry date is still on an eTicket), so it becomes nullable.
-- ---------------------------------------------------------------------------
alter table mission.rv_trip_stops rename column campground to name;
alter table mission.rv_trip_stops alter column arrive_on drop not null;
alter table mission.rv_trip_stops
  add column if not exists slug        text,
  add column if not exists seq         integer,
  add column if not exists kind        text not null default 'campground',
  add column if not exists leg         text,
  add column if not exists day_summary text,
  add column if not exists address     text;
alter table mission.rv_trip_stops drop constraint if exists rv_trip_stops_kind_check;
alter table mission.rv_trip_stops add constraint rv_trip_stops_kind_check
  check (kind in ('home', 'campground', 'ferry', 'excursion', 'hotel', 'storage'));
create unique index if not exists rv_trip_stops_slug_idx on mission.rv_trip_stops (trip_id, slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Reservations. Separate from stops because one stop can hold several (a
-- campsite and a day-use pass) and some belong to no stop at all (a toll
-- transponder). "Still to book" is every reservation not booked/confirmed —
-- derived, never kept as a second list.
-- ---------------------------------------------------------------------------
create table if not exists mission.rv_reservations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trip_id        uuid not null references mission.rv_trips(id) on delete cascade,
  stop_id        uuid references mission.rv_trip_stops(id) on delete set null,
  slug           text,
  vendor         text,
  kind           text not null default 'campground',
  status         text not null default 'to-book',
  conf_number    text,
  secondary_ref  text,
  site_type      text,
  pull_through   boolean,
  amp            integer,
  hookups        text,
  check_in       text,
  check_out      text,
  paid           numeric(10, 2),
  balance_due    numeric(10, 2),
  booking_fee    numeric(10, 2),
  -- A deadline, not a date: "by 2 PM Oct 21" is the whole point.
  cancel_by      timestamptz,
  cancel_policy  text,
  day_of_notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rv_reservations_kind_check check (kind in ('campground', 'ferry', 'toll', 'hotel', 'storage', 'day-use', 'other')),
  constraint rv_reservations_status_check check (status in ('to-book', 'booked', 'confirmed', 'canceled'))
);
create index if not exists rv_reservations_trip_idx on mission.rv_reservations (trip_id);
create index if not exists rv_reservations_stop_idx on mission.rv_reservations (stop_id);
create index if not exists rv_reservations_user_idx on mission.rv_reservations (user_id, cancel_by);
create unique index if not exists rv_reservations_slug_idx on mission.rv_reservations (trip_id, slug) where slug is not null;

-- Things to see, per stop. `garden` is Mary Jo's filter.
create table if not exists mission.rv_pois (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  stop_id      uuid not null references mission.rv_trip_stops(id) on delete cascade,
  name         text not null,
  description  text,
  garden       boolean not null default false,
  chosen       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists rv_pois_stop_idx on mission.rv_pois (stop_id);
create index if not exists rv_pois_user_idx on mission.rv_pois (user_id);

-- The fuel plan: one row per driving day.
create table if not exists mission.rv_fuel_stops (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  trip_id       uuid not null references mission.rv_trips(id) on delete cascade,
  drive_date    date,
  leg           text,
  miles         integer,
  route         text,
  primary_stop  text,
  backup        text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists rv_fuel_stops_trip_idx on mission.rv_fuel_stops (trip_id, drive_date);
create index if not exists rv_fuel_stops_user_idx on mission.rv_fuel_stops (user_id);

-- Documents: a file in the private `attachments` bucket under the owner's
-- folder (the existing owner-folder storage policy covers it), or a link.
-- A row with neither is a document known to exist but not yet uploaded.
create table if not exists mission.rv_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  trip_id      uuid references mission.rv_trips(id) on delete cascade,
  title        text not null,
  kind         text,
  bucket       text not null default 'attachments',
  path         text,
  url          text,
  filename     text,
  mime         text,
  bytes        bigint,
  source_note  text,
  created_at   timestamptz not null default now()
);
create index if not exists rv_documents_trip_idx on mission.rv_documents (trip_id);
create index if not exists rv_documents_user_idx on mission.rv_documents (user_id);

-- A trip's to-dos are ordinary tasks, so they reach /tasks, the brief and the
-- dashboard with nothing new. This says which trip each belongs to. `pretrip`
-- is the one task a completed Pre-Trip run closes by itself.
create table if not exists mission.rv_trip_tasks (
  task_id  uuid primary key references mission.tasks(id) on delete cascade,
  trip_id  uuid not null references mission.rv_trips(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null default 'todo',
  constraint rv_trip_tasks_kind_check check (kind in ('todo', 'pretrip'))
);
create index if not exists rv_trip_tasks_trip_idx on mission.rv_trip_tasks (trip_id);
create index if not exists rv_trip_tasks_user_idx on mission.rv_trip_tasks (user_id);

-- The rig profile: one document per owner, rendered by the Rig Summary.
create table if not exists mission.rv_profile (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- A Pre-Trip run belongs to a trip.
alter table mission.rv_checklist_runs
  add column if not exists trip_id uuid references mission.rv_trips(id) on delete set null;
create index if not exists rv_checklist_runs_trip_idx on mission.rv_checklist_runs (trip_id);

-- ---------------------------------------------------------------------------
-- Open issues: faults and loose ends that are not a schedule — a generator
-- code, a check-engine light, a part to buy. In the maintenance module rather
-- than the RV one, because a dishwasher can have one too.
-- ---------------------------------------------------------------------------
create table if not exists mission.maintenance_issues (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  asset_id     uuid references mission.maintenance_assets(id) on delete set null,
  title        text not null,
  system       text,
  status       text not null default 'open',
  opened_on    date not null default ((now() at time zone 'America/New_York')::date),
  details      text,
  next_step    text,
  resolved_on  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint maintenance_issues_status_check check (status in ('open', 'scheduled', 'resolved'))
);
create index if not exists maintenance_issues_user_idx on mission.maintenance_issues (user_id, status);
create index if not exists maintenance_issues_asset_idx on mission.maintenance_issues (asset_id);

-- The coach and its generator are maintenance assets now.
alter table mission.maintenance_assets drop constraint if exists maintenance_assets_category_check;
alter table mission.maintenance_assets add constraint maintenance_assets_category_check check (category in (
  'small_engine', 'lawn_mower', 'tractor', 'chainsaw', 'boat', 'pwc',
  'vehicle', 'rv', 'generator', 'hvac', 'water_system', 'refrigerator', 'dishwasher',
  'clothes_washer', 'other'
));

-- ---------------------------------------------------------------------------
-- RLS. Reads go through core.may_read(user_id, 'rv'), which is true for the
-- owner, for anyone in the owner's household, and for an active 'rv' grant —
-- so Mary Jo, the itinerary reader, can open it on her own login. Writes stay
-- owner-only. One policy per command, so no table carries two permissive
-- policies for the same action.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rv_trips', 'rv_trip_stops', 'rv_checklist_runs', 'rv_checklist_checks',
                           'rv_reservations', 'rv_pois', 'rv_fuel_stops', 'rv_documents',
                           'rv_trip_tasks', 'rv_profile']
  loop
    execute format('alter table mission.%I enable row level security', t);
    execute format('drop policy if exists %I on mission.%I', t || '_owner', t);
    execute format('drop policy if exists %I on mission.%I', t || '_read', t);
    execute format('drop policy if exists %I on mission.%I', t || '_insert', t);
    execute format('drop policy if exists %I on mission.%I', t || '_update', t);
    execute format('drop policy if exists %I on mission.%I', t || '_delete', t);
    execute format('create policy %I on mission.%I for select using (core.may_read(user_id, ''rv''))', t || '_read', t);
    execute format('create policy %I on mission.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('create policy %I on mission.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('create policy %I on mission.%I for delete using ((select auth.uid()) = user_id)', t || '_delete', t);
  end loop;
end $$;

alter table mission.maintenance_issues enable row level security;
drop policy if exists maintenance_issues_owner on mission.maintenance_issues;
create policy maintenance_issues_owner on mission.maintenance_issues
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
