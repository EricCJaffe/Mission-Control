-- File the workouts under Health.
--
-- The first weekly brief generated against real data reported "God First,
-- Health, Family, Impact have no scheduled time in this period" and put three
-- hours under Admin. Every one of those three was a training session.
--
-- 20260905180000 translated the legacy `domain = 'Health'` label on 21 rows,
-- but 46 more carried no domain at all and were only identifiable by
-- `event_type`, which is free text and holds both 'workout' and 'Workout'.
-- Case is the entire reason they were missed.
--
-- Only workouts are touched. 'Daily Anchor' and 'Monthly Review' are left
-- unclassified on purpose — an anchor could be spirit, soul or body depending
-- on what the anchor is, and guessing would put a number in the alignment
-- check that nobody chose.

update mission.calendar_events
   set domain = 'body'
 where domain is null
   and event_type ilike 'workout';

notify pgrst, 'reload schema';
