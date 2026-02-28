import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * POST - Create a new planned workout
 *
 * Body:
 * {
 *   scheduled_date: string (ISO date)
 *   template_id?: string
 *   workout_type?: string
 *   prescribed?: object
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scheduled_date, scheduled_time, template_id, workout_type, prescribed, notes, day_label } = body;

    // Validate required fields
    if (!scheduled_date) {
      return NextResponse.json(
        { error: 'scheduled_date is required' },
        { status: 400 }
      );
    }

    // Parse scheduled_time (HH:MM format) or default to 9 AM
    const timeStr = scheduled_time || '09:00';
    const [hours, minutes] = timeStr.split(':').map(Number);

    // If template_id is provided, fetch template data
    let templateData = null;
    if (template_id) {
      const { data: template } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', template_id)
        .eq('user_id', user.id)
        .single();

      if (template) {
        templateData = template;
      }
    }

    // Build planned workout data
    const plannedWorkoutData = {
      user_id: user.id,
      scheduled_date,
      scheduled_time: timeStr, // HH:MM format
      template_id: template_id || null,
      workout_type: workout_type || templateData?.type || null,
      day_label: day_label || templateData?.name || null,
      prescribed: prescribed || templateData?.structure || {},
      notes: notes || null,
      status: 'pending' as const, // Valid values: pending, completed, skipped, substituted
    };

    // Insert planned workout
    const { data, error } = await supabase
      .from('planned_workouts')
      .insert(plannedWorkoutData)
      .select()
      .single();

    if (error) {
      console.error('Error creating planned workout:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Database trigger automatically creates calendar_event
    return NextResponse.json({ ok: true, planned_workout: data });
  } catch (error) {
    console.error('Error in POST /api/fitness/planned-workouts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update an existing planned workout
 *
 * Body:
 * {
 *   id: string
 *   scheduled_date?: string
 *   notes?: string
 *   status?: string
 *   day_label?: string
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, scheduled_date, notes, status, day_label } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (scheduled_date !== undefined) updateData.scheduled_date = scheduled_date;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    if (day_label !== undefined) updateData.day_label = day_label;
    updateData.updated_at = new Date().toISOString();

    // Update planned workout
    const { data, error } = await supabase
      .from('planned_workouts')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating planned workout:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Planned workout not found' }, { status: 404 });
    }

    // Database trigger automatically updates calendar_event
    return NextResponse.json({ ok: true, planned_workout: data });
  } catch (error) {
    console.error('Error in PATCH /api/fitness/planned-workouts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a planned workout
 *
 * Query params:
 *   id: string
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Delete planned workout
    const { error } = await supabase
      .from('planned_workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting planned workout:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Database trigger automatically deletes calendar_event
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /api/fitness/planned-workouts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
