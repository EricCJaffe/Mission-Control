import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { HealthDocUpdater, type SectionUpdate } from '@/lib/fitness/health-doc-updater';
import { GENETIC_REPORT_TYPES } from '@/lib/fitness/genetic-report-types';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

type Confidence = 'high' | 'medium' | 'low';

type SuggestedUpdateInput = {
  section_number: number;
  section_name?: string;
  proposed_content: string;
  reason: string;
  confidence?: Confidence;
  priority?: number;
};

type NormalizedSuggestedUpdate = {
  section_number: number;
  section_name: string;
  proposed_content: string;
  reason: string;
  confidence: Confidence;
  priority: number;
};

type PlanIntake = {
  plan_name: string;
  goal: string;
  primary_objective: string;
  secondary_objectives: string[];
  target_metrics: Array<{
    metric: string;
    current: string;
    target: string;
    why: string;
  }>;
  weekly_framework: Array<{
    day_name: string;
    session_type: string;
    purpose: string;
    duration_min: number;
    notes: string;
  }>;
  day_type_guidance: Array<{
    type: string;
    description: string;
    intensity_guidance: string;
    duration_guidance: string;
    examples: string[];
  }>;
  weekly_tracking: string[];
  schedule_constraints: {
    off_day: string;
    hard_day: string;
    long_day: string;
    allow_double_day: boolean;
    strength_days_per_week: number;
    cardio_days_per_week: number;
    strength_duration_min: number;
    normal_cardio_duration_min: string;
    long_cardio_duration_min: number;
    cardio_modes: string[];
    notes: string;
  };
  notes_for_generation: string;
};

type Snapshot = {
  health_document: {
    version: number | null;
    updated_at: string | null;
    content: string | null;
    targeted_sections: Record<string, string>;
  };
  pending_updates: {
    count: number;
  };
  medications: {
    total: number;
    medications: Array<{ name: string; type: string; timing: string | null }>;
    supplements: Array<{ name: string; type: string; timing: string | null }>;
  };
  labs: {
    confirmed_panels: number;
    latest_panel_date: string | null;
    abnormal_results: string[];
  };
  hydration: {
    avg_intake_7d: number | null;
    avg_output_7d: number | null;
    target_oz: number | null;
    alerts: string[];
  };
  nutrition: {
    total_entries_7d: number;
    avg_sodium_7d: number | null;
    avg_protein_7d: number | null;
    avg_fiber_7d: number | null;
    pattern: string | null;
  };
  genetics: {
    completed_reports: Array<{ file_name: string; file_type: string; processed_at: string | null }>;
    comprehensive_analysis: Record<string, unknown> | null;
  };
  imaging: Array<{
    file_name: string;
    created_at: string;
    summary: string;
    impression: string | null;
  }>;
  recovery: {
    sessions_last_14d: number;
    total_minutes_last_14d: number;
    modality_counts: Record<string, number>;
    latest_sessions: Array<{
      session_date: string;
      modality: string;
      duration_min: number;
      timing_context: string;
      perceived_recovery: number | null;
    }>;
  };
  metrics: {
    latest_weight_lbs: number | null;
    avg_resting_hr_7d: number | null;
    avg_hrv_7d: number | null;
    avg_sleep_hours_7d: number | null;
    latest_bp_avg_30d: { systolic: number; diastolic: number } | null;
    readiness: { score: number | null; label: string | null };
    strain: { score: number | null; level: string | null };
    form: { tsb: number | null; status: string | null; ctl: number | null; atl: number | null };
  };
  training: {
    active_plan: { id: string; name: string; goal: string | null; start_date: string; end_date: string } | null;
    last_workout: { date: string; type: string; duration_minutes: number | null; tss: number | null } | null;
    ninety_day_summary: {
      total_workouts: number;
      avg_sessions_per_week: number;
      avg_duration_minutes: number;
      avg_tss: number;
      workout_type_distribution: Record<string, number>;
    };
  };
};

const TARGET_SECTION_LABELS: Record<number, string> = {
  1: 'Medical History',
  2: 'Medications (Active)',
  3: 'Supplements (Active)',
  6: 'Vital Baselines & Targets',
  7: 'Training Constraints',
  9: 'Genetic / Methylation',
  11: 'Health Priorities',
};

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: result } = await supabase.rpc('get_health_command_center_analysis', {
      p_user_id: user.id,
    });

    if (!result?.found) {
      return NextResponse.json({ ok: true, found: false, analysis: null, snapshot: null, generated_at: null });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      analysis: result.analysis,
      snapshot: result.snapshot,
      generated_at: result.generated_at,
    });
  } catch (error) {
    console.error('Failed to load saved command center analysis:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to load saved analysis' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const mode = body?.mode as string | undefined;

    if (mode === 'queue_updates') {
      return await queueSuggestedUpdates(user.id, body?.updates);
    }

    const snapshot = await loadSnapshot(user.id);

    if (mode === 'follow_up') {
      const question = typeof body?.question === 'string' ? body.question.trim() : '';
      if (!question) {
        return NextResponse.json({ ok: false, error: 'Question is required' }, { status: 400 });
      }

      const followUp = await generateFollowUp(user.id, snapshot, question);
      const saved = await loadSavedAnalysis(user.id);
      if (saved) {
        const merged = {
          ...saved.analysis,
          last_follow_up: {
            question,
            ...followUp,
            generated_at: new Date().toISOString(),
          },
        };
        await saveAnalysis(user.id, merged, snapshot);
      }
      return NextResponse.json({ ok: true, snapshot, follow_up: followUp });
    }

    if (mode === 'plan_intake') {
      const planIntake = await generatePlanIntake(user.id, snapshot, body || {});
      const saved = await loadSavedAnalysis(user.id);
      if (saved) {
        const merged = {
          ...saved.analysis,
          last_plan_intake: {
            ...planIntake,
            generated_at: new Date().toISOString(),
          },
        };
        await saveAnalysis(user.id, merged, snapshot);
      }
      return NextResponse.json({ ok: true, snapshot, plan_intake: planIntake });
    }

    if (mode === 'plan_intake_field') {
      const field = typeof body?.field === 'string' ? body.field : '';
      const currentIntake = body?.current_intake && typeof body.current_intake === 'object'
        ? body.current_intake as Record<string, unknown>
        : {};
      if (!field) {
        return NextResponse.json({ ok: false, error: 'Field is required' }, { status: 400 });
      }

      const value = await regeneratePlanIntakeField(user.id, snapshot, field, currentIntake, body || {});
      const saved = await loadSavedAnalysis(user.id);
      if (saved && saved.analysis?.last_plan_intake && typeof saved.analysis.last_plan_intake === 'object') {
        const mergedPlanIntake = {
          ...(saved.analysis.last_plan_intake as Record<string, unknown>),
          [field]: value,
          generated_at: new Date().toISOString(),
        };
        const mergedAnalysis = {
          ...saved.analysis,
          last_plan_intake: mergedPlanIntake,
        };
        await saveAnalysis(user.id, mergedAnalysis, snapshot);
      }
      return NextResponse.json({ ok: true, snapshot, field, value });
    }

    const analysis = await generateComprehensiveAnalysis(user.id, snapshot);
    const generatedAt = new Date().toISOString();
    await saveAnalysis(user.id, analysis, snapshot);
    return NextResponse.json({ ok: true, snapshot, analysis, generated_at: generatedAt });
  } catch (error) {
    console.error('Health command center error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}

async function saveAnalysis(userId: string, analysis: Record<string, unknown>, snapshot: Snapshot) {
  const supabase = await supabaseServer();
  await supabase.rpc('upsert_health_command_center_analysis', {
    p_user_id: userId,
    p_analysis: analysis,
    p_snapshot: snapshot,
  });
}

async function loadSavedAnalysis(userId: string): Promise<{ analysis: Record<string, unknown>; snapshot: Snapshot } | null> {
  const supabase = await supabaseServer();
  const { data: result } = await supabase.rpc('get_health_command_center_analysis', {
    p_user_id: userId,
  });

  if (!result?.found || !result.analysis || !result.snapshot) {
    return null;
  }

  return {
    analysis: result.analysis as Record<string, unknown>,
    snapshot: result.snapshot as Snapshot,
  };
}

async function loadSnapshot(userId: string): Promise<Snapshot> {
  const supabase = await supabaseServer();
  const updater = new HealthDocUpdater(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [
    { data: healthDoc },
    pendingUpdatesResult,
    { data: medRows },
    { data: panels },
    { data: hydrationRows },
    { data: hydrationTargetRow },
    { data: nutritionRows },
    { data: nutritionTargetRow },
    { data: imagingRows },
    { data: geneticsRows },
    { data: recoveryRows },
    { data: readinessRow },
    { data: strainRow },
    { data: formRow },
    { data: bodyMetricRows },
    { data: sleepRows },
    { data: bpRows },
    { data: workoutRows },
    { data: activePlanRow },
  ] = await Promise.all([
    supabase
      .from('health_documents')
      .select('content, version, created_at')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('health_doc_pending_updates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('medications')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true),
    supabase
      .from('lab_panels')
      .select('id, panel_date')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('panel_date', { ascending: false })
      .limit(6),
    supabase
      .from('hydration_logs')
      .select('log_date, intake_oz, output_oz, symptoms')
      .eq('user_id', userId)
      .gte('log_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('log_date', { ascending: false }),
    supabase
      .from('hydration_targets')
      .select('base_target_oz, alert_weight_gain_lbs')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('nutrition_logs')
      .select('logged_at, sodium_mg, protein_g, fiber_g')
      .eq('user_id', userId)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase
      .from('nutrition_targets')
      .select('pattern')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('health_file_uploads')
      .select('file_name, created_at, analysis_json')
      .eq('user_id', userId)
      .eq('file_type', 'imaging')
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('health_file_uploads')
      .select('file_name, file_type, processed_at')
      .eq('user_id', userId)
      .in('file_type', GENETIC_REPORT_TYPES as unknown as string[])
      .eq('processing_status', 'completed')
      .order('processed_at', { ascending: false }),
    supabase
      .from('recovery_sessions')
      .select('session_date, modality, duration_min, timing_context, perceived_recovery')
      .eq('user_id', userId)
      .gte('session_date', fourteenDaysAgoIso())
      .order('session_date', { ascending: false })
      .limit(20),
    supabase
      .from('daily_readiness')
      .select('readiness_score, readiness_label')
      .eq('user_id', userId)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('daily_strain')
      .select('strain_score, strain_level')
      .eq('user_id', userId)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('fitness_form')
      .select('form_tsb, form_status, fitness_ctl, fatigue_atl')
      .eq('user_id', userId)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, weight_lbs')
      .eq('user_id', userId)
      .gte('metric_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('metric_date', { ascending: false }),
    supabase
      .from('sleep_logs')
      .select('sleep_date, total_sleep_seconds')
      .eq('user_id', userId)
      .gte('sleep_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('sleep_date', { ascending: false }),
    supabase
      .from('bp_readings')
      .select('systolic, diastolic')
      .eq('user_id', userId)
      .gte('reading_date', thirtyDaysAgo.toISOString())
      .order('reading_date', { ascending: false }),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes, tss')
      .eq('user_id', userId)
      .gte('workout_date', ninetyDaysAgo.toISOString())
      .order('workout_date', { ascending: false }),
    supabase
      .from('training_plans')
      .select('id, plan_name, goal, start_date, end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let geneticsComprehensive: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.rpc('get_genetics_comprehensive_analysis', {
      p_user_id: userId,
    });
    if (data?.found && data.analysis) {
      geneticsComprehensive = data.analysis as Record<string, unknown>;
    }
  } catch {
    geneticsComprehensive = null;
  }

  const panelIds = (panels || []).map((panel) => panel.id);
  let abnormalResults: string[] = [];
  if (panelIds.length > 0) {
    const { data: labRows } = await supabase
      .from('lab_results')
      .select('panel_id, test_name, value, unit, flag')
      .in('panel_id', panelIds)
      .neq('flag', 'normal')
      .order('created_at', { ascending: false })
      .limit(12);

    abnormalResults = (labRows || []).map((row) => {
      const rawValue = row.value ? `${row.value}${row.unit ? ` ${row.unit}` : ''}` : 'flagged';
      return `${row.test_name}: ${rawValue} (${row.flag})`;
    });
  }

  const healthContent = healthDoc?.content || null;
  const targetedSections = Object.fromEntries(
    Object.entries(TARGET_SECTION_LABELS).map(([key]) => {
      const sectionNumber = Number(key);
      return [String(sectionNumber), updater.extractSection(healthContent || '', sectionNumber) || ''];
    })
  );

  const normalizedMeds = (medRows || []).map((row) => {
    const type = String(row.type || row.medication_type || 'prescription');
    return {
      name: String(row.name || row.medication_name || 'Unknown'),
      type,
      timing: row.timing ? String(row.timing) : null,
    };
  });

  const supplements = normalizedMeds.filter((row) => row.type.toLowerCase().includes('supplement'));
  const medications = normalizedMeds.filter((row) => !row.type.toLowerCase().includes('supplement'));

  const avgRestingHr = average(bodyMetricRows?.map((row) => row.resting_hr));
  const avgHrv = average(bodyMetricRows?.map((row) => row.hrv_ms));
  const latestWeight = bodyMetricRows?.find((row) => row.weight_lbs != null)?.weight_lbs ?? null;
  const avgSleepHours = sleepRows?.length
    ? Number((sleepRows.reduce((sum, row) => sum + (row.total_sleep_seconds || 0), 0) / sleepRows.length / 3600).toFixed(1))
    : null;
  const avgBp = bpRows?.length
    ? {
        systolic: Math.round(bpRows.reduce((sum, row) => sum + row.systolic, 0) / bpRows.length),
        diastolic: Math.round(bpRows.reduce((sum, row) => sum + row.diastolic, 0) / bpRows.length),
      }
    : null;

  const hydrationAlerts = (hydrationRows || []).flatMap((row) => Array.isArray(row.symptoms) ? row.symptoms.map(String) : []).slice(0, 5);

  const workoutTypeDistribution: Record<string, number> = {};
  for (const row of workoutRows || []) {
    workoutTypeDistribution[row.workout_type] = (workoutTypeDistribution[row.workout_type] || 0) + 1;
  }

  const recoveryCounts: Record<string, number> = {};
  for (const row of recoveryRows || []) {
    const key = String(row.modality || 'unknown');
    recoveryCounts[key] = (recoveryCounts[key] || 0) + 1;
  }

  return {
    health_document: {
      version: healthDoc?.version ?? null,
      updated_at: healthDoc?.created_at ?? null,
      content: healthContent,
      targeted_sections: targetedSections,
    },
    pending_updates: {
      count: pendingUpdatesResult.count || 0,
    },
    medications: {
      total: normalizedMeds.length,
      medications,
      supplements,
    },
    labs: {
      confirmed_panels: panels?.length || 0,
      latest_panel_date: panels?.[0]?.panel_date || null,
      abnormal_results: abnormalResults,
    },
    hydration: {
      avg_intake_7d: average(hydrationRows?.map((row) => Number(row.intake_oz || 0))),
      avg_output_7d: average(hydrationRows?.map((row) => Number(row.output_oz || 0))),
      target_oz: hydrationTargetRow?.base_target_oz ?? null,
      alerts: hydrationAlerts,
    },
    nutrition: {
      total_entries_7d: nutritionRows?.length || 0,
      avg_sodium_7d: average(nutritionRows?.map((row) => Number(row.sodium_mg || 0))),
      avg_protein_7d: average(nutritionRows?.map((row) => Number(row.protein_g || 0))),
      avg_fiber_7d: average(nutritionRows?.map((row) => Number(row.fiber_g || 0))),
      pattern: nutritionTargetRow?.pattern ?? null,
    },
    genetics: {
      completed_reports: (geneticsRows || []).map((row) => ({
        file_name: row.file_name,
        file_type: row.file_type,
        processed_at: row.processed_at,
      })),
      comprehensive_analysis: geneticsComprehensive,
    },
    imaging: (imagingRows || []).map((row) => ({
      file_name: row.file_name,
      created_at: row.created_at,
      summary: typeof row.analysis_json?.summary === 'string' ? row.analysis_json.summary : '',
      impression: typeof row.analysis_json?.impression === 'string' ? row.analysis_json.impression : null,
    })),
    recovery: {
      sessions_last_14d: recoveryRows?.length || 0,
      total_minutes_last_14d: (recoveryRows || []).reduce((sum, row) => sum + Number(row.duration_min || 0), 0),
      modality_counts: recoveryCounts,
      latest_sessions: (recoveryRows || []).slice(0, 8).map((row) => ({
        session_date: row.session_date,
        modality: row.modality,
        duration_min: Number(row.duration_min || 0),
        timing_context: row.timing_context,
        perceived_recovery: row.perceived_recovery ?? null,
      })),
    },
    metrics: {
      latest_weight_lbs: latestWeight,
      avg_resting_hr_7d: avgRestingHr,
      avg_hrv_7d: avgHrv,
      avg_sleep_hours_7d: avgSleepHours,
      latest_bp_avg_30d: avgBp,
      readiness: {
        score: readinessRow?.readiness_score ?? null,
        label: readinessRow?.readiness_label ?? null,
      },
      strain: {
        score: strainRow?.strain_score ?? null,
        level: strainRow?.strain_level ?? null,
      },
      form: {
        tsb: formRow?.form_tsb ?? null,
        status: formRow?.form_status ?? null,
        ctl: formRow?.fitness_ctl ?? null,
        atl: formRow?.fatigue_atl ?? null,
      },
    },
    training: {
      active_plan: activePlanRow
        ? {
            id: activePlanRow.id,
            name: activePlanRow.plan_name,
            goal: activePlanRow.goal,
            start_date: activePlanRow.start_date,
            end_date: activePlanRow.end_date,
          }
        : null,
      last_workout: workoutRows?.[0]
        ? {
            date: workoutRows[0].workout_date,
            type: workoutRows[0].workout_type,
            duration_minutes: workoutRows[0].duration_minutes,
            tss: workoutRows[0].tss,
          }
        : null,
      ninety_day_summary: {
        total_workouts: workoutRows?.length || 0,
        avg_sessions_per_week: workoutRows?.length ? Number(((workoutRows.length || 0) / 13).toFixed(1)) : 0,
        avg_duration_minutes: average(workoutRows?.map((row) => row.duration_minutes)) ?? 0,
        avg_tss: average(workoutRows?.map((row) => row.tss)) ?? 0,
        workout_type_distribution: workoutTypeDistribution,
      },
    },
  };
}

async function generateComprehensiveAnalysis(userId: string, snapshot: Snapshot) {
  const system = await buildAISystemPrompt(userId, 'general_health_query');
  const user = `Build a total health picture from the combined data below.

Rules:
- Prioritize objective recent data over stale assumptions in health.md.
- Be specific and pragmatic, especially around cardiac safety, recovery, medications, genetics, and training.
- Do not hallucinate nutrition details that are not present.
- Only suggest health.md updates when the current section clearly lags reality.
- For suggested updates, return full replacement section content that starts with the correct markdown heading.

Current targeted health.md sections:
${JSON.stringify(snapshot.health_document.targeted_sections, null, 2)}

Combined health snapshot:
${JSON.stringify({
  health_document: {
    version: snapshot.health_document.version,
    updated_at: snapshot.health_document.updated_at,
    content: snapshot.health_document.content,
  },
  pending_updates: snapshot.pending_updates,
  medications: snapshot.medications,
  labs: snapshot.labs,
  hydration: snapshot.hydration,
  nutrition: snapshot.nutrition,
  genetics: snapshot.genetics,
  imaging: snapshot.imaging,
  recovery: snapshot.recovery,
  metrics: snapshot.metrics,
  training: snapshot.training,
}, null, 2)}

Return valid JSON only:
{
  "executive_summary": "2-4 paragraphs",
  "top_priorities": ["3-6 items"],
  "what_is_working": ["3-6 items"],
  "risks_to_watch": ["3-6 items"],
  "cross_domain_connections": ["3-6 items tying together labs/genetics/imaging/training/meds/recovery"],
  "doctor_conversation_topics": ["3-6 items"],
  "open_questions_for_user": ["0-5 short questions that would improve training or health recommendations"],
  "training_direction": {
    "overall_recommendation": "short paragraph",
    "best_next_block": "strength|endurance|hybrid|maintenance|cardiac_rehab",
    "rationale": ["3-5 items"],
    "guardrails": ["3-6 items"]
  },
  "suggested_health_doc_updates": [
    {
      "section_number": 1,
      "section_name": "Medical History",
      "reason": "why update is warranted",
      "confidence": "high",
      "priority": 1,
      "proposed_content": "## 1. Medical History\\n..."
    }
  ]
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user,
  });

  const parsed = parseJson(raw);
  const suggested = Array.isArray(parsed.suggested_health_doc_updates)
    ? parsed.suggested_health_doc_updates
    : [];

  parsed.suggested_health_doc_updates = suggested
    .map((update) => normalizeSuggestedUpdate(update))
    .filter((update): update is NormalizedSuggestedUpdate => Boolean(update))
    .map((update) => ({
      ...update,
      current_content: snapshot.health_document.targeted_sections[String(update.section_number)] || '',
    }));

  return parsed;
}

async function generateFollowUp(userId: string, snapshot: Snapshot, question: string) {
  const system = await buildAISystemPrompt(userId, 'general_health_query');
  const user = `You are answering a follow-up question based on the user's total health picture.

Question: ${question}

Combined health snapshot:
${JSON.stringify({
  medications: snapshot.medications,
  labs: snapshot.labs,
  hydration: snapshot.hydration,
  nutrition: snapshot.nutrition,
  genetics: snapshot.genetics,
  imaging: snapshot.imaging,
  recovery: snapshot.recovery,
  metrics: snapshot.metrics,
  training: snapshot.training,
}, null, 2)}

Return valid JSON only:
{
  "answer": "2-5 concise paragraphs",
  "recommended_plan": {
    "goal": "strength|endurance|hybrid|maintenance|cardiac_rehab",
    "weeks": 12,
    "sessions_per_week": 4,
    "focus_areas": ["array of short strings"],
    "why": "why this plan type matches the question and health picture"
  }
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user,
  });

  return parseJson(raw);
}

async function generatePlanIntake(userId: string, snapshot: Snapshot, input: Record<string, unknown>): Promise<PlanIntake> {
  const system = await buildAISystemPrompt(userId, 'general_health_query');
  const user = `Create a 12-week training-plan intake draft for a cardiac-aware endurance-priority hybrid block.

Known user preferences:
- Sunday is full recovery / off
- Thursday is the hard cardio / VO2 day
- Saturday is the long cardio day
- Strength days average 45 minutes
- Normal cardio days average 45-60 minutes
- Long cardio day averages 90 minutes
- Weight is a secondary outcome for now
- Strength output should stay framework-level, not exact exercise prescription
- User rotates treadmill, outdoor, and bike for cardio
- Strength/cardio split should reflect endurance priority and medical safety
- Recovery work should be explicit rather than implied when it materially supports adherence and readiness

Current command-center health snapshot:
${JSON.stringify(snapshot, null, 2)}

Optional intake context from client:
${JSON.stringify(input, null, 2)}

Return valid JSON only:
{
  "plan_name": "Name of the 12-week block",
  "goal": "endurance|hybrid|cardiac_rehab|maintenance",
  "primary_objective": "One sentence",
  "secondary_objectives": ["3-5 items"],
  "target_metrics": [
    {
      "metric": "Resting HR",
      "current": "Current estimated value",
      "target": "12-week target range",
      "why": "Why this matters"
    }
  ],
  "weekly_framework": [
    {
      "day_name": "Monday",
      "session_type": "Strength Day",
      "purpose": "Why this day exists",
      "duration_min": 45,
      "notes": "Any double-up or flexibility notes"
    }
  ],
  "day_type_guidance": [
    {
      "type": "Zone 2 Cardio",
      "description": "What this day is for",
      "intensity_guidance": "How hard it should feel",
      "duration_guidance": "Typical duration",
      "examples": ["Treadmill", "Outdoor", "Bike"]
    }
  ],
  "weekly_tracking": [
    "4-7 weekly metrics to track"
  ],
  "schedule_constraints": {
    "off_day": "Sunday",
    "hard_day": "Thursday",
    "long_day": "Saturday",
    "allow_double_day": true,
    "strength_days_per_week": 3,
    "cardio_days_per_week": 4,
    "strength_duration_min": 45,
    "normal_cardio_duration_min": "45-60",
    "long_cardio_duration_min": 90,
    "cardio_modes": ["Treadmill", "Outdoor", "Bike"],
    "notes": "Scheduling notes the downstream plan generator should honor"
  },
  "notes_for_generation": "Short paragraph the downstream plan generator should honor"
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user,
  });

  return parseJson(raw) as unknown as PlanIntake;
}

async function regeneratePlanIntakeField(
  userId: string,
  snapshot: Snapshot,
  field: string,
  currentIntake: Record<string, unknown>,
  input: Record<string, unknown>
) {
  const allowedFields = new Set(['target_metrics', 'weekly_framework', 'day_type_guidance', 'weekly_tracking', 'schedule_constraints']);
  if (!allowedFields.has(field)) {
    throw new Error('Unsupported intake field');
  }

  const system = await buildAISystemPrompt(userId, 'general_health_query');
  const user = `Update only one section of a saved training-plan intake draft.

Field to regenerate: ${field}

Current command-center health snapshot:
${JSON.stringify(snapshot, null, 2)}

Current intake draft:
${JSON.stringify(currentIntake, null, 2)}

Optional client context:
${JSON.stringify(input, null, 2)}

Rules:
- Honor the saved intake structure unless the field being regenerated clearly needs a better answer.
- Keep the plan cardiac-aware and endurance-priority.
- Respect user defaults: Sunday off, Thursday hard cardio, Saturday long cardio, 3 strength days, 4 cardio days, strength day 45 min, normal cardio 45-60 min, long cardio 90 min.
- Treat recovery work as a meaningful planning input, not an afterthought.
- Return valid JSON only, with this exact shape:
{
  "field": "${field}",
  "value": <replacement value for only that field>
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user,
  });

  const parsed = parseJson(raw);
  if (parsed.field !== field || parsed.value === undefined) {
    throw new Error(`AI returned invalid ${field} refresh format`);
  }

  return parsed.value;
}

async function queueSuggestedUpdates(userId: string, updates: unknown) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ ok: false, error: 'No suggested updates provided' }, { status: 400 });
  }

  const updater = new HealthDocUpdater(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const currentDoc = await updater.loadCurrentHealthDoc(userId);
  if (!currentDoc) {
    return NextResponse.json({ ok: false, error: 'Health document not initialized' }, { status: 404 });
  }

  const normalized = (updates as SuggestedUpdateInput[])
    .map((update) => normalizeSuggestedUpdate(update))
    .filter((update): update is NormalizedSuggestedUpdate => Boolean(update));

  if (normalized.length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid suggested updates provided' }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: existingRows } = await supabase
    .from('health_doc_pending_updates')
    .select('section_number')
    .eq('user_id', userId)
    .eq('status', 'pending');

  const existingSections = new Set((existingRows || []).map((row) => row.section_number));

  const toSave: SectionUpdate[] = normalized
    .filter((update) => !existingSections.has(update.section_number))
    .map((update) => ({
      section_number: update.section_number,
      section_name: update.section_name,
      current_content: updater.extractSection(currentDoc, update.section_number) || '',
      proposed_content: update.proposed_content,
      reason: update.reason,
      trigger: 'ai_recommendation',
      trigger_data: { source: 'health_command_center' },
      confidence: update.confidence,
      priority: update.priority,
    }));

  const ids = await updater.savePendingUpdates(userId, toSave);

  return NextResponse.json({
    ok: true,
    queued_count: ids.length,
    skipped_count: normalized.length - ids.length,
    update_ids: ids,
  });
}

function normalizeSuggestedUpdate(input: unknown): NormalizedSuggestedUpdate | null {
  if (!input || typeof input !== 'object') return null;
  const update = input as Record<string, unknown>;
  const sectionNumber = Number(update.section_number);
  const proposedContent = typeof update.proposed_content === 'string' ? update.proposed_content.trim() : '';
  const reason = typeof update.reason === 'string' ? update.reason.trim() : '';

  if (!Number.isInteger(sectionNumber) || !TARGET_SECTION_LABELS[sectionNumber] || !proposedContent || !reason) {
    return null;
  }

  const confidenceRaw = typeof update.confidence === 'string' ? update.confidence.toLowerCase() : 'medium';
  const confidence: Confidence =
    confidenceRaw === 'high' || confidenceRaw === 'low' || confidenceRaw === 'medium'
      ? confidenceRaw
      : 'medium';

  return {
    section_number: sectionNumber,
    section_name:
      typeof update.section_name === 'string' && update.section_name.trim().length > 0
        ? update.section_name.trim()
        : TARGET_SECTION_LABELS[sectionNumber],
    proposed_content: proposedContent,
    reason,
    confidence,
    priority: Math.max(1, Math.min(10, Number(update.priority) || 5)),
  };
}

function parseJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(match ? match[1] : trimmed);
}

function average(values: Array<number | null | undefined> | undefined) {
  const filtered = (values || []).filter((value): value is number => typeof value === 'number');
  if (filtered.length === 0) return null;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function fourteenDaysAgoIso() {
  const date = new Date();
  date.setDate(date.getDate() - 13);
  return date.toISOString().slice(0, 10);
}
