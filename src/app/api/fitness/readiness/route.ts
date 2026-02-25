import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateReadinessScore } from '@/lib/fitness/readiness';
import type { ReadinessInputs } from '@/lib/fitness/types';

/**
 * GET /api/fitness/readiness — Calculate today's composite readiness score
 * Pulls from body_metrics, fitness_form, bp_readings, and optionally weather
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Check if we already calculated today's readiness
  const { data: existing } = await supabase
    .from('daily_readiness')
    .select('*')
    .eq('user_id', user.id)
    .eq('calc_date', today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(existing);
  }

  // Gather inputs from various tables
  const [metricsRes, formRes, bpRes, profileRes, weatherRes, last7MetricsRes] = await Promise.all([
    // Latest body metrics
    supabase
      .from('body_metrics')
      .select('resting_hr, hrv_ms, body_battery, sleep_score, sleep_duration_min, stress_avg, training_readiness')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Latest form (PMC)
    supabase
      .from('fitness_form')
      .select('form_tsb')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Latest BP
    supabase
      .from('bp_readings')
      .select('systolic, diastolic')
      .eq('user_id', user.id)
      .order('reading_date', { ascending: false })
      .limit(7),
    // Athlete profile
    supabase
      .from('athlete_profile')
      .select('rhr_baseline, hrv_baseline, sleep_target_min')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Weather (try, non-critical)
    fetchWeatherSafe(),
    // Last 7 days of metrics for baselines
    supabase
      .from('body_metrics')
      .select('hrv_ms, resting_hr')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(7),
  ]);

  const metrics = metricsRes.data;
  const form = formRes.data;
  const bpReadings = bpRes.data ?? [];
  const profile = profileRes.data;
  const last7 = last7MetricsRes.data ?? [];

  if (!metrics) {
    return NextResponse.json({ error: 'No metrics data available for readiness calculation' }, { status: 404 });
  }

  // Calculate 7-day baselines
  const hrv7dayAvg = last7.reduce((s, m) => s + (m.hrv_ms ?? 0), 0) / Math.max(last7.length, 1);
  const rhr14dayAvg = profile?.rhr_baseline ?? last7.reduce((s, m) => s + (m.resting_hr ?? 0), 0) / Math.max(last7.length, 1);

  // Check if outdoor workout planned today
  const { data: todayPlan } = await supabase
    .from('planned_workouts')
    .select('workout_type')
    .eq('user_id', user.id)
    .eq('scheduled_date', today)
    .maybeSingle();

  const outdoorPlanned = todayPlan?.workout_type === 'cardio';

  const inputs: ReadinessInputs = {
    hrv_status: metrics.hrv_ms ?? hrv7dayAvg,
    hrv_7day_baseline: profile?.hrv_baseline ?? hrv7dayAvg,
    resting_hr: metrics.resting_hr ?? rhr14dayAvg,
    rhr_baseline: rhr14dayAvg,
    sleep_score: metrics.sleep_score ?? 70,
    sleep_duration_min: metrics.sleep_duration_min ?? profile?.sleep_target_min ?? 450,
    sleep_target_min: profile?.sleep_target_min ?? 450,
    body_battery: metrics.body_battery ?? 50,
    stress_avg_overnight: metrics.stress_avg ?? 30,
    training_readiness: metrics.training_readiness ?? 50,
    form_tsb: form?.form_tsb ?? 0,
    latest_bp_systolic: bpReadings[0]?.systolic ?? null,
    latest_bp_diastolic: bpReadings[0]?.diastolic ?? null,
    bp_7day_avg_systolic: bpReadings.length > 0
      ? Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length)
      : 120,
    heat_index_f: weatherRes?.heat_index_f ?? null,
    outdoor_planned: outdoorPlanned,
  };

  const result = calculateReadinessScore(inputs);

  // Persist
  await supabase.from('daily_readiness').upsert({
    user_id: user.id,
    calc_date: today,
    readiness_score: result.score,
    readiness_color: result.color,
    readiness_label: result.label,
    hrv_score: result.factors.find(f => f.name === 'HRV')?.score,
    rhr_score: result.factors.find(f => f.name === 'Resting HR')?.score,
    sleep_score: result.factors.find(f => f.name === 'Sleep')?.score,
    body_battery_score: result.factors.find(f => f.name === 'Body Battery')?.score,
    form_score: result.factors.find(f => f.name === 'Form (TSB)')?.score,
    bp_score: result.factors.find(f => f.name === 'Blood Pressure')?.score,
    weather_score: result.factors.find(f => f.name === 'Weather')?.score,
    inputs: inputs as unknown as Record<string, unknown>,
    recommendation: result.recommendation,
  }, { onConflict: 'user_id,calc_date' });

  return NextResponse.json(result);
}

async function fetchWeatherSafe(): Promise<{ heat_index_f: number } | null> {
  try {
    const { getCurrentWeather } = await import('@/lib/weather');
    const w = await getCurrentWeather();
    return { heat_index_f: w.heat_index_f };
  } catch {
    return null;
  }
}
