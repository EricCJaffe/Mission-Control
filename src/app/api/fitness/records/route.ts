import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch personal records with exercise names
  const { data: records, error } = await supabase
    .from('personal_records')
    .select('id, exercise_id, record_type, value, unit, achieved_date, notes')
    .eq('user_id', user.id)
    .order('achieved_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch exercise names for records that reference exercises
  const exerciseIds = [...new Set((records ?? []).filter(r => r.exercise_id).map(r => r.exercise_id))];
  let exerciseMap: Record<string, string> = {};

  if (exerciseIds.length > 0) {
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id, name')
      .in('id', exerciseIds);
    if (exercises) {
      exerciseMap = Object.fromEntries(exercises.map(e => [e.id, e.name]));
    }
  }

  const enriched = (records ?? []).map(r => ({
    ...r,
    exercise_name: r.exercise_id ? exerciseMap[r.exercise_id] ?? 'Unknown' : null,
  }));

  return NextResponse.json({ ok: true, records: enriched });
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
    .from('personal_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
