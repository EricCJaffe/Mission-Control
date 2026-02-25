import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Seed March 13, 2026 cardiologist appointment
 * POST /api/fitness/appointments/seed-march
 *
 * One-time setup to create the critical March appointment
 */
export async function POST() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  try {
    // Check if March 13 appointment already exists
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('user_id', userId)
      .eq('appointment_date', '2026-03-13')
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'March 13 appointment already exists',
        message: 'The March 13, 2026 cardiologist appointment has already been created.',
        appointment_id: existing.id,
      }, { status: 400 });
    }

    // Create March 13, 2026 cardiologist appointment
    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        appointment_date: '2026-03-13',
        doctor_name: 'Cardiologist', // User can update this later
        doctor_specialty: 'cardiologist',
        user_notes: 'Follow-up appointment post-CABG (Nov 2022). Discuss EF improvement, Z2 training progress, medication optimization, lab trends.',
        status: 'upcoming',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create appointment:', insertError);
      return NextResponse.json({
        error: 'Failed to create appointment',
        details: insertError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'March 13, 2026 cardiologist appointment created successfully!',
      appointment: {
        id: appointment.id,
        date: appointment.appointment_date,
        doctor: appointment.doctor_name,
        specialty: appointment.doctor_specialty,
        status: appointment.status,
      },
      next_steps: [
        'Go to /fitness/appointments to view the appointment',
        'Click "Generate Appointment Prep" to create AI-powered questions',
        'Review the suggested questions and customize as needed',
        'Upload any pending lab reports before the appointment',
      ],
    });

  } catch (error) {
    console.error('Error seeding March appointment:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Check if March 13 appointment exists
 * GET /api/fitness/appointments/seed-march
 */
export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, status, prep_generated_at')
    .eq('user_id', userId)
    .eq('appointment_date', '2026-03-13')
    .single();

  return NextResponse.json({
    exists: !!appointment,
    appointment: appointment || null,
    prep_generated: !!appointment?.prep_generated_at,
  });
}
