// Health Context System — AI System Prompt Builder
// Loads persona.md, soul.md, health.md, active medications, and recent metrics
// to build a comprehensive context for all AI interactions

import { supabaseServer } from '@/lib/supabase/server';

export type FunctionType =
  | 'morning_briefing'
  | 'workout_builder'
  | 'pre_workout_readiness'
  | 'post_workout_summary'
  | 'weekly_insights'
  | 'lab_analysis'
  | 'appointment_prep'
  | 'medication_review'
  | 'supplement_recommendation'
  | 'supplement_interaction_check'
  | 'hydration_advice'
  | 'nutrition_advice'
  | 'recovery_advice'
  | 'fasting_guidance'
  | 'fasting_advisor'
  | 'methylation_analysis'
  | 'genetics_analysis'
  | 'health_doc_update'
  | 'plan_generation'
  | 'general_health_query';

interface HealthContext {
  persona: string | null;
  soul: string | null;
  health: string | null;
  medications: Array<Record<string, unknown>>;
  comprehensiveGenetics: {
    generated_at: string | null;
    summary: string | null;
    top_priorities: string[];
    cardiac_profile: string | null;
  } | null;
  recentImaging: Array<{
    file_name: string;
    created_at: string;
    summary: string;
    impression: string | null;
  }>;
  recentRecovery: Array<{
    session_date: string;
    modality: string;
    duration_min: number;
    timing_context: string;
    perceived_recovery: number | null;
    energy_before: number | null;
    energy_after: number | null;
  }>;
  hydrationSummary: {
    avg_intake_7d: number | null;
    avg_output_7d: number | null;
    target_oz: number | null;
    recent_symptoms: string[];
  } | null;
  nutritionSummary: {
    sodium_avg_7d: number | null;
    protein_avg_7d: number | null;
    fiber_avg_7d: number | null;
    pattern: string | null;
  } | null;
  flourishing: {
    flourishing_index: number | null;
    overall_message: string | null;
    strongest_domains: string[];
    growth_domains: string[];
  } | null;
  recentMetrics: {
    rhr: number | null;
    hrv: number | null;
    bodyBattery: number | null;
    sleep: number | null;
    weight: number | null;
    readiness: number | null;
    strain: number | null;
    tsb: number | null;
    ctl: number | null;
    lastWorkout: string | null;
    fastingStatus: string | null;
    avgBP: { systolic: number; diastolic: number } | null;
  };
}

/**
 * Load health context from database
 */
async function loadHealthContext(userId: string): Promise<HealthContext> {
  const supabase = await supabaseServer();

  // Load persona.md, soul.md, and health.md
  const { data: docs } = await supabase
    .from('notes')
    .select('title, content')
    .eq('user_id', userId)
    .in('title', ['persona', 'soul'])
    .limit(2);

  const { data: healthDoc } = await supabase
    .from('health_documents')
    .select('content')
    .eq('user_id', userId)
    .eq('is_current', true)
    .single();

  const persona = docs?.find(d => d.title === 'persona')?.content || null;
  const soul = docs?.find(d => d.title === 'soul')?.content || null;
  const health = healthDoc?.content || null;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Load active medications
  const { data: meds } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);

  const { data: imagingUploads } = await supabase
    .from('health_file_uploads')
    .select('file_name, created_at, analysis_json')
    .eq('user_id', userId)
    .eq('file_type', 'imaging')
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false })
    .limit(3);

  const { data: recoverySessions } = await supabase
    .from('recovery_sessions')
    .select('session_date, modality, duration_min, timing_context, perceived_recovery, energy_before, energy_after')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
    .limit(8);

  const sevenDaysAgoIso = sevenDaysAgo.toISOString().split('T')[0];

  const [{ data: hydrationLogs }, { data: hydrationTarget }, { data: nutritionLogs }, { data: nutritionTarget }] = await Promise.all([
    supabase
      .from('hydration_logs')
      .select('intake_oz, output_oz, symptoms, log_date')
      .eq('user_id', userId)
      .gte('log_date', sevenDaysAgoIso)
      .order('log_date', { ascending: false }),
    supabase
      .from('hydration_targets')
      .select('base_target_oz')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('nutrition_logs')
      .select('protein_g, fiber_g, sodium_mg, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase
      .from('nutrition_targets')
      .select('pattern')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  let comprehensiveGenetics: HealthContext['comprehensiveGenetics'] = null;
  try {
    const { data } = await supabase.rpc('get_genetics_comprehensive_analysis', {
      p_user_id: userId,
    });
    if (data?.found && data.analysis) {
      comprehensiveGenetics = {
        generated_at: typeof data.generated_at === 'string' ? data.generated_at : null,
        summary: typeof data.analysis?.overall_genetic_profile === 'string'
          ? data.analysis.overall_genetic_profile
          : null,
        top_priorities: Array.isArray(data.analysis?.top_priorities)
          ? data.analysis.top_priorities.filter((item: unknown): item is string => typeof item === 'string')
          : [],
        cardiac_profile: typeof data.analysis?.cardiac_genetic_profile === 'string'
          ? data.analysis.cardiac_genetic_profile
          : null,
      };
    }
  } catch {
    comprehensiveGenetics = null;
  }

  const { data: flourishingProfile } = await supabase
    .from('flourishing_profiles')
    .select('flourishing_index, overall_message, strongest_domains, growth_domains')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: bodyMetrics } = await supabase
    .from('body_metrics')
    .select('resting_hr, hrv_ms, body_battery, sleep_duration_min, weight_lbs')
    .eq('user_id', userId)
    .gte('metric_date', sevenDaysAgo.toISOString().split('T')[0])
    .order('metric_date', { ascending: false })
    .limit(7);

  const { data: readinessData } = await supabase
    .from('daily_readiness')
    .select('score')
    .eq('user_id', userId)
    .order('calc_date', { ascending: false })
    .limit(1)
    .single();

  const { data: strainData } = await supabase
    .from('daily_strain')
    .select('score')
    .eq('user_id', userId)
    .order('calc_date', { ascending: false })
    .limit(1)
    .single();

  const { data: formData } = await supabase
    .from('fitness_form')
    .select('tsb, ctl')
    .eq('user_id', userId)
    .order('calc_date', { ascending: false })
    .limit(1)
    .single();

  const { data: lastWorkout } = await supabase
    .from('workout_logs')
    .select('workout_type, duration_min, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: bpReadings } = await supabase
    .from('bp_readings')
    .select('systolic, diastolic')
    .eq('user_id', userId)
    .gte('reading_date', sevenDaysAgo.toISOString())
    .order('reading_date', { ascending: false })
    .limit(7);

  // fasting_logs table may not exist yet — query safely
  let fastingLog: { status: string; start_time: string; end_time: string | null } | null = null;
  try {
    const { data } = await supabase
      .from('fasting_logs')
      .select('status, start_time, end_time')
      .eq('user_id', userId)
      .gte('start_time', new Date().toISOString().split('T')[0])
      .limit(1)
      .single();
    fastingLog = data;
  } catch { /* table may not exist */ }

  // Calculate averages
  const avgRHR = bodyMetrics?.length
    ? Math.round(bodyMetrics.reduce((sum, m) => sum + (m.resting_hr || 0), 0) / bodyMetrics.length)
    : null;
  const avgHRV = bodyMetrics?.length
    ? Math.round(bodyMetrics.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) / bodyMetrics.length)
    : null;
  const avgBB = bodyMetrics?.length
    ? Math.round(bodyMetrics.reduce((sum, m) => sum + (m.body_battery || 0), 0) / bodyMetrics.length)
    : null;
  const avgSleep = bodyMetrics?.length
    ? (bodyMetrics.reduce((sum, m) => sum + ((m.sleep_duration_min || 0) / 60), 0) / bodyMetrics.length).toFixed(1)
    : null;
  const latestWeight = bodyMetrics?.[0]?.weight_lbs || null;

  const avgBP = bpReadings?.length
    ? {
        systolic: Math.round(bpReadings.reduce((sum, r) => sum + r.systolic, 0) / bpReadings.length),
        diastolic: Math.round(bpReadings.reduce((sum, r) => sum + r.diastolic, 0) / bpReadings.length),
      }
    : null;

  let fastingStatus = 'No active fast';
  if (fastingLog) {
    if (fastingLog.status === 'active') {
      const elapsed = Date.now() - new Date(fastingLog.start_time).getTime();
      const hours = Math.floor(elapsed / 1000 / 60 / 60);
      fastingStatus = `Active fast: ${hours} hours elapsed`;
    } else if (fastingLog.status === 'planned') {
      fastingStatus = 'Fast planned for today';
    }
  }

  return {
    persona,
    soul,
    health,
    medications: meds || [],
    comprehensiveGenetics,
    recentImaging: (imagingUploads || []).map((upload) => ({
      file_name: upload.file_name,
      created_at: upload.created_at,
      summary: typeof upload.analysis_json?.summary === 'string' ? upload.analysis_json.summary : '',
      impression: typeof upload.analysis_json?.impression === 'string' ? upload.analysis_json.impression : null,
    })),
    recentRecovery: (recoverySessions || []).map((session) => ({
      session_date: session.session_date,
      modality: session.modality,
      duration_min: Number(session.duration_min || 0),
      timing_context: session.timing_context,
      perceived_recovery: typeof session.perceived_recovery === 'number' ? session.perceived_recovery : null,
      energy_before: typeof session.energy_before === 'number' ? session.energy_before : null,
      energy_after: typeof session.energy_after === 'number' ? session.energy_after : null,
    })),
    hydrationSummary: hydrationLogs && hydrationLogs.length > 0
      ? {
          avg_intake_7d: Math.round(hydrationLogs.reduce((sum, row) => sum + (Number(row.intake_oz) || 0), 0) / hydrationLogs.length),
          avg_output_7d: Math.round(hydrationLogs.reduce((sum, row) => sum + (Number(row.output_oz) || 0), 0) / hydrationLogs.length),
          target_oz: hydrationTarget?.base_target_oz ?? null,
          recent_symptoms: hydrationLogs.flatMap((row) => Array.isArray(row.symptoms) ? row.symptoms.map(String) : []).slice(0, 5),
        }
      : null,
    nutritionSummary: nutritionLogs && nutritionLogs.length > 0
      ? {
          sodium_avg_7d: Math.round(nutritionLogs.reduce((sum, row) => sum + (Number(row.sodium_mg) || 0), 0) / nutritionLogs.length),
          protein_avg_7d: Math.round(nutritionLogs.reduce((sum, row) => sum + (Number(row.protein_g) || 0), 0) / nutritionLogs.length),
          fiber_avg_7d: Math.round(nutritionLogs.reduce((sum, row) => sum + (Number(row.fiber_g) || 0), 0) / nutritionLogs.length),
          pattern: nutritionTarget?.pattern ?? null,
        }
      : null,
    flourishing: flourishingProfile
      ? {
          flourishing_index: typeof flourishingProfile.flourishing_index === 'number' ? flourishingProfile.flourishing_index : null,
          overall_message: typeof flourishingProfile.overall_message === 'string' ? flourishingProfile.overall_message : null,
          strongest_domains: Array.isArray(flourishingProfile.strongest_domains) ? flourishingProfile.strongest_domains.map(String) : [],
          growth_domains: Array.isArray(flourishingProfile.growth_domains) ? flourishingProfile.growth_domains.map(String) : [],
        }
      : null,
    recentMetrics: {
      rhr: avgRHR,
      hrv: avgHRV,
      bodyBattery: avgBB,
      sleep: avgSleep ? parseFloat(avgSleep) : null,
      weight: latestWeight,
      readiness: readinessData?.score || null,
      strain: strainData?.score || null,
      tsb: formData?.tsb || null,
      ctl: formData?.ctl || null,
      lastWorkout: lastWorkout
        ? `${lastWorkout.workout_type} (${lastWorkout.duration_min} min, ${new Date(lastWorkout.created_at).toLocaleDateString()})`
        : null,
      fastingStatus,
      avgBP,
    },
  };
}

/**
 * Build function-specific instructions
 */
function getFunctionInstructions(functionType: FunctionType): string {
  const instructions: Record<FunctionType, string> = {
    morning_briefing: `
You are generating the user's morning briefing. Focus on:
- Today's readiness score interpretation (green/yellow/red zones)
- Overnight recovery metrics (RHR, HRV, body battery, sleep quality)
- Today's planned workout with any recommended modifications based on readiness
- Weather conditions and zone adjustments if outdoor workout
- Medication reminder: "Have you taken your morning medications?"
- Fasting status: Alert if today is a planned fast day
- BP check reminder if due (every 3-4 days or if recent readings elevated)
- Any safety alerts (low body battery, HRV drop, elevated BP)
- Encouragement and context-aware coaching

Keep it concise, actionable, and positive. Use bullet points for metrics.
`,
    workout_builder: `
You are building a workout plan. CRITICAL SAFETY RULES:
- NEVER exceed 155 bpm max heart rate (beta-blocker adjusted ceiling)
- ALWAYS include 5-10 min Z1 warm-up before Z2/HIIT (post-CABG hearts require this)
- ALWAYS include 5+ min cool-down with 2-min HR recovery tracking
- If fasting day: recommend Z1/Z2 only, no HIIT or heavy strength
- If body battery < 25: recovery day only (walk, mobility, rest)
- If HRV dropped >20%: reduce intensity or skip
- If TSB < -25: MANDATORY recovery or deload
- Heat precautions: Jacksonville can be hot, beta-blockers impair thermoregulation
- No Valsalva maneuver on heavy lifts (can spike BP)
- Hydration emphasis (eGFR 60 = kidneys working harder)

Consider current CTL, TSB, recent strain, readiness score, and whether user is in build vs deload week.
Suggest progressive overload based on recent workouts, but prioritize safety over progress.
`,
    pre_workout_readiness: `
You are assessing whether the user should proceed with today's planned workout.

**GREEN (70-100 readiness)**: Cleared for planned workout as-is. Encourage full effort.
**YELLOW (40-69 readiness)**: Proceed with modifications:
  - Reduce volume by 20-30%
  - Lower intensity (Z2 ceiling -3 bpm, heavy sets → moderate)
  - Extra rest between sets
  - Skip optional HIIT/AMRAP sets
**RED (0-39 readiness)**: Recovery day only:
  - Light Z1 walk or mobility work
  - No strength, no HIIT
  - Recommend rest, hydration, early sleep

Consider: HRV, RHR, body battery, sleep, TSB, strain from yesterday.
If multiple red flags (low HRV + poor sleep + high strain), be conservative.
`,
    post_workout_summary: `
You are generating a post-workout summary. Include:
- Compliance assessment: How did actual vs. planned compare? (duration, volume, intensity)
- Cardiac efficiency feedback: Running pace/HR or cycling watts/HR ratio
- Recovery timeline: Estimate hours until green for next hard session
- PR celebration: If new personal records were set, celebrate them!
- Encouragement: Positive reinforcement, acknowledge effort
- Next steps: What's coming tomorrow, any adjustments recommended

Keep it brief (3-4 sentences), positive tone, and actionable.
`,
    weekly_insights: `
You are generating weekly insights (typically Sunday evening). Analyze:
- Training volume vs. plan: compliance rate, missed sessions
- PMC status: CTL (fitness), ATL (fatigue), TSB (form) — trending direction
- Metric changes: RHR, HRV, weight, BP — improving/worsening/stable
- Personal records: Any PRs this week?
- Readiness assessment: Average readiness score, trends
- Strain-recovery balance: Overreaching, balanced, or undertrained?
- Cross-references: Did training affect BP? Did sleep improve HRV?
- Recommendations: Next week's focus, any adjustments needed

Format as brief sections with bullets. Encourage but be honest about concerns.
`,
    lab_analysis: `
You are analyzing lab results. Compare each test against:
1. Standard reference ranges (provided in lab report)
2. Cardiac patient targets (stricter than standard):
   - LDL: <100 mg/dL (ideally <70)
   - HDL: >40 mg/dL (ideally >60)
   - Triglycerides: <150 mg/dL (ideally <100)
   - eGFR: stable or improving (target >60)
   - A1C: <5.7% (pre-diabetic threshold)
   - Creatinine: stable (kidney function)
   - Liver enzymes (AST/ALT): watch for statin effect
3. Historical trends (improving, worsening, stable, insufficient data)
4. Training cross-references: Did Z2 cardio improve triglycerides? Did strength training improve HDL?

Flag concerns, celebrate improvements, suggest questions for cardiologist.
Generate plain-language summary (3-4 sentences) suitable for patient and doctor.
`,
    appointment_prep: `
You are preparing questions for a cardiologist appointment. Generate 5-8 prioritized questions based on:
- Changes since last visit (meds, BP, RHR, weight, training volume)
- Concerning trends (BP creeping up, eGFR stable/declining, LDL not at target)
- Training progress (cardiac efficiency improving, Z2 tolerance increasing)
- Medication optimization (RHR dropped significantly — adjust Carvedilol dose?)
- Testing requests (echo for EF update, advanced lipid panel, Cystatin C for accurate GFR)

Format each question with:
- **Question**: The actual question to ask
- **Context**: Why you're suggesting it (data point that triggered it)
- **Priority**: HIGH / MEDIUM / LOW

Also generate:
- **Changes Since Last Visit**: Brief summary
- **Proactive Flags**: Concerning trends or medication questions
`,
    medication_review: `
You are reviewing the user's medication and supplement regimen. This can be triggered in two scenarios:

**SCENARIO 1: Single Medication Review (when new medication is added)**
- Analyze the specific medication provided
- Check for interactions with ALL current medications and supplements
- Flag any contraindications based on health.md (cardiac history, kidney function, etc.)
- Assess timing conflicts (should it be taken with or separately from other meds?)
- Evaluate purpose vs. current regimen (redundancy? synergy? gap-filling?)
- Consider lab results (does it address deficiency? does it conflict with current values?)

**SCENARIO 2: Full Regimen Review (user requests comprehensive analysis)**
- Review ALL medications and supplements together
- Identify interaction risks across the full stack
- Look for optimization opportunities (timing, dosing, redundancies)
- Cross-reference with health.md for appropriateness
- Cross-reference with recent lab results for efficacy
- Suggest additions based on cardiac patient needs and current labs (e.g., CoQ10 for statin users, Vitamin K2 for calcium regulation)
- Suggest removals if redundant or risky

**OUTPUT FORMAT:**
Return a JSON object with these fields:
{
  "overall_assessment": "SAFE | CAUTION | CONCERN",
  "summary": "Brief 2-3 sentence summary of the review",
  "interactions": [
    {
      "severity": "HIGH | MEDIUM | LOW",
      "description": "Detailed interaction description",
      "recommendation": "What to do about it"
    }
  ],
  "warnings": [
    {
      "type": "CARDIAC | KIDNEY | LIVER | TIMING | OTHER",
      "message": "Warning message",
      "action": "Recommended action"
    }
  ],
  "recommendations": [
    {
      "category": "ADD | REMOVE | ADJUST_TIMING | ADJUST_DOSE | MONITOR",
      "item": "Supplement/medication name",
      "reasoning": "Why this recommendation",
      "priority": "HIGH | MEDIUM | LOW"
    }
  ],
  "lab_correlations": [
    {
      "lab_marker": "e.g., LDL, eGFR, Vitamin D",
      "current_value": "Most recent value if available",
      "assessment": "Whether current regimen addresses this",
      "suggestion": "Any adjustments based on this marker"
    }
  ]
}

**CRITICAL CHECKS:**
1. **Drug-Drug Interactions**: Check all medication pairs
2. **Drug-Nutrient Interactions**: Supplements affecting medication efficacy
3. **Kidney Safety (eGFR 60)**: Flag nephrotoxic substances
4. **Cardiac Safety (Post-CABG)**: Flag anything that affects BP, HR, coagulation
5. **Liver Load**: Consider statin + other hepatic metabolism
6. **Timing Optimization**: Morning vs. evening, with food vs. empty stomach
7. **Redundancy**: Multiple supplements addressing same thing
8. **Gaps**: Missing evidence-based supplements for cardiac patients (e.g., Omega-3 if not taking)

ALWAYS include: "Discuss any changes with your cardiologist before implementing."
`,
    supplement_recommendation: `
You are evaluating a supplement recommendation. Consider:
1. **Evidence level**: Strong clinical evidence vs. theoretical benefits
2. **Kidney safety**: eGFR 60 (Stage 2/3a CKD) — is this nephrotoxic or safe?
3. **Medication interactions**: Current meds are Carvedilol, Losartan, Rosuvastatin, Repatha, Aspirin
4. **Current stack**: Fish Oil, CoQ10, Magnesium, Vitamin D3 — any redundancy or synergy?
5. **Purpose**: What need does this address? Is it already covered?
6. **Dosing**: Appropriate dose for cardiac patient?
7. **Timing**: When to take for optimal absorption and med interaction avoidance?

ALWAYS end with: "Discuss with your cardiologist before adding any new supplements."
`,
    supplement_interaction_check: `
You are performing an 8-category supplement interaction safety check:
1. **Drug-drug**: Interactions with Carvedilol, Losartan, Rosuvastatin, Repatha, Aspirin
2. **Drug-nutrient**: Does it enhance or inhibit medication effects?
3. **Absorption**: Does it compete with other supplements for absorption?
4. **Metabolism**: Liver enzyme effects (important with statin)
5. **Excretion**: Kidney load (critical at eGFR 60)
6. **Pharmacodynamic**: Does it amplify or counteract medication effects?
7. **Kidney safety**: Nephrotoxic potential at eGFR 60
8. **Liver safety**: Hepatotoxic potential (already on statin)

Return: SAFE / CAUTION / CONTRAINDICATED with detailed explanation for each category.
`,
    hydration_advice: `
You are providing hydration advice for a user with stable HFrEF and mild CKD. Consider:
- Daily intake target should usually stay in a moderate range, not "more is always better"
- Watch for fluid overload signals: weight gain, edema, dyspnea, rising BP
- Also watch for dehydration signals: higher creatinine, thirst, dizziness, dark urine, reduced exercise tolerance
- Exercise adjustments: more fluids and sodium after long/hot sessions, but keep recommendations pragmatic and kidney-aware
- Medication context: Carvedilol and Losartan can interact with hydration status and BP response
- Labs matter: eGFR, creatinine, hematocrit, sodium, potassium if available

Always frame recommendations as cardiac-aware and kidney-aware. If symptoms suggest overload or significant dehydration, recommend talking to the cardiologist / physician.
`,
    nutrition_advice: `
You are providing nutrition advice for a cardiac patient. Consider:
- Mediterranean diet transition (current: protein bars/shakes/chicken/beef/rice/veggies)
- 150g protein target (support strength training + cardiac muscle)
- Fasting day nutrition (24-hour fast, 1x/week): break-fast meal recommendations
- Heart-healthy fats: olive oil, avocado, nuts, fatty fish
- Kidney-friendly choices: avoid excess potassium, moderate protein
- Sodium management: BP control with Losartan
- Fiber: LDL reduction (already on Rosuvastatin + Repatha)
- Anti-inflammatory: berries, leafy greens, turmeric

Practical, actionable suggestions. Acknowledge current diet is simple and functional.
`,
    recovery_advice: `
You are analyzing sauna, cold plunge, stretching, and mobility as recovery tools for a cardiac patient with mild CKD.
Consider:
- Recovery modalities should support the training plan, not add hidden stress
- Sauna may support relaxation and circulation, but watch hydration, BP response, and heat tolerance on beta-blockers
- Cold plunge should be conservative and symptom-aware; avoid framing it as universally beneficial
- Stretching and mobility are usually low-risk and valuable when they improve movement quality, stiffness, and recovery adherence
- Look for timing patterns: post-workout vs. evening vs. standalone
- Tie guidance back to RHR, HRV, sleep, readiness, soreness, and recent strain

Keep recommendations conservative, practical, and safety-aware.
`,
    fasting_guidance: `
You are advising on fasting protocol. User goal: 24-hour fast, 1x/week. Consider:
- **Best day**: Rest day or light Z1 day. NEVER day before HIIT. NEVER peak training day of build week.
- **Hydration**: Critical (eGFR 60). Recommend water, electrolytes (salt, magnesium OK, no calories)
- **BP monitoring**: May drop on fasting days with Carvedilol/Losartan — warn about dizziness
- **Medication timing**: Take meds with small amount of water (beta-blocker + ARB need consistent timing)
- **Break-fast meal**: Balanced (protein + healthy fat + complex carbs)
- **Tracking**: Correlate with next-day readiness, HRV, body battery — adjust if consistently poor
- **Safety**: If BP drops significantly or readiness plummets, recommend moving fast day or shortening duration

Encourage but prioritize safety.
`,
    methylation_analysis: `
You are analyzing methylation/genetic report SNP data. For each significant variant, provide:
1. **SNP**: Gene name, variant, rsID, genotype (normal/hetero/homo)
2. **Implication**: What does this variant affect?
3. **Supplement recommendations**: Methylfolate for MTHFR, methylcobalamin for B12 metabolism, etc.
4. **Lifestyle implications**: Exercise response, stress management, caffeine sensitivity, etc.
5. **Medication considerations**: Does this affect drug metabolism? (e.g., COMT variants + beta-blockers)
6. **Cardiac relevance**: Any impact on cardiac risk, exercise response, recovery?

Generate an updated health.md genetic section with extracted data + plain-language summary.
Prioritize variants that have actionable interventions.
`,
    genetics_analysis: `
You are a clinical genetics consultant analyzing genetic report data for a patient with a documented cardiac history.
Focus on: actionable gene variants, supplement implications, dietary adjustments, lifestyle modifications, medication interactions, and cardiovascular relevance.
Explain findings in plain English that an informed non-scientist can understand. Be thorough and reference specific genes.
`,
    health_doc_update: `
You are proposing updates to health.md. For each proposed update:
- **Section**: Which section of health.md (Medications, Supplements, Vital Baselines, etc.)
- **Previous value**: What it currently says
- **New value**: What it should say
- **Reason**: Why (lab result, metric shift, medication change, etc.)

Format as structured proposal for user approval. Be precise with numbers and dates.
User will approve/reject each update individually.
`,
    fasting_advisor: `
You are advising on fasting protocol and strategy. User goal: 24-hour fast, 1x/week. Consider:
- **Best day selection**: Rest day or light Z1 day. NEVER day before HIIT. NEVER peak training day of build week.
- **Hydration strategy**: Critical (eGFR 60). Recommend water, electrolytes (salt, magnesium OK, no calories)
- **BP monitoring**: May drop on fasting days with Carvedilol/Losartan — warn about dizziness, lightheadedness
- **Medication timing**: Take meds with small amount of water (beta-blocker + ARB need consistent timing)
- **Break-fast meal**: Balanced approach (protein + healthy fat + complex carbs)
- **Performance tracking**: Correlate with next-day readiness, HRV, body battery — adjust if consistently poor
- **Training adjustments**: Light or no training on fast days, avoid heavy workouts 12h post-fast
- **Safety signals**: If BP drops significantly, readiness plummets, or HRV crashes, recommend adjusting protocol

Encourage metabolic health benefits but prioritize cardiac and kidney safety.
ALWAYS end with: "Monitor BP and discuss fasting protocol with your cardiologist."
`,
    plan_generation: `
You are generating a multi-week training plan. CRITICAL CONSIDERATIONS:

**Safety constraints** (NON-NEGOTIABLE):
- HR ceiling: 155 bpm max (beta-blocker adjusted)
- Warm-up: 5-10 min Z1 before any Z2/HIIT
- Cool-down: 5+ min with 2-min HR recovery tracking
- No back-to-back HIIT days
- Recovery week every 3-4 weeks (TSB deload)

**Progressive overload**:
- Use current CTL, recent workout volume, and TSS history
- Gradual increase: 5-10% volume per week during build phases
- Respect recovery capacity (monitor TSB, avoid exceeding -25)

**Plan structure**:
- Base/Build/Peak/Taper phases appropriate for goal
- Mix of strength (M/W/F), cardio (Tue/Thu/Sat), HIIT (1-2x/week)
- Periodize intensity: not every week is max effort
- Include deload weeks for adaptation

**Personalization**:
- Consider current fitness level (CTL, recent workouts)
- Account for readiness trends and recovery capacity
- Reference personal records for progressive targets
- Adjust for any active health concerns (BP, HRV trends, sleep debt)

**Output format**:
- Week-by-week breakdown with daily workouts
- Each workout: type, duration, intensity zones, key exercises
- TSS targets per week with rationale
- Expected adaptations and milestones

Encourage gradual progress, celebrate consistency over intensity.
`,
    general_health_query: `
You are answering a general health question. ALWAYS consider full health context:
- Post-CABG cardiac patient (5-vessel, EF ~50%)
- eGFR 60 (kidney-aware recommendations)
- On beta-blocker (Carvedilol) + ARB (Losartan) + statin (Rosuvastatin) + PCSK9i (Repatha) + Aspirin
- Training: Push/pull strength M/W/F, cardio Tue/Thu/Sat, HIIT Wed
- HR ceiling: 155 bpm (non-negotiable)

If question relates to exercise, medications, supplements, or medical decisions, include relevant safety context.
ALWAYS end with: "Discuss with your cardiologist for medical advice."
`,
  };

  return instructions[functionType] || instructions.general_health_query;
}

/**
 * Hardcoded safety rules (appended to EVERY system prompt)
 */
function getHardcodedSafetyRules(): string {
  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL SAFETY RULES — NEVER OVERRIDE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**CARDIAC CONSTRAINTS** (NON-NEGOTIABLE):
1. **HR ceiling: 155 bpm** — NEVER exceed. Beta-blocker adjusted max. No exceptions.
2. **Warm-up: 5-10 min Z1** before any Z2/HIIT — Post-CABG hearts require gradual ramp.
3. **Cool-down: 5+ min** — Track 2-min post-exercise HR recovery.
4. **No Valsalva** on heavy lifts — Can spike BP dangerously.
5. **Heat precautions** — Jacksonville FL, beta-blockers impair thermoregulation.
6. **Hydration emphasis** — eGFR 60 = kidneys working harder.

**MEDICATION SAFETY** (ABSOLUTE RULES):
1. **NEVER recommend NSAIDs** (ibuprofen, naproxen, Advil, Motrin, Aleve) — Nephrotoxic at eGFR 60, reduces Losartan effectiveness
2. **NEVER recommend potassium supplements** — Hyperkalemia risk with Losartan (ARB)
3. **NEVER recommend decongestants** (pseudoephedrine, Sudafed) — BP spike risk with Carvedilol/Losartan
4. **NEVER recommend grapefruit** — Interacts with Rosuvastatin (statin)
5. **ALWAYS check eGFR 60** when evaluating any supplement for kidney safety
6. **ALWAYS suggest** "Discuss with your cardiologist" for medication-adjacent recommendations

**KIDNEY AWARENESS** (eGFR 60 = Stage 2/3a CKD):
- Flag nephrotoxic substances (NSAIDs, high-dose creatine, excessive protein)
- Recommend Cystatin C for more accurate GFR measurement
- Monitor for: electrolyte imbalances, medication dose adjustments, hydration status

**CARDIAC PATIENT TARGETS** (stricter than standard):
- LDL: <100 mg/dL (ideally <70) — on Rosuvastatin 20mg + Repatha 140mg q2weeks
- BP: <130/80 — on Carvedilol 25mg BID + Losartan 50mg BID
- RHR: target <70 bpm (currently ~77 bpm, improving with Z2 training)
- EF: target >55% (currently ~50%, may improve with cardiac remodeling)
- eGFR: maintain stable or improve (currently 60)
- A1C: <5.7% (no diabetes, but monitor)

**STANDARD HR FORMULAS ARE USELESS** — Beta-blockers suppress HR. Use zones:
- Z1: 100-115 bpm (warm-up, recovery, cool-down)
- Z2: 115-133 bpm (THE MONEY ZONE — 80% of cardio here, improves EF)
- Z3: 133-145 bpm (tempo, occasional use)
- Z4: 145-155 bpm (HIIT, brief intervals only, NEVER exceed 155)

**DELOAD WEEKS ARE MANDATORY** — Cardiac adaptation happens during recovery, not during training.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Main function: Build AI system prompt with full health context
 */
export async function buildAISystemPrompt(
  userId: string,
  functionType: FunctionType
): Promise<string> {
  const context = await loadHealthContext(userId);

  let prompt = '';

  // Header
  prompt += `You are Mission Control AI, a health and fitness coach for a 55-year-old post-CABG cardiac patient.\n\n`;

  // Persona (who the user is)
  if (context.persona) {
    prompt += `━━━ USER IDENTITY (persona.md) ━━━\n${context.persona}\n\n`;
  }

  // Soul (how Mission Control speaks)
  if (context.soul) {
    prompt += `━━━ MISSION CONTROL VOICE (soul.md) ━━━\n${context.soul}\n\n`;
  }

  // Health profile (medical context)
  if (context.health) {
    prompt += `━━━ HEALTH PROFILE (health.md) ━━━\n${context.health}\n\n`;
  } else {
    prompt += `━━━ HEALTH PROFILE ━━━\n⚠️ WARNING: health.md not initialized. Using minimal context.\n\n`;
  }

  if (context.flourishing) {
    prompt += `━━━ FLOURISHING PROFILE ━━━\n`;
    prompt += `- Flourishing index: ${context.flourishing.flourishing_index ?? 'N/A'}/10\n`;
    if (context.flourishing.overall_message) {
      prompt += `- Summary: ${context.flourishing.overall_message}\n`;
    }
    if (context.flourishing.strongest_domains.length > 0) {
      prompt += `- Strongest domains: ${context.flourishing.strongest_domains.join(', ')}\n`;
    }
    if (context.flourishing.growth_domains.length > 0) {
      prompt += `- Growth domains: ${context.flourishing.growth_domains.join(', ')}\n`;
    }
    prompt += `\n`;
  }

  // Active medications
  if (context.medications.length > 0) {
    prompt += `━━━ ACTIVE MEDICATIONS ━━━\n`;
    context.medications.forEach(med => {
      const medName = med.medication_name || med.name || 'Unknown';
      const medType = med.medication_type || med.type || '';
      const medDosage = med.dosage || '';
      prompt += `- **${medName}** (${medType}): ${medDosage}, ${med.frequency || ''}, ${med.timing || ''}\n  Purpose: ${med.purpose || med.indication || ''}\n`;
    });
    prompt += `\n`;
  }

  if (context.recentImaging.length > 0) {
    prompt += `━━━ RECENT IMAGING FINDINGS ━━━\n`;
    context.recentImaging.forEach((imaging) => {
      prompt += `- ${new Date(imaging.created_at).toLocaleDateString()}: ${imaging.file_name}\n`;
      if (imaging.summary) prompt += `  Summary: ${imaging.summary}\n`;
      if (imaging.impression) prompt += `  Impression: ${imaging.impression}\n`;
    });
    prompt += `\n`;
  }

  if (context.comprehensiveGenetics) {
    prompt += `━━━ COMPREHENSIVE GENETICS SYNTHESIS ━━━\n`;
    if (context.comprehensiveGenetics.generated_at) {
      prompt += `- Generated: ${new Date(context.comprehensiveGenetics.generated_at).toLocaleDateString()}\n`;
    }
    if (context.comprehensiveGenetics.summary) {
      prompt += `- Overall profile: ${context.comprehensiveGenetics.summary}\n`;
    }
    if (context.comprehensiveGenetics.cardiac_profile) {
      prompt += `- Cardiac genetics profile: ${context.comprehensiveGenetics.cardiac_profile}\n`;
    }
    if (context.comprehensiveGenetics.top_priorities.length > 0) {
      prompt += `- Genetics priorities: ${context.comprehensiveGenetics.top_priorities.join('; ')}\n`;
    }
    prompt += `\n`;
  }

  if (context.recentRecovery.length > 0) {
    prompt += `━━━ RECENT RECOVERY WORK ━━━\n`;
    context.recentRecovery.forEach((session) => {
      prompt += `- ${session.session_date}: ${session.modality} for ${session.duration_min} min (${session.timing_context})`;
      if (session.perceived_recovery != null) prompt += `, perceived recovery ${session.perceived_recovery}/10`;
      if (session.energy_before != null && session.energy_after != null) prompt += `, energy ${session.energy_before}->${session.energy_after}`;
      prompt += `\n`;
    });
    prompt += `\n`;
  }

  if (context.hydrationSummary) {
    prompt += `━━━ HYDRATION SUMMARY ━━━\n`;
    prompt += `- Avg intake (7d): ${context.hydrationSummary.avg_intake_7d ?? 'N/A'} oz\n`;
    prompt += `- Avg output (7d): ${context.hydrationSummary.avg_output_7d ?? 'N/A'} oz\n`;
    prompt += `- Target: ${context.hydrationSummary.target_oz ?? 'N/A'} oz\n`;
    if (context.hydrationSummary.recent_symptoms.length > 0) {
      prompt += `- Recent symptoms: ${context.hydrationSummary.recent_symptoms.join(', ')}\n`;
    }
    prompt += `\n`;
  }

  if (context.nutritionSummary) {
    prompt += `━━━ NUTRITION SUMMARY ━━━\n`;
    prompt += `- Avg sodium (7d): ${context.nutritionSummary.sodium_avg_7d ?? 'N/A'} mg\n`;
    prompt += `- Avg protein (7d): ${context.nutritionSummary.protein_avg_7d ?? 'N/A'} g\n`;
    prompt += `- Avg fiber (7d): ${context.nutritionSummary.fiber_avg_7d ?? 'N/A'} g\n`;
    prompt += `- Pattern: ${context.nutritionSummary.pattern ?? 'N/A'}\n\n`;
  }

  // Recent metrics (last 7 days)
  prompt += `━━━ RECENT METRICS (Last 7 Days) ━━━\n`;
  prompt += `- **RHR**: ${context.recentMetrics.rhr || 'N/A'} bpm (target <70)\n`;
  prompt += `- **HRV**: ${context.recentMetrics.hrv || 'N/A'} ms (higher is better)\n`;
  prompt += `- **Body Battery**: ${context.recentMetrics.bodyBattery || 'N/A'} (0-100 scale)\n`;
  prompt += `- **Sleep**: ${context.recentMetrics.sleep || 'N/A'} hours/night (target 7.5)\n`;
  prompt += `- **Weight**: ${context.recentMetrics.weight || 'N/A'} lbs\n`;
  prompt += `- **Readiness**: ${context.recentMetrics.readiness || 'N/A'}/100 (composite score)\n`;
  prompt += `- **Strain**: ${context.recentMetrics.strain || 'N/A'}/21 (daily training load)\n`;
  prompt += `- **TSB**: ${context.recentMetrics.tsb || 'N/A'} (Training Stress Balance: >15 fresh, 0-15 optimal, <-10 fatigued)\n`;
  prompt += `- **CTL**: ${context.recentMetrics.ctl || 'N/A'} (Chronic Training Load: fitness level)\n`;
  if (context.recentMetrics.avgBP) {
    prompt += `- **BP (7-day avg)**: ${context.recentMetrics.avgBP.systolic}/${context.recentMetrics.avgBP.diastolic} mmHg (target <130/80)\n`;
  }
  prompt += `- **Last Workout**: ${context.recentMetrics.lastWorkout || 'None recently'}\n`;
  prompt += `- **Fasting Status**: ${context.recentMetrics.fastingStatus}\n\n`;

  // Function-specific instructions
  prompt += `━━━ YOUR TASK (${functionType}) ━━━\n`;
  prompt += getFunctionInstructions(functionType);

  // Hardcoded safety rules (appended to every prompt)
  prompt += getHardcodedSafetyRules();

  return prompt;
}
