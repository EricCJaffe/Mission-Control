import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateAppointmentPrep } from '@/lib/fitness/ai';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('appointment_date', { ascending: false })
    .limit(20);

  return NextResponse.json({ appointments: appointments ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { appointment_date, doctor_name, doctor_specialty, user_notes } = body;

  if (!appointment_date) {
    return NextResponse.json({ error: 'appointment_date required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: user.id,
      appointment_date,
      doctor_name: doctor_name || null,
      doctor_specialty: doctor_specialty || 'cardiologist',
      user_notes: user_notes || null,
      status: 'upcoming',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, appointment: data });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // If generating prep, run AI
  if (updates.generate_prep) {
    delete updates.generate_prep;

    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    // Get last completed appointment
    const { data: lastAppt } = await supabase
      .from('appointments')
      .select('appointment_date')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('appointment_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get metrics trends (30-day)
    const { data: metrics } = await supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, weight_lbs')
      .eq('user_id', user.id)
      .gte('metric_date', thirtyDaysAgo)
      .order('metric_date', { ascending: true });

    // Get BP readings
    const { data: bpReadings } = await supabase
      .from('bp_readings')
      .select('systolic, diastolic, flag_level')
      .eq('user_id', user.id)
      .gte('reading_date', thirtyDaysAgo);

    // Get medications
    const { data: meds } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true);

    // Get lab flags
    const { data: labFlags } = await supabase
      .from('lab_results')
      .select('test_name, flag')
      .eq('user_id', user.id)
      .neq('flag', 'normal')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get workout compliance
    const { data: planned } = await supabase
      .from('planned_workouts')
      .select('id, status')
      .eq('user_id', user.id)
      .gte('scheduled_date', thirtyDaysAgo)
      .lte('scheduled_date', today);

    const completedCount = planned?.filter(p => p.status === 'completed').length ?? 0;
    const totalPlanned = planned?.length ?? 0;
    const compliancePct = totalPlanned > 0 ? Math.round((completedCount / totalPlanned) * 100) : null;

    // Build trends
    const rhrTrend = metrics && metrics.length >= 2
      ? { start: metrics[0]?.resting_hr ?? 0, end: metrics[metrics.length - 1]?.resting_hr ?? 0 }
      : null;
    const hrvTrend = metrics && metrics.length >= 2
      ? { start: metrics[0]?.hrv_ms ?? 0, end: metrics[metrics.length - 1]?.hrv_ms ?? 0 }
      : null;
    const weightTrend = metrics && metrics.length >= 2
      ? { start: metrics[0]?.weight_lbs ?? 0, end: metrics[metrics.length - 1]?.weight_lbs ?? 0 }
      : null;

    const bpAvg = bpReadings && bpReadings.length > 0
      ? {
          systolic: Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length),
          diastolic: Math.round(bpReadings.reduce((s, r) => s + r.diastolic, 0) / bpReadings.length),
        }
      : null;

    const elevatedDays = bpReadings?.filter(r =>
      r.flag_level && !['normal'].includes(r.flag_level)
    ).length ?? 0;

    try {
      const prep = await generateAppointmentPrep({
        user_id: user.id, // NEW: passes user ID for health context loading
        doctor_specialty: updates.doctor_specialty || 'cardiologist',
        last_appointment_date: lastAppt?.appointment_date ?? null,
        rhr_trend: rhrTrend && rhrTrend.start > 0 && rhrTrend.end > 0 ? rhrTrend : null,
        hrv_trend: hrvTrend && hrvTrend.start > 0 && hrvTrend.end > 0 ? hrvTrend : null,
        bp_avg: bpAvg,
        bp_elevated_days: elevatedDays,
        weight_trend: weightTrend && weightTrend.start > 0 && weightTrend.end > 0 ? weightTrend : null,
        training_compliance_pct: compliancePct,
        cardiac_efficiency_trend: null,
        notable_events: [],
        medications: meds ?? [],
        recent_lab_flags: labFlags?.map(f => `${f.test_name}: ${f.flag}`) ?? [],
      });

      updates.suggested_questions = prep.suggested_questions;
      updates.changes_summary = prep.changes_summary;
      updates.flags = prep.flags;
      updates.prep_generated_at = new Date().toISOString();
      updates.status = 'prep_ready';
    } catch (err) {
      console.error('Appointment prep generation failed', err);
    }
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, appointment: data });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
