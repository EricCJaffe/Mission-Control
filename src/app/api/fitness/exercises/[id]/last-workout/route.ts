import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: exerciseId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch the most recent workout that included this exercise
  const { data: sets, error } = await supabase
    .from('set_logs')
    .select(`
      set_type,
      reps,
      weight_lbs,
      rpe,
      rest_seconds,
      workout_logs!inner(workout_date)
    `)
    .eq('exercise_id', exerciseId)
    .order('workout_logs(workout_date)', { ascending: false })
    .limit(20); // Get up to 20 sets from the last workout

  if (error) {
    console.error('Error fetching last workout:', error);
    return NextResponse.json({ error: 'Failed to fetch last workout' }, { status: 500 });
  }

  if (!sets || sets.length === 0) {
    return NextResponse.json({
      ok: true,
      has_history: false,
      sets: [],
      workout_date: null,
    });
  }

  // Extract the workout date from the first set
  const workoutDate = (sets[0] as any).workout_logs?.workout_date;

  // Format sets
  const formattedSets = sets.map(s => ({
    set_type: s.set_type,
    reps: s.reps,
    weight_lbs: s.weight_lbs,
    rpe: s.rpe || null,
    rest_seconds: s.rest_seconds,
  }));

  return NextResponse.json({
    ok: true,
    has_history: true,
    sets: formattedSets,
    workout_date: workoutDate,
  });
}
