import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calcTss } from '@/lib/fitness/tss';
import { calcCompliance } from '@/lib/fitness/compliance';
import { classifyBP } from '@/lib/fitness/alerts';
import { calculateCardiacEfficiency, cardiacCost } from '@/lib/fitness/cardiac-efficiency';
import { bestEstimated1RM } from '@/lib/fitness/estimated1rm';
import { predictRecovery } from '@/lib/fitness/recovery';
import { calculateWorkoutStrain } from '@/lib/fitness/strain';
import type { SetLog, CardioLog } from '@/lib/fitness/types';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    planned_workout_id?: string | null;
    template_id?: string | null;
    garmin_activity_id?: string | null;
    workout_type: string;
    duration_minutes: number | null;
    rpe_session: number | null;
    avg_hr?: number | null;
    max_hr?: number | null;
    notes: string | null;
    sets: SetLog[];
    cardio?: CardioLog | null;
    planned_duration_min?: number | null;
    planned_tss?: number | null;
    source?: string;
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

  // Calculate workout strain
  const strainScore = calculateWorkoutStrain({
    type: workoutData.workout_type as 'strength' | 'cardio' | 'hiit' | 'hybrid',
    duration_min: workoutData.duration_minutes ?? 0,
    avg_hr: cardio?.avg_hr ?? workoutData.avg_hr ?? null,
    max_hr: cardio?.max_hr ?? workoutData.max_hr ?? null,
    time_in_zone_min: cardio ? {
      z1: Number(cardio.time_in_zone1_min) || 0,
      z2: Number(cardio.time_in_zone2_min) || 0,
      z3: Number(cardio.time_in_zone3_min) || 0,
      z4: Number(cardio.time_in_zone4_min) || 0,
    } : null,
    avg_power_watts: cardio?.avg_power_watts ?? null,
    tss,
    session_rpe: workoutData.rpe_session,
    total_volume_lbs: null,
  });

  // Insert workout log (now includes HR, source, strain)
  const { data: log, error: logError } = await supabase
    .from('workout_logs')
    .insert({
      user_id: user.id,
      planned_workout_id: workoutData.planned_workout_id ?? null,
      template_id: workoutData.template_id ?? null,
      garmin_activity_id: workoutData.garmin_activity_id ?? null,
      workout_type: workoutData.workout_type,
      duration_minutes: workoutData.duration_minutes,
      rpe_session: workoutData.rpe_session,
      notes: workoutData.notes,
      tss,
      intensity_factor: cardio?.avg_hr ? Math.round((cardio.avg_hr / 140) * 1000) / 1000 : null,
      compliance_pct: compliance.pct,
      compliance_color: compliance.color,
      avg_hr: workoutData.avg_hr ?? null,
      max_hr: workoutData.max_hr ?? null,
      source: workoutData.source ?? 'manual',
      strain_score: strainScore,
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
      completed: (s as any).completed ?? true, // Default to true for backward compatibility
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

  // Estimated 1RM detection for strength exercises
  const estimated1rms: { exercise_name: string; e1rm: number }[] = [];
  if (sets && sets.length > 0) {
    // Group sets by exercise for 1RM calculation
    const exerciseSets = new Map<string, { reps: number | null; weight_lbs: number | null; set_type: string }[]>();
    for (const s of sets) {
      if (!s.exercise_id) continue;
      const group = exerciseSets.get(s.exercise_id) ?? [];
      group.push({ reps: s.reps, weight_lbs: s.weight_lbs, set_type: s.set_type });
      exerciseSets.set(s.exercise_id, group);
    }

    for (const [exerciseId, exerciseSetsArr] of exerciseSets) {
      const best = bestEstimated1RM(exerciseSetsArr);
      if (best) {
        // Check if this is a new estimated 1RM PR
        const { data: existingE1rm } = await supabase
          .from('personal_records')
          .select('value')
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)
          .eq('record_type', 'estimated_1rm')
          .order('value', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingE1rm || best.e1rm > existingE1rm.value) {
          const { data: ex } = await supabase
            .from('exercises')
            .select('name')
            .eq('id', exerciseId)
            .maybeSingle();

          await supabase.from('personal_records').insert({
            user_id: user.id,
            exercise_id: exerciseId,
            record_type: 'estimated_1rm',
            value: best.e1rm,
            unit: 'lbs',
            achieved_date: new Date().toISOString().slice(0, 10),
            workout_log_id: log.id,
            notes: `Based on ${best.based_on_weight}lbs × ${best.based_on_reps} reps`,
          });

          if (ex?.name) estimated1rms.push({ exercise_name: ex.name, e1rm: best.e1rm });
        }
      }
    }
  }

  // Insert cardio log with cardiac efficiency
  let cardiacEfficiencyValue: number | null = null;
  if (cardio) {
    // Calculate cardiac efficiency
    const efficiency = calculateCardiacEfficiency({
      activity_type: cardio.activity_type,
      avg_hr: cardio.avg_hr,
      avg_pace_per_mile: cardio.avg_pace_per_mile,
      avg_power_watts: cardio.avg_power_watts,
      duration_min: workoutData.duration_minutes ?? 0,
    });
    cardiacEfficiencyValue = efficiency.efficiency;

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
      hr_recovery_2min: cardio.hr_recovery_2min,
      z2_drift_duration_min: cardio.z2_drift_duration_min,
      cardiac_drift_pct: cardio.cardiac_drift_pct,
      avg_power_watts: cardio.avg_power_watts,
      max_power_watts: cardio.max_power_watts,
      normalized_power: cardio.normalized_power,
      cardiac_efficiency: efficiency.efficiency,
      cardiac_cost: efficiency.cost,
      efficiency_type: efficiency.type,
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

    // Check for cardiac efficiency PR (best watts/bpm or speed/bpm)
    if (efficiency.efficiency && efficiency.type) {
      const prType = efficiency.type === 'cycling' ? 'best_pace' : 'best_pace'; // reuse type
      const { data: existingEfficiency } = await supabase
        .from('personal_records')
        .select('value')
        .eq('user_id', user.id)
        .eq('record_type', prType)
        .is('exercise_id', null)
        .order('value', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Higher efficiency is better
      if (!existingEfficiency || efficiency.efficiency > existingEfficiency.value) {
        await supabase.from('personal_records').insert({
          user_id: user.id,
          exercise_id: null,
          record_type: prType,
          value: efficiency.efficiency,
          unit: efficiency.type === 'cycling' ? 'W/bpm' : '(m/min)/bpm',
          achieved_date: new Date().toISOString().slice(0, 10),
          workout_log_id: log.id,
          notes: `Cardiac efficiency: ${efficiency.efficiency} ${efficiency.type === 'cycling' ? 'W/bpm' : '(m/min)/bpm'}`,
        });
      }
    }
  }

  // Mark planned workout as completed if linked
  if (workoutData.planned_workout_id) {
    await supabase.from('planned_workouts')
      .update({ status: 'completed' })
      .eq('id', workoutData.planned_workout_id);
  }

  // Trigger strain recalculation (fire and forget)
  fetch(new URL('/api/fitness/strain', req.url).toString(), {
    method: 'POST',
    headers: { cookie: req.headers.get('cookie') ?? '' },
  }).catch(() => { /* non-critical */ });

  // Trigger health.md update for workout patterns (non-blocking)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '') || 'http://localhost:3001';
    await fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        trigger: 'workout_logged',
        trigger_data: {
          workout_id: log.id,
          workout_type: workoutData.workout_type,
          duration_min: workoutData.duration_minutes,
          tss,
          strain_score: strainScore,
          avg_hr: cardio?.avg_hr ?? workoutData.avg_hr,
          max_hr: cardio?.max_hr ?? workoutData.max_hr,
          rpe_session: workoutData.rpe_session,
          compliance_pct: compliance.pct,
        },
      }),
    });
    console.log(`Triggered health.md update check for workout ${log.id}`);
  } catch (err) {
    console.error('Failed to trigger health.md update (non-critical):', err);
  }

  // Recovery prediction
  let recovery = null;
  if (strainScore > 0) {
    const { data: readinessData } = await supabase
      .from('daily_readiness')
      .select('readiness_score')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    recovery = predictRecovery({
      session_strain: strainScore,
      current_readiness: readinessData?.readiness_score ?? 60,
    });
  }

  // Create calendar event for this workout
  const workoutDate = new Date().toISOString().slice(0, 10);
  const eventTitle = `${workoutData.workout_type.charAt(0).toUpperCase() + workoutData.workout_type.slice(1)} Workout`;
  const eventNotes = `View workout details: /fitness/history/${log.id}`;

  await supabase.from('calendar_events').upsert({
    user_id: user.id,
    title: eventTitle,
    start_at: workoutDate,
    end_at: workoutDate,
    event_type: 'workout',
    domain: 'fitness',
    notes: eventNotes,
    alignment_tag: `workout:${log.id}`,
  }, {
    onConflict: 'user_id,alignment_tag',
  });

  return NextResponse.json({
    ok: true,
    workout_id: log.id,
    new_prs: newPRs,
    estimated_1rms: estimated1rms,
    strain_score: strainScore,
    cardiac_efficiency: cardiacEfficiencyValue,
    recovery: recovery ? {
      estimated_hours: recovery.estimated_recovery_hours,
      ready_by: recovery.ready_by.toISOString(),
      message: recovery.message,
    } : null,
  });
}
