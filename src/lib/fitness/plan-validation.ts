// ============================================================
// PLAN VALIDATION ADAPTER
//
// Bridges the AI-generated plan JSON to the pure rule engine in
// ./program-rules. Kept separate on purpose: program-rules knows nothing about
// this app's plan shape or database, so it stays trivially testable and equally
// callable from a route handler or a chat-driven path.
//
// This file owns exactly one job — translate loose model output into the strict
// ProgramPlan shape the validators expect, defensively, because the model may
// omit or mistype anything.
// ============================================================

import {
  validateProgram,
  type ProgramPlan,
  type PlannedDay,
  type PlannedExercise,
  type ProgressionMechanism,
  type RuleReport,
  type TrainingGoal,
} from './program-rules';

/** Exercise metadata used to resolve muscle groups the model did not inline. */
export type ExerciseMeta = {
  id: string;
  name?: string | null;
  category?: string | null;
  muscle_groups?: string[] | null;
  is_compound?: boolean | null;
};

const KNOWN_GOALS: TrainingGoal[] = [
  'hypertrophy',
  'strength',
  'fat_loss',
  'endurance',
  'longevity',
  'hybrid',
  'maintenance',
];

const KNOWN_MECHANISMS: ProgressionMechanism[] = [
  'load',
  'reps',
  'sets',
  'range_of_motion',
  'frequency',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Coerce a free-form goal string to a TrainingGoal.
 * Unrecognised values fall back to 'hybrid', which runs both the strength and
 * hypertrophy rule families — the conservative choice, since it surfaces more
 * findings rather than silently skipping checks.
 */
export function normalizeGoal(raw: unknown): TrainingGoal {
  const value = String(raw ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  const direct = KNOWN_GOALS.find(g => g === value);
  if (direct) return direct;
  if (/muscle|size|hypertroph/.test(value)) return 'hypertrophy';
  if (/fat|weight_loss|cut/.test(value)) return 'fat_loss';
  if (/strength|power/.test(value)) return 'strength';
  if (/endur|aerobic|cardio/.test(value)) return 'endurance';
  if (/longev|health|resilien/.test(value)) return 'longevity';
  return 'hybrid';
}

function toExercise(raw: unknown, byId: Map<string, ExerciseMeta>): PlannedExercise | null {
  const r = asRecord(raw);
  const name = typeof r.exercise_name === 'string' ? r.exercise_name : undefined;
  const id = typeof r.exercise_id === 'string' ? r.exercise_id : undefined;
  if (!name && !id) return null;

  const meta = id ? byId.get(id) : undefined;

  return {
    exercise_id: id,
    exercise_name: name ?? meta?.name ?? 'Unknown exercise',
    sets: asNumber(r.sets),
    target_reps:
      typeof r.target_reps === 'string' || typeof r.target_reps === 'number'
        ? r.target_reps
        : undefined,
    target_weight_pct: asNumber(r.target_weight_pct),
    rest_seconds: asNumber(r.rest_seconds),
    rir: asNumber(r.rir),
    // Prefer what the model stated; fall back to the exercise library.
    muscle_groups:
      asStringArray(r.muscle_groups).length > 0
        ? asStringArray(r.muscle_groups)
        : (meta?.muscle_groups ?? undefined) || undefined,
    category: (typeof r.category === 'string' ? r.category : meta?.category) ?? undefined,
    is_compound:
      typeof r.is_compound === 'boolean' ? r.is_compound : (meta?.is_compound ?? undefined) || undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function toDay(raw: unknown, index: number, byId: Map<string, ExerciseMeta>): PlannedDay {
  const r = asRecord(raw);
  const exercises = Array.isArray(r.exercises)
    ? r.exercises.map(e => toExercise(e, byId)).filter((e): e is PlannedExercise => e !== null)
    : [];

  const intensity = String(r.intensity ?? '').toLowerCase();

  return {
    // Fall back to position so a missing day_number cannot collapse every day
    // onto day 0 and fabricate a 72-hour-rule violation.
    day_number: asNumber(r.day_number) ?? index + 1,
    day_label: typeof r.day_label === 'string' ? r.day_label : undefined,
    workout_type: typeof r.workout_type === 'string' ? r.workout_type : undefined,
    target_duration_min: asNumber(r.target_duration_min),
    target_tss: asNumber(r.target_tss),
    intensity:
      intensity === 'easy' || intensity === 'moderate' || intensity === 'hard' || intensity === 'max'
        ? intensity
        : undefined,
    exercises,
  };
}

/**
 * Build the ProgramPlan the validators consume from raw model output.
 * Exported separately from validation so callers can inspect or persist the
 * normalised shape.
 */
export function toProgramPlan(
  planData: Record<string, unknown>,
  opts: { goal: unknown; weeks?: number; exercises?: ExerciseMeta[] }
): ProgramPlan {
  const byId = new Map<string, ExerciseMeta>();
  for (const ex of opts.exercises ?? []) byId.set(ex.id, ex);

  const template = Array.isArray(planData.weekly_template) ? planData.weekly_template : [];

  const progressionRaw = asRecord(planData.progression);
  const mechanisms = asStringArray(progressionRaw.mechanisms)
    .map(m => m.toLowerCase().replace(/[\s-]+/g, '_'))
    .filter((m): m is ProgressionMechanism =>
      KNOWN_MECHANISMS.includes(m as ProgressionMechanism)
    );
  const cadence = asNumber(progressionRaw.cadence_weeks);

  const activityRaw = asRecord(planData.weekly_activity);

  return {
    goal: normalizeGoal(opts.goal ?? planData.goal),
    weeks: opts.weeks ?? asNumber(planData.weeks),
    weekly_template: template.map((d, i) => toDay(d, i, byId)),
    deload_weeks: Array.isArray(planData.deload_weeks)
      ? planData.deload_weeks.map(asNumber).filter((n): n is number => n !== undefined)
      : undefined,
    // Only treat progression as declared when it is actually structured. A
    // free-text progression_notes string is not checkable and must not satisfy
    // the progressive-overload rule.
    progression:
      mechanisms.length > 0 && cadence !== undefined
        ? {
            mechanisms,
            cadence_weeks: cadence,
            notes:
              typeof progressionRaw.notes === 'string'
                ? progressionRaw.notes
                : typeof planData.progression_notes === 'string'
                  ? planData.progression_notes
                  : undefined,
          }
        : undefined,
    weekly_activity:
      Object.keys(activityRaw).length > 0
        ? {
            active_days: asNumber(activityRaw.active_days),
            sweat_days: asNumber(activityRaw.sweat_days),
            hard_days: asNumber(activityRaw.hard_days),
            long_days: asNumber(activityRaw.long_days),
          }
        : undefined,
  };
}

/** Normalise then validate. Convenience wrapper for route handlers. */
export function validateGeneratedPlan(
  planData: Record<string, unknown>,
  opts: { goal: unknown; weeks?: number; exercises?: ExerciseMeta[] }
): { report: RuleReport; normalized: ProgramPlan } {
  const normalized = toProgramPlan(planData, opts);
  return { report: validateProgram(normalized), normalized };
}
