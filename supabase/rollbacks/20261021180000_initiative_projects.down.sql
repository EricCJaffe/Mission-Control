-- Rollback for 20261021180000_initiative_projects.sql (rename alongside it).
-- Initiative rows are mirrors of the brain's docs/initiatives.yml; the next
-- sync after a re-apply rebuilds them, so deleting them loses nothing.
delete from mission.tasks where source = 'initiative';
delete from mission.projects where kind = 'initiative';
delete from mission.sync_runs where source = 'initiatives';

alter table mission.sync_runs drop constraint if exists sync_runs_source_check;
alter table mission.sync_runs
  add constraint sync_runs_source_check
  check (source = any (array['projects', 'm365_mail', 'm365_calendar', 'brain']));

alter table mission.tasks drop constraint if exists tasks_source_check;
alter table mission.tasks
  add constraint tasks_source_check check (source = any (array[
    'manual', 'todo_md', 'claude_md', 'github_issue', 'code_todo',
    'monday', 'email', 'calendar'
  ]));

alter table mission.projects drop constraint if exists projects_plan_pct_check;
alter table mission.projects drop constraint if exists projects_rag_check;
alter table mission.projects drop constraint if exists projects_kind_check;
alter table mission.projects
  drop column if exists next_step,
  drop column if exists last_activity_at,
  drop column if exists blockers,
  drop column if exists plan_doc,
  drop column if exists owner_session,
  drop column if exists plan_pct,
  drop column if exists rag,
  drop column if exists kind;
