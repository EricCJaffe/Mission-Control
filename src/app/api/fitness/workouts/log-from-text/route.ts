/**
 * POST /api/fitness/workouts/log-from-text
 *
 * Log a completed workout from a natural-language description:
 *   "bench 3x8 at 135, then rows 3x10 @95, felt like a 7"
 *
 * Two-step by design.
 *   { text }                    -> parses and returns a PREVIEW. Writes nothing.
 *   { parsed, confirm: true }   -> writes the confirmed preview. No AI call.
 *
 * The AI step is the only part that can be wrong, so it never writes. The write
 * step is deterministic, which means a confirmed preview produces exactly the
 * rows the user saw, the preview can be hand-corrected without re-parsing (and
 * re-billing), and the same endpoint serves both the UI and a chat-driven path.
 *
 * Saving is refused while any exercise is unresolved, rather than silently
 * dropping it — a workout that quietly loses an exercise is worse than one that
 * asks a question.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  parseWorkoutText,
  buildSetRows,
  isReadyToSave,
  type ParsedWorkout,
  type ExerciseLibraryEntry,
} from '@/lib/fitness/workout-text-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { text?: string; parsed?: ParsedWorkout; confirm?: boolean; workout_date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // ---------- Phase 2: write a confirmed preview (no AI) ----------
  if (body.confirm && body.parsed) {
    const parsed = body.parsed;

    if (!isReadyToSave(parsed)) {
      const unresolved = parsed.exercises.filter(e => !e.exercise_id).map(e => e.raw_name);
      return NextResponse.json(
        {
          ok: false,
          error:
            unresolved.length > 0
              ? `Unmatched exercises: ${unresolved.join(', ')}. Pick a match or create them first.`
              : 'Nothing to save.',
          unresolved,
        },
        { status: 400 }
      );
    }

    const workoutDate = body.workout_date ?? parsed.workout_date ?? new Date().toISOString();

    const { data: workoutLog, error: logError } = await supabase
      .from('workout_logs')
      .insert({
        user_id: user.id,
        workout_date: workoutDate,
        workout_type: parsed.workout_type,
        duration_minutes: parsed.duration_minutes,
        rpe_session: parsed.rpe_session,
        notes: parsed.notes,
      })
      .select()
      .single();

    if (logError || !workoutLog) {
      console.error('[log-from-text] failed to create workout_log:', logError);
      return NextResponse.json(
        { ok: false, error: logError?.message ?? 'Failed to create workout' },
        { status: 500 }
      );
    }

    const rows = buildSetRows(parsed, workoutLog.id);
    if (rows.length > 0) {
      const { error: setsError } = await supabase.from('set_logs').insert(rows);
      if (setsError) {
        // Roll back the parent so a half-written workout cannot linger. The
        // cascade on workout_log_id removes any sets that did land.
        await supabase.from('workout_logs').delete().eq('id', workoutLog.id);
        console.error('[log-from-text] failed to insert set_logs, rolled back:', setsError);
        return NextResponse.json({ ok: false, error: setsError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      workout: workoutLog,
      sets_created: rows.length,
    });
  }

  // ---------- Phase 1: parse to a preview (one AI call, writes nothing) ----------
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  }

  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('id, name, category, muscle_groups')
    .or(`user_id.eq.${user.id},is_template.eq.true`)
    .order('name');

  if (exError) {
    console.error('[log-from-text] failed to load exercise library:', exError);
    return NextResponse.json({ ok: false, error: 'Could not load exercise library' }, { status: 500 });
  }

  const library: ExerciseLibraryEntry[] = (exercises ?? []).map(e => ({
    id: e.id,
    name: e.name,
    category: e.category ?? '',
    muscle_groups: e.muscle_groups ?? [],
  }));

  try {
    const parsed = await parseWorkoutText(text, library);
    return NextResponse.json({
      ok: true,
      saved: false,
      parsed,
      ready_to_save: isReadyToSave(parsed),
    });
  } catch (error) {
    console.error('[log-from-text] parse failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to parse workout' },
      { status: 500 }
    );
  }
}
