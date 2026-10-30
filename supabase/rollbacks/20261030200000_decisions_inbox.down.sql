-- Rollback for 20261030200000_decisions_inbox.sql
-- Drops the Decisions inbox. Answered-but-undelivered rows are answers no bot
-- has seen yet; check first:
--   select count(*) from mission.decisions where status = 'answered' and delivered_at is null;
drop policy if exists decisions_owner_answer on mission.decisions;
drop policy if exists decisions_owner_read on mission.decisions;
drop index if exists mission.decisions_undelivered_idx;
drop index if exists mission.decisions_user_status_idx;
drop table if exists mission.decisions;
