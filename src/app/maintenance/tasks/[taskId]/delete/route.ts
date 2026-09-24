import { supabaseServer } from '@/lib/supabase/server';
import { back, text } from '@/lib/maintenance/form';

/** Stops a schedule. The plan row cascades; the history keeps its entries. */
export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return back(req, '/login');

  const form = await req.formData();
  const returnTo = text(form, 'redirect') ?? '/maintenance';

  // Only a maintenance task may be deleted through this route.
  const { data: plan } = await supabase.from('maintenance_plans').select('task_id').eq('task_id', taskId).maybeSingle();
  if (plan) await supabase.from('tasks').delete().eq('id', taskId);
  return back(req, returnTo);
}
