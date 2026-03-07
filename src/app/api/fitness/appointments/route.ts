import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateAppointmentPrep } from '@/lib/fitness/ai';
import type { Medication } from '@/lib/fitness/types';

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

    const { data: imagingReports } = await supabase
      .from('health_file_uploads')
      .select('file_name, created_at, analysis_json')
      .eq('user_id', user.id)
      .eq('file_type', 'imaging')
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5);

    let geneticsInsights: string[] = [];
    try {
      const { data: geneticsSummary } = await supabase.rpc('get_genetics_comprehensive_analysis', {
        p_user_id: user.id,
      });
      if (geneticsSummary?.found && geneticsSummary.analysis) {
        const overall = typeof geneticsSummary.analysis?.overall_genetic_profile === 'string'
          ? geneticsSummary.analysis.overall_genetic_profile
          : null;
        const cardiac = typeof geneticsSummary.analysis?.cardiac_genetic_profile === 'string'
          ? geneticsSummary.analysis.cardiac_genetic_profile
          : null;
        const topPriorities = Array.isArray(geneticsSummary.analysis?.top_priorities)
          ? geneticsSummary.analysis.top_priorities.filter((item: unknown): item is string => typeof item === 'string').slice(0, 3)
          : [];
        geneticsInsights = [overall, cardiac, ...topPriorities].filter((item): item is string => Boolean(item));
      }
    } catch {
      geneticsInsights = [];
    }

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

    // Normalize medication names for AI prompt
    const normalizedMeds: Medication[] = (meds ?? []).map((m) => {
      const rawType = String(m.type || m.medication_type || 'prescription');
      const type: Medication['type'] =
        rawType === 'supplement' || rawType === 'otc' || rawType === 'prescription'
          ? rawType
          : 'prescription';

      return {
        id: m.id,
        user_id: m.user_id,
        name: String(m.name || m.medication_name || 'Unknown'),
        type,
        dosage: m.dosage ?? null,
        frequency: m.frequency ?? null,
        timing: m.timing ?? null,
        prescribing_doctor: m.prescribing_doctor ?? null,
        purpose: m.purpose ?? null,
        known_interactions: m.known_interactions ?? null,
        side_effects_experienced: m.side_effects_experienced ?? null,
        active: m.active ?? true,
        start_date: m.start_date ?? null,
        end_date: m.end_date ?? null,
        ai_review: m.ai_review ?? null,
        last_reviewed_at: m.last_reviewed_at ?? null,
      };
    });

    console.log('[AppointmentPrep] Generating prep with:', {
      medsCount: normalizedMeds.length,
      rhrTrend, hrvTrend, bpAvg, weightTrend, compliancePct,
      labFlagsCount: labFlags?.length ?? 0,
    });

    try {
      const prep = await generateAppointmentPrep({
        user_id: user.id,
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
        medications: normalizedMeds,
        recent_lab_flags: labFlags?.map(f => `${f.test_name}: ${f.flag}`) ?? [],
        recent_imaging_findings: (imagingReports || []).map((report) => {
          const summary = typeof report.analysis_json?.summary === 'string'
            ? report.analysis_json.summary
            : 'Imaging report available';
          return `${report.file_name}: ${summary}`;
        }),
        recent_genetics_insights: geneticsInsights,
      });

      console.log('[AppointmentPrep] AI returned:', {
        questionsCount: prep.suggested_questions?.length ?? 0,
        changesCount: prep.changes_summary?.length ?? 0,
        flagsCount: prep.flags?.length ?? 0,
      });

      updates.suggested_questions = prep.suggested_questions;
      updates.changes_summary = prep.changes_summary;
      updates.flags = prep.flags;
      updates.prep_generated_at = new Date().toISOString();
      updates.status = 'prep_ready';
    } catch (err) {
      console.error('[AppointmentPrep] Generation FAILED:', err);
      // Still update the appointment with error info so user sees feedback
      updates.flags = [`Prep generation error: ${err instanceof Error ? err.message : 'Unknown error'}. Try again.`];
      updates.status = 'prep_ready';
      updates.prep_generated_at = new Date().toISOString();
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

  // Trigger health.md update detection from completed appointment notes (non-blocking)
  const isCompletingWithNotes =
    data.status === 'completed' &&
    typeof data.appointment_notes === 'string' &&
    data.appointment_notes.trim().length > 0;

  if (isCompletingWithNotes) {
    const baseUrl = req.headers.get('origin') || 'http://localhost:3000';
    fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        trigger: 'appointment_notes',
        trigger_data: {
          appointment_id: data.id,
          appointment_date: data.appointment_date,
          doctor_name: data.doctor_name,
          doctor_specialty: data.doctor_specialty,
          appointment_notes: data.appointment_notes,
          medication_changes: data.medication_changes,
        },
      }),
    }).catch(err => {
      console.error('Failed to trigger health.md update from appointment notes (non-critical):', err);
    });
  }

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
