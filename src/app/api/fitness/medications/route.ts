import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** Normalize medication rows — handles both name/type and medication_name/medication_type schemas */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMed(m: any) {
  return {
    ...m,
    name: m.name || m.medication_name || 'Unknown',
    type: m.type || m.medication_type || 'prescription',
  };
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id);

  const normalized = (medications ?? []).map(normalizeMed);
  normalized.sort((a, b) => {
    if (a.active !== b.active) return (a.active ? -1 : 1);
    return String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());
  });

  return NextResponse.json({ medications: normalized });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, type, dosage, frequency, timing, prescribing_doctor, purpose, known_interactions, start_date } = body;

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type required' }, { status: 400 });
  }

  const row = {
    user_id: user.id,
    name, type,
    dosage: dosage || null, frequency: frequency || null,
    timing: timing || null, prescribing_doctor: prescribing_doctor || null,
    purpose: purpose || null, known_interactions: known_interactions || null,
    start_date: start_date || null, active: true,
  };

  // Try name/type first, fall back to medication_name/medication_type
  let { data, error } = await supabase.from('medications').insert(row).select().single();

  if (error && (error.code === '42703' || error.message?.includes('column'))) {
    const { name: n, type: t, ...rest } = row;
    ({ data, error } = await supabase.from('medications')
      .insert({ ...rest, medication_name: n, medication_type: t })
      .select().single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, medication: normalizeMed(data) });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // If deactivating, set end_date
  if (updates.active === false && !updates.end_date) {
    updates.end_date = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from('medications')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, medication: normalizeMed(data) });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('medications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
