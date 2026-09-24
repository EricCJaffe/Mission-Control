import { supabaseServer } from '@/lib/supabase/server';
import { addSchedule, ensureProject, scheduleFromLibrary, type NewSchedule } from '@/lib/maintenance/service';
import { findItem } from '@/lib/maintenance/library';
import type { Research } from '@/lib/maintenance/research';
import { back, date, num, text, withError } from '@/lib/maintenance/form';

/*
 * Adds a schedule to an asset from one of three places: a library entry
 * (`library_key`), a line of the model research (`research_index`), or the
 * custom form. All three end in the same addSchedule call.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const here = `/maintenance/${id}`;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const { data: asset } = await supabase
    .from('maintenance_assets')
    .select('id,name,research')
    .eq('id', id)
    .maybeSingle();
  if (!asset) return back(req, '/maintenance');

  const form = await req.formData();
  let schedule: NewSchedule | null = null;

  const libraryKey = text(form, 'library_key');
  const researchIndex = num(form, 'research_index');
  if (libraryKey) {
    const item = findItem(libraryKey);
    if (item) schedule = scheduleFromLibrary(item);
  } else if (researchIndex !== null) {
    const item = (asset.research as Research | null)?.items?.[researchIndex];
    if (item) {
      schedule = {
        title: item.title,
        rule: item.rule,
        instructions: item.instructions,
        why: item.why,
        meterInterval: item.meter_interval,
        stagger: 7,
      };
    }
  } else {
    const title = text(form, 'title');
    const rule = text(form, 'recurrence_rule');
    // "Most all tasks are going to be recurring" — a custom item without a
    // repeat is refused rather than quietly made a one-off.
    if (!title || !rule) return back(req, withError(here, 'A title and a repeat are required.'));
    schedule = {
      title,
      rule,
      instructions: text(form, 'instructions'),
      due: date(form, 'due_date'),
      meterInterval: num(form, 'meter_interval'),
    };
  }
  if (!schedule) return back(req, withError(here, 'That item could not be found.'));

  try {
    const projectId = await ensureProject(supabase, user.id);
    await addSchedule(supabase, user.id, asset as { id: string; name: string }, projectId, schedule);
  } catch (e) {
    return back(req, withError(here, (e as Error).message));
  }
  return back(req, here);
}
