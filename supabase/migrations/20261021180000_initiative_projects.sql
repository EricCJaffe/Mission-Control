-- Coding initiatives on the projects module.
--
-- Eric, 2026-10-21 7:51 AM ET: a daily shortlist of the major coding
-- initiatives against plan, in Mission Control. scripts/sync/initiatives.ts
-- reads the brain's docs/initiatives.yml and upserts one mission.projects row
-- per initiative (kind = 'initiative'), with its phases as mission.tasks
-- (source = 'initiative').
--
-- APPLY WHEN THE PR MERGES, NOT BEFORE, and rename this file to the version
-- the ledger records. /projects selects the new columns, so the page errors
-- between a merge and this apply.
--
-- Rollback (supabase/rollbacks/<version>_initiative_projects.down.sql):
--   delete from mission.tasks where source = 'initiative';
--   delete from mission.projects where kind = 'initiative';
--   delete from mission.sync_runs where source = 'initiatives';
--   restore sync_runs_source_check and tasks_source_check without 'initiative'; drop the columns below.

alter table mission.projects
  add column if not exists kind text not null default 'repo',
  add column if not exists rag text,
  add column if not exists plan_pct integer,
  add column if not exists owner_session text,
  add column if not exists plan_doc text,
  add column if not exists blockers text[] not null default '{}',
  add column if not exists last_activity_at date,
  add column if not exists next_step text;

alter table mission.projects drop constraint if exists projects_kind_check;
alter table mission.projects
  add constraint projects_kind_check check (kind in ('repo', 'initiative'));

alter table mission.projects drop constraint if exists projects_rag_check;
alter table mission.projects
  add constraint projects_rag_check check (rag is null or rag in ('red', 'yellow', 'green'));

alter table mission.projects drop constraint if exists projects_plan_pct_check;
alter table mission.projects
  add constraint projects_plan_pct_check check (plan_pct is null or plan_pct between 0 and 100);

alter table mission.tasks drop constraint if exists tasks_source_check;
alter table mission.tasks
  add constraint tasks_source_check check (source = any (array[
    'manual', 'todo_md', 'claude_md', 'github_issue', 'code_todo',
    'monday', 'email', 'calendar', 'initiative'
  ]));

alter table mission.sync_runs drop constraint if exists sync_runs_source_check;
alter table mission.sync_runs
  add constraint sync_runs_source_check
  check (source = any (array['projects', 'm365_mail', 'm365_calendar', 'brain', 'initiatives']));
