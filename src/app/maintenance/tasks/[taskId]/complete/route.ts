import { supabaseServer } from '@/lib/supabase/server';
import { today } from '@/lib/day';
import { completionPatch, type CompletableTask } from '@/lib/tasks/complete';
import { back, date, num, text, withError } from '@/lib/maintenance/form';

/*
 * Done, with the details a service history wants.
 *
 * Order matters. The meter is written to the asset FIRST, because the
 * completion trigger copies the asset's current meter into the log and into
 * the plan's `last_meter` — do it the other way round and the next "due in 50
 * hours" counts from the previous reading. Then the task is rolled forward
 * (the trigger writes the log row), then that row gets the notes and cost.
 */
export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const form = await req.formData();
  const returnTo = text(form, 'redirect') ?? '/maintenance';

  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select('asset_id')
    .eq('task_id', taskId)
    .maybeSingle();
  if (!plan) return back(req, withError(returnTo, 'That schedule no longer exists.'));

  const meter = num(form, 'meter_reading');
  if (meter !== null) {
    await supabase
      .from('maintenance_assets')
      .update({ meter_reading: meter, meter_read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', plan.asset_id);
  }

  const { data: current } = await supabase
    .from('tasks')
    .select('recurrence_rule, recurrence_anchor, due_date, recurrence_count')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('tasks')
    .update({
      ...completionPatch(current as CompletableTask | null, today()),
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) return back(req, withError(returnTo, error.message));

  const details = {
    notes: text(form, 'notes'),
    cost: num(form, 'cost'),
    vendor: text(form, 'vendor'),
    performed_on: date(form, 'performed_on'),
  };
  if (Object.values(details).some((v) => v !== null)) {
    const { data: row } = await supabase
      .from('maintenance_log')
      .select('id')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      const patch = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== null));
      await supabase.from('maintenance_log').update(patch).eq('id', row.id);
    }
  }

  return back(req, returnTo);
}
