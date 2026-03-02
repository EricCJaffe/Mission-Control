import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * POST /api/fitness/records/recalculate
 *
 * Derives personal records from all set_logs for the authenticated user.
 * Computes per-exercise: max_weight, max_reps, estimated_1rm, max_volume.
 * Replaces all existing strength PR rows (max_weight / max_reps / max_volume / estimated_1rm).
 */

interface SetRow {
  id: string;
  workout_log_id: string;
  exercise_id: string | null;
  set_number: number;
  weight_lbs: number | null;
  reps: number | null;
  workout_logs: {
    workout_date: string;
  } | null;
}

const STRENGTH_PR_TYPES = ['max_weight', 'max_reps', 'max_volume', 'estimated_1rm'] as const;

export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  // ── Load all set_logs with workout date ────────────────────────────────
  const { data: sets, error: setsError } = await supabase
    .from('set_logs')
    .select('id, workout_log_id, exercise_id, set_number, weight_lbs, reps, workout_logs(workout_date)')
    .not('exercise_id', 'is', null)
    .not('weight_lbs', 'is', null)
    .gt('weight_lbs', 0)
    .order('workout_log_id');

  if (setsError) {
    return NextResponse.json({ error: 'Failed to load set logs' }, { status: 500 });
  }

  // Filter to sets that belong to this user's workouts
  const myWorkoutIds = await (async () => {
    const { data } = await supabase
      .from('workout_logs')
      .select('id')
      .eq('user_id', userId);
    return new Set((data ?? []).map(w => w.id));
  })();

  const mySets = ((sets as unknown as SetRow[]) ?? []).filter(
    s => s.workout_log_id && myWorkoutIds.has(s.workout_log_id)
  );

  if (mySets.length === 0) {
    return NextResponse.json({
      success: true,
      summary: { records_created: 0, exercises_analyzed: 0 },
    });
  }

  // ── Group sets by exercise ─────────────────────────────────────────────
  const byExercise = new Map<
    string,
    Array<{ workoutLogId: string; date: string; weight: number; reps: number }>
  >();

  for (const s of mySets) {
    if (!s.exercise_id) continue;
    const weight = s.weight_lbs ?? 0;
    const reps = s.reps ?? 0;
    if (weight <= 0) continue;

    const date =
      (s.workout_logs as { workout_date: string } | null)?.workout_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10);

    if (!byExercise.has(s.exercise_id)) byExercise.set(s.exercise_id, []);
    byExercise.get(s.exercise_id)!.push({
      workoutLogId: s.workout_log_id,
      date,
      weight,
      reps,
    });
  }

  // ── Compute PRs per exercise ───────────────────────────────────────────
  const prRows: Array<{
    user_id: string;
    exercise_id: string;
    workout_log_id: string;
    record_type: string;
    value: number;
    unit: string;
    achieved_date: string;
  }> = [];

  for (const [exerciseId, entries] of byExercise.entries()) {
    // max_weight — heaviest single set weight
    const maxWeightEntry = entries.reduce((best, e) =>
      e.weight > best.weight ? e : best
    );
    prRows.push({
      user_id: userId,
      exercise_id: exerciseId,
      workout_log_id: maxWeightEntry.workoutLogId,
      record_type: 'max_weight',
      value: maxWeightEntry.weight,
      unit: 'lbs',
      achieved_date: maxWeightEntry.date,
    });

    // max_reps — most reps in a single set (any weight)
    const withReps = entries.filter(e => e.reps > 0);
    if (withReps.length > 0) {
      const maxRepsEntry = withReps.reduce((best, e) =>
        e.reps > best.reps ? e : best
      );
      prRows.push({
        user_id: userId,
        exercise_id: exerciseId,
        workout_log_id: maxRepsEntry.workoutLogId,
        record_type: 'max_reps',
        value: maxRepsEntry.reps,
        unit: 'reps',
        achieved_date: maxRepsEntry.date,
      });
    }

    // estimated_1rm — Epley formula: weight × (1 + reps / 30)
    // Meaningful when reps are ≥ 1 (Epley degrades past ~10-12 reps but still useful)
    const oneRmEntry = entries
      .filter(e => e.reps >= 1)
      .map(e => ({ ...e, orm: e.weight * (1 + e.reps / 30) }))
      .reduce((best, e) => (e.orm > best.orm ? e : best), {
        ...entries[0],
        orm: 0,
      });
    if (oneRmEntry.orm > 0) {
      prRows.push({
        user_id: userId,
        exercise_id: exerciseId,
        workout_log_id: oneRmEntry.workoutLogId,
        record_type: 'estimated_1rm',
        value: Math.round(oneRmEntry.orm * 10) / 10,
        unit: 'lbs',
        achieved_date: oneRmEntry.date,
      });
    }

    // max_volume — heaviest total session volume (sum of weight × reps per workout)
    const volumeByWorkout = new Map<string, { volume: number; date: string }>();
    for (const e of entries) {
      const vol = e.weight * (e.reps || 0);
      if (vol <= 0) continue;
      const existing = volumeByWorkout.get(e.workoutLogId);
      if (!existing) {
        volumeByWorkout.set(e.workoutLogId, { volume: vol, date: e.date });
      } else {
        existing.volume += vol;
      }
    }
    if (volumeByWorkout.size > 0) {
      const [bestLogId, bestVol] = [...volumeByWorkout.entries()].reduce(
        (best, [id, v]) => (v.volume > best[1].volume ? [id, v] : best)
      );
      prRows.push({
        user_id: userId,
        exercise_id: exerciseId,
        workout_log_id: bestLogId,
        record_type: 'max_volume',
        value: Math.round(bestVol.volume),
        unit: 'lbs',
        achieved_date: bestVol.date,
      });
    }
  }

  // ── Delete existing strength PRs and re-insert ─────────────────────────
  await supabase
    .from('personal_records')
    .delete()
    .eq('user_id', userId)
    .in('record_type', STRENGTH_PR_TYPES);

  if (prRows.length > 0) {
    const { error: insertError } = await supabase
      .from('personal_records')
      .insert(prRows);

    if (insertError) {
      console.error('PR insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save PRs' }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      records_created: prRows.length,
      exercises_analyzed: byExercise.size,
    },
  });
}
