-- The review module: a period gets a verdict, and the verdict is remembered.
--
-- Eric, 2026-09-20: "make sure the reviews module is robust and dashboard
-- like ... No reading would be red."
--
-- WHY THIS IS NOT THE REVIEW MODULE THAT WAS RETIRED IN AUGUST
--
-- `mission.monthly_reviews` still holds zero rows. It was a survey: it asked
-- Eric to sit down and type his way through a form, and it was never once
-- completed. The lesson is not that reviews do not matter -- it is that a
-- review that starts from a blank page never happens.
--
-- So the readings here are COMPUTED before he ever opens the page. The cycle
-- opens with every number already in it, taken from the practice log, the
-- training log, the task board and the calendar. What is asked of him is one
-- line per area that is not green, and the one action that would fix it. That
-- is the whole interaction, and it is the only part a machine cannot do.
--
-- NO READING IS RED. THIS IS DELIBERATE AND IT CONTRADICTS `status-colors.ts`.
--
-- `src/lib/status-colors.ts` renders a missing score GREY, on the reasoning
-- that "we have not asked yet" is not "you are failing". That is right for a
-- pillar tile on the dashboard and wrong here. In the Honey Lake Operating
-- System -- the framework this review is modeled on and the one every
-- Foundation Stone engagement runs -- red means "past the line, OR no reading
-- this month". Silence is the failure mode a review exists to catch: the areas
-- that go quiet are precisely the ones that drift, and coloring them grey is
-- how a quarter passes with Family unmeasured and nobody noticing.
--
-- The one carve-out is an area created after the period began. It could not
-- have been read, so it is not counted -- the same guard `computeAdherence`
-- already applies to a newly added practice.
--
-- THE HISTORY MUST NOT MOVE WHEN A DEFINITION MOVES
--
-- `review_readings` copies the label, target, warn line, unit and direction it
-- was judged against. Raising the workout target from 3 to 4 next month must
-- not retroactively turn last month red. A review is a record of a judgement
-- made at a time, against the line that was in force at that time.

-- ---------------------------------------------------------------------------
-- 1. The areas: what gets a color.
-- ---------------------------------------------------------------------------
create table if not exists mission.review_areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- Stable identity. Readings denormalize this, so it survives a rename.
  key         text not null,
  label       text not null,
  -- One line saying what the area is actually measuring, shown under the tile.
  description text,

  -- Where it sits in the priority matrix. God First -> Health -> Family ->
  -- Impact, the same order `src/lib/brief/types.ts` calls non-negotiable.
  matrix_key  text not null,

  -- 'matrix'  -- one of the four life areas
  -- 'project' -- a single project's health, computed from its task board
  -- 'metric'  -- anything else numeric, added later
  kind        text not null default 'matrix',
  project_id  uuid references mission.projects(id) on delete cascade,

  -- How the reading is taken. 'manual' means Eric enters the number; every
  -- other value names a collector in `src/lib/reviews/collect.ts`.
  source      text not null,

  -- The line, and the drift line. For `higher_better`: at or above `target`
  -- is green, at or above `warn_at` is yellow, below it is red. Inverted for
  -- `lower_better`, which is how "overdue tasks" is scored.
  target      numeric,
  warn_at     numeric,
  direction   text not null default 'higher_better',
  unit        text not null default 'score',

  -- Which cycle this area belongs to. A quarterly assessment has no business
  -- being marked red fifty-two times a year for not having been retaken, so
  -- an area is only read on the cadence it is actually kept on.
  cadence     text not null default 'weekly',

  active      boolean not null default true,
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint review_areas_key_unique unique (user_id, key),
  constraint review_areas_matrix_check
    check (matrix_key in ('god_first', 'health', 'family', 'impact', 'admin')),
  constraint review_areas_kind_check
    check (kind in ('matrix', 'project', 'metric')),
  constraint review_areas_direction_check
    check (direction in ('higher_better', 'lower_better')),
  constraint review_areas_cadence_check
    check (cadence in ('weekly', 'monthly', 'quarterly', 'annual')),
  constraint review_areas_source_check
    check (source in ('practices', 'training', 'tasks', 'calendar', 'flourishing', 'projects', 'manual')),
  -- A project area without a project is a tile that can never be read.
  constraint review_areas_project_check
    check (kind <> 'project' or project_id is not null)
);

create index if not exists review_areas_active_idx
  on mission.review_areas (user_id, cadence, sort_order)
  where active;

-- ---------------------------------------------------------------------------
-- 2. The cycles: one period, one verdict.
-- ---------------------------------------------------------------------------
create table if not exists mission.review_cycles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  kind         text not null default 'weekly',
  -- Inclusive on both ends, and always a whole period. `periods.ts` owns the
  -- arithmetic; nothing writes an arbitrary window.
  period_start date not null,
  period_end   date not null,

  status       text not null default 'open',
  -- The worst color among the readings, recomputed on every collect. Stored
  -- rather than derived so the dashboard's trend strip is one cheap read.
  overall      text,
  -- What he wrote when he closed it. The only free text in the cycle.
  summary_md   text,

  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  collected_at timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint review_cycles_unique unique (user_id, kind, period_start),
  constraint review_cycles_kind_check
    check (kind in ('weekly', 'monthly', 'quarterly', 'annual')),
  constraint review_cycles_status_check
    check (status in ('open', 'closed')),
  constraint review_cycles_overall_check
    check (overall is null or overall in ('red', 'yellow', 'green')),
  constraint review_cycles_range_check
    check (period_end >= period_start)
);

create index if not exists review_cycles_recent_idx
  on mission.review_cycles (user_id, kind, period_start desc);

-- ---------------------------------------------------------------------------
-- 3. The readings: one area, one period, one color, one reason.
-- ---------------------------------------------------------------------------
create table if not exists mission.review_readings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  cycle_id    uuid not null references mission.review_cycles(id) on delete cascade,
  -- Nulled rather than deleted when an area is retired: the history stays
  -- readable because every field it was judged against is copied below.
  area_id     uuid references mission.review_areas(id) on delete set null,

  -- The copy. See the header: history must not move when a definition moves.
  area_key    text not null,
  label       text not null,
  matrix_key  text not null,
  kind        text not null default 'matrix',
  unit        text not null default 'score',
  direction   text not null default 'higher_better',
  target      numeric,
  warn_at     numeric,

  -- THE distinction this table turns on. `has_reading = false` means nothing
  -- was measured, which is red. A rule-scored area (a project's health) is a
  -- real reading with no number, so it carries `has_reading = true` and a null
  -- `value` -- overloading null to mean both would make silence invisible.
  has_reading boolean not null default false,
  value       numeric,

  status        text not null,
  -- Deterministic, written by the collector, never by a model. "No reading in
  -- the period", "41 overdue, line is 10", "2 of 3 sessions".
  status_reason text not null,
  -- The components behind the number, so a tile can be opened up.
  detail        jsonb not null default '{}'::jsonb,

  -- What Eric adds. `action_md` is the Honey Lake question for anything not
  -- green: the one thing that would fix it.
  note_md     text,
  action_md   text,

  -- Was it this color last period too? A single red is an event; the same
  -- red three cycles running is the thing the review exists to surface.
  prior_status text,
  carried_cycles integer not null default 0,

  computed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint review_readings_unique unique (cycle_id, area_key),
  constraint review_readings_status_check
    check (status in ('red', 'yellow', 'green', 'not_due')),
  constraint review_readings_prior_check
    check (prior_status is null or prior_status in ('red', 'yellow', 'green', 'not_due')),
  -- No reading means no number. Guards the collector against writing a value
  -- it then forgets to mark as read.
  constraint review_readings_value_check
    check (has_reading or value is null)
);

create index if not exists review_readings_cycle_idx
  on mission.review_readings (cycle_id, matrix_key, area_key);

create index if not exists review_readings_area_history_idx
  on mission.review_readings (user_id, area_key, computed_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS. Same owner rule as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table mission.review_areas    enable row level security;
alter table mission.review_cycles   enable row level security;
alter table mission.review_readings enable row level security;

drop policy if exists review_areas_owner on mission.review_areas;
create policy review_areas_owner on mission.review_areas
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists review_cycles_owner on mission.review_cycles;
create policy review_cycles_owner on mission.review_cycles
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists review_readings_owner on mission.review_readings;
create policy review_readings_owner on mission.review_readings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 5. Seed the four life areas, for every user that already exists.
--
-- The starting lines are drawn from what the data actually shows as of
-- 2026-09-20, not from an ideal: 11 workouts in the last 35 days is ~2.2 a
-- week, so 3 is a stretch and 5 would be a tile that is red forever. A line
-- nobody can reach gets ignored within a month, which is the same death the
-- August review module died.
--
-- FAMILY IS MANUAL, AND THAT IS A FINDING RATHER THAN A SHORTCUT. Of 240
-- calendar events, 168 are tagged work, 70 body, 2 spirit and ZERO family. An
-- automatic reading off the calendar would not be measuring family time, it
-- would be measuring whether the calendar has ever been tagged -- and it would
-- print red every week for a reason that has nothing to do with his family.
-- One number a week, entered by hand, is honest. Blank is still red.
-- ---------------------------------------------------------------------------
insert into mission.review_areas
  (user_id, key, label, description, matrix_key, kind, source, target, warn_at, direction, unit, cadence, sort_order)
select u.id, a.key, a.label, a.description, a.matrix_key, 'matrix', a.source,
       a.target, a.warn_at, a.direction, a.unit, a.cadence, a.sort_order
from auth.users u
cross join (values
  ('god_first', 'God First', 'Adherence across the spirit practices — Bible reading, prayer, faith reading, church, giving.',
   'god_first', 'practices', 8, 6, 'higher_better', 'score', 'weekly', 10),
  ('health_body', 'Health — Body', 'Training sessions logged in the period.',
   'health', 'training', 3, 2, 'higher_better', 'count', 'weekly', 20),
  ('family', 'Family', 'Hours of deliberate, undistracted family time. Entered by hand — the calendar has never carried a family tag.',
   'family', 'manual', 6, 3, 'higher_better', 'hours', 'weekly', 30),
  ('impact', 'Impact', 'Overdue open tasks across every project. The line is how much lateness is tolerable, not how much work there is.',
   'impact', 'tasks', 0, 10, 'lower_better', 'count', 'weekly', 40),
  ('health_soul', 'Health — Soul', 'The Flourishing assessment’s soul score. Monthly, because a survey retaken weekly stops being answered.',
   'health', 'flourishing', 8, 6, 'higher_better', 'score', 'monthly', 50),
  -- A roll-up, not twenty-two tiles. The value is how many active projects
  -- score red; the per-project rows live in the reading's `detail` and are
  -- what the dashboard table renders. Adding a project therefore needs no
  -- migration and no new area.
  ('project_health', 'Projects', 'Every active project scored on its own task board: overdue work, or no movement at all. The number is how many are red.',
   'impact', 'projects', 0, 3, 'lower_better', 'count', 'weekly', 60)
) as a(key, label, description, matrix_key, source, target, warn_at, direction, unit, cadence, sort_order)
on conflict (user_id, key) do nothing;

notify pgrst, 'reload schema';
