import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateWorkoutSummary } from '@/lib/fitness/ai';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { workout_id } = body;

  if (!workout_id) return NextResponse.json({ error: 'workout_id required' }, { status: 400 });

  // Fetch workout log
  const { data: log } = await supabase
    .from('workout_logs')
    .select('workout_type, duration_minutes, rpe_session, tss, compliance_pct, notes')
    .eq('id', workout_id)
    .eq('user_id', user.id)
    .single();

  if (!log) return NextResponse.json({ error: 'Workout not found' }, { status: 404 });

  // Fetch cardio data if exists
  const { data: cardio } = await supabase
    .from('cardio_logs')
    .select('avg_hr, max_hr, time_in_zone2_min, z2_drift_duration_min')
    .eq('workout_log_id', workout_id)
    .maybeSingle();

  // Count sets and PRs
  const { count: setCount } = await supabase
    .from('set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('workout_log_id', workout_id);

  const { count: prCount } = await supabase
    .from('personal_records')
    .select('id', { count: 'exact', head: true })
    .eq('workout_log_id', workout_id);

  const summary = await generateWorkoutSummary({
    workout_type: log.workout_type,
    duration_minutes: log.duration_minutes,
    rpe_session: log.rpe_session,
    tss: log.tss,
    compliance_pct: log.compliance_pct,
    cardio: cardio ?? undefined,
    set_count: setCount ?? 0,
    pr_count: prCount ?? 0,
    notes: log.notes,
  });

  // Save the summary back to the workout log
  await supabase
    .from('workout_logs')
    .update({ ai_summary: summary })
    .eq('id', workout_id);

  return NextResponse.json({ summary });
}
