-- Rollback for 20261031140457_maintenance_water_items.sql. Deletes only the
-- rows that migration created, matched on the exact text it wrote, so any
-- other guest house or softener data (added by hand before or after) stays.

-- The softener's helper-list row (the task itself predates the migration).
delete from mission.work_items
where instructions like 'Main house water softener, once a month: lift the brine tank lid.%'
  and materials = 'Water softener salt pellets (40 lb bags)';

-- The guest house sediment task (its maintenance_plans row cascades).
delete from mission.tasks t
using mission.maintenance_plans p
where t.id = p.task_id
  and p.library_key = 'water.sediment'
  and t.title = 'Guest House water system: Replace sediment pre-filter';

-- The guest house water system, only if nothing else hangs off it now.
delete from mission.maintenance_assets a
where a.category = 'water_system'
  and a.notes = 'Own filters; changed every quarter with the main house (Eric, 2026-10-01).'
  and not exists (select 1 from mission.maintenance_plans p where p.asset_id = a.id);
