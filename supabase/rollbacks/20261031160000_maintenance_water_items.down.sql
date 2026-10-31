-- Rollback for 20261031160000_maintenance_water_items.sql: take the softener
-- off the helper list and remove the guest house water system (its plan and
-- task go with it). Finds the same rows by the same names.
delete from mission.work_items w
using mission.maintenance_plans p, mission.maintenance_assets ws, mission.maintenance_assets mh
where w.task_id = p.task_id and p.library_key = 'water.softener_salt'
  and ws.id = p.asset_id and ws.category = 'water_system'
  and mh.id = ws.building_id and mh.name = 'Main House';

delete from mission.tasks t
using mission.maintenance_plans p, mission.maintenance_assets a, mission.maintenance_assets gh
where t.id = p.task_id and p.asset_id = a.id and a.category = 'water_system'
  and gh.id = a.building_id and gh.name = 'Guest House';

delete from mission.maintenance_assets a
using mission.maintenance_assets gh
where a.category = 'water_system' and gh.id = a.building_id and gh.name = 'Guest House';
