import { supabaseServer } from '@/lib/supabase/server';
import { back, num, text, withError } from '@/lib/maintenance/form';

const MAP = '/maintenance/map';

/*
 * Places, moves or unpins one building.
 *
 *   asset_id + x + y   pin (or move) an existing item
 *   name + x + y       a new building: created as an "Other" item at that spot,
 *                      with no schedules yet; add them on its own page
 *   asset_id + clear   take it off the map; the item and its history stay
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return back(req, '/login');

  const form = await req.formData();
  const assetId = text(form, 'asset_id');
  const name = text(form, 'name');
  const now = new Date().toISOString();

  if (assetId && form.get('clear')) {
    const { error } = await supabase.from('maintenance_assets').update({ map_x: null, map_y: null, updated_at: now }).eq('id', assetId);
    return back(req, error ? withError(MAP, error.message) : MAP);
  }

  const x = num(form, 'x');
  const y = num(form, 'y');
  if (x === null || y === null || x < 0 || x > 100 || y < 0 || y > 100) {
    return back(req, withError(MAP, 'Tap a spot on the photo first.'));
  }

  // A typed name wins over the dropdown: typing is the deliberate act.
  if (name) {
    const { data: map } = await supabase.from('property_maps').select('address').maybeSingle();
    const { error } = await supabase.from('maintenance_assets').insert({
      user_id: userData.user.id,
      name,
      category: 'other',
      location: (map?.address as string | null) ?? null,
      status: 'active',
      map_x: x,
      map_y: y,
    });
    return back(req, error ? withError(MAP, error.message) : MAP);
  }

  if (!assetId) return back(req, withError(MAP, 'Type a name, or pick an item from the list.'));
  const { error } = await supabase.from('maintenance_assets').update({ map_x: x, map_y: y, updated_at: now }).eq('id', assetId);
  return back(req, error ? withError(MAP, error.message) : MAP);
}
