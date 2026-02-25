import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calcTss } from '@/lib/fitness/tss';
import { calcCompliance } from '@/lib/fitness/compliance';
import { classifyBP } from '@/lib/fitness/alerts';
import type { SetLog, CardioLog } from '@/lib/fitness/types';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    planned_workout_id?: string | null;
    template_id?: string | null;
    workout_type: string;
    duration_minutes: number | null;
    rpe_session: number | null;
    notes: string | null;
    sets: SetLog[];
    cardio?: CardioLog | null;
    planned_duration_min?: number | null;
    planned_tss?: number | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sets, cardio, planned_duration_min, planned_tss, ...workoutData } = body;

  // Calculate TSS
  const tss = calcTss({
    workout_type: workoutData.workout_type,
    duration_min: workoutData.duration_minutes ?? 0,
    avg_hr: cardio?.avg_hr,
    normalized_power: cardio?.normalized_power,
    rpe_session: workoutData.rpe_session,
  });

  // Calculate compliance vs plan
  const compliance = calcCompliance({
    planned_duration_min,
    actual_duration_min: workoutData.duration_minutes,
    planned_tss,
    actual_tss: tss,
  });

  // Insert workout log
  const { data: log, error: logError } = await supabase
    .from('workout_logs')
    .insert({
      user_id: user.id,
      planned_workout_id: workoutData.planned_workout_id ?? null,
      template_id: workoutData.template_id ?? null,
      workout_type: workoutData.workout_type,
      duration_minutes: workoutData.duration_minutes,
      rpe_session: workoutData.rpe_session,
      notes: workoutData.notes,
      tss,
      intensity_factor: cardio?.avg_hr ? Math.round((cardio.avg_hr / 140) * 1000) / 1000 : null,
      compliance_pct: compliance.pct,
      compliance_color: compliance.color,
    })
    .select('id')
    .single();

  if (logError || !log) {
    return NextResponse.json({ error: logError?.message ?? 'Failed to save workout' }, { status: 500 });
  }

  // Insert set logs
  const newPRs: string[] = [];
  if (sets && sets.length > 0) {
    const setInserts = sets.map((s) => ({
      workout_log_id: log.id,
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      set_type: s.set_type,
      reps: s.reps,
      weight_lbs: s.weight_lbs,
      rpe: s.rpe,
      rest_seconds: s.rest_seconds,
      superset_group: s.superset_group,
      superset_round: s.superset_round,
      is_pr: false,
      notes: s.notes,
    }));

    await supabase.from('set_logs').insert(setInserts);

    // Detect PRs: check max weight per exercise among working sets
    const workingSets = sets.filter((s) => s.set_type === 'working' && s.exercise_id && s.weight_lbs);
    const exercisePRMap = new Map<string, number>();
    for (const s of workingSets) {
      if (!s.exercise_id || !s.weight_lbs) continue;
      const current = exercisePRMap.get(s.exercise_id) ?? 0;
      if (s.weight_lbs > current) exercisePRMap.set(s.exercise_id, s.weight_lbs);
    }

    for (const [exercise_id, weight] of exercisePRMap) {
      const { data: existing } = await supabase
        .from('personal_records')
        .select('value')
        .eq('user_id', user.id)
        .eq('exercise_id', exercise_id)
        .eq('record_type', 'max_weight')
        .order('value', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existing || weight > existing.value) {
        const { data: ex } = await supabase
          .from('exercises')
          .select('name')
          .eq('id', exercise_id)
          .maybeSingle();

        await supabase.from('personal_records').insert({
          user_id: user.id,
          exercise_id,
          record_type: 'max_weight',
          value: weight,
          unit: 'lbs',
          achieved_date: new Date().toISOString().slice(0, 10),
          workout_log_id: log.id,
        });

        if (ex?.name) newPRs.push(ex.name);
      }
    }
  }

  // Insert cardio log
  if (cardio) {
    await supabase.from('cardio_logs').insert({
      workout_log_id: log.id,
      activity_type: cardio.activity_type,
      avg_hr: cardio.avg_hr,
      max_hr: cardio.max_hr,
      min_hr: cardio.min_hr,
      time_in_zone1_min: cardio.time_in_zone1_min,
      time_in_zone2_min: cardio.time_in_zone2_min,
      time_in_zone3_min: cardio.time_in_zone3_min,
      time_in_zone4_min: cardio.time_in_zone4_min,
      distance_miles: cardio.distance_miles,
      avg_pace_per_mile: cardio.avg_pace_per_mile,
      calories: cardio.calories,
      hr_recovery_1min: cardio.hr_recovery_1min,
      z2_drift_duration_min: cardio.z2_drift_duration_min,
      cardiac_drift_pct: cardio.cardiac_drift_pct,
      avg_power_watts: cardio.avg_power_watts,
      max_power_watts: cardio.max_power_watts,
      normalized_power: cardio.normalized_power,
      weather_data: cardio.weather_data,
    });

    // Check HR ceiling violation
    if (cardio.max_hr && cardio.max_hr > 155) {
      await supabase.from('ai_insights').insert({
        user_id: user.id,
        insight_type: 'alert',
        title: 'HR Ceiling Exceeded',
        content: `Max HR of **${cardio.max_hr} bpm** exceeded the 155 bpm ceiling during today's ${workoutData.workout_type} session. Review your effort levels and zone adherence.`,
        priority: 'critical',
      });
    }
  }

  return NextResponse.json({ ok: true, workout_id: log.id, new_prs: newPRs });
}
