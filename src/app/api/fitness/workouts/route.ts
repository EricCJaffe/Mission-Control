import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Get single workout with sets and cardio
    const { data: workout } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!workout) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: sets } = await supabase
      .from('set_logs')
      .select('*, exercises:exercise_id(name, category)')
      .eq('workout_log_id', id)
      .order('set_number', { ascending: true });

    const { data: cardio } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('workout_log_id', id)
      .maybeSingle();

    return NextResponse.json({ workout: { ...workout, sets: sets ?? [], cardio } });
  }

  // List recent workouts
  const limit = parseInt(searchParams.get('limit') || '30');
  const { data: workouts } = await supabase
    .from('workout_logs')
    .select('id, workout_date, workout_type, duration_minutes, tss, compliance_pct, compliance_color, rpe_session, notes, ai_summary, source, strain_score, avg_hr, max_hr')
    .eq('user_id', user.id)
    .order('workout_date', { ascending: false })
    .limit(limit);

  return NextResponse.json({ workouts: workouts ?? [] });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Delete related records first (cascade may handle this, but be explicit)
  await supabase.from('set_logs').delete().eq('workout_log_id', id);
  await supabase.from('cardio_logs').delete().eq('workout_log_id', id);

  const { error } = await supabase
    .from('workout_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
