import { supabaseServer } from '@/lib/supabase/server';
import { createAsset } from '@/lib/maintenance/service';
import { STARTER } from '@/lib/maintenance/library';
import { back, withError } from '@/lib/maintenance/form';

/*
 * One of each thing Eric named, with the library defaults scheduled. Refuses
 * when anything is already in the inventory: pressing it twice must not make
 * two tractors.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const { count } = await supabase
    .from('maintenance_assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) > 0) return back(req, '/maintenance');

  try {
    let stagger = 0;
    for (const item of STARTER) {
      await createAsset(supabase, user.id, item, { staggerStart: stagger });
      stagger += 2;
    }
  } catch (e) {
    return back(req, withError('/maintenance', (e as Error).message));
  }
  return back(req, '/maintenance');
}
