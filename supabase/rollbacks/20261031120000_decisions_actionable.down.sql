-- Rollback for 20261031120000_decisions_actionable.sql.
drop table if exists mission.decision_questions;
drop index if exists mission.decisions_user_dedupe_idx;
alter table mission.decisions
  drop column if exists closed_reason,
  drop column if exists dedupe_key,
  drop column if exists next_step,
  drop column if exists pr_ref;
