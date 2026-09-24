import { supabaseServer } from '@/lib/supabase/server';
import { isCategory } from '@/lib/maintenance/library';
import { back, date, num, text, withError } from '@/lib/maintenance/form';

const STATUSES = new Set(['active', 'stored', 'retired']);

/*
 * Edits the asset. Only fields present in the form are written, so the small
 * "update meter" form and the full details form share this route.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return back(req, '/login');

  const form = await req.formData();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of ['name', 'make', 'model', 'serial_number', 'location', 'parts_notes', 'notes']) {
    if (form.has(key)) patch[key] = text(form, key);
  }
  if (form.has('name') && !patch.name) return back(req, withError(`/maintenance/${id}`, 'The name cannot be empty.'));
  if (form.has('model_year')) patch.model_year = num(form, 'model_year');
  if (form.has('purchased_on')) patch.purchased_on = date(form, 'purchased_on');
  if (form.has('category')) {
    const c = text(form, 'category') ?? '';
    if (isCategory(c)) patch.category = c;
  }
  if (form.has('status')) {
    const s = text(form, 'status') ?? '';
    if (STATUSES.has(s)) patch.status = s;
  }
  if (form.has('meter_unit')) {
    const u = text(form, 'meter_unit');
    patch.meter_unit = u === 'hours' || u === 'miles' ? u : null;
  }
  if (form.has('meter_reading')) {
    patch.meter_reading = num(form, 'meter_reading');
    patch.meter_read_at = new Date().toISOString();
  }
  if (form.has('finance_asset_id')) {
    const f = text(form, 'finance_asset_id');
    patch.finance_asset_id = f && /^[0-9a-f-]{36}$/i.test(f) ? f : null;
  }

  const { error } = await supabase.from('maintenance_assets').update(patch).eq('id', id);
  if (error) return back(req, withError(`/maintenance/${id}`, error.message));
  return back(req, `/maintenance/${id}`);
}
