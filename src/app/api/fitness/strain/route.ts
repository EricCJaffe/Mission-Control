import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateDailyStrain, calculateWorkoutStrain } from '@/lib/fitness/strain';
import type { StrainInputs } from '@/lib/fitness/types';

/**
 * GET /api/fitness/strain — Calculate today's daily strain
 * POST /api/fitness/strain — Recalculate after a workout is logged
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Check cache
  const { data: existing } = await supabase
    .from('daily_strain')
    .select('*')
    .eq('user_id', user.id)
    .eq('calc_date', today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(existing);
  }

  // No workouts yet today — return baseline
  return NextResponse.json({ strain_score: 0, strain_level: 'light', calc_date: today });
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00`;
  const endOfDay = `${today}T23:59:59`;

  // Get all workouts today
  const { data: todayWorkouts } = await supabase
    .from('workout_logs')
    .select('id, workout_type, duration_minutes, tss, rpe_session, avg_hr, max_hr')
    .eq('user_id', user.id)
    .gte('workout_date', startOfDay)
    .lte('workout_date', endOfDay);

  // Get cardio details for each workout
  const workoutInputs: StrainInputs['workouts'] = [];

  for (const w of todayWorkouts ?? []) {
    const { data: cardio } = await supabase
      .from('cardio_logs')
      .select('time_in_zone1_min, time_in_zone2_min, time_in_zone3_min, time_in_zone4_min, avg_power_watts')
      .eq('workout_log_id', w.id)
      .maybeSingle();

    workoutInputs.push({
      type: w.workout_type as StrainInputs['workouts'][0]['type'],
      duration_min: w.duration_minutes ?? 0,
      avg_hr: w.avg_hr ?? null,
      max_hr: w.max_hr ?? null,
      time_in_zone_min: cardio ? {
        z1: Number(cardio.time_in_zone1_min) || 0,
        z2: Number(cardio.time_in_zone2_min) || 0,
        z3: Number(cardio.time_in_zone3_min) || 0,
        z4: Number(cardio.time_in_zone4_min) || 0,
      } : null,
      avg_power_watts: cardio?.avg_power_watts ?? null,
      tss: w.tss ? Number(w.tss) : null,
      session_rpe: w.rpe_session ? Number(w.rpe_session) : null,
      total_volume_lbs: null,
    });
  }

  // Get Garmin daily stress if available
  const { data: dayMetrics } = await supabase
    .from('body_metrics')
    .select('stress_avg, garmin_data')
    .eq('user_id', user.id)
    .eq('metric_date', today)
    .maybeSingle();

  // Get athlete profile for beta-blocker multiplier
  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('beta_blocker_multiplier, max_hr_ceiling, lactate_threshold_hr')
    .eq('user_id', user.id)
    .maybeSingle();

  const garminData = (dayMetrics?.garmin_data ?? {}) as Record<string, unknown>;

  const inputs: StrainInputs = {
    workouts: workoutInputs,
    all_day_stress_avg: dayMetrics?.stress_avg ?? 30,
    steps: (garminData.steps as number) ?? 5000,
    active_minutes: (garminData.active_minutes as number) ?? 30,
    max_hr: profile?.max_hr_ceiling ?? 155,
    lactate_threshold_hr: profile?.lactate_threshold_hr ?? 140,
    beta_blocker_multiplier: Number(profile?.beta_blocker_multiplier) || 1.15,
  };

  const result = calculateDailyStrain(inputs);

  // Per-workout strain contributions
  const contributions = workoutInputs.map((w, i) => ({
    workout_log_id: todayWorkouts?.[i]?.id,
    strain: calculateWorkoutStrain(w, Number(profile?.beta_blocker_multiplier) || 1.15),
    type: w.type,
    duration: w.duration_min,
  }));

  // Persist
  await supabase.from('daily_strain').upsert({
    user_id: user.id,
    calc_date: today,
    strain_score: result.strain,
    strain_level: result.level,
    workout_strain: result.breakdown.workout_strain,
    daily_life_strain: result.breakdown.daily_life_strain,
    workout_contributions: contributions,
    inputs: inputs as unknown as Record<string, unknown>,
  }, { onConflict: 'user_id,calc_date' });

  // Also update strain_score on individual workout_logs
  for (const c of contributions) {
    if (c.workout_log_id) {
      await supabase.from('workout_logs')
        .update({ strain_score: c.strain })
        .eq('id', c.workout_log_id);
    }
  }

  return NextResponse.json(result);
}
