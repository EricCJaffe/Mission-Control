-- Rollback for 20261019180000_briefs_grokbot_outbox.sql
-- Restores mission.briefs to daily/weekly only. Alert rows must go first, or
-- the narrowed check fails; they are copies of mail already handed to grokbot.
drop index if exists mission.briefs_handoff_pending_idx;
alter table mission.briefs drop constraint if exists briefs_kind_check;
delete from mission.briefs where kind = 'alert';
alter table mission.briefs add constraint briefs_kind_check check (kind in ('weekly','daily'));
alter table mission.briefs drop constraint if exists briefs_severity_check;
alter table mission.briefs
  drop column if exists subject,
  drop column if exists severity,
  drop column if exists handoff_requested_at,
  drop column if exists handed_off_at,
  drop column if exists handoff_ref;
