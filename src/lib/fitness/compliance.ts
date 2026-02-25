// ============================================================
// Workout Compliance Calculation
// Compares actual vs planned workout metrics
// ============================================================

import type { ComplianceColor } from './types';

export type ComplianceResult = {
  pct: number;
  color: ComplianceColor;
  label: string;
};

/**
 * Calculate compliance percentage and color from actual vs planned values.
 * Uses duration, TSS, or volume depending on what's available.
 *
 * Color thresholds (TrainingPeaks-inspired):
 *   Green:  80-120% of planned
 *   Yellow: 50-79% or 121-150%
 *   Orange: <50% or >150%
 *   Red:    missed (actual = 0 or null)
 */
export function calcCompliance(params: {
  planned_duration_min?: number | null;
  actual_duration_min?: number | null;
  planned_tss?: number | null;
  actual_tss?: number | null;
}): ComplianceResult {
  const { planned_duration_min, actual_duration_min, planned_tss, actual_tss } = params;

  // Missed workout
  const actualIsZero =
    (actual_duration_min === null || actual_duration_min === undefined || actual_duration_min === 0) &&
    (actual_tss === null || actual_tss === undefined || actual_tss === 0);

  if (actualIsZero) {
    return { pct: 0, color: 'red', label: 'Missed' };
  }

  // Prefer TSS comparison; fall back to duration
  let pct: number;
  if (planned_tss && actual_tss) {
    pct = (actual_tss / planned_tss) * 100;
  } else if (planned_duration_min && actual_duration_min) {
    pct = (actual_duration_min / planned_duration_min) * 100;
  } else {
    // No planned data to compare against — treat as unplanned, consider green
    return { pct: 100, color: 'green', label: 'Unplanned' };
  }

  return {
    pct: Math.round(pct),
    color: complianceColor(pct),
    label: complianceLabel(pct),
  };
}

function complianceColor(pct: number): ComplianceColor {
  if (pct === 0) return 'red';
  if (pct >= 80 && pct <= 120) return 'green';
  if ((pct >= 50 && pct < 80) || (pct > 120 && pct <= 150)) return 'yellow';
  return 'orange';
}

function complianceLabel(pct: number): string {
  if (pct === 0) return 'Missed';
  if (pct >= 80 && pct <= 120) return 'On target';
  if (pct < 50) return 'Way under';
  if (pct < 80) return 'Under';
  if (pct <= 150) return 'Over';
  return 'Way over';
}

/** Tailwind class for the compliance color dot/badge. */
export function complianceTailwindClass(color: ComplianceColor): string {
  switch (color) {
    case 'green':  return 'bg-green-500';
    case 'yellow': return 'bg-yellow-400';
    case 'orange': return 'bg-orange-500';
    case 'red':    return 'bg-red-500';
  }
}
