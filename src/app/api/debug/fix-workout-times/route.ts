import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const today = new Date().toISOString().split('T')[0];

    // Get today's workout events
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, alignment_tag, event_type')
      .gte('start_at', `${today}T00:00:00`)
      .lt('start_at', `${today}T23:59:59`)
      .order('start_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Find workouts with 00:00:00 time
    const workoutsWithNoTime = events?.filter(e => {
      const startTime = new Date(e.start_at);
      return (e.alignment_tag?.includes('workout') || e.event_type === 'workout') &&
             startTime.getHours() === 0 &&
             startTime.getMinutes() === 0;
    }) || [];

    console.log(`Found ${workoutsWithNoTime.length} workouts with no time`);

    // Fix them by setting to 9 AM
    const updates = [];
    for (const workout of workoutsWithNoTime) {
      const startDate = new Date(workout.start_at);
      const newStart = new Date(startDate);
      newStart.setHours(9, 0, 0, 0);

      const newEnd = new Date(newStart);
      newEnd.setHours(10, 0, 0, 0);

      const { error: updateError } = await supabase
        .from('calendar_events')
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
        })
        .eq('id', workout.id);

      if (updateError) {
        console.error(`Error updating ${workout.id}:`, updateError);
      } else {
        updates.push({
          id: workout.id,
          title: workout.title,
          old_time: workout.start_at,
          new_time: newStart.toISOString(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      today,
      total_events: events?.length || 0,
      workouts_fixed: updates.length,
      updates,
      all_events: events,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
