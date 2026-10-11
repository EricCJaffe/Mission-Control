-- Approved by Eric on 2026-10-11 at 9:09 AM ET.
--
-- Two changes, both idempotent, neither required for the code to run:
--
-- 1. `calendar_events.domain_origin` records who chose the domain.
--    'sync' — the Outlook harvester wrote it, and a later run may replace it
--    when the category (or the title fallback) says something else.
--    'hand' — a person set it, and the sync will not touch it.
--    Null is "we do not know", which is how every row looks until this file
--    runs, and the sync leaves those rows alone.
--
--    The backfill is the only way to tell the old hard-coded `work` from a
--    domain somebody already changed. The harvester used to write `work` on
--    insert and never again, so a synced row that is still `work` was the
--    machine. Anything else on a synced row was a person, or an earlier
--    triage, and stays put. Rows with no `external_id` are not Outlook's
--    and are not stamped.
--
-- 2. The weekly Family review area was `manual` because the calendar had
--    never carried a family tag. It now reads family hours from the calendar
--    (and RV trip days). The collector already does that when the area's
--    source is still `manual`, so this update is the row catching up with
--    the code. A number typed on the review still wins; that lives in the
--    reading, not in this source value.

alter table mission.calendar_events
  add column if not exists domain_origin text;

alter table mission.calendar_events drop constraint if exists calendar_events_domain_origin_check;
alter table mission.calendar_events
  add constraint calendar_events_domain_origin_check
  check (domain_origin is null or domain_origin in ('sync', 'hand'));

update mission.calendar_events
   set domain_origin = 'sync'
 where external_id is not null
   and domain = 'work'
   and domain_origin is null;

--    Before this file, nothing but the harvester ever wrote `domain` on a
--    synced row (the update route did not accept one), so `work` there is
--    the machine's. Applied 2026-10-11 BEFORE the code merged, so the new
--    route's pre-migration fallback never had a window to save a hand `work`.
--    A null domain is unclassified, not a choice: left unset for the sync.
update mission.calendar_events
   set domain_origin = 'hand'
 where external_id is not null
   and domain is not null
   and domain <> 'work'
   and domain_origin is null;

update mission.review_areas
   set source = 'calendar',
       description = 'Hours tagged family on the calendar, plus RV trip days that are not already a family calendar event. A number typed on the review replaces that for the period.',
       updated_at = now()
 where key = 'family'
   and source = 'manual';

notify pgrst, 'reload schema';
