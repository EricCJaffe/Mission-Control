-- Two water maintenance items Eric asked for (water-system form, answered
-- 2026-10-01; loops mc-maint:water-guest-house and mc-maint:water-softener,
-- idle since):
--   1. "The guest house HAS its own filters, same quarterly change as the main
--      house" -> a Water system asset under the Guest House building with the
--      library's 3-month sediment pre-filter schedule, due the same day as
--      the main house's so both are changed together.
--   2. "There IS a softener at the main house" -> its existing monthly
--      "Check softener salt" schedule goes on the helper list.
--
-- Data, not schema. The repo is public, so nothing here names a person, an
-- address or an id: rows are found by the names already in the database
-- (a 'Guest House' building, a water_system asset under 'Main House') and the
-- helper location is copied from the owner's existing helper items.
-- Idempotent: each step checks before it writes; re-running changes nothing.
-- Rollback: supabase/rollbacks/20261031160000_maintenance_water_items.down.sql.

do $$
declare
  r record;
  v_asset uuid;
  v_task uuid;
  v_main_task record;
  v_loc record;
begin
  for r in
    select gh.user_id, gh.id as guest_id, ws.id as main_water_id
    from mission.maintenance_assets gh
    join mission.maintenance_assets ws
      on ws.user_id = gh.user_id and ws.category = 'water_system' and ws.status = 'active'
    join mission.maintenance_assets mh
      on mh.id = ws.building_id and mh.name = 'Main House'
    where gh.name = 'Guest House' and gh.status = 'active'
  loop
    -- 1. Guest house water system and its quarterly sediment filter.
    select a.id into v_asset
    from mission.maintenance_assets a
    where a.user_id = r.user_id and a.category = 'water_system' and a.building_id = r.guest_id
    limit 1;
    if v_asset is null then
      insert into mission.maintenance_assets (user_id, name, category, building_id, status, notes)
      values (r.user_id, 'Water system', 'water_system', r.guest_id, 'active',
              'Own filters; changed every quarter with the main house (Eric, 2026-10-01).')
      returning id into v_asset;
    end if;

    if not exists (
      select 1 from mission.maintenance_plans p where p.asset_id = v_asset and p.library_key = 'water.sediment'
    ) then
      select t.project_id, t.due_date, t.recurrence_anchor into v_main_task
      from mission.maintenance_plans p
      join mission.tasks t on t.id = p.task_id
      where p.asset_id = r.main_water_id and p.library_key = 'water.sediment'
      limit 1;

      insert into mission.tasks (
        user_id, title, description, why, domain, source, status, category, priority,
        project_id, due_date, recurrence_rule, recurrence_anchor
      ) values (
        r.user_id,
        'Guest House water system: Replace sediment pre-filter',
        'Every 3 months, the same day as the main house. Shut off, relieve pressure, replace the cartridge and O-ring lube, note the cartridge size in Parts.',
        'The pre-filter protects everything downstream; it clogs first.',
        'family', 'manual', 'todo', 'maintenance', 3,
        v_main_task.project_id,
        coalesce(v_main_task.due_date, current_date),
        'FREQ=MONTHLY;INTERVAL=3',
        coalesce(v_main_task.recurrence_anchor, v_main_task.due_date, current_date)
      )
      returning id into v_task;

      insert into mission.maintenance_plans (task_id, asset_id, user_id, library_key)
      values (v_task, v_asset, r.user_id, 'water.sediment');
    end if;

    -- 2. Main house softener salt on the helper list.
    select p.task_id into v_task
    from mission.maintenance_plans p
    where p.asset_id = r.main_water_id and p.library_key = 'water.softener_salt'
    limit 1;
    if v_task is not null and not exists (select 1 from mission.work_items w where w.task_id = v_task) then
      select w.location_asset_id, w.location_label into v_loc
      from mission.work_items w
      where w.user_id = r.user_id and w.location_label is not null
      order by w.created_at desc
      limit 1;

      insert into mission.work_items (
        task_id, user_id, shared, skill, location_asset_id, location_label, instructions, materials
      ) values (
        v_task, r.user_id, true, 'helper', v_loc.location_asset_id, v_loc.location_label,
        'Main house water softener, once a month: lift the brine tank lid. Keep the salt a few inches above the water line; top it up if it is low. If there is a hard crust (a salt bridge), break it up gently with a broom handle. Text Eric if the tank was empty or there is standing water above the salt.',
        'Water softener salt pellets (40 lb bags)'
      );
    end if;
  end loop;
end $$;
