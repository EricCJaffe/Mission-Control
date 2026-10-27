-- Rollback for 20261026235419_muse_mail.sql
-- Drops the Muse mailbox. Any undelivered reply (status 'done', handed_off_at
-- null) is lost with it, so check for those first:
--   select id, from_agent, done_at from mission.muse_mail
--    where status = 'done' and handed_off_at is null;
drop policy if exists muse_mail_owner on mission.muse_mail;
drop index if exists mission.muse_mail_user_status_created_idx;
drop table if exists mission.muse_mail;
