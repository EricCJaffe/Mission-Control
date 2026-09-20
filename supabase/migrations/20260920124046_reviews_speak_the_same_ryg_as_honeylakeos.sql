-- One red/yellow/green vocabulary, personal system and client system alike.
--
-- Eric, 2026-09-17: red/yellow/green "should be a foundational catalyst across
-- all that we do." Yesterday this module invented its own words for it —
-- `target`/`warn_at`/`higher_better` — while `honeylakeos` has been running the
-- same idea in production since July under `green_at`/`yellow_at`/
-- `higher_is_better`. Two names for one concept across the two systems is
-- exactly the fragmentation that rule exists to prevent, and the cost of
-- fixing it only ever goes up: `review_readings` copies these columns onto
-- every row it writes, so today it is a rename and after the first cycle it is
-- a data migration. There are 0 cycles and 0 readings as this runs.
--
-- The contract now mirrors `honeylakeos/src/lib/measureStatus.ts` field for
-- field, and that file is the reference implementation:
--
--   green_at / yellow_at   the two thresholds
--   target_value           the CENTER, used only by `within_range`
--   direction              higher_is_better | lower_is_better | within_range
--
-- THREE THINGS COME ACROSS WITH THE NAMES, AND THEY ARE THE POINT.
--
-- 1. `unknown` is a first-class status meaning NOBODY SET A TARGET. Until now
--    an area with no line read GREEN here, on the reasoning that nothing can be
--    past a line that does not exist. That is a lie of precisely the kind this
--    module exists to stop — an unconfigured measure reporting "all good" is
--    worse than one reporting nothing. honeylakeos puts it better than I did:
--    "Red accuses the number; this accuses the setup."
--
-- 2. `within_range` — both too high and too low are failures. There was no way
--    to express weight, sleep hours or blood pressure without it, all of which
--    Mission Control already stores.
--
-- 3. A missing READING is still red, which is the amendment Eric made to
--    honeylakeos's ADR 0016 on 2026-09-17 ("Red — the deck wins") and repeated
--    here on 2026-09-20 ("No reading would be red"). Same rule, same reason,
--    now demonstrably the same words.
--
-- ⚠️ ORDER MATTERS BELOW. Every CHECK constraint is dropped before the UPDATE
-- that rewrites the values it guards. A check fires on the new row, so leaving
-- the old one in place makes the rename fail on its own first row — which is
-- exactly what happened on the first attempt.

-- ---------------------------------------------------------------------------
-- Areas.
-- ---------------------------------------------------------------------------
alter table mission.review_areas drop constraint if exists review_areas_direction_check;

alter table mission.review_areas rename column target  to green_at;
alter table mission.review_areas rename column warn_at to yellow_at;
alter table mission.review_areas add column if not exists target_value numeric;

comment on column mission.review_areas.green_at is
  'At or past this is green. Compared with <= when direction is lower_is_better.';
comment on column mission.review_areas.yellow_at is
  'Between this and green_at is yellow; past it is red.';
comment on column mission.review_areas.target_value is
  'The center, for within_range only: green_at and yellow_at become tolerances around it.';

update mission.review_areas
   set direction = case direction
                     when 'higher_better' then 'higher_is_better'
                     when 'lower_better'  then 'lower_is_better'
                     else direction
                   end;

alter table mission.review_areas
  add constraint review_areas_direction_check
  check (direction in ('higher_is_better', 'lower_is_better', 'within_range'));

alter table mission.review_areas alter column direction set default 'higher_is_better';

-- A center with no tolerance is not a band, and a band with no center is not
-- within anything. Same rule `measureHasTarget` applies in honeylakeos, stated
-- here so the database cannot hold a measure the code refuses to color.
alter table mission.review_areas
  add constraint review_areas_within_range_check
  check (
    direction <> 'within_range'
    or (target_value is not null and (green_at is not null or yellow_at is not null))
  );

-- ---------------------------------------------------------------------------
-- Readings. Same rename, because a reading copies the line it was judged
-- against — see the header of the reviews_module migration.
-- ---------------------------------------------------------------------------
alter table mission.review_readings drop constraint if exists review_readings_status_check;
alter table mission.review_readings drop constraint if exists review_readings_prior_check;

alter table mission.review_readings rename column target  to green_at;
alter table mission.review_readings rename column warn_at to yellow_at;
alter table mission.review_readings add column if not exists target_value numeric;

update mission.review_readings
   set direction = case direction
                     when 'higher_better' then 'higher_is_better'
                     when 'lower_better'  then 'lower_is_better'
                     else direction
                   end;

alter table mission.review_readings alter column direction set default 'higher_is_better';

alter table mission.review_readings
  add constraint review_readings_status_check
  check (status in ('red', 'yellow', 'green', 'unknown', 'not_due'));

alter table mission.review_readings
  add constraint review_readings_prior_check
  check (prior_status is null or prior_status in ('red', 'yellow', 'green', 'unknown', 'not_due'));

comment on column mission.review_readings.status is
  'green | yellow | red | unknown (no target set) | not_due (wrong cadence, or predates the period). Mirrors honeylakeos MeasureStatus plus not_due.';

notify pgrst, 'reload schema';
