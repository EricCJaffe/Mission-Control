-- Rollback for 20261031124343_decisions_loops.sql. Loop rows must go first or
-- the narrower check fails.
delete from mission.decisions where kind = 'loop';
alter table mission.decisions drop column if exists group_name;
alter table mission.decisions drop constraint if exists decisions_kind_check;
alter table mission.decisions
  add constraint decisions_kind_check check (kind in ('decision', 'stalled'));
