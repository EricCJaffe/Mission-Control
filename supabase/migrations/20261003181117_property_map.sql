-- ===========================================================================
-- Property map: an aerial photo of the property with every building pinned.
--
-- Eric, 2026-10-03: label the main house, guest house, barn, pole barn,
-- chicken coop, she shed, red house on the lake, gun range and the bathroom
-- on the lake once, so maintenance can be specific to each.
--
-- A pin IS a maintenance asset. Each building gets schedules, issues and a
-- service log the same way a tractor does, so there is no second list of
-- "places" to keep in step with the inventory. map_x / map_y are percentages
-- of the image (0-100), which keeps a pin on its building at any screen width
-- and survives swapping in a sharper photo of the same framing.
--
-- The photo lives in the private `attachments` bucket under the owner's
-- folder (policy mission_attachments_owner). The repository is public: the
-- address and the aerial never go in it.
-- ===========================================================================

alter table mission.maintenance_assets
  add column if not exists map_x numeric,
  add column if not exists map_y numeric;

alter table mission.maintenance_assets
  drop constraint if exists maintenance_assets_map_xy_check;
alter table mission.maintenance_assets
  add constraint maintenance_assets_map_xy_check check (
    (map_x is null) = (map_y is null)
    and (map_x is null or (map_x between 0 and 100 and map_y between 0 and 100))
  );

-- One map per owner. A second property would make this (user_id, slug).
create table if not exists mission.property_maps (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  image_path  text not null,
  address     text,
  updated_at  timestamptz not null default now()
);

alter table mission.property_maps enable row level security;

drop policy if exists property_maps_owner on mission.property_maps;
create policy property_maps_owner on mission.property_maps
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
