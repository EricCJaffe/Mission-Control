// ============================================================
// HEART RATE ZONES — Cardiac-safe, beta-blocker adjusted
// Auto-calculated from max HR ceiling with seasonal heat adjustments
// for Jacksonville, FL climate
// ============================================================

import type { HRZones } from './types';

/**
 * Calculate HR zones from max HR ceiling.
 * Zone percentages derived from cardiac rehab guidelines:
 *   Z1 (Recovery):  ~64-74% of max — warm-up, cool-down, easy days
 *   Z2 (Endurance): ~74-86% of max — the "money zone" for cardiac fitness
 *   Z3 (Tempo):     ~86-94% of max — tempo efforts, controlled pushing
 *   Z4 (Threshold): ~94-100% of max — HIIT, approach with caution
 */
export function calculateHRZones(maxHRCeiling: number): HRZones {
  return {
    z1: [Math.round(maxHRCeiling * 0.645), Math.round(maxHRCeiling * 0.742)],
    z2: [Math.round(maxHRCeiling * 0.742), Math.round(maxHRCeiling * 0.858)],
    z3: [Math.round(maxHRCeiling * 0.858), Math.round(maxHRCeiling * 0.935)],
    z4: [Math.round(maxHRCeiling * 0.935), maxHRCeiling],
  };
}

export type SeasonInfo = {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  label: string;
  adjustment_bpm: number;
  reason: string;
};

/**
 * Get seasonal max HR ceiling adjustment for Jacksonville, FL.
 * Heat and humidity increase cardiac workload — the same effort
 * requires a higher HR in summer, so we LOWER the ceiling to keep
 * true physiological strain equivalent.
 *
 * Based on ACSM heat guidelines for cardiac patients:
 *   - Heat index >90°F: reduce max HR by 5 bpm
 *   - Heat index >100°F: reduce max HR by 10 bpm
 *   - Jacksonville summer avg heat index: 95-105°F
 */
export function getSeasonalAdjustment(month?: number): SeasonInfo {
  const m = month ?? new Date().getMonth(); // 0-indexed

  // Jacksonville, FL seasonal pattern
  if (m >= 5 && m <= 8) {
    // June-September: Peak heat & humidity
    return {
      season: 'summer',
      label: 'Summer (Jun–Sep)',
      adjustment_bpm: -8,
      reason: 'Jacksonville heat/humidity — cardiac output diverted to cooling',
    };
  }
  if (m === 4 || m === 9) {
    // May, October: Transition months
    return {
      season: m === 4 ? 'spring' : 'fall',
      label: m === 4 ? 'Late Spring (May)' : 'Early Fall (Oct)',
      adjustment_bpm: -4,
      reason: 'Transitional heat — moderate cardiac load increase',
    };
  }
  if (m === 3 || m === 10) {
    // April, November: Mild transition
    return {
      season: m === 3 ? 'spring' : 'fall',
      label: m === 3 ? 'Spring (Apr)' : 'Fall (Nov)',
      adjustment_bpm: -2,
      reason: 'Mild heat — slight cardiac load increase',
    };
  }
  // December-March: Cool season — no adjustment
  return {
    season: 'winter',
    label: 'Winter (Dec–Mar)',
    adjustment_bpm: 0,
    reason: 'Cool season — zones at full capacity',
  };
}

/**
 * Calculate seasonally-adjusted HR zones.
 * Applies heat adjustment to max HR ceiling before zone calculation.
 */
export function calculateSeasonalHRZones(
  baseMaxHRCeiling: number,
  month?: number,
): { zones: HRZones; effectiveMaxHR: number; seasonal: SeasonInfo } {
  const seasonal = getSeasonalAdjustment(month);
  const effectiveMaxHR = baseMaxHRCeiling + seasonal.adjustment_bpm;
  const zones = calculateHRZones(effectiveMaxHR);

  return { zones, effectiveMaxHR, seasonal };
}

/**
 * Get zone name and description for display
 */
export function getZoneInfo(zone: number): { name: string; description: string; color: string } {
  switch (zone) {
    case 1: return { name: 'Z1 Recovery', description: 'Warm-up, cool-down, easy days', color: '#16a34a' };
    case 2: return { name: 'Z2 Endurance', description: 'Aerobic base — the money zone', color: '#2563eb' };
    case 3: return { name: 'Z3 Tempo', description: 'Controlled pushing, tempo efforts', color: '#d97706' };
    case 4: return { name: 'Z4 Threshold', description: 'HIIT — approach with caution', color: '#dc2626' };
    default: return { name: 'Unknown', description: '', color: '#94a3b8' };
  }
}
