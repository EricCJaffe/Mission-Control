// ============================================================
// Training Stress Score (TSS) Calculations
// ============================================================

const LACTATE_THRESHOLD_HR = 140; // beta-blocker adjusted estimate

// RPE → TSS per hour lookup (strength workouts)
const RPE_TSS_PER_HOUR: Record<number, number> = {
  1: 20, 2: 25, 3: 30, 4: 35, 5: 40,
  6: 50, 7: 60, 8: 70, 9: 80, 10: 90,
};

/**
 * HR-based TSS for running/walking (no power meter).
 * hrTSS = (duration_min × IF² × 100) / 60
 * where IF = avg_HR / LTHR
 */
export function calcHrTss(params: {
  duration_min: number;
  avg_hr: number;
  lthr?: number;
}): number {
  const lthr = params.lthr ?? LACTATE_THRESHOLD_HR;
  const intensityFactor = params.avg_hr / lthr;
  const tss = (params.duration_min * Math.pow(intensityFactor, 2) * 100) / 60;
  return Math.round(tss * 10) / 10;
}

/**
 * Power-based TSS for cycling.
 * TSS = (duration_sec × NP × IF) / (FTP × 3600) × 100
 * where IF = NP / FTP
 */
export function calcPowerTss(params: {
  duration_sec: number;
  normalized_power: number;
  ftp: number;
}): number {
  const { duration_sec, normalized_power, ftp } = params;
  const intensityFactor = normalized_power / ftp;
  const tss = ((duration_sec * normalized_power * intensityFactor) / (ftp * 3600)) * 100;
  return Math.round(tss * 10) / 10;
}

/**
 * RPE-based TSS for strength workouts.
 * Uses lookup table: RPE × duration fraction.
 * Rounds RPE to nearest integer for lookup.
 */
export function calcStrengthTss(params: {
  duration_min: number;
  rpe: number;
}): number {
  const { duration_min, rpe } = params;
  const roundedRpe = Math.round(Math.max(1, Math.min(10, rpe)));
  const tssPerHour = RPE_TSS_PER_HOUR[roundedRpe] ?? 50;
  const tss = (tssPerHour * duration_min) / 60;
  return Math.round(tss * 10) / 10;
}

/**
 * Calculate intensity factor from avg HR and LTHR.
 */
export function calcIntensityFactor(avg_hr: number, lthr = LACTATE_THRESHOLD_HR): number {
  return Math.round((avg_hr / lthr) * 1000) / 1000;
}

/**
 * Pick the right TSS method based on available data.
 */
export function calcTss(params: {
  workout_type: string;
  duration_min: number;
  avg_hr?: number | null;
  normalized_power?: number | null;
  ftp?: number | null;
  rpe_session?: number | null;
  lthr?: number;
}): number | null {
  const { workout_type, duration_min, avg_hr, normalized_power, ftp, rpe_session, lthr } = params;

  // Power-based (cycling with power meter)
  if (normalized_power && ftp && (workout_type === 'cardio' || workout_type === 'hiit')) {
    return calcPowerTss({ duration_sec: duration_min * 60, normalized_power, ftp });
  }

  // HR-based (running/walking/elliptical)
  if (avg_hr && (workout_type === 'cardio' || workout_type === 'hiit')) {
    return calcHrTss({ duration_min, avg_hr, lthr });
  }

  // RPE-based (strength)
  if (rpe_session && workout_type === 'strength') {
    return calcStrengthTss({ duration_min, rpe: rpe_session });
  }

  // Hybrid: try HR-based first, fall back to RPE
  if (workout_type === 'hybrid') {
    if (avg_hr) return calcHrTss({ duration_min, avg_hr, lthr });
    if (rpe_session) return calcStrengthTss({ duration_min, rpe: rpe_session });
  }

  return null;
}
