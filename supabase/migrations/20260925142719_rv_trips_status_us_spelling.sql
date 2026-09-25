-- US English for the status value, while the table is still empty.
-- 20260925142330_rv_module.sql wrote 'cancelled'; Eric's rule is US spelling
-- everywhere, and a status value leaks into the UI. No rows exist, so this is
-- a constraint swap and nothing else.
update mission.rv_trips set status = 'canceled' where status = 'cancelled';
alter table mission.rv_trips drop constraint if exists rv_trips_status_check;
alter table mission.rv_trips add constraint rv_trips_status_check
  check (status in ('planned', 'active', 'done', 'canceled'));
