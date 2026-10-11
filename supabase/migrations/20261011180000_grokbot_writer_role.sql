-- grokbot_writer: phase 2 of the grokbot db-write path.
--
-- Eric approved 2026-10-10: grokbot may write tasks, notes and daily
-- priorities; health, labs and meds stay read-only. The tool half is brain's
-- jobs/lib/grok-db.py, which refuses to write until this role exists.
--
-- Shape:
--   * NOLOGIN, no password, NOBYPASSRLS. grok-db reaches it with
--     SET LOCAL ROLE inside one transaction, so no new credential exists.
--   * SELECT / INSERT / UPDATE on three tables. Deliberately no DELETE and
--     nothing on any other table.
--   * The existing owner policies (auth.uid() = user_id) are granted to
--     PUBLIC, so they bind this role too. The RESTRICTIVE policy below is a
--     second fence pinned to Eric's id, which a forged jwt claim cannot open.
--
-- No grant on schema auth or auth.uid(): PUBLIC already holds EXECUTE on
-- auth.uid(), and postgres holds no grant option on either, so those grants
-- would only print "no privileges were granted". Dry-run proved the policies
-- evaluate without them.
--
-- The two task-completion triggers become SECURITY DEFINER. They were
-- SECURITY INVOKER, and every UPDATE that marks a task done reads
-- maintenance_plans and writes supplies — tables this role must not hold.
-- Dry-run without this change: "permission denied for table
-- maintenance_plans" on any completion, maintenance task or not. Granting
-- the role those tables instead would widen it past what Eric approved.
-- Definer rights bypass RLS inside the body, so both bodies now scope every
-- read and write to new.user_id explicitly; behavior for the app is unchanged.
--
-- Dry-run 2026-10-11 (inside an aborted transaction): 9 grants, insert ok,
-- status->done ok, delete denied, forged sub refused (42501), labs denied.
--
-- Rollback:
--   drop policy if exists grokbot_writer_eric_only on mission.tasks;
--   drop policy if exists grokbot_writer_eric_only on mission.notes;
--   drop policy if exists grokbot_writer_eric_only on mission.daily_priorities;
--   revoke all on mission.tasks, mission.notes, mission.daily_priorities from grokbot_writer;
--   revoke usage on schema mission from grokbot_writer;
--   revoke grokbot_writer from postgres;
--   drop role grokbot_writer;
--   alter function mission.maintenance_log_completion() security invoker reset search_path;
--   alter function mission.supplies_use_on_completion() security invoker reset search_path;
--   (the user_id filters added below are harmless to keep)

create role grokbot_writer nologin noinherit nobypassrls;
-- postgres is not superuser on hosted Supabase; SET ROLE needs membership.
grant grokbot_writer to postgres;

grant usage on schema mission to grokbot_writer;
grant select, insert, update on mission.tasks, mission.notes, mission.daily_priorities to grokbot_writer;

create policy grokbot_writer_eric_only on mission.tasks
  as restrictive for all to grokbot_writer
  using (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f')
  with check (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f');
create policy grokbot_writer_eric_only on mission.notes
  as restrictive for all to grokbot_writer
  using (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f')
  with check (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f');
create policy grokbot_writer_eric_only on mission.daily_priorities
  as restrictive for all to grokbot_writer
  using (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f')
  with check (user_id = 'e22a6d93-9b90-444c-a77c-8c731424a92f');

create or replace function mission.maintenance_log_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  mission.maintenance_plans%rowtype;
  v_meter numeric;
begin
  if not (
    new.last_completed_at is distinct from old.last_completed_at
    or (new.status = 'done' and old.status is distinct from 'done')
  ) then
    return new;
  end if;
  select * into v_plan from mission.maintenance_plans
   where task_id = new.id and user_id = new.user_id;
  if not found then
    return new;
  end if;
  select meter_reading into v_meter from mission.maintenance_assets
   where id = v_plan.asset_id and user_id = new.user_id;
  insert into mission.maintenance_log
    (user_id, asset_id, task_id, title, performed_on, meter_reading, source)
  values
    (new.user_id, v_plan.asset_id, new.id, new.title,
     (now() at time zone 'America/New_York')::date, v_meter, 'completed');
  update mission.maintenance_plans set last_meter = v_meter
   where task_id = new.id and user_id = new.user_id;
  return new;
end;
$$;

create or replace function mission.supplies_use_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    new.last_completed_at is distinct from old.last_completed_at
    or (new.status = 'done' and old.status is distinct from 'done')
  ) then
    return new;
  end if;

  update mission.supplies s
     set on_hand = greatest(s.on_hand - n.qty, 0),
         updated_at = now()
    from mission.supply_needs n
   where n.task_id = new.id
     and n.supply_id = s.id
     and n.user_id = new.user_id
     and s.user_id = new.user_id;

  return new;
end;
$$;
