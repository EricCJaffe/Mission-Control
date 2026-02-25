// ============================================================
// RECOVERY TIMELINE PREDICTOR
// Estimates when you'll be recovered for the next hard session
// Uses personal recovery rate derived from historical data
// ============================================================

import type { RecoveryPrediction } from './types';

/**
 * Predict recovery timeline after a workout
 */
export function predictRecovery(params: {
  session_strain: number;          // 0-21 strain score
  current_readiness: number;       // 0-100 readiness score
  historical_recovery_rate?: number; // avg readiness points per hour of sleep (learned)
  next_planned_session?: Date;
  age_years?: number;
}): RecoveryPrediction {
  const {
    session_strain,
    current_readiness,
    historical_recovery_rate,
    next_planned_session,
    age_years = 55,
  } = params;

  // Base recovery hours scaled by strain
  let baseHours: number;
  if (session_strain < 8) baseHours = 12;
  else if (session_strain < 14) baseHours = 24;
  else if (session_strain < 18) baseHours = 42;
  else baseHours = 60;

  // Age adjustment: +10% for every 5 years over 40
  const ageMultiplier = age_years > 40 ? 1 + (age_years - 40) * 0.02 : 1;

  // Readiness adjustment: recover faster when fresh, slower when fatigued
  const readinessMultiplier =
    current_readiness > 70 ? 0.8 : current_readiness > 40 ? 1.0 : 1.3;

  // Historical rate adjustment (if available)
  const historyMultiplier = historical_recovery_rate
    ? Math.max(0.7, Math.min(1.3, 1.0 / historical_recovery_rate))
    : 1.0;

  const estimatedHours = Math.round(
    baseHours * ageMultiplier * readinessMultiplier * historyMultiplier,
  );

  const readyBy = new Date(Date.now() + estimatedHours * 3600000);

  const readyForNext = next_planned_session
    ? readyBy <= next_planned_session
    : true;

  const confidence = historical_recovery_rate
    ? ('high' as const)
    : current_readiness > 0
      ? ('medium' as const)
      : ('low' as const);

  let message: string;
  if (readyForNext && next_planned_session) {
    const dayName = next_planned_session.toLocaleDateString('en-US', { weekday: 'long' });
    message = `Estimated recovery: ${estimatedHours}h. You should be green for ${dayName}'s session.`;
  } else if (!readyForNext && next_planned_session) {
    const dayName = next_planned_session.toLocaleDateString('en-US', { weekday: 'long' });
    message = `Estimated recovery: ${estimatedHours}h. You may still be fatigued for ${dayName}. Consider adjusting.`;
  } else {
    message = `Estimated recovery: ${estimatedHours} hours.`;
  }

  return {
    estimated_recovery_hours: estimatedHours,
    ready_by: readyBy,
    ready_for_next_session: readyForNext,
    confidence,
    message,
  };
}
