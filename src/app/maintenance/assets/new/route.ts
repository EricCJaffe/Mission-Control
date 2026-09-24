import { supabaseServer } from '@/lib/supabase/server';
import { createAsset } from '@/lib/maintenance/service';
import { isCategory } from '@/lib/maintenance/library';
import { back, date, num, text, withError } from '@/lib/maintenance/form';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const form = await req.formData();
  const name = text(form, 'name');
  const category = text(form, 'category') ?? '';
  if (!name || !isCategory(category)) return back(req, withError('/maintenance', 'A name and a type are required.'));

  const meter = num(form, 'meter_reading');
  try {
    const id = await createAsset(
      supabase,
      user.id,
      {
        name,
        category,
        make: text(form, 'make'),
        model: text(form, 'model'),
        model_year: num(form, 'model_year'),
        location: text(form, 'location'),
        purchased_on: date(form, 'purchased_on'),
        meter_reading: meter,
        meter_read_at: meter !== null ? new Date().toISOString() : null,
      },
      // The checkbox is on by default; an unticked box posts nothing.
      { seedSchedules: form.get('seed') === 'on' },
    );
    return back(req, `/maintenance/${id}`);
  } catch (e) {
    return back(req, withError('/maintenance', (e as Error).message));
  }
}
