import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { CardiologistReport } from '@/lib/fitness/cardiologist-report';
import type { CardiologistReportData } from '@/lib/fitness/cardiologist-report';
import React from 'react';

/**
 * Generate cardiologist report PDF
 * GET /api/fitness/appointments/report?id=<appointment_id>
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const appointmentId = searchParams.get('id');
  if (!appointmentId) {
    return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 });
  }

  // Fetch appointment
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('user_id', user.id)
    .single();

  if (apptError || !appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  // Fetch active medications
  const { data: meds } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true);

  const medications = (meds || []).map((m: Record<string, unknown>) => ({
    name: (m.name || m.medication_name || 'Unknown') as string,
    type: (m.type || m.medication_type || 'prescription') as string,
    dosage: (m.dosage || null) as string | null,
    frequency: (m.frequency || null) as string | null,
    purpose: (m.purpose || m.indication || null) as string | null,
  }));

  // Fetch recent vitals (7-day avg)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: metrics } = await supabase
    .from('body_metrics')
    .select('resting_hr, hrv_ms, body_battery, sleep_duration_min, weight_lbs')
    .eq('user_id', user.id)
    .gte('metric_date', sevenDaysAgo.toISOString().split('T')[0])
    .order('metric_date', { ascending: false })
    .limit(7);

  const { data: bpReadings } = await supabase
    .from('bp_readings')
    .select('systolic, diastolic')
    .eq('user_id', user.id)
    .gte('reading_date', sevenDaysAgo.toISOString())
    .order('reading_date', { ascending: false })
    .limit(7);

  // Calculate averages
  const avg = (arr: (number | null)[]): number | null => {
    const valid = arr.filter((v): v is number => v != null && v > 0);
    return valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
  };

  const avgSleep = metrics?.length
    ? Number((metrics.reduce((s, m) => s + ((m.sleep_duration_min || 0) / 60), 0) / metrics.length).toFixed(1))
    : null;

  const bpAvg = bpReadings && bpReadings.length > 0
    ? {
        systolic: Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length),
        diastolic: Math.round(bpReadings.reduce((s, r) => s + r.diastolic, 0) / bpReadings.length),
      }
    : null;

  const reportData: CardiologistReportData = {
    patientName: user.user_metadata?.full_name || user.email || 'Patient',
    appointmentDate: new Date(appointment.appointment_date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    doctorName: appointment.doctor_name || 'Cardiologist',
    doctorSpecialty: appointment.doctor_specialty || 'Cardiology',
    suggestedQuestions: appointment.suggested_questions || [],
    changesSummary: appointment.changes_summary || [],
    flags: appointment.flags || [],
    medications,
    vitals: {
      rhr: avg(metrics?.map(m => m.resting_hr) || []),
      hrv: avg(metrics?.map(m => m.hrv_ms) || []),
      bp: bpAvg,
      weight: metrics?.[0]?.weight_lbs || null,
      bodyBattery: avg(metrics?.map(m => m.body_battery) || []),
      sleepHours: avgSleep,
    },
    generatedAt: new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(CardiologistReport, { data: reportData }) as any
    );

    const dateStr = appointment.appointment_date;
    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="cardiologist-report-${dateStr}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[Report] PDF generation failed:', err);
    return NextResponse.json({
      error: 'PDF generation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Get report data as JSON (for preview)
 * POST /api/fitness/appointments/report
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 });

  const { data: appointment } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    suggestedQuestions: appointment.suggested_questions || [],
    changesSummary: appointment.changes_summary || [],
    flags: appointment.flags || [],
    prepGeneratedAt: appointment.prep_generated_at,
    status: appointment.status,
  });
}
