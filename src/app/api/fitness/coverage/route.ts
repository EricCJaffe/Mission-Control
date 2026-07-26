/**
 * GET /api/fitness/coverage?months=6
 *
 * Movement-coverage report: which training attributes are well-covered and
 * which have gone stale over a months-to-years window.
 *
 * Pure computation — no OpenAI call — so it is free to load on page mount,
 * unlike the AI surfaces that were made explicit earlier. It only reads the
 * user's own history and the exercise library.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  computeCoverage,
  sortByUrgency,
  type CoverageSet,
  type CoverageCardio,
  type ExerciseMeta,
} from '@/lib/fitness/coverage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const monthsParam = Number(req.nextUrl.searchParams.get('months'));
  const windowMonths = Number.isFinite(monthsParam) && monthsParam >= 1 && monthsParam <= 60
    ? Math.round(monthsParam)
    : 6;

  const referenceDate = new Date().toISOString().slice(0, 10);
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const windowStartISO = windowStart.toISOString();

  // Resistance sets joined to their workout date, scoped to this user.
  const { data: setRows, error: setErr } = await supabase
    .from('set_logs')
    .select('exercise_id, reps, set_type, workout_logs!inner(user_id, workout_date)')
    .eq('workout_logs.user_id', user.id)
    .gte('workout_logs.workout_date', windowStartISO);

  // Cardio sessions with zone breakdown.
  const { data: cardioRows, error: cardioErr } = await supabase
    .from('cardio_logs')
    .select(
      'time_in_zone1_min, time_in_zone2_min, time_in_zone3_min, time_in_zone4_min, workout_logs!inner(user_id, workout_date, duration_minutes)'
    )
    .eq('workout_logs.user_id', user.id)
    .gte('workout_logs.workout_date', windowStartISO);

  // Exercise metadata: user's own + the shared template library.
  const { data: exerciseRows, error: exErr } = await supabase
    .from('exercises')
    .select('id, category, velocity_intent, movement_planes, is_unilateral, trains_balance, trains_mobility')
    .or(`user_id.eq.${user.id},is_template.eq.true`);

  if (setErr || cardioErr || exErr) {
    console.error('[coverage] query failed:', setErr ?? cardioErr ?? exErr);
    return NextResponse.json({ ok: false, error: 'Failed to load training history' }, { status: 500 });
  }

  // Supabase types the joined relation as object-or-array depending on shape;
  // normalise defensively.
  const workoutDateOf = (row: { workout_logs?: unknown }): { date: string; duration: number | null } | null => {
    const rel = Array.isArray(row.workout_logs) ? row.workout_logs[0] : row.workout_logs;
    if (!rel || typeof rel !== 'object') return null;
    const r = rel as { workout_date?: string; duration_minutes?: number | null };
    return r.workout_date ? { date: r.workout_date, duration: r.duration_minutes ?? null } : null;
  };

  const sets: CoverageSet[] = (setRows ?? [])
    .map((row): CoverageSet | null => {
      const wd = workoutDateOf(row);
      if (!wd) return null;
      return {
        exercise_id: row.exercise_id,
        date: wd.date,
        reps: row.reps,
        set_type: row.set_type,
      };
    })
    .filter((s): s is CoverageSet => s !== null);

  const cardio: CoverageCardio[] = (cardioRows ?? [])
    .map((row): CoverageCardio | null => {
      const wd = workoutDateOf(row);
      if (!wd) return null;
      return {
        date: wd.date,
        zone1_min: row.time_in_zone1_min,
        zone2_min: row.time_in_zone2_min,
        zone3_min: row.time_in_zone3_min,
        zone4_min: row.time_in_zone4_min,
        duration_min: wd.duration,
      };
    })
    .filter((c): c is CoverageCardio => c !== null);

  const exercises: ExerciseMeta[] = (exerciseRows ?? []).map(e => ({
    id: e.id,
    category: e.category,
    velocity_intent: e.velocity_intent,
    movement_planes: e.movement_planes,
    is_unilateral: e.is_unilateral,
    trains_balance: e.trains_balance,
    trains_mobility: e.trains_mobility,
  }));

  const report = computeCoverage({ sets, cardio, exercises, referenceDate, windowMonths });

  return NextResponse.json({
    ok: true,
    report: { ...report, attributes: sortByUrgency(report.attributes) },
  });
}
