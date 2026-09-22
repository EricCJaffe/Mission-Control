-- A fourth job mechanism: `on_demand`.
--
-- `mechanism` is an allowlist rather than free text because it is the fact
-- that decides where a job is allowed to live — a Vercel cron cannot see
-- ~/dev, so anything needing a repo, `gh` or a model can only be a timer on
-- the box. A job nobody schedules is still a real job, and it needed a value.
--
-- ─── WHY THIS FILE WAS WRITTEN TWO WEEKS LATE ──────────────────────────────
--
-- It was applied on 2026-09-08 through MCP and never committed. The change
-- reached the repo the next day as an EDIT TO AN ALREADY-APPLIED MIGRATION
-- (8cbcf2a, "Add on_demand as a fourth job mechanism"), which widened the
-- constraint inside 20260908022326_brain_dashboard.sql instead of adding a
-- file of its own.
--
-- Nothing broke, which is the problem: the live schema was right, the repo
-- looked right, and the ledger carried a version with no file for thirteen
-- days. `npm run db:ledger` reported it as UNFILED and nobody read it.
--
-- Editing an applied migration in place is the specific habit that makes a
-- chain unreplayable — the file no longer describes what ran at that version,
-- so a rebuild from zero produces a schema no migration ever created. The
-- base file has been put back to the three values it was applied with, and
-- the fourth lives here, under the version the ledger actually recorded.
--
-- SCHEMA IS `mission`. Qualified, because `public` is FinanceOS on this same
-- database and an unqualified statement would find its copy and succeed.

-- The constraint is an allowlist, so it is replaced rather than added to.
alter table mission.brain_jobs
  drop constraint if exists brain_jobs_mechanism_check;

alter table mission.brain_jobs
  add constraint brain_jobs_mechanism_check
  check (mechanism in ('systemd_timer', 'vercel_cron', 'paperclip', 'on_demand'));

notify pgrst, 'reload schema';
