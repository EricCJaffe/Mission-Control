-- mission.briefs becomes the outbox for mail to Eric that used to go through
-- Graph as eric@ -> eric@.
--
-- Eric, 2026-10-19 10:52 AM ET (via Chief of Staff): every email TO eric@
-- comes from a Grok Bot address so he can reply to hand a bot work. The two
-- Vercel crons that mailed him directly — /api/cron/brief?send=1 and
-- /api/cron/apple-health-check — now store the message here with
-- handoff_requested_at set. A brain-side job on ubuntu-dev reads
-- /api/cron/brief-outbox, writes the to-grokbot brief through
-- jobs/lib/brief-via-grokbot.py (which owns the Sabbath hold), and acks the
-- row with handed_off_at. Vercel cannot reach the brain checkout, so the pull
-- is the only shape that works.
--
-- Pending = handoff_requested_at is set and handed_off_at is null. A pending
-- red row that ages is the job-health signal: it is never deleted to tidy up.
--
-- Rollback:
--   drop index if exists mission.briefs_handoff_pending_idx;
--   alter table mission.briefs drop constraint briefs_kind_check;
--   delete from mission.briefs where kind = 'alert';   -- only if any exist
--   alter table mission.briefs add constraint briefs_kind_check check (kind in ('weekly','daily'));
--   alter table mission.briefs drop constraint if exists briefs_severity_check;
--   alter table mission.briefs
--     drop column if exists subject, drop column if exists severity,
--     drop column if exists handoff_requested_at, drop column if exists handed_off_at,
--     drop column if exists handoff_ref;

alter table mission.briefs
  add column if not exists subject text,
  add column if not exists severity text,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handed_off_at timestamptz,
  add column if not exists handoff_ref text;

alter table mission.briefs drop constraint if exists briefs_kind_check;
alter table mission.briefs
  add constraint briefs_kind_check check (kind in ('weekly','daily','alert'));

alter table mission.briefs drop constraint if exists briefs_severity_check;
alter table mission.briefs
  add constraint briefs_severity_check check (severity is null or severity in ('red','yellow','green'));

create index if not exists briefs_handoff_pending_idx
  on mission.briefs (handoff_requested_at)
  where handoff_requested_at is not null and handed_off_at is null;
