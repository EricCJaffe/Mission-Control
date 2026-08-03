import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Logs a coached class as a workout plus its class detail.
 *
 * Writes workout_logs first so the session counts everywhere workouts count —
 * training balance, streaks, the dashboard — then attaches the class-specific
 * fields alongside. If the detail insert fails the workout is still kept:
 * losing the session over an optional field would be the worse outcome.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const discipline =
    typeof body?.discipline === 'string' && body.discipline.trim()
      ? body.discipline.trim()
      : 'Jiu-Jitsu';
  const duration = Number(body?.duration_minutes);
  const workoutDate = typeof body?.workout_date === 'string' ? body.workout_date : null;

  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: 'A duration in minutes is required' }, { status: 400 });
  }

  const rpeRaw = Number(body?.rpe);
  const rpe = Number.isFinite(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10 ? Math.round(rpeRaw) : null;

  const { data: workout, error: workoutError } = await supabase
    .from('workout_logs')
    .insert({
      user_id: user.id,
      workout_type: discipline,
      workout_date: workoutDate ? new Date(workoutDate).toISOString() : new Date().toISOString(),
      duration_minutes: Math.round(duration),
      rpe_session: rpe,
      notes: typeof body?.notes === 'string' ? body.notes.trim() || null : null,
      source: 'manual',
    })
    .select('id')
    .single();

  if (workoutError || !workout) {
    return NextResponse.json(
      { error: workoutError?.message ?? 'Could not save the workout' },
      { status: 500 }
    );
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const roundsRaw = Number(body?.rounds);

  const { error: classError } = await supabase.from('class_sessions').insert({
    user_id: user.id,
    workout_log_id: workout.id,
    discipline,
    instructor: str(body?.instructor),
    school: str(body?.school),
    focus: str(body?.focus),
    session_type: str(body?.session_type),
    rounds: Number.isFinite(roundsRaw) && roundsRaw >= 0 ? Math.round(roundsRaw) : null,
    notes: str(body?.notes),
  });

  if (classError) {
    console.error('[class-session] detail insert failed:', classError.message);
  }

  return NextResponse.json({ ok: true, workout_log_id: workout.id, detail_saved: !classError });
}
