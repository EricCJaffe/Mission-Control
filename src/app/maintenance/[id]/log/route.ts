import { supabaseServer } from '@/lib/supabase/server';
import { today } from '@/lib/day';
import { back, date, num, text, withError } from '@/lib/maintenance/form';

/** A repair or one-off entered straight into the service history. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const here = `/maintenance/${id}`;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const form = await req.formData();
  const title = text(form, 'title');
  if (!title) return back(req, withError(here, 'Say what was done.'));

  const { error } = await supabase.from('maintenance_log').insert({
    user_id: user.id,
    asset_id: id,
    title,
    performed_on: date(form, 'performed_on') ?? today(),
    meter_reading: num(form, 'meter_reading'),
    cost: num(form, 'cost'),
    vendor: text(form, 'vendor'),
    notes: text(form, 'notes'),
    source: 'manual',
  });
  if (error) return back(req, withError(here, error.message));
  return back(req, `${here}#history`);
}
