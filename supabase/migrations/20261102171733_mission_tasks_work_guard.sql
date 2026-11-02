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
-- 2. GUARD: the domain check itself (tasks_domain_check, 20260905180000) now allows
--    'work_archived' and no longer allows 'work', so the database refuses a business task
--    on insert or update. brain jobs/lib/grok-db.py already refuses it client-side, and the
--    task routes answer 400. NULL stays legal (Chief of Staff classifies the null-domain rows).
--
-- Rollback:
--   alter table mission.tasks drop constraint if exists tasks_domain_check;
--   update mission.tasks set domain = 'work' where domain = 'work_archived';
--   alter table mission.tasks add constraint tasks_domain_check
--     check (domain is null or domain in ('spirit','body','soul','family','work'));

alter table mission.tasks drop constraint if exists tasks_domain_check;

update mission.tasks set domain = 'work_archived' where domain = 'work';

alter table mission.tasks add constraint tasks_domain_check
  check (domain is null or domain in ('spirit','body','soul','family','work_archived'));

do $$
begin
  raise notice 'mission_tasks_work_guard: % work rows left (expect 0); % archived',
    (select count(*) from mission.tasks where domain = 'work'),
    (select count(*) from mission.tasks where domain = 'work_archived');
end $$;
