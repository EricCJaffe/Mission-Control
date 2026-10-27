-- Let the brain's R1 data invariant read the bot-activity heartbeat.
--
-- field-notes R1 (Eric-approved 2026-10-11): a sync is not done until
-- something watches its DATA. The /activity harvester (scripts/sync/activity.ts,
-- every 5 minutes) writes one mission.bot_activity_runs row per run; the
-- invariant in ~/dev/brain/jobs/_data-invariants.tsv flags no ok run in 20
-- minutes. It connects as financeos_invariants_ro, the existing read-only
-- role the FinanceOS invariants already use on this same database, and that
-- role got "permission denied for schema mission" (harness, 2026-10-27).
--
-- Exactly what it needs and nothing more:
--   usage on schema mission    -- to name the table at all. PUBLIC holds no
--                                 table grants in mission, so usage alone
--                                 reaches nothing else.
--   select on bot_activity_runs -- status, timestamps and counts per run;
--                                 never item text (that is bot_activity_items,
--                                 which stays out of reach).
--   a select policy             -- the table has RLS and the role does not
--                                 bypass it; same shape as FinanceOS's
--                                 invariants_ro_select on qbo_sync_records.
-- No write grant, no new role, no new credential.
--
-- Rollback: supabase/rollbacks/20261027232732_bot_activity_invariant_ro.down.sql

grant usage on schema mission to financeos_invariants_ro;
grant select on mission.bot_activity_runs to financeos_invariants_ro;

drop policy if exists invariants_ro_select on mission.bot_activity_runs;
create policy invariants_ro_select on mission.bot_activity_runs
  for select
  to financeos_invariants_ro
  using (true);
