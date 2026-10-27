-- Undo 20261027224500_bot_activity.sql. Stop mission-control-activity.timer
-- first, or the next run fails on the missing tables (harmless, but noisy).
drop policy if exists bot_activity_runs_owner_read on mission.bot_activity_runs;
drop index if exists mission.bot_activity_runs_user_started_idx;
drop table if exists mission.bot_activity_runs;

drop policy if exists bot_activity_items_owner_read on mission.bot_activity_items;
drop index if exists mission.bot_activity_items_user_kind_occurred_idx;
drop index if exists mission.bot_activity_items_key_idx;
drop table if exists mission.bot_activity_items;
