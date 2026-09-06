-- Classify what was left unclassified, and write down the week's real shape.
--
-- Two things the rules could not decide and a person could.
--
-- PART 1 — the seven unclassified tasks.
--
-- Five are firearms training courses and a gunsmithing follow-up, one is a
-- lookup, one is a shelving rod in Mary Jo's closet. Eric's call: shooting is
-- `body`, alongside jiu-jitsu — it is training, not a hobby. My own reading had
-- been `soul`, and it was wrong for the reason guesses usually are: I sorted by
-- what the activity looks like from outside rather than by what it is for.
--
-- PART 2 — three calendar events whose `event_type` lied.
--
-- "Exercise" and "Back and Bicep" were filed as 'Daily Anchor' and 'Monthly
-- Review'; both are workouts. "sell crypto" was also a 'Daily Anchor'. The
-- earlier caution about a Daily Anchor possibly being spirit or soul was
-- reasoning from the label instead of the title — the titles are unambiguous.
--
-- PART 3 — the standing week, which was true and simply never written down.
--
-- Mon-Sat: read from 06:30 (Bible, then a book), plan the day to 07:45, train
-- 08:00-09:30. Recurring rows rather than one row per day, now that the brief
-- and the priority matrix expand recurrence.
--
-- Getting ready afterwards, 09:30-10:00, is deliberately NOT here. It is not a
-- commitment competing for the week, and three hours of it would inflate Health
-- with time that is not training.
--
-- Sunday church is missing on purpose: the time was not given, and inventing
-- one would put a number in the alignment check that nobody chose.

-- ---------------------------------------------------------------------------
-- Part 1
-- ---------------------------------------------------------------------------
update mission.tasks set domain = 'body'
 where domain is null and status <> 'done'
   and (title ilike '%rifle%' or title ilike '%carbine%' or title ilike '%glass trigger%'
        or title ilike '%sig sauer%' or title ilike '%agency arms%');

update mission.tasks set domain = 'family'
 where domain is null and status <> 'done' and title ilike '%closet%';

-- ---------------------------------------------------------------------------
-- Part 2
-- ---------------------------------------------------------------------------
update mission.calendar_events set domain = 'body'
 where domain is null and (title ilike 'exercise' or title ilike '%bicep%');

update mission.calendar_events set domain = 'work'
 where domain is null and title ilike '%crypto%';

-- ---------------------------------------------------------------------------
-- Part 3 — the standing week.
--
-- Anchored on Monday 2026-09-07 so the first occurrence is a Monday; the
-- Mon-Sat rule then does the rest. Times are Eastern, stored as UTC (EDT,
-- UTC-4) — 06:30 local is 10:30Z.
--
-- Guarded by a `not exists` on the title so re-running this migration cannot
-- create a second set.
-- ---------------------------------------------------------------------------
insert into mission.calendar_events
  (user_id, title, start_at, end_at, event_type, domain, recurrence_rule, notes)
select u.id, v.title, v.start_at::timestamptz, v.end_at::timestamptz, 'Daily Anchor', v.domain, 'Mon-Sat', v.notes
from auth.users u
cross join (values
  ('Morning reading — Bible, then a book',
   '2026-09-07T10:30:00Z', '2026-09-07T11:30:00Z', 'spirit',
   'Bible first, then a book. The anchor the rest of the morning hangs off.'),
  ('Scan the day',
   '2026-09-07T11:30:00Z', '2026-09-07T11:45:00Z', 'work',
   'Run through the day''s actions before getting ready to train.'),
  ('Exercise',
   '2026-09-07T12:00:00Z', '2026-09-07T13:30:00Z', 'body',
   'Six days a week. Getting ready afterwards is not scheduled — it is not a commitment competing for the week.')
) as v(title, start_at, end_at, domain, notes)
where u.email = 'ejaffejax@gmail.com'
  and not exists (
    select 1 from mission.calendar_events e
     where e.user_id = u.id and e.title = v.title and e.recurrence_rule = 'Mon-Sat'
  );

notify pgrst, 'reload schema';
