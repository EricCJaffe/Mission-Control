// ============================================================
// ESTIMATED 1RM — Epley Formula
// Tracks strength progression alongside cardiac improvement
// ============================================================

import type { Estimated1RM } from './types';

/**
 * Epley formula: 1RM = weight × (1 + reps / 30)
 * Most accurate for 1-10 rep range. Less reliable above 12 reps.
 */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight; // actual 1RM
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Brzycki formula (alternative): 1RM = weight × 36 / (37 - reps)
 * Better for higher rep ranges (8-12). Diverges from Epley above 12 reps.
 */
export function brzycki1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0 || reps >= 37) return 0;
  if (reps === 1) return weight;
  return Math.round((weight * 36) / (37 - reps) * 10) / 10;
}

/**
 * Average of Epley and Brzycki for a more robust estimate
 */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(((epley1RM(weight, reps) + brzycki1RM(weight, reps)) / 2) * 10) / 10;
}

/**
 * From a set of working sets for an exercise, find the best estimated 1RM
 */
export function bestEstimated1RM(
  sets: { weight_lbs: number | null; reps: number | null; set_type: string }[],
): { e1rm: number; based_on_weight: number; based_on_reps: number } | null {
  let best: { e1rm: number; based_on_weight: number; based_on_reps: number } | null = null;

  for (const set of sets) {
    if (set.set_type !== 'working' && set.set_type !== 'amrap') continue;
    if (!set.weight_lbs || !set.reps || set.weight_lbs <= 0 || set.reps <= 0) continue;
    // Only reliable for 1-12 rep range
    if (set.reps > 12) continue;

    const e1rm = estimated1RM(set.weight_lbs, set.reps);
    if (!best || e1rm > best.e1rm) {
      best = { e1rm, based_on_weight: set.weight_lbs, based_on_reps: set.reps };
    }
  }

  return best;
}

/**
 * Calculate percentage of 1RM for training load context
 */
export function percentOf1RM(weight: number, e1rm: number): number {
  if (e1rm <= 0) return 0;
  return Math.round((weight / e1rm) * 100);
}

/**
 * Build Estimated1RM records for all exercises in a workout
 */
export function buildEstimated1RMRecords(
  exerciseSets: Map<string, { name: string; sets: { weight_lbs: number | null; reps: number | null; set_type: string }[] }>,
  workoutDate: string,
): Estimated1RM[] {
  const records: Estimated1RM[] = [];

  for (const [exerciseId, data] of exerciseSets) {
    const best = bestEstimated1RM(data.sets);
    if (best) {
      records.push({
        exercise_id: exerciseId,
        exercise_name: data.name,
        estimated_1rm_lbs: best.e1rm,
        based_on_weight: best.based_on_weight,
        based_on_reps: best.based_on_reps,
        date: workoutDate,
      });
    }
  }

  return records;
}
