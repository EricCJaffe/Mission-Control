// ============================================================
// DAILY STRAIN SCORE — 0-21 logarithmic scale (Whoop-style)
// Beta-blocker adjusted: same HR = more physiological effort
// ============================================================

import type { StrainInputs, StrainResult, StrainLevel } from './types';

const DEFAULT_BETA_BLOCKER_MULTIPLIER = 1.15;

export function calculateDailyStrain(inputs: StrainInputs): StrainResult {
  const multiplier = inputs.beta_blocker_multiplier || DEFAULT_BETA_BLOCKER_MULTIPLIER;
  let totalWorkoutStrain = 0;

  for (const w of inputs.workouts) {
    let workoutPoints = 0;

    if (w.time_in_zone_min) {
      // HR zone-based strain (cardio, HIIT)
      // Higher zones contribute exponentially more strain
      workoutPoints =
        (w.time_in_zone_min.z1 * 1 +
          w.time_in_zone_min.z2 * 2 +
          w.time_in_zone_min.z3 * 4 +
          w.time_in_zone_min.z4 * 8) *
        multiplier;
    } else if (w.session_rpe && w.duration_min) {
      // RPE-based strain (strength workouts without HR data)
      workoutPoints = w.duration_min * (w.session_rpe / 10) * 3;
    } else if (w.tss) {
      // TSS fallback
      workoutPoints = w.tss * 1.5;
    }

    totalWorkoutStrain += workoutPoints;
  }

  // Daily life strain from Garmin all-day metrics
  const lifeStrain =
    (inputs.all_day_stress_avg / 100) * 30 + (inputs.active_minutes / 60) * 10;

  // Composite: logarithmic mapping to 0-21 scale
  const rawStrain = totalWorkoutStrain + lifeStrain;
  const strain = Math.min(
    21,
    Math.round(2 * Math.log(1 + rawStrain / 10) * 10) / 10,
  );

  const level: StrainLevel =
    strain < 8 ? 'light' : strain < 14 ? 'moderate' : strain < 18 ? 'high' : 'all_out';

  return {
    strain,
    level,
    breakdown: {
      workout_strain: Math.round(totalWorkoutStrain * 10) / 10,
      daily_life_strain: Math.round(lifeStrain * 10) / 10,
    },
  };
}

/** Calculate strain contribution for a single workout (for badges) */
export function calculateWorkoutStrain(workout: StrainInputs['workouts'][0], betaBlockerMultiplier = DEFAULT_BETA_BLOCKER_MULTIPLIER): number {
  let points = 0;

  if (workout.time_in_zone_min) {
    points =
      (workout.time_in_zone_min.z1 * 1 +
        workout.time_in_zone_min.z2 * 2 +
        workout.time_in_zone_min.z3 * 4 +
        workout.time_in_zone_min.z4 * 8) *
      betaBlockerMultiplier;
  } else if (workout.session_rpe && workout.duration_min) {
    points = workout.duration_min * (workout.session_rpe / 10) * 3;
  } else if (workout.tss) {
    points = workout.tss * 1.5;
  }

  // Map single workout points to 0-21 scale
  return Math.min(21, Math.round(2 * Math.log(1 + points / 10) * 10) / 10);
}
