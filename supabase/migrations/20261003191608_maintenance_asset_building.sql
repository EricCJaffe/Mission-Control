-- ===========================================================================
-- Which building an item lives in.
--
-- Eric, 2026-10-03: the building labels on the property map should be
-- selectable for the maintenance items. A building is itself a maintenance
-- asset (pinned on the map, 20261003181117_property_map.sql), so "the water
-- heater is in the guest house" is one asset pointing at another.
--
-- `location` stays as free text for things that are not on the map (the RV,
-- a storage unit). building_id wins on screen when both are set.
-- on delete set null: deleting a building never deletes what was in it.
-- ===========================================================================

alter table mission.maintenance_assets
  add column if not exists building_id uuid references mission.maintenance_assets(id) on delete set null;

alter table mission.maintenance_assets
  drop constraint if exists maintenance_assets_building_not_self;
alter table mission.maintenance_assets
  add constraint maintenance_assets_building_not_self check (building_id is null or building_id <> id);

create index if not exists maintenance_assets_building_idx
  on mission.maintenance_assets (building_id) where building_id is not null;

notify pgrst, 'reload schema';
