import { supabaseServer } from '@/lib/supabase/server';
import { researchAsset } from '@/lib/maintenance/research';
import { isCategory } from '@/lib/maintenance/library';
import { back, withError } from '@/lib/maintenance/form';

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const here = `/maintenance/${id}`;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return back(req, '/login');

  const { data: asset } = await supabase
    .from('maintenance_assets')
    .select('name,category,make,model,model_year,meter_unit,location')
    .eq('id', id)
    .maybeSingle();
  if (!asset || !isCategory(asset.category)) return back(req, '/maintenance');
  if (!asset.make && !asset.model) {
    return back(req, withError(here, 'Add the make and model first — without them this is just the generic list again.'));
  }

  try {
    const research = await researchAsset({ ...asset, category: asset.category });
    const { error } = await supabase
      .from('maintenance_assets')
      .update({ research, researched_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return back(req, withError(here, `Research failed: ${(e as Error).message}`));
  }
  return back(req, `${here}#research`);
}
