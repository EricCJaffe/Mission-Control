/**
 * The property map's data, shared by /maintenance (as its header) and
 * /maintenance/map (full size), so both show the same pins in the same colors.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { worst, type AssetRow, type PlanRow } from './load';
import { dueLabel, type Verdict } from './status';

export type MapPin = {
  id: string;
  name: string;
  x: number | null;
  y: number | null;
  /* Worst of the building's own schedules and of everything inside it. */
  verdict: Verdict | null;
  next: string | null;
  schedules: number;
  /* Items that live in this building (building_id). */
  inside: Array<{ id: string; name: string }>;
};

export type PropertyMapData = { imageUrl: string | null; address: string | null; pins: MapPin[] };

/*
 * The photo is private; the browser gets a ten-minute signed link, issued per
 * page load and never stored.
 */
export async function loadPropertyMap(db: MissionClient, assets: AssetRow[], plans: PlanRow[]): Promise<PropertyMapData> {
  const { data: map } = await db.from('property_maps').select('image_path,address').maybeSingle();
  let imageUrl: string | null = null;
  if (map?.image_path) {
    const { data } = await db.storage.from('attachments').createSignedUrl(map.image_path as string, 60 * 10);
    imageUrl = data?.signedUrl ?? null;
  }

  const plansOf = (id: string) => plans.filter((p) => p.asset_id === id);
  const pins: MapPin[] = assets.map((a) => {
    const own = plansOf(a.id);
    const inside = assets.filter((c) => c.building_id === a.id);
    // A building is red when its water heater is overdue, not only its roof.
    const all = [...own, ...inside.flatMap((c) => plansOf(c.id))];
    const next = own[0];
    return {
      id: a.id,
      name: a.name,
      x: a.map_x,
      y: a.map_y,
      verdict: all.length ? worst(all.map((p) => p.verdict)) : null,
      next: next ? `${next.task.title.replace(`${a.name}: `, '')} · ${dueLabel(next.days)}` : null,
      schedules: own.length,
      inside: inside.map((c) => ({ id: c.id, name: c.name })),
    };
  });

  return { imageUrl, address: (map?.address as string | null) ?? null, pins };
}

/* What can be chosen as "the building it is in": anything pinned on the map. */
export function buildingOptions(assets: AssetRow[], exceptId?: string) {
  return assets
    .filter((a) => a.map_x !== null && a.id !== exceptId)
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
