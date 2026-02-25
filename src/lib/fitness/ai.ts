// ============================================================
// Fitness AI Service Layer
// Wraps callOpenAI with fitness-specific prompts and context
// ============================================================

import { callOpenAI } from '@/lib/openai';
import type { WorkoutTemplate, BodyMetrics, FitnessForm } from './types';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const MAX_HR = 155;

/** Build the standard athlete system prompt with current metrics. */
function buildSystemPrompt(metrics?: Partial<BodyMetrics & FitnessForm>): string {
  return `You are an AI fitness coach integrated into a personal training dashboard for a cardiac patient.

ATHLETE PROFILE:
- Age: 55, approx. weight: 184 lbs
- Medical: CABG surgery (2022), on Carvedilol (beta-blocker) and Losartan (ACE inhibitor)
- Working max HR: ${MAX_HR} bpm — HARD CEILING, never program above this
- HR Zones (beta-blocker adjusted):
  Z1 Recovery:    100–115 bpm
  Z2 Aerobic Base: 115–133 bpm
  Z3 Tempo:        133–145 bpm
  Z4 HIIT:         145–155 bpm
- Lactate threshold HR estimate: 140 bpm
- Training: Push/Pull strength split Mon/Wed/Fri, Z2 cardio Tue/Thu/Sat, HIIT on Wed

CURRENT STATUS:
- Resting HR: ${metrics?.resting_hr ?? 'unknown'} bpm (target: <70)
- HRV: ${metrics?.hrv_ms ?? 'unknown'} ms
- Body Battery: ${metrics?.body_battery ?? 'unknown'}/100
- Form/TSB: ${metrics?.form_tsb != null ? Math.round(metrics.form_tsb) : 'unknown'} (${metrics?.form_status ?? 'unknown'})
- Sleep score: ${metrics?.sleep_score ?? 'unknown'}/100

SAFETY RULES (non-negotiable):
1. NEVER prescribe or exceed ${MAX_HR} bpm
2. Body battery < 25 → recovery only (Z1 walk or rest), no intensity
3. TSB < -10 → reduce planned volume by 20-30%
4. TSB < -25 → mandatory rest, flag critical overreaching
5. Always include 5-10 min Z1 warm-up before any Z2 or higher intensity
6. Always include 5 min cool-down
7. Flag any concerning metric trends immediately`;
}

/**
 * Generate a progressive workout suggestion based on an existing template and recent history.
 */
export async function generateProgressiveWorkout(params: {
  template: WorkoutTemplate;
  recentLogs: Array<{ exercise_name: string; sets: Array<{ weight_lbs: number; reps: number; set_type: string }> }>;
  metrics?: Partial<BodyMetrics & FitnessForm>;
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
 */
export async function generateNaturalLanguageWorkout(params: {
  prompt: string;
  exerciseLibrary: Array<{ id: string; name: string; category: string; muscle_groups: string[] }>;
  metrics?: Partial<BodyMetrics & FitnessForm>;
}): Promise<Partial<WorkoutTemplate>> {
  const { prompt, exerciseLibrary, metrics } = params;

  const system = buildSystemPrompt(metrics);
  const user = `The athlete says: "${prompt}"

Available exercises:
${exerciseLibrary.map(e => `- ${e.name} (${e.category}, ${e.muscle_groups.join(', ')}), id: ${e.id}`).join('\n')}

Generate a complete workout plan. Return valid JSON with this structure:
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
    }
  ]
}
Return ONLY the JSON.`;

  const result = await callOpenAI({ model: DEFAULT_MODEL, system, user });

  try {
    return JSON.parse(result);
  } catch {
    return {
      name: 'AI Generated Workout',
      type: 'strength',
      structure: [],
      estimated_duration_min: 45,
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
}): Promise<Array<{ title: string; content: string; priority: string; insight_type: string }>> {
  const system = buildSystemPrompt();
  const user = `Generate weekly training insights for the week of ${params.week_start} to ${params.week_end}.

DATA:
${JSON.stringify(params, null, 2)}

Return a JSON array of 2-4 insights. Each insight:
{
  "title": "short title",
  "content": "markdown-formatted content, 2-4 sentences",
  "priority": "info|positive|warning|critical",
  "insight_type": "weekly_summary|trend|recommendation|milestone|alert"
}

Focus on: compliance, cardiac metrics trends, readiness for next week, any safety concerns.
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
 * Pre-workout readiness check — returns a brief recommendation.
 */
export async function generateReadinessCheck(params: {
  planned_workout_type: string;
  planned_workout_name: string;
  metrics: Partial<BodyMetrics & FitnessForm>;
  weather?: { heat_index_f?: number; conditions?: string } | null;
}): Promise<{ recommendation: string; should_modify: boolean; suggested_adjustment: string | null }> {
  const system = buildSystemPrompt(params.metrics);
  const user = `The athlete is about to start: "${params.planned_workout_name}" (${params.planned_workout_type}).

Current conditions:
- Body Battery: ${params.metrics.body_battery ?? 'unknown'}
- HRV: ${params.metrics.hrv_ms ?? 'unknown'} ms
- TSB (Form): ${params.metrics.form_tsb != null ? Math.round(params.metrics.form_tsb) : 'unknown'}
- Sleep score: ${params.metrics.sleep_score ?? 'unknown'}
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
