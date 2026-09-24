import { supabaseServer } from '@/lib/supabase/server';
import { back, withError } from '@/lib/maintenance/form';

/*
 * Deletes an asset, its schedules (the tasks) and its history. The tasks go
 * first and explicitly: the plan rows cascade from the asset, but the tasks do
 * not, and orphaned "Tractor: grease fittings" tasks would keep nagging about
 * a tractor that is gone. To keep the history, mark it Retired instead.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return back(req, '/login');

  const form = await req.formData();
  if (form.get('confirm') !== 'delete') {
    return back(req, withError(`/maintenance/${id}`, 'Type "delete" to confirm.'));
  }

  const { data: plans } = await supabase.from('maintenance_plans').select('task_id').eq('asset_id', id);
  const taskIds = (plans ?? []).map((p) => p.task_id as string);
  if (taskIds.length) await supabase.from('tasks').delete().in('id', taskIds);

  const { error } = await supabase.from('maintenance_assets').delete().eq('id', id);
  if (error) return back(req, withError(`/maintenance/${id}`, error.message));
  return back(req, '/maintenance');
}
