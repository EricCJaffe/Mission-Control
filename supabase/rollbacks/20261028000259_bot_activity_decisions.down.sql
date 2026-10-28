-- Rollback for 20261028000259_bot_activity_decisions.sql
-- Drops Eric's /activity decisions and their audit log. Undelivered rows are
-- answers no bot has seen yet; check first:
--   select count(*) from mission.bot_activity_decisions where delivered_at is null;
drop policy if exists bot_activity_decisions_owner_insert on mission.bot_activity_decisions;
drop policy if exists bot_activity_decisions_owner_read on mission.bot_activity_decisions;
drop index if exists mission.bot_activity_decisions_undelivered_idx;
drop index if exists mission.bot_activity_decisions_user_created_idx;
drop table if exists mission.bot_activity_decisions;
