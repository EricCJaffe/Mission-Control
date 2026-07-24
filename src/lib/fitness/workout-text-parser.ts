// ============================================================
// NATURAL-LANGUAGE WORKOUT PARSER
//
// Turns "bench 3x8 at 135, then rows 3x10 @95, felt like a 7" into rows for
// workout_logs + set_logs.
//
// Split deliberately into two phases:
//   1. parseWorkoutText()  — one AI call, produces a PREVIEW. Writes nothing.
//   2. buildSetRows()      — pure, deterministic. Turns a confirmed preview
//                            into database rows.
//
// The split matters because the AI step is the only part that can be wrong.
// Keeping the write path deterministic means a confirmed preview always
// produces exactly the rows shown, and the preview can be corrected by hand
// (or in chat) without re-parsing and re-billing.
//
// Exercise names are matched against the user's library with the existing fuzzy
// matcher rather than by the model, so the model never invents an exercise_id.
// ============================================================

import { callOpenAI } from '@/lib/openai';
import { findExerciseSuggestions } from './ai';

export type ExerciseLibraryEntry = {
  id: string;
  name: string;
  category: string;
  muscle_groups: string[];
};

export type ParsedSet = {
  set_number: number;
  set_type: 'warmup' | 'working' | 'cooldown' | 'drop' | 'failure' | 'amrap';
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  notes: string | null;
};

export type ParsedExercise = {
  /** Exactly as written by the user, so the preview is recognisable. */
  raw_name: string;
  /** Resolved library id, or null when nothing matched confidently. */
  exercise_id: string | null;
  matched_name: string | null;
  /** 0-1 from the fuzzy matcher. Low values warrant confirmation. */
  match_confidence: number;
  /** Alternatives when the match is uncertain, for a picker in the UI. */
  candidates: Array<{ id: string; name: string; similarity: number }>;
  sets: ParsedSet[];
};

export type ParsedWorkout = {
  workout_type: string;
  workout_date: string | null;
  duration_minutes: number | null;
  rpe_session: number | null;
  notes: string | null;
  exercises: ParsedExercise[];
  /** Anything the parser could not place. Never silently dropped. */
  warnings: string[];
};

/** Below this, treat a name match as unconfirmed and make the user choose. */
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

const SET_TYPES = new Set(['warmup', 'working', 'cooldown', 'drop', 'failure', 'amrap']);

function asNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function extractJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  return JSON.parse(trimmed);
}

const SYSTEM_PROMPT = `You convert a spoken or typed description of a COMPLETED workout into structured JSON.

Rules:
- Record what was actually DONE, not what was planned.
- "3x8 at 135" means 3 sets of 8 reps at 135 lbs — expand it into 3 separate set objects.
- "3x8,7,6" or "8/7/6" means three sets with those individual rep counts.
- Weights are pounds unless the text says kg; if kg, convert (1 kg = 2.20462 lbs) and round to 1 decimal.
- Bodyweight movements have weight_lbs null. Do not guess a bodyweight number.
- If a set count or rep count is genuinely absent, use null rather than inventing one.
- set_type is one of: warmup, working, cooldown, drop, failure, amrap. Default to "working".
- rpe is 1-10 if mentioned ("felt like a 7", "RPE 8"). Otherwise null.
- Use the exercise name EXACTLY as the user said it. Do not normalise or correct it.
- Put anything you could not interpret into "warnings" instead of dropping it.
- workout_date only if an explicit date or clear relative day is given ("yesterday"); otherwise null.

Return ONLY this JSON:
{
  "workout_type": "strength" | "cardio" | "hybrid" | "mobility",
  "workout_date": "YYYY-MM-DD" | null,
  "duration_minutes": number | null,
  "rpe_session": number | null,
  "notes": string | null,
  "exercises": [
    {
      "raw_name": "bench press",
      "sets": [
        { "set_number": 1, "set_type": "working", "reps": 8, "weight_lbs": 135, "rpe": null, "notes": null }
      ]
    }
  ],
  "warnings": ["anything ambiguous or unparsed"]
}`;

/**
 * Phase 1 — one AI call producing a preview. Writes nothing.
 *
 * Exercise resolution happens here in code, not in the model: the model returns
 * raw names only, and those are matched against the library with the fuzzy
 * matcher. That stops the model inventing exercise_ids that look plausible and
 * point at the wrong row.
 */
export async function parseWorkoutText(
  text: string,
  library: ExerciseLibraryEntry[],
  opts: { today?: string } = {}
): Promise<ParsedWorkout> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const raw = await callOpenAI({
    model: 'gpt-4o-mini',
    system: SYSTEM_PROMPT,
    user: `Today is ${today}.\n\nWorkout description:\n${text}`,
  });

  let data: Record<string, unknown>;
  try {
    data = extractJson(raw);
  } catch {
    throw new Error('Could not parse the workout description into structured data.');
  }

  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  const exercisesRaw = Array.isArray(data.exercises) ? data.exercises : [];
  const exercises: ParsedExercise[] = [];

  for (const item of exercisesRaw) {
    const r = asRecord(item);
    const rawName = typeof r.raw_name === 'string' ? r.raw_name.trim() : '';
    if (!rawName) continue;

    const suggestions = findExerciseSuggestions(rawName, library, 3);
    const best = suggestions[0];
    const confident = best && best.similarity >= MATCH_CONFIDENCE_THRESHOLD;

    if (!confident) {
      warnings.push(
        `"${rawName}" did not match anything in your exercise library — pick a match or create it before saving.`
      );
    }

    const setsRaw = Array.isArray(r.sets) ? r.sets : [];
    const sets: ParsedSet[] = setsRaw.map((s, i) => {
      const sr = asRecord(s);
      const type = String(sr.set_type ?? 'working').toLowerCase();
      return {
        set_number: asNumber(sr.set_number) ?? i + 1,
        set_type: (SET_TYPES.has(type) ? type : 'working') as ParsedSet['set_type'],
        reps: asNumber(sr.reps),
        weight_lbs: asNumber(sr.weight_lbs),
        rpe: asNumber(sr.rpe),
        notes: typeof sr.notes === 'string' ? sr.notes : null,
      };
    });

    if (sets.length === 0) {
      warnings.push(`"${rawName}" had no sets that could be read, so it was skipped.`);
      continue;
    }

    exercises.push({
      raw_name: rawName,
      exercise_id: confident ? best.id : null,
      matched_name: confident ? best.name : null,
      match_confidence: best?.similarity ?? 0,
      candidates: suggestions.map(s => ({ id: s.id, name: s.name, similarity: s.similarity })),
      sets,
    });
  }

  if (exercises.length === 0) {
    warnings.push('No exercises could be read from that description.');
  }

  const workoutType = String(data.workout_type ?? 'strength').toLowerCase();

  return {
    workout_type: ['strength', 'cardio', 'hybrid', 'mobility'].includes(workoutType)
      ? workoutType
      : 'strength',
    workout_date:
      typeof data.workout_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.workout_date)
        ? data.workout_date
        : null,
    duration_minutes: asNumber(data.duration_minutes),
    rpe_session: asNumber(data.rpe_session),
    notes: typeof data.notes === 'string' ? data.notes : null,
    exercises,
    warnings,
  };
}

/** True when every exercise resolved to a library entry — safe to save. */
export function isReadyToSave(parsed: ParsedWorkout): boolean {
  return parsed.exercises.length > 0 && parsed.exercises.every(e => e.exercise_id !== null);
}

/**
 * Phase 2 — pure. Turns a confirmed preview into set_logs rows.
 *
 * Deliberately contains no AI and no I/O: what the user confirmed in the
 * preview is exactly what gets written. set_number is renumbered per exercise
 * so hand-edits to the preview cannot produce duplicate or gapped numbering.
 */
export function buildSetRows(
  parsed: ParsedWorkout,
  workoutLogId: string
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  for (const exercise of parsed.exercises) {
    if (!exercise.exercise_id) continue;
    exercise.sets.forEach((set, index) => {
      rows.push({
        workout_log_id: workoutLogId,
        exercise_id: exercise.exercise_id,
        set_number: index + 1,
        set_type: set.set_type,
        reps: set.reps,
        weight_lbs: set.weight_lbs,
        rpe: set.rpe,
        notes: set.notes,
      });
    });
  }

  return rows;
}
