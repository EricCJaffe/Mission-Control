import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calcTss } from '@/lib/fitness/tss';
import { calculateWorkoutStrain } from '@/lib/fitness/strain';
import { calculateCardiacEfficiency } from '@/lib/fitness/cardiac-efficiency';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Get single workout with sets and cardio
    const { data: workout } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!workout) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: sets } = await supabase
      .from('set_logs')
      .select('*, exercises:exercise_id(name, category)')
      .eq('workout_log_id', id)
      .order('set_number', { ascending: true });

    const { data: cardio } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('workout_log_id', id)
      .maybeSingle();

    return NextResponse.json({ workout: { ...workout, sets: sets ?? [], cardio } });
  }

  // List recent workouts
  const limit = parseInt(searchParams.get('limit') || '30');
  const { data: workouts } = await supabase
    .from('workout_logs')
    .select('id, workout_date, workout_type, duration_minutes, tss, compliance_pct, compliance_color, rpe_session, notes, ai_summary, source, strain_score, avg_hr, max_hr')
    .eq('user_id', user.id)
    .order('workout_date', { ascending: false })
    .limit(limit);

  return NextResponse.json({ workouts: workouts ?? [] });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Delete related records first (cascade may handle this, but be explicit)
  await supabase.from('set_logs').delete().eq('workout_log_id', id);
  await supabase.from('cardio_logs').delete().eq('workout_log_id', id);

  const { error } = await supabase
    .from('workout_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Correct a manually logged session after the fact.
 *
 * This deliberately lives beside the existing workout CRUD rather than
 * reusing the create route: edits must never create a second session or
 * re-run calendar/health side effects. Sets are replaced as one owned child
 * collection, which keeps the editor simple and makes a paper log easy to
 * repair without leaving orphaned rows.
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    id?: string;
    workout_date?: string;
    duration_minutes?: number | null;
    rpe_session?: number | null;
    notes?: string | null;
    avg_hr?: number | null;
    max_hr?: number | null;
    sets?: Array<{
      exercise_id: string | null;
      set_number: number;
      set_type: string;
      reps: number | null;
      weight_lbs: number | null;
      rpe: number | null;
      rest_seconds?: number | null;
      superset_group?: string | null;
      superset_round?: number | null;
      notes?: string | null;
      completed?: boolean;
    }>;
    cardio?: {
      activity_type?: string | null;
      avg_hr?: number | null;
      max_hr?: number | null;
      min_hr?: number | null;
      distance_miles?: number | null;
      avg_pace_per_mile?: string | null;
      calories?: number | null;
      time_in_zone1_min?: number | null;
      time_in_zone2_min?: number | null;
      time_in_zone3_min?: number | null;
      time_in_zone4_min?: number | null;
      hr_recovery_1min?: number | null;
      hr_recovery_2min?: number | null;
    } | null;
  } | null;

  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing, error: existingError } = await supabase
    .from('workout_logs')
    .select('id, user_id, workout_type, workout_date')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
  }

  const duration = body.duration_minutes ?? null;
  const cardio = body.cardio ?? null;
  const sets = body.sets ?? [];
  const tss = calcTss({
    workout_type: existing.workout_type,
    duration_min: duration ?? 0,
    avg_hr: cardio?.avg_hr ?? body.avg_hr,
    rpe_session: body.rpe_session ?? null,
  });
  const totalVolumeLbs = sets.reduce(
    (sum, set) => sum + (Number(set.reps) || 0) * (Number(set.weight_lbs) || 0),
    0,
  );
  const strainScore = calculateWorkoutStrain({
    type: existing.workout_type.toLowerCase() as 'strength' | 'cardio' | 'hiit' | 'hybrid',
    duration_min: duration ?? 0,
    avg_hr: cardio?.avg_hr ?? body.avg_hr ?? null,
    max_hr: cardio?.max_hr ?? body.max_hr ?? null,
    avg_power_watts: null,
    time_in_zone_min: cardio ? {
      z1: Number(cardio.time_in_zone1_min) || 0,
      z2: Number(cardio.time_in_zone2_min) || 0,
      z3: Number(cardio.time_in_zone3_min) || 0,
      z4: Number(cardio.time_in_zone4_min) || 0,
    } : null,
    tss,
    session_rpe: body.rpe_session ?? null,
    total_volume_lbs: totalVolumeLbs > 0 ? totalVolumeLbs : null,
  });

  const workoutUpdate: Record<string, unknown> = {
    duration_minutes: duration,
    rpe_session: body.rpe_session ?? null,
    notes: body.notes ?? null,
    avg_hr: body.avg_hr ?? null,
    max_hr: body.max_hr ?? null,
    tss,
    strain_score: strainScore,
  };
  if (body.workout_date) {
    workoutUpdate.workout_date = new Date(`${body.workout_date}T12:00:00`).toISOString();
  }

  const { error: updateError } = await supabase
    .from('workout_logs')
    .update(workoutUpdate)
    .eq('id', body.id)
    .eq('user_id', user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.sets) {
    const { error: deleteSetsError } = await supabase.from('set_logs').delete().eq('workout_log_id', body.id);
    if (deleteSetsError) return NextResponse.json({ error: deleteSetsError.message }, { status: 500 });

    if (sets.length > 0) {
      const { error: insertSetsError } = await supabase.from('set_logs').insert(sets.map((set) => ({
        workout_log_id: body.id,
        exercise_id: set.exercise_id,
        set_number: set.set_number,
        set_type: set.set_type,
        reps: set.reps,
        weight_lbs: set.weight_lbs,
        rpe: set.rpe,
        rest_seconds: set.rest_seconds ?? null,
        superset_group: set.superset_group ?? null,
        superset_round: set.superset_round ?? null,
        is_pr: false,
        notes: set.notes ?? null,
        completed: set.completed ?? true,
      })));
      if (insertSetsError) return NextResponse.json({ error: insertSetsError.message }, { status: 500 });
    }
  }

  if (body.cardio !== undefined) {
    const { error: deleteCardioError } = await supabase.from('cardio_logs').delete().eq('workout_log_id', body.id);
    if (deleteCardioError) return NextResponse.json({ error: deleteCardioError.message }, { status: 500 });
    if (cardio) {
      const efficiency = calculateCardiacEfficiency({
        activity_type: cardio.activity_type ?? 'run',
        avg_hr: cardio.avg_hr ?? null,
        avg_pace_per_mile: cardio.avg_pace_per_mile ?? null,
        avg_power_watts: null,
        duration_min: duration ?? 0,
      });
      const { error: insertCardioError } = await supabase.from('cardio_logs').insert({
        workout_log_id: body.id,
        activity_type: cardio.activity_type ?? 'run',
        avg_hr: cardio.avg_hr ?? null,
        max_hr: cardio.max_hr ?? null,
        min_hr: cardio.min_hr ?? null,
        distance_miles: cardio.distance_miles ?? null,
        avg_pace_per_mile: cardio.avg_pace_per_mile ?? null,
        calories: cardio.calories ?? null,
        time_in_zone1_min: cardio.time_in_zone1_min ?? null,
        time_in_zone2_min: cardio.time_in_zone2_min ?? null,
        time_in_zone3_min: cardio.time_in_zone3_min ?? null,
        time_in_zone4_min: cardio.time_in_zone4_min ?? null,
        hr_recovery_1min: cardio.hr_recovery_1min ?? null,
        hr_recovery_2min: cardio.hr_recovery_2min ?? null,
        cardiac_efficiency: efficiency.efficiency,
        cardiac_cost: efficiency.cost,
        efficiency_type: efficiency.type,
      });
      if (insertCardioError) return NextResponse.json({ error: insertCardioError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
