-- MC divorce p3, guard + archive (brain channel/from-grokbot/2026-11-02-mission-control-mc-divorce.md;
-- Eric's blanket yes, 8:29 AM ET 2026-11-02, relayed by Chief of Staff).
--
-- FSAOS + brain are the single home for business data. The 42 manual/email work tasks
-- were imported into FSAOS (fsaos#297, 2026-11-02 10:55 AM ET, verified with before and
-- after counts); the 251 todo_md rows were copies of repo TODO lines that FSAOS reads
-- from the repos directly. Mission Control keeps Eric's personal tasks only.
--
-- 1. ARCHIVE, not delete: every domain='work' row is relabeled 'work_archived'. Rows stay
--    where they are, because ten tables reference mission.tasks (task_links,
--    daily_priorities, goal_tasks, calendar_events, ...), and a move would break them.
--    Before (2026-11-02 ~11:35 AM ET): 293 work rows (manual 39, email 3, todo_md 251).
-- 2. GUARD: a row may never be domain='work' again, on insert or update. brain
--    jobs/lib/grok-db.py already refuses it; this makes the database refuse it too.
--    NULL stays legal (Chief of Staff is classifying the 139 null-domain rows).
--
-- Rollback:
--   drop trigger if exists tasks_no_work on mission.tasks;
--   drop function if exists mission.tasks_no_work();
--   update mission.tasks set domain = 'work' where domain = 'work_archived';

update mission.tasks set domain = 'work_archived' where domain = 'work';

create or replace function mission.tasks_no_work()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.domain = 'work' then
    raise exception 'mission.tasks: business (domain work) tasks live in FSAOS since the MC divorce (2026-11-02)'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists tasks_no_work on mission.tasks;
create trigger tasks_no_work
  before insert or update on mission.tasks
  for each row execute function mission.tasks_no_work();

do $$
declare v_left int;
begin
  select count(*) into v_left from mission.tasks where domain = 'work';
  raise notice 'mission_tasks_work_guard: % work rows left (expect 0); % archived',
    v_left, (select count(*) from mission.tasks where domain = 'work_archived');
end $$;
