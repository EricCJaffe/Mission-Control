// ============================================================
// Fitness AI Service Layer
// Wraps callOpenAI with fitness-specific prompts and context
// NOW INTEGRATED WITH HEALTH CONTEXT SYSTEM (health.md)
// ============================================================

import { callOpenAI } from '@/lib/openai';
import { buildAISystemPrompt, type FunctionType } from './health-context';
import type {
  WorkoutTemplate,
  BodyMetrics,
  FitnessForm,
  BPReading,
  AthleteProfile,
  SleepDebt,
  ReadinessResult,
  SuggestedQuestion,
  ChangeSinceLastVisit,
  Medication,
} from './types';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

// USER ID CONTEXT (set by calling code)
let currentUserId: string | null = null;
export function setAIUserId(userId: string) {
  currentUserId = userId;
}
export function getAIUserId(): string | null {
  return currentUserId;
}

const DEFAULT_MAX_HR = 155;

/** Extended context for AI system prompt */
export type AIContext = Partial<BodyMetrics & FitnessForm> & {
  profile?: Partial<AthleteProfile>;
  bp_readings?: Partial<BPReading>[];
  sleep_debt?: SleepDebt;
  readiness?: ReadinessResult;
  meds_taken_at?: string | null;
};

/** Build the standard athlete system prompt with current metrics. */
export function buildSystemPrompt(ctx?: AIContext): string {
  const maxHr = ctx?.profile?.max_hr_ceiling ?? DEFAULT_MAX_HR;
  const lthr = ctx?.profile?.lactate_threshold_hr ?? 140;
  const zones = ctx?.profile?.hr_zones;
  const z1 = zones?.z1 ?? [100, 115];
  const z2 = zones?.z2 ?? [115, 133];
  const z3 = zones?.z3 ?? [133, 145];
  const z4 = zones?.z4 ?? [145, maxHr];

  let prompt = `You are an AI fitness coach integrated into a personal training dashboard for a cardiac patient.

ATHLETE PROFILE:
- Age: 55, approx. weight: 184 lbs
- Medical: CABG surgery (2022), on Carvedilol (beta-blocker) and Losartan (ACE inhibitor)
- Working max HR: ${maxHr} bpm — HARD CEILING, never program above this
- HR Zones (beta-blocker adjusted):
  Z1 Recovery:     ${z1[0]}–${z1[1]} bpm
  Z2 Aerobic Base: ${z2[0]}–${z2[1]} bpm
  Z3 Tempo:        ${z3[0]}–${z3[1]} bpm
  Z4 HIIT:         ${z4[0]}–${z4[1]} bpm
- Lactate threshold HR estimate: ${lthr} bpm
- Beta-blocker multiplier: ${ctx?.profile?.beta_blocker_multiplier ?? 1.15}x (same HR = more effort)
- Training: Push/Pull strength split Mon/Wed/Fri, Z2 cardio Tue/Thu/Sat, HIIT on Wed

CURRENT STATUS:
- Resting HR: ${ctx?.resting_hr ?? 'unknown'} bpm (target: <70)
- HRV: ${ctx?.hrv_ms ?? 'unknown'} ms
- Body Battery: ${ctx?.body_battery ?? 'unknown'}/100
- Form/TSB: ${ctx?.form_tsb != null ? Math.round(ctx.form_tsb) : 'unknown'} (${ctx?.form_status ?? 'unknown'})
- Sleep score: ${ctx?.sleep_score ?? 'unknown'}/100
- Training readiness: ${ctx?.training_readiness ?? 'unknown'}/100`;

  // Readiness score context
  if (ctx?.readiness) {
    prompt += `\n- Readiness score: ${ctx.readiness.score}/100 (${ctx.readiness.label})`;
  }

  // Sleep debt context
  if (ctx?.sleep_debt) {
    const balance = ctx.sleep_debt.rolling_7day_balance_min;
    const hours = Math.abs(balance / 60).toFixed(1);
    prompt += `\n- Sleep debt: ${balance >= 0 ? '+' : '-'}${hours}h this week (${ctx.sleep_debt.status})`;
  }

  // Medication timing context
  if (ctx?.meds_taken_at) {
    prompt += `\n- Carvedilol taken at: ${ctx.meds_taken_at} (HR suppression peaks 1-2h after dosing)`;
  }

  // Blood pressure context
  if (ctx?.bp_readings && ctx.bp_readings.length > 0) {
    const latest = ctx.bp_readings[0];
    prompt += `\n\nBLOOD PRESSURE:`;
    prompt += `\n- Latest: ${latest.systolic}/${latest.diastolic} mmHg`;
    if (latest.pulse) prompt += ` (pulse ${latest.pulse})`;
    if (latest.pre_or_post_meds) prompt += ` — ${latest.pre_or_post_meds.replace('_', ' ')}`;
    if (ctx.bp_readings.length >= 3) {
      const avg_sys = Math.round(ctx.bp_readings.reduce((s, r) => s + (r.systolic ?? 0), 0) / ctx.bp_readings.length);
      const avg_dia = Math.round(ctx.bp_readings.reduce((s, r) => s + (r.diastolic ?? 0), 0) / ctx.bp_readings.length);
      prompt += `\n- Recent average (${ctx.bp_readings.length} readings): ${avg_sys}/${avg_dia}`;
    }
    prompt += `\n- Correlate BP with training load: elevated BP + high TSS → reduce intensity`;
    prompt += `\n- Post-workout BP should decrease from baseline (if it rises, flag concern)`;
  }

  // FTP context for cycling
  if (ctx?.profile?.ftp_watts) {
    prompt += `\n\nCYCLING:
- FTP: ${ctx.profile.ftp_watts}W
- Power zones are more accurate than HR for cycling (no cardiac lag)`;
  }

  prompt += `

SAFETY RULES (non-negotiable):
1. NEVER prescribe or exceed ${maxHr} bpm
2. Body battery < 25 → recovery only (Z1 walk or rest), no intensity
3. TSB < -10 → reduce planned volume by 20-30%
4. TSB < -25 → mandatory rest, flag critical overreaching
5. Always include 5-10 min Z1 warm-up before any Z2 or higher intensity (cardiac surgery patients need longer warm-ups)
6. Always include 5 min cool-down; prompt for 2-min post-workout HR recovery reading
7. Flag any concerning metric trends immediately
8. If sleep debt > 2h or readiness < 40, recommend recovery-only or rest
9. Beta-blocker timing matters: HR is most suppressed 1-2h post-dose — if workout is in that window, RPE may be more reliable than HR`;

  return prompt;
}

/**
 * Generate a progressive workout suggestion based on an existing template and recent history.
 */
export async function generateProgressiveWorkout(params: {
  template: WorkoutTemplate;
  recentLogs: Array<{ exercise_name: string; sets: Array<{ weight_lbs: number; reps: number; set_type: string }> }>;
  metrics?: AIContext;
}): Promise<WorkoutTemplate> {
  const { template, recentLogs, metrics } = params;

  const system = buildSystemPrompt(metrics);
  const user = `Based on the following workout template and recent performance, suggest progressive overload for today's workout.

TEMPLATE: ${template.name} (${template.type} / ${template.split_type ?? 'general'})
STRUCTURE: ${JSON.stringify(template.structure, null, 2)}

RECENT PERFORMANCE (last session):
${JSON.stringify(recentLogs, null, 2)}

Return the modified workout structure as valid JSON matching the original structure format.
Apply progressive overload where appropriate (small weight increases or rep increases).
If body battery or form metrics suggest fatigue, reduce volume instead of increasing it.
Return ONLY the JSON structure, no commentary.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    const structure = JSON.parse(result);
    return { ...template, structure, ai_generated: true };
  } catch {
    // If parsing fails, return original template unchanged
    return template;
  }
}

/**
 * Generate a workout from natural language input.
 * Enhanced to support multiple exercises and supersets in one description.
 */
export async function generateNaturalLanguageWorkout(params: {
  prompt: string;
  exerciseLibrary: Array<{ id: string; name: string; category: string; muscle_groups: string[] }>;
  metrics?: AIContext;
}): Promise<Partial<WorkoutTemplate>> {
  const { prompt, exerciseLibrary, metrics } = params;

  console.log('[AI Workout Parser] Input description:', prompt);
  console.log('[AI Workout Parser] Exercise library size:', exerciseLibrary.length);
  console.log('[AI Workout Parser] First 5 exercises:', exerciseLibrary.slice(0, 5).map(e => e.name));

  const system = buildSystemPrompt(metrics);
  const user = `You are a workout parser. Convert the following workout description into structured JSON.

WORKOUT DESCRIPTION: "${prompt}"

EXERCISE LIBRARY (match exercises to these IDs):
${exerciseLibrary.map(e => `- "${e.name}" → id: ${e.id}`).join('\n')}

PARSING INSTRUCTIONS:

1. EXERCISE MATCHING:
   - Match each mentioned exercise to its ID in the library (case-insensitive, partial match OK)
   - Examples: "bench press" matches "Barbell Bench Press", "squat" matches "Barbell Back Squat"
   - If no match found in library, add the exercise name to "unmatched_exercises"

2. SET NOTATION:
   - "5x5 at 225lbs" = 5 sets × 5 reps @ 225lbs (all type: "working")
   - "3x10" = 3 sets × 10 reps (all type: "working")
   - "2 warm-up sets at 95lbs" = 2 sets type: "warmup" @ 95lbs
   - "3 working sets at 135lbs" = 3 sets type: "working" @ 135lbs
   - "1 drop set at 100lbs" = 1 set type: "drop" @ 100lbs

3. SUPERSETS:
   - "superset: pull-ups 3x10, rows 3x10 at 95lbs" → type: "superset" with 2 exercises, 3 rounds
   - Each exercise in superset gets target_reps and target_weight

4. OUTPUT RULES:
   - ONLY include exercises explicitly mentioned
   - Keep exercises in the order they appear
   - DO NOT add warmups, cooldowns, or stretching unless mentioned
   - Each standalone exercise becomes one structure item
   - Each superset becomes one structure item with multiple exercises

EXAMPLE INPUT: "bench press 2 warm-up sets at 95lbs, 3 working sets at 135lbs"
EXAMPLE OUTPUT:
{
  "structure": [{
    "type": "standalone",
    "exercise_id": "<bench-press-id>",
    "sets": [
      {"type": "warmup", "target_reps": 10, "target_weight": 95},
      {"type": "warmup", "target_reps": 10, "target_weight": 95},
      {"type": "working", "target_reps": 8, "target_weight": 135},
      {"type": "working", "target_reps": 8, "target_weight": 135},
      {"type": "working", "target_reps": 8, "target_weight": 135}
    ]
  }]
}

Return valid JSON with this structure:
{
  "name": "workout name",
  "type": "strength|cardio|hiit|hybrid",
  "split_type": "push|pull|z2|hiit|etc",
  "estimated_duration_min": 45,
  "structure": [
    {
      "type": "standalone",
      "exercise_id": "<id from library>",
      "sets": [
        {"type": "warmup", "target_reps": 12, "target_weight": 95},
        {"type": "working", "target_reps": 5, "target_weight": 185}
      ]
    },
    {
      "type": "superset",
      "group_name": "Pull Superset",
      "rounds": 3,
      "exercises": [
        {"exercise_id": "<id from library>", "target_reps": 10, "target_weight": 0},
        {"exercise_id": "<id from library>", "target_reps": 10, "target_weight": 95}
      ],
      "rest_between_exercises": 30,
      "rest_between_rounds": 120
    }
  ],
  "unmatched_exercises": ["exercise names not found in library"]
}

Parse the workout description above and return ONLY the JSON structure. No explanation needed.`;

  console.log('[AI Workout Parser] Calling OpenAI with model:', DEFAULT_MODEL);
  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });
  console.log('[AI Workout Parser] Raw AI response:', result.substring(0, 500));

  try {
    // Strip markdown code fences if present
    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);
    console.log('[AI Workout Parser] Successfully parsed:', JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (error) {
    console.error('[AI Workout Parser] Failed to parse AI response:', result);
    console.error('[AI Workout Parser] Parse error:', error);
    return {
      name: 'AI Generated Workout',
      type: 'strength',
      structure: [],
      estimated_duration_min: 45,
      unmatched_exercises: [],
    };
  }
}

/**
 * Generate a post-workout AI summary.
 */
export async function generateWorkoutSummary(params: {
  workout_type: string;
  duration_minutes: number | null;
  rpe_session: number | null;
  tss: number | null;
  compliance_pct: number | null;
  cardio?: { avg_hr: number | null; time_in_zone2_min: number | null; z2_drift_duration_min: number | null; max_hr: number | null };
  set_count?: number;
  pr_count?: number;
  notes?: string | null;
}): Promise<string> {
  const system = buildSystemPrompt();
  const user = `Generate a concise 2-3 sentence post-workout summary for the following session.
Be specific about what went well, any concerns (HR ceiling, zone distribution), and one actionable note for next time.
Keep it encouraging but honest. Write in second person ("You...").

Session data:
${JSON.stringify(params, null, 2)}`;

  return await callOpenAI({ model: DEFAULT_MODEL, system, user });
}

/**
 * Generate weekly AI insights (called Sunday evening).
 */
export async function generateWeeklyInsights(params: {
  week_start: string;
  week_end: string;
  workout_logs: Array<{ date: string; type: string; duration_minutes: number | null; tss: number | null; compliance_color: string | null }>;
  planned_count: number;
  completed_count: number;
  avg_rhr?: number | null;
  avg_hrv?: number | null;
  current_weight?: number | null;
  tsb_end_of_week?: number | null;
  prs_this_week?: string[];
  bp_readings?: Array<{ systolic: number; diastolic: number; reading_date: string; pre_or_post_meds?: string | null }>;
  avg_readiness?: number | null;
  sleep_debt_7day_min?: number | null;
  cardiac_efficiency_trend?: { start: number; end: number; type: string } | null;
}): Promise<Array<{ title: string; content: string; priority: string; insight_type: string }>> {
  const system = buildSystemPrompt();

  let bpContext = '';
  if (params.bp_readings && params.bp_readings.length > 0) {
    const avgSys = Math.round(params.bp_readings.reduce((s, r) => s + r.systolic, 0) / params.bp_readings.length);
    const avgDia = Math.round(params.bp_readings.reduce((s, r) => s + r.diastolic, 0) / params.bp_readings.length);
    bpContext = `\n\nBLOOD PRESSURE THIS WEEK:
- ${params.bp_readings.length} readings, avg ${avgSys}/${avgDia}
- Correlate with training load and medication timing`;
  }

  let readinessContext = '';
  if (params.avg_readiness != null) readinessContext += `\n- Average readiness: ${params.avg_readiness}/100`;
  if (params.sleep_debt_7day_min != null) {
    const hours = (Math.abs(params.sleep_debt_7day_min) / 60).toFixed(1);
    readinessContext += `\n- Sleep debt: ${params.sleep_debt_7day_min >= 0 ? '+' : '-'}${hours}h`;
  }
  if (params.cardiac_efficiency_trend) {
    const pctChange = ((params.cardiac_efficiency_trend.end - params.cardiac_efficiency_trend.start) / params.cardiac_efficiency_trend.start * 100).toFixed(1);
    readinessContext += `\n- Cardiac efficiency (${params.cardiac_efficiency_trend.type}): ${pctChange}% change this week`;
  }

  const user = `Generate weekly training insights for the week of ${params.week_start} to ${params.week_end}.

DATA:
${JSON.stringify({ ...params, bp_readings: undefined, cardiac_efficiency_trend: undefined }, null, 2)}${bpContext}${readinessContext}

Return a JSON array of 2-4 insights. Each insight:
{
  "title": "short title",
  "content": "markdown-formatted content, 2-4 sentences",
  "priority": "info|positive|warning|critical",
  "insight_type": "weekly_summary|trend|recommendation|milestone|alert"
}

Focus on: compliance, cardiac metrics trends, BP trends, readiness for next week, cardiac efficiency, any safety concerns.
Return ONLY the JSON array.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return [{
      title: 'Weekly Summary',
      content: result,
      priority: 'info',
      insight_type: 'weekly_summary',
    }];
  }
}

/**
 * Parse workout description and return structured exercises with fuzzy matching.
 * Used by the AI Workout Builder component.
 */
export async function parseWorkoutDescription(params: {
  description: string;
  exerciseLibrary: Array<{ id: string; name: string; category: string; muscle_groups: string[] }>;
  metrics?: AIContext;
}): Promise<{
  structure: WorkoutStructureItem[];
  unmatched_exercises: string[];
}> {
  const result = await generateNaturalLanguageWorkout({
    prompt: params.description,  // Map description to prompt
    exerciseLibrary: params.exerciseLibrary,
    metrics: params.metrics,
  });

  return {
    structure: result.structure ?? [],
    unmatched_exercises: (result as any).unmatched_exercises ?? [],
  };
}

/**
 * Find fuzzy matches for an exercise name in the library.
 * Uses simple string similarity (lowercase, substring matching).
 */
export function findExerciseSuggestions(
  searchTerm: string,
  exerciseLibrary: Array<{ id: string; name: string; category: string; muscle_groups: string[] }>,
  limit = 3
): Array<{ id: string; name: string; category: string; similarity: number }> {
  const term = searchTerm.toLowerCase().trim();

  const matches = exerciseLibrary.map(ex => {
    const exName = ex.name.toLowerCase();
    let similarity = 0;

    // Exact match
    if (exName === term) similarity = 1.0;
    // Contains full term
    else if (exName.includes(term)) similarity = 0.8;
    // Term contains exercise name
    else if (term.includes(exName)) similarity = 0.7;
    // Word overlap
    else {
      const termWords = new Set(term.split(/\s+/));
      const exWords = new Set(exName.split(/\s+/));
      const overlap = [...termWords].filter(w => exWords.has(w)).length;
      const totalWords = Math.max(termWords.size, exWords.size);
      similarity = overlap / totalWords * 0.6;
    }

    return { id: ex.id, name: ex.name, category: ex.category, similarity };
  });

  return matches
    .filter(m => m.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Pre-workout readiness check — returns a brief recommendation.
 */
export async function generateReadinessCheck(params: {
  planned_workout_type: string;
  planned_workout_name: string;
  metrics: AIContext;
  weather?: { heat_index_f?: number; conditions?: string } | null;
}): Promise<{ recommendation: string; should_modify: boolean; suggested_adjustment: string | null }> {
  const system = buildSystemPrompt(params.metrics);
  const user = `The athlete is about to start: "${params.planned_workout_name}" (${params.planned_workout_type}).

Current conditions:
- Body Battery: ${params.metrics.body_battery ?? 'unknown'}
- HRV: ${params.metrics.hrv_ms ?? 'unknown'} ms
- TSB (Form): ${params.metrics.form_tsb != null ? Math.round(params.metrics.form_tsb) : 'unknown'}
- Sleep score: ${params.metrics.sleep_score ?? 'unknown'}
- Training readiness: ${params.metrics.training_readiness ?? 'unknown'}
${params.metrics.readiness ? `- Readiness score: ${params.metrics.readiness.score}/100 (${params.metrics.readiness.label})` : ''}
${params.metrics.sleep_debt ? `- Sleep debt (7-day): ${params.metrics.sleep_debt.rolling_7day_balance_min} min (${params.metrics.sleep_debt.status})` : ''}
${params.metrics.meds_taken_at ? `- Meds taken at: ${params.metrics.meds_taken_at}` : ''}
${params.weather ? `- Weather: ${params.weather.conditions}, heat index ${params.weather.heat_index_f}°F` : ''}

Return JSON:
{
  "recommendation": "1-2 sentence go/no-go recommendation",
  "should_modify": true|false,
  "suggested_adjustment": "specific modification if should_modify is true, null otherwise"
}
Return ONLY the JSON.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return { recommendation: result, should_modify: false, suggested_adjustment: null };
  }
}

/**
 * Generate Morning Briefing — daily personalized summary.
 * The first screen the user sees each day.
 */
export async function generateMorningBriefing(params: {
  user_id: string; // NEW: required for health context
  readiness_score: number;
  readiness_label: string;
  readiness_factors: Array<{ name: string; score: number; detail: string }>;
  resting_hr: number | null;
  rhr_baseline: number | null;
  hrv_ms: number | null;
  hrv_baseline: number | null;
  sleep_score: number | null;
  sleep_duration_min: number | null;
  sleep_debt_7day_min: number | null;
  body_battery: number | null;
  today_plan: { name: string; type: string; target_hr_range?: string } | null;
  weather: { temp_f: number; conditions: string; heat_index_f: number } | null;
  weekly_compliance: string;
  weekly_strain_budget_pct: number;
  streak_days: number;
  recent_prs: string[];
  days_since_bp_reading: number | null;
  recent_bp: { systolic: number; diastolic: number } | null;
  medications?: Array<{ name: string; type: string; dosage: string; timing: string }>;
  fasting_status?: 'fasting' | 'feeding' | 'unknown';
  fasting_hours?: number | null;
}): Promise<{ recommendation: string; alerts: string[]; motivation: string }> {
  // Use comprehensive health context system
  const system = await buildAISystemPrompt(params.user_id, 'morning_briefing');
  const user = `Generate a morning training briefing. Be concise — max 4 short lines total.

READINESS: ${params.readiness_score}/100 (${params.readiness_label})
Factors: ${params.readiness_factors.map(f => `${f.name}: ${f.score} — ${f.detail}`).join('; ')}

OVERNIGHT:
- RHR: ${params.resting_hr ?? '?'} bpm${params.rhr_baseline ? ` (baseline ${params.rhr_baseline})` : ''}
- HRV: ${params.hrv_ms ?? '?'} ms${params.hrv_baseline ? ` (baseline ${params.hrv_baseline})` : ''}
- Sleep: ${params.sleep_score ?? '?'}/100, ${params.sleep_duration_min ? (params.sleep_duration_min / 60).toFixed(1) + 'h' : '?'}
- Sleep debt: ${params.sleep_debt_7day_min != null ? (params.sleep_debt_7day_min >= 0 ? '+' : '') + Math.round(params.sleep_debt_7day_min) + ' min' : '?'}
- Body Battery: ${params.body_battery ?? '?'}

TODAY'S PLAN: ${params.today_plan ? `${params.today_plan.name} (${params.today_plan.type})` : 'Rest day'}
${params.weather ? `WEATHER: ${params.weather.temp_f}°F, ${params.weather.conditions}, heat index ${params.weather.heat_index_f}°F` : ''}

WEEKLY: ${params.weekly_compliance}, strain budget ${params.weekly_strain_budget_pct}% used, streak ${params.streak_days} days
${params.recent_prs.length > 0 ? `RECENT PRs: ${params.recent_prs.join(', ')}` : ''}
${params.days_since_bp_reading != null && params.days_since_bp_reading >= 3 ? `⚠️ No BP reading in ${params.days_since_bp_reading} days` : ''}
${params.recent_bp ? `LATEST BP: ${params.recent_bp.systolic}/${params.recent_bp.diastolic}` : ''}

${params.medications && params.medications.length > 0 ? `MORNING MEDICATIONS: ${params.medications.map(m => `${m.name} (${m.dosage})`).join(', ')}` : ''}
${params.fasting_status && params.fasting_status !== 'unknown' ? `FASTING STATUS: ${params.fasting_status === 'fasting' ? `Currently fasting (${params.fasting_hours}h)` : 'Feeding window'}` : ''}

Return JSON:
{
  "recommendation": "1-2 sentence workout recommendation (confirm plan or suggest modification)",
  "alerts": ["array of short alert strings, empty if none"],
  "motivation": "one motivational/progress note referencing a recent trend or milestone"
}
Return ONLY the JSON.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return { recommendation: result, alerts: [], motivation: '' };
  }
}

/**
 * Analyze lab results using AI.
 * Extracts structured data from raw text, flags abnormal values,
 * and correlates with fitness/cardiac data.
 */
export async function analyzeLabResults(params: {
  raw_text: string;
  lab_type: string;
  lab_date: string;
  previous_results?: Array<{ lab_date: string; parsed_results: Record<string, unknown> }>;
  current_medications?: string[];
  recent_bp_avg?: { systolic: number; diastolic: number };
  current_weight?: number;
  current_rhr?: number;
}): Promise<{
  parsed_results: Record<string, { value: number | string; unit: string; reference_range: string; flag: 'normal' | 'low' | 'high' | 'critical' }>;
  ai_analysis: string;
  ai_flags: { flag: string; severity: 'info' | 'warning' | 'critical' }[];
}> {
  const system = `You are a medical data analyst helping a cardiac patient (post-CABG, on Carvedilol + Losartan) understand their lab results.
You are NOT providing medical advice — you're organizing and contextualizing data for discussion with their cardiologist.

IMPORTANT:
- Extract all numerical values into structured format
- Flag anything outside reference ranges
- Note trends if previous results are provided
- Correlate with cardiac medications (Carvedilol can affect liver enzymes, blood glucose; Losartan affects kidney function)
- Always note: "Discuss all findings with your cardiologist"`;

  const user = `Analyze these ${params.lab_type} results from ${params.lab_date}.

RAW TEXT:
${params.raw_text}

${params.previous_results ? `PREVIOUS RESULTS:\n${JSON.stringify(params.previous_results, null, 2)}` : ''}
${params.current_medications ? `MEDICATIONS: ${params.current_medications.join(', ')}` : 'MEDICATIONS: Carvedilol 12.5mg 2x daily, Losartan'}
${params.recent_bp_avg ? `RECENT BP AVG: ${params.recent_bp_avg.systolic}/${params.recent_bp_avg.diastolic}` : ''}
${params.current_weight ? `WEIGHT: ${params.current_weight} lbs` : ''}
${params.current_rhr ? `RESTING HR: ${params.current_rhr} bpm` : ''}

Return JSON:
{
  "parsed_results": {
    "test_name": { "value": 123, "unit": "mg/dL", "reference_range": "70-100", "flag": "normal|low|high|critical" }
  },
  "ai_analysis": "2-4 paragraph markdown analysis correlating results with cardiac health, medications, and fitness data. Always end with 'Discuss these results with your cardiologist.'",
  "ai_flags": [{ "flag": "description of flagged item", "severity": "info|warning|critical" }]
}
Return ONLY the JSON.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return {
      parsed_results: {},
      ai_analysis: result,
      ai_flags: [{ flag: 'Could not parse results automatically', severity: 'info' }],
    };
  }
}

/**
 * Generate appointment prep — suggested questions, changes summary, flags.
 */
export async function generateAppointmentPrep(params: {
  user_id: string; // NEW: required for health context
  doctor_specialty: string;
  last_appointment_date: string | null;
  rhr_trend: { start: number; end: number } | null;
  hrv_trend: { start: number; end: number } | null;
  bp_avg: { systolic: number; diastolic: number } | null;
  bp_elevated_days: number;
  weight_trend: { start: number; end: number } | null;
  training_compliance_pct: number | null;
  cardiac_efficiency_trend: { start: number; end: number; type: string } | null;
  notable_events: string[];
  medications: Medication[];
  recent_lab_flags: string[];
}): Promise<{
  suggested_questions: SuggestedQuestion[];
  changes_summary: ChangeSinceLastVisit[];
  flags: string[];
}> {
  // Use comprehensive health context system
  const system = await buildAISystemPrompt(params.user_id, 'appointment_prep');
  const user = `Generate appointment preparation for a ${params.doctor_specialty} visit.

PATIENT CONTEXT:
- 55yo male, CABG surgery 2022
- Current medications: ${params.medications.map(m => `${m.name} ${m.dosage ?? ''} (${m.purpose ?? m.type})`).join(', ') || 'Carvedilol, Losartan'}
- Active training: Zone 2 cardio + HIIT + strength

${params.last_appointment_date ? `LAST APPOINTMENT: ${params.last_appointment_date}` : 'No previous appointment recorded'}

RECENT DATA:
- RHR trend: ${params.rhr_trend ? `${params.rhr_trend.start} → ${params.rhr_trend.end} bpm` : 'insufficient data'}
- HRV trend: ${params.hrv_trend ? `${params.hrv_trend.start} → ${params.hrv_trend.end} ms` : 'insufficient data'}
- BP average: ${params.bp_avg ? `${params.bp_avg.systolic}/${params.bp_avg.diastolic}` : 'no readings'}
- BP elevated days (last 30): ${params.bp_elevated_days}
- Weight trend: ${params.weight_trend ? `${params.weight_trend.start} → ${params.weight_trend.end} lbs` : 'insufficient data'}
- Training compliance: ${params.training_compliance_pct != null ? `${params.training_compliance_pct}%` : 'unknown'}
- Cardiac efficiency: ${params.cardiac_efficiency_trend ? `${params.cardiac_efficiency_trend.start.toFixed(3)} → ${params.cardiac_efficiency_trend.end.toFixed(3)} (${params.cardiac_efficiency_trend.type})` : 'insufficient data'}
${params.notable_events.length > 0 ? `- Notable events: ${params.notable_events.join('; ')}` : ''}
${params.recent_lab_flags.length > 0 ? `- Lab flags: ${params.recent_lab_flags.join('; ')}` : ''}

Return JSON:
{
  "suggested_questions": [
    {
      "category": "medication|training|vitals|labs|general",
      "question": "The question to ask the doctor",
      "context": "Why the AI is suggesting this question based on the data",
      "data_point": "The specific metric that triggered it",
      "priority": "high|medium|low"
    }
  ],
  "changes_summary": [
    {
      "metric": "Metric name",
      "previous_value": "Value at last appointment",
      "current_value": "Current value",
      "trend": "improved|worsened|stable",
      "note": "Brief context"
    }
  ],
  "flags": ["Array of concerns to mention proactively"]
}

Generate 5-8 prioritized questions, 4-6 changes, and any relevant flags.
Return ONLY the JSON.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return {
      suggested_questions: [],
      changes_summary: [],
      flags: [result],
    };
  }
}

/**
 * Extract structured lab results from raw text (PDF content or manual entry).
 */
export async function extractLabResults(params: {
  raw_text: string;
  panel_date: string;
  previous_results?: Array<{ test_name: string; value: number; panel_date: string }>;
}): Promise<Array<{
  test_name: string;
  test_category: string;
  value: number | null;
  value_text: string | null;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
  reference_range_text: string;
  flag: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
  ai_interpretation: string;
  ai_trend_note: string | null;
}>> {
  const system = `You are a lab result parser for a cardiac patient (post-CABG, on Carvedilol + Losartan).
Extract every individual test value from the provided text into structured data.
For each test, determine if it's within reference range and flag accordingly.
If previous values exist, note trends.`;

  const user = `Parse these lab results from ${params.panel_date}:

${params.raw_text}

${params.previous_results && params.previous_results.length > 0
    ? `PREVIOUS VALUES:\n${params.previous_results.map(r => `${r.test_name}: ${r.value} (${r.panel_date})`).join('\n')}`
    : ''}

Return a JSON array of test results:
[{
  "test_name": "Test Name",
  "test_category": "lipid_panel|metabolic|cbc|thyroid|cardiac|other",
  "value": 123,
  "value_text": null,
  "unit": "mg/dL",
  "reference_low": 70,
  "reference_high": 100,
  "reference_range_text": "70-100 mg/dL",
  "flag": "normal|low|high|critical_low|critical_high",
  "ai_interpretation": "Brief context for this result for a cardiac patient on beta-blockers",
  "ai_trend_note": "Compared to previous: trend note" or null
}]
Return ONLY the JSON array.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return [];
  }
}
