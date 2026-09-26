-- A job that must wait for another: it stays off every helper's list until
-- the blocking task is done. First use: demolishing the chicken coop waits
-- until the water and electric run to it are found and capped.
alter table mission.work_items add column if not exists blocked_by uuid references mission.tasks(id) on delete set null;
notify pgrst, 'reload schema';
