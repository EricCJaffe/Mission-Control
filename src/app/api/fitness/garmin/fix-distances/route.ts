import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all Garmin workouts
    const { data: workouts } = await supabase
      .from('workout_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('import_source', 'Garmin');

    if (!workouts || workouts.length === 0) {
      return NextResponse.json({ ok: true, fixed: 0 });
    }

    const workoutIds = workouts.map(w => w.id);

    // Get cardio logs that need fixing (distance > 50 miles is obviously wrong)
    const { data: cardioLogs } = await supabase
      .from('cardio_logs')
      .select('id, distance_miles')
      .in('workout_log_id', workoutIds)
      .gt('distance_miles', 50);

    if (!cardioLogs || cardioLogs.length === 0) {
      return NextResponse.json({ ok: true, fixed: 0 });
    }

    // Update each one individually
    let fixedCount = 0;
    for (const log of cardioLogs) {
      const correctedDistance = parseFloat((log.distance_miles / 100).toFixed(2));
      const { error } = await supabase
        .from('cardio_logs')
        .update({ distance_miles: correctedDistance })
        .eq('id', log.id);

      if (!error) {
        fixedCount++;
      }
    }

    return NextResponse.json({ ok: true, fixed: fixedCount });
  } catch (error: any) {
    console.error('Fix distances error:', error);
    return NextResponse.json(
      { error: error.message || 'Fix failed' },
      { status: 500 }
    );
  }
}
