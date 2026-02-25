import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('start') || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const endDate = searchParams.get('end') || new Date().toISOString().slice(0, 10);

  const [
    { data: bodyMetrics },
    { data: bpReadings },
    { data: workoutLogs },
    { data: formHistory },
  ] = await Promise.all([
    supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, body_battery, weight_lbs, sleep_score, vo2_max')
      .eq('user_id', user.id)
      .gte('metric_date', startDate)
      .lte('metric_date', endDate)
      .order('metric_date', { ascending: true }),
    supabase
      .from('bp_readings')
      .select('reading_date, systolic, diastolic, pulse, flag_level')
      .eq('user_id', user.id)
      .gte('reading_date', `${startDate}T00:00:00`)
      .lte('reading_date', `${endDate}T23:59:59`)
      .order('reading_date', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes, tss, compliance_color, rpe_session')
      .eq('user_id', user.id)
      .gte('workout_date', `${startDate}T00:00:00`)
      .lte('workout_date', `${endDate}T23:59:59`)
      .order('workout_date', { ascending: true }),
    supabase
      .from('fitness_form')
      .select('calc_date, fitness_ctl, fatigue_atl, form_tsb, form_status, daily_tss')
      .eq('user_id', user.id)
      .gte('calc_date', startDate)
      .lte('calc_date', endDate)
      .order('calc_date', { ascending: true }),
  ]);

  return NextResponse.json({
    bodyMetrics: bodyMetrics ?? [],
    bpReadings: bpReadings ?? [],
    workoutLogs: workoutLogs ?? [],
    formHistory: formHistory ?? [],
  });
}
