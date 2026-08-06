/**
 * POST /api/fitness/exercises/last-workouts
 * Body: { exercise_ids: string[] }
 *
 * For each exercise, returns the sets from its single most-recent workout (the
 * actual weights, reps, and set count you last did) so the logger can pre-fill a
 * new session from last time — for templates, AI-built, and manual entry alike.
 *
 * User-scoped via RLS on workout_logs (the inner join drops any set whose
 * workout isn't visible to the caller).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type LastSet = {
  set_type: string | null;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  rest_seconds: number | null;
};

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const exerciseIds: string[] = Array.isArray(body.exercise_ids)
    ? body.exercise_ids.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  if (exerciseIds.length === 0) return NextResponse.json({ ok: true, last: {} });

  // Pull recent sets for these exercises, newest workout first. RLS keeps it to
  // the caller's own workouts. Grab enough rows to cover several sessions per
  // exercise so we can isolate each one's most recent workout.
  const { data, error } = await supabase
    .from('set_logs')
    .select('exercise_id, set_number, set_type, reps, weight_lbs, rpe, rest_seconds, workout_log_id, workout_logs!inner(workout_date)')
    .in('exercise_id', exerciseIds)
    .order('workout_logs(workout_date)', { ascending: false })
    // Within a workout, sets must come back in the order they were performed.
    // Without this Postgres returns them arbitrarily, so a pull-up pyramid of
    // 0/15/25/25/25/15/0 pre-filled as 25/15/15/0/25/0/25 — the same numbers
    // in an order that makes no sense as a session.
    .order('set_number', { ascending: true })
    .limit(1000);

  if (error) {
    console.error('[last-workouts] query failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // For each exercise, keep only the sets belonging to its most-recent workout.
  const byExercise: Record<
    string,
    { workout_log_id: string; workout_date: string | null; sets: LastSet[] }
  > = {};

  for (const row of data ?? []) {
    const exId = row.exercise_id as string | null;
    if (!exId) continue;
    const rel = Array.isArray(row.workout_logs) ? row.workout_logs[0] : row.workout_logs;
    const workoutDate = (rel as { workout_date?: string } | null)?.workout_date ?? null;
    const workoutLogId = row.workout_log_id as string;

    const existing = byExercise[exId];
    if (!existing) {
      // First (newest) row for this exercise — that workout is the target.
      byExercise[exId] = { workout_log_id: workoutLogId, workout_date: workoutDate, sets: [] };
    } else if (existing.workout_log_id !== workoutLogId) {
      // Rows are newest-first; once we pass the target workout, ignore the rest.
      continue;
    }
    byExercise[exId].sets.push({
      set_type: row.set_type,
      reps: row.reps,
      weight_lbs: row.weight_lbs,
      rpe: row.rpe ?? null,
      rest_seconds: row.rest_seconds,
    });
  }

  return NextResponse.json({ ok: true, last: byExercise });
}
