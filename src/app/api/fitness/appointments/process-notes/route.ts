import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

/**
 * POST /api/fitness/appointments/process-notes
 *
 * Process post-appointment notes via AI to generate health.md update suggestions.
 * The notes are analyzed for medication changes, new diagnoses, updated targets,
 * and other health-relevant information that should be reflected in health.md.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appointment_id } = await request.json();

  if (!appointment_id) {
    return NextResponse.json({ error: 'appointment_id is required' }, { status: 400 });
  }

  try {
    // Fetch the appointment with notes
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointment_id)
      .eq('user_id', user.id)
      .single();

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (!appointment.appointment_notes) {
      return NextResponse.json({ error: 'No appointment notes to process' }, { status: 400 });
    }

    // Use the HealthDocUpdater to generate proposed updates
    const updater = new HealthDocUpdater();
    const updates = await updater.detectUpdates(user.id, 'appointment_notes', {
      appointment_id: appointment.id,
      doctor_name: appointment.doctor_name,
      doctor_specialty: appointment.doctor_specialty,
      appointment_date: appointment.appointment_date,
      notes: appointment.appointment_notes,
      medication_changes: appointment.medication_changes,
    });

    if (updates.length > 0) {
      // Save pending updates for user review
      await updater.savePendingUpdates(user.id, updates);
    }

    return NextResponse.json({
      ok: true,
      updates_count: updates.length,
      updates: updates.map(u => ({
        section_name: u.section_name,
        reason: u.reason,
        confidence: u.confidence,
      })),
      review_url: '/fitness/health/review-updates',
    });
  } catch (error) {
    console.error('[ProcessNotes] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process notes' },
      { status: 500 }
    );
  }
}
