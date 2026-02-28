import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/fitness/withings/cleanup
 * Remove all Withings workout imports (preparing for Garmin as workout source)
 */
export async function DELETE() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Delete workout_logs with import_source = 'Withings'
    // Related cardio_logs will cascade delete automatically
    const { data: deletedWorkouts, error: deleteError } = await supabase
      .from('workout_logs')
      .delete()
      .eq('user_id', user.id)
      .eq('import_source', 'Withings')
      .select('id');

    if (deleteError) {
      console.error('Withings workout cleanup error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to cleanup Withings workouts', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: deletedWorkouts?.length || 0,
      message: `Removed ${deletedWorkouts?.length || 0} Withings workout imports`,
    });
  } catch (error: any) {
    console.error('Withings cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', details: error.message },
      { status: 500 }
    );
  }
}
