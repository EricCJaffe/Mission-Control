-- Sunday church, the last piece of the standing week.
--
-- 09:30 Eastern (13:30Z), anchored on Sunday 2026-09-13 so the first
-- occurrence falls on a Sunday and the weekly rule does the rest.
--
-- THE DURATION IS AN ASSUMPTION. Eric gave the start time and not the end;
-- 90 minutes is a normal service and is easy to correct in the calendar. It is
-- called out here rather than buried, because this hour lands in God First and
-- an invented number in the alignment check is exactly the thing the rest of
-- this system refuses to do.
--
-- Guarded on the title so re-running cannot create a second one.
insert into mission.calendar_events
  (user_id, title, start_at, end_at, event_type, domain, recurrence_rule, notes)
select u.id, 'Church', '2026-09-13T13:30:00Z'::timestamptz, '2026-09-13T15:00:00Z'::timestamptz,
       'Daily Anchor', 'spirit', 'weekly',
       'Sundays, 9:30. Duration assumed at 90 minutes — adjust in the calendar if it is wrong.'
from auth.users u
where u.email = 'ejaffejax@gmail.com'
  and not exists (
    select 1 from mission.calendar_events e
     where e.user_id = u.id and e.title = 'Church' and e.recurrence_rule = 'weekly'
  );

notify pgrst, 'reload schema';
