import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateReadinessCheck } from '@/lib/fitness/ai';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { planned_workout_type, planned_workout_name } = body;

  // Get latest metrics
  const { data: latestMetrics } = await supabase
    .from('body_metrics')
    .select('resting_hr, hrv_ms, body_battery, sleep_score, training_readiness')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get latest form
  const { data: latestForm } = await supabase
    .from('fitness_form')
    .select('form_tsb, form_status')
    .eq('user_id', user.id)
    .order('calc_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Try to get weather (optional)
  let weather = null;
  try {
    const { getCurrentWeather } = await import('@/lib/weather');
    const w = await getCurrentWeather();
    weather = { heat_index_f: w.heat_index_f, conditions: w.conditions };
  } catch {
    // Weather not configured — proceed without it
  }

  const result = await generateReadinessCheck({
    planned_workout_type: planned_workout_type ?? 'strength',
    planned_workout_name: planned_workout_name ?? 'workout',
    metrics: { ...latestMetrics, ...latestForm },
    weather,
  });

  return NextResponse.json(result);
}
