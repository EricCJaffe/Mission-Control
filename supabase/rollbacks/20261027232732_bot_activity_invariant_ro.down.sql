-- Rollback for 20261027232732_bot_activity_invariant_ro.sql
-- Remove the R1 row (mission-control-bot-activity-stale) from the brain's
-- jobs/_data-invariants.tsv first, or backend-scan reports it as erroring.
drop policy if exists invariants_ro_select on mission.bot_activity_runs;
revoke select on mission.bot_activity_runs from financeos_invariants_ro;
revoke usage on schema mission from financeos_invariants_ro;
