-- Routine maintenance: the things we own, what each needs and when, and what
-- was actually done.
--
-- Eric, 2026-09-24: "a routine maintenance module that can show up as
-- reoccurring tasks ... tractor, air conditioning filters, water system
-- filters, lawn mowers, boat, jet ski, chainsaw, car, refrigerator, dish and
-- clothes washers ... I can get exact models so we can query against best
-- practices ... link it to FinanceOS inventory ... custom interface, workflows
-- and reminders that roll in together." And: "Most all tasks are going to be
-- recurring. And could appear on calendar."
--
-- WHY THE SCHEDULE IS A TASK AND NOT A TABLE OF ITS OWN
--
-- A maintenance item that is due is, in every way that matters, a task: it has
-- a due date, it can be overdue, it belongs in the weekly brief, and ticking it
-- off anywhere should count. `mission.tasks` already carries RRULE recurrence
-- and rolls the due date forward on completion. A parallel `schedules` table
-- would need its own brief section, its own overdue arithmetic and its own
-- completion flow, and within a month the two would disagree about whether the
-- furnace filter was changed. So each schedule IS a task, filed under one
-- "Home & Equipment Maintenance" project, and this migration only adds what a
-- task cannot carry: which machine it is for, and an hours/miles interval.
--
-- `mission.tasks` itself is not altered.

-- ---------------------------------------------------------------------------
-- The inventory.
-- ---------------------------------------------------------------------------
create table if not exists mission.maintenance_assets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  name            text not null,
  -- Drives which best-practice library applies. The list lives in
  -- src/lib/maintenance/library.ts; the check keeps a typo out of the table.
  category        text not null,

  -- Exact make and model are what make the AI research worth running: "a
  -- tractor" gets the generic library, "Kubota L2501, 2021" gets its manual.
  make            text,
  model           text,
  model_year      integer,
  serial_number   text,
  location        text,

  -- Hour meter for engines, odometer for vehicles. Null for appliances.
  meter_unit      text,
  meter_reading   numeric,
  meter_read_at   timestamptz,

  purchased_on    date,
  -- Filter sizes, oil spec, plug, blade, belt. The thing you want in the
  -- store aisle, not in a manual in the garage.
  parts_notes     text,
  notes           text,

  -- public.assets.id in FinanceOS, when this thing is also on the balance
  -- sheet. DELIBERATELY NOT A FOREIGN KEY: public is FinanceOS's schema, and a
  -- constraint pointing into it would make a FinanceOS migration that rebuilds
  -- or prunes `assets` fail on a table it has never heard of. A dangling id
  -- here shows as "link not found" on screen; a blocked FinanceOS deploy does
  -- not show anywhere.
  finance_asset_id uuid,

  status          text not null default 'active',

  -- The last model-specific research, kept so it is not re-run (and re-paid
  -- for) on every page view.
  research        jsonb,
  researched_at   timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint maintenance_assets_category_check check (category in (
    'small_engine', 'lawn_mower', 'tractor', 'chainsaw', 'boat', 'pwc',
    'vehicle', 'hvac', 'water_system', 'refrigerator', 'dishwasher',
    'clothes_washer', 'other'
  )),
  constraint maintenance_assets_meter_unit_check
    check (meter_unit is null or meter_unit in ('hours', 'miles')),
  constraint maintenance_assets_status_check
    check (status in ('active', 'stored', 'retired'))
);

create index if not exists maintenance_assets_user_idx
  on mission.maintenance_assets (user_id, category);

-- ---------------------------------------------------------------------------
-- A schedule: one task, tied to one machine.
-- ---------------------------------------------------------------------------
create table if not exists mission.maintenance_plans (
  -- One plan per task. Deleting the task deletes the plan; the asset's log
  -- keeps the history.
  task_id         uuid primary key references mission.tasks(id) on delete cascade,
  asset_id        uuid not null references mission.maintenance_assets(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Which library entry seeded it, so the asset page can tell "already
  -- scheduled" from "suggested". Null for a custom or AI-suggested item.
  library_key     text,

  -- "Every 50 hours OR every year, whichever first." The calendar half is the
  -- task's RRULE; this is the meter half. Null when only the calendar applies.
  meter_interval  numeric,
  -- The meter when this was last done, written by the completion trigger.
  last_meter      numeric,

  created_at      timestamptz not null default now()
);

create index if not exists maintenance_plans_asset_idx on mission.maintenance_plans (asset_id);
create index if not exists maintenance_plans_user_idx on mission.maintenance_plans (user_id);

-- ---------------------------------------------------------------------------
-- The service history. What was done, not what was due.
-- ---------------------------------------------------------------------------
create table if not exists mission.maintenance_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  asset_id        uuid not null references mission.maintenance_assets(id) on delete cascade,
  -- Kept when the schedule is later deleted: the oil change still happened.
  task_id         uuid references mission.tasks(id) on delete set null,

  title           text not null,
  performed_on    date not null,
  meter_reading   numeric,
  cost            numeric(10, 2),
  vendor          text,
  notes           text,

  -- `completed` rows are written by the trigger below; `manual` is a repair or
  -- one-off entered straight into the history.
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),

  constraint maintenance_log_source_check check (source in ('completed', 'manual'))
);

create index if not exists maintenance_log_asset_idx
  on mission.maintenance_log (asset_id, performed_on desc);
create index if not exists maintenance_log_task_idx on mission.maintenance_log (task_id);
create index if not exists maintenance_log_user_idx on mission.maintenance_log (user_id);

-- ---------------------------------------------------------------------------
-- RLS. Same owner rule as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table mission.maintenance_assets enable row level security;
alter table mission.maintenance_plans  enable row level security;
alter table mission.maintenance_log    enable row level security;

drop policy if exists maintenance_assets_owner on mission.maintenance_assets;
create policy maintenance_assets_owner on mission.maintenance_assets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists maintenance_plans_owner on mission.maintenance_plans;
create policy maintenance_plans_owner on mission.maintenance_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists maintenance_log_owner on mission.maintenance_log;
create policy maintenance_log_owner on mission.maintenance_log
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Completing a maintenance task writes the history. Wherever it was ticked.
--
-- A trigger rather than a line in the maintenance route, because the task can
-- be completed from /tasks, the priority matrix or the dashboard, none of which
-- know this module exists. If only the maintenance screen wrote history, the
-- log would be missing exactly the completions made in passing, which is most
-- of them.
--
-- "Completed" is either signal: a recurring task never reaches `done` (it rolls
-- forward), so its mark is `last_completed_at` moving; a one-off's mark is the
-- status change itself.
--
-- SECURITY INVOKER (the default): RLS applies, so the row it writes must belong
-- to the same user as the task, which it does by construction.
-- ---------------------------------------------------------------------------
create or replace function mission.maintenance_log_completion()
returns trigger
language plpgsql
set search_path = mission, pg_catalog
as $$
declare
  v_plan  mission.maintenance_plans%rowtype;
  v_meter numeric;
begin
  if not (
    new.last_completed_at is distinct from old.last_completed_at
    or (new.status = 'done' and old.status is distinct from 'done')
  ) then
    return new;
  end if;

  select * into v_plan from mission.maintenance_plans where task_id = new.id;
  if not found then
    return new;
  end if;

  select meter_reading into v_meter from mission.maintenance_assets where id = v_plan.asset_id;

  insert into mission.maintenance_log
    (user_id, asset_id, task_id, title, performed_on, meter_reading, source)
  values
    (new.user_id, v_plan.asset_id, new.id, new.title,
     -- Eastern, not UTC: an evening completion is today's, not tomorrow's.
     (now() at time zone 'America/New_York')::date, v_meter, 'completed');

  update mission.maintenance_plans set last_meter = v_meter where task_id = new.id;

  return new;
end;
$$;

drop trigger if exists maintenance_log_completion on mission.tasks;
create trigger maintenance_log_completion
  after update of status, last_completed_at on mission.tasks
  for each row execute function mission.maintenance_log_completion();

notify pgrst, 'reload schema';
