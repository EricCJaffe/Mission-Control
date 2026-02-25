// ============================================================
// CARDIAC EFFICIENCY INDEX
// Unique metric: measures work output per heartbeat
// Improvement = cardiac remodeling from Z2 training
// ============================================================

import type { CardiacEfficiencyResult } from './types';

/**
 * Running cardiac efficiency = speed (m/min) / avg HR
 * Higher = more efficient (faster at same cardiac cost)
 */
export function runningEfficiency(
  paceMinPerMile: number,
  avgHr: number,
): CardiacEfficiencyResult {
  if (avgHr <= 0 || paceMinPerMile <= 0) {
    return { efficiency: 0, type: 'running', cardiac_cost: 0, unit: '(m/min)/bpm' };
  }
  const speedMPerMin = 1609.34 / paceMinPerMile;
  const efficiency = Math.round((speedMPerMin / avgHr) * 1000) / 1000;
  const cardiacCost = Math.round(avgHr * paceMinPerMile); // approximate total beats per mile
  return { efficiency, type: 'running', cardiac_cost: cardiacCost, unit: '(m/min)/bpm' };
}

/**
 * Cycling cardiac efficiency = avg power (watts) / avg HR
 * THE gold standard for cardiac efficiency in endurance sport
 */
export function cyclingEfficiency(
  avgPowerWatts: number,
  avgHr: number,
): CardiacEfficiencyResult {
  if (avgHr <= 0 || avgPowerWatts <= 0) {
    return { efficiency: 0, type: 'cycling', cardiac_cost: 0, unit: 'W/bpm' };
  }
  const efficiency = Math.round((avgPowerWatts / avgHr) * 1000) / 1000;
  const cardiacCost = 0; // not meaningful for cycling without duration
  return { efficiency, type: 'cycling', cardiac_cost: cardiacCost, unit: 'W/bpm' };
}

/**
 * Cardiac cost of a session = avg HR × duration (≈ total heartbeats)
 * As fitness improves, same work costs fewer total beats
 */
export function cardiacCost(avgHr: number, durationMin: number): number {
  return Math.round(avgHr * durationMin);
}

/**
 * Calculate cardiac efficiency for a cardio session based on activity type
 */
export function calculateCardiacEfficiency(params: {
  activity_type: string;
  avg_hr: number | null;
  avg_pace_per_mile: string | null;
  avg_power_watts: number | null;
  duration_min: number;
}): { efficiency: number | null; cost: number; type: 'running' | 'cycling' | null } {
  const { activity_type, avg_hr, avg_pace_per_mile, avg_power_watts, duration_min } = params;

  if (!avg_hr || avg_hr <= 0) {
    return { efficiency: null, cost: 0, type: null };
  }

  const cost = cardiacCost(avg_hr, duration_min);

  // Cycling with power data — gold standard
  if (['bike', 'cycling'].includes(activity_type) && avg_power_watts && avg_power_watts > 0) {
    const result = cyclingEfficiency(avg_power_watts, avg_hr);
    return { efficiency: result.efficiency, cost, type: 'cycling' };
  }

  // Running/walking with pace data
  if (['run', 'walk', 'treadmill'].includes(activity_type) && avg_pace_per_mile) {
    const paceMin = parsePace(avg_pace_per_mile);
    if (paceMin > 0) {
      const result = runningEfficiency(paceMin, avg_hr);
      return { efficiency: result.efficiency, cost, type: 'running' };
    }
  }

  return { efficiency: null, cost, type: null };
}

/** Parse pace string like "10:30" to decimal minutes (10.5) */
function parsePace(pace: string): number {
  const parts = pace.split(':');
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  if (isNaN(minutes) || isNaN(seconds)) return 0;
  return minutes + seconds / 60;
}
