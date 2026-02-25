// ============================================================
// Safety Alerts Engine
// Checks metrics against cardiac safety rules and flags issues
// ============================================================

import type { BPFlagLevel, InsightPriority } from './types';

export type Alert = {
  title: string;
  message: string;
  priority: InsightPriority;
  insight_type: 'alert' | 'recommendation' | 'readiness';
};

/** Classify a BP reading per AHA guidelines. */
export function classifyBP(systolic: number, diastolic: number): BPFlagLevel {
  if (systolic > 180 || diastolic > 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90)  return 'high_stage2';
  if (systolic >= 130 || diastolic >= 80)  return 'high_stage1';
  if (systolic >= 120 && diastolic < 80)   return 'elevated';
  return 'normal';
}

export function bpFlagLabel(flag: BPFlagLevel): string {
  switch (flag) {
    case 'normal':      return 'Normal';
    case 'elevated':    return 'Elevated';
    case 'high_stage1': return 'High (Stage 1)';
    case 'high_stage2': return 'High (Stage 2)';
    case 'crisis':      return 'Hypertensive Crisis';
  }
}

export function bpFlagTailwindClass(flag: BPFlagLevel): string {
  switch (flag) {
    case 'normal':      return 'text-green-700 bg-green-50 border-green-200';
    case 'elevated':    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'high_stage1': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'high_stage2': return 'text-red-700 bg-red-50 border-red-200';
    case 'crisis':      return 'text-red-900 bg-red-100 border-red-500';
  }
}

/**
 * Check body battery and return alert if too low to train.
 */
export function checkBodyBattery(bodyBattery: number): Alert | null {
  if (bodyBattery < 15) {
    return {
      title: 'Body Battery Critical',
      message: `Body battery is ${bodyBattery}. Rest today — your body needs recovery before any training.`,
      priority: 'critical',
      insight_type: 'readiness',
    };
  }
  if (bodyBattery < 25) {
    return {
      title: 'Low Body Battery',
      message: `Body battery is ${bodyBattery}. Recovery only today — Zone 1 walk or rest.`,
      priority: 'warning',
      insight_type: 'readiness',
    };
  }
  return null;
}

/**
 * Check HRV against 7-day average.
 */
export function checkHrv(currentHrv: number, sevenDayAvgHrv: number): Alert | null {
  if (sevenDayAvgHrv === 0) return null;
  const dropPct = ((sevenDayAvgHrv - currentHrv) / sevenDayAvgHrv) * 100;
  if (dropPct >= 20) {
    return {
      title: 'HRV Drop Detected',
      message: `HRV is ${Math.round(dropPct)}% below your 7-day average (${currentHrv} vs ${Math.round(sevenDayAvgHrv)} ms). Possible overtraining or illness — reduce load today.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }
  return null;
}

/**
 * Check resting HR against baseline.
 */
export function checkRhr(currentRhr: number, baselineRhr: number): Alert | null {
  const rise = currentRhr - baselineRhr;
  if (rise >= 5) {
    return {
      title: 'Resting HR Elevated',
      message: `Resting HR is ${rise} bpm above baseline (${currentRhr} vs ${baselineRhr} bpm). Possible illness or insufficient recovery — monitor closely.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }
  return null;
}

/**
 * Check TSB (form) for overreaching.
 */
export function checkFormTsb(tsb: number): Alert | null {
  if (tsb < -25) {
    return {
      title: 'Critical Overreaching',
      message: `Training Stress Balance is ${Math.round(tsb)} — you are deeply overreached. Mandatory rest or deload this week. No high-intensity training.`,
      priority: 'critical',
      insight_type: 'recommendation',
    };
  }
  if (tsb < -10) {
    return {
      title: 'Overreaching Warning',
      message: `Training Stress Balance is ${Math.round(tsb)}. Reduce training volume by 20-30% this week to avoid accumulated fatigue.`,
      priority: 'warning',
      insight_type: 'recommendation',
    };
  }
  return null;
}

/**
 * Check if max HR exceeded the safe ceiling (155 bpm).
 */
export function checkMaxHr(maxHr: number, ceiling = 155): Alert | null {
  if (maxHr > ceiling) {
    return {
      title: 'HR Ceiling Exceeded',
      message: `Max HR of ${maxHr} bpm exceeded the safe ceiling of ${ceiling} bpm. Review this session and ensure you are staying within your adjusted zones.`,
      priority: 'critical',
      insight_type: 'alert',
    };
  }
  return null;
}

/**
 * Check BP reading for dangerous levels.
 */
export function checkBP(systolic: number, diastolic: number): Alert | null {
  const flag = classifyBP(systolic, diastolic);
  if (flag === 'crisis') {
    return {
      title: '🚨 Hypertensive Crisis',
      message: `BP reading of ${systolic}/${diastolic} is dangerously high. Seek immediate medical attention if you feel unwell. Rest completely and recheck in 5 minutes.`,
      priority: 'critical',
      insight_type: 'alert',
    };
  }
  if (flag === 'high_stage2') {
    return {
      title: 'High Blood Pressure (Stage 2)',
      message: `BP reading of ${systolic}/${diastolic} is Stage 2 hypertension. Skip today's workout, rest, and consult your cardiologist if this is recurring.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }
  return null;
}

/**
 * Check for rapid weight change (possible fluid retention — cardiac concern).
 */
export function checkWeightChange(todayLbs: number, yesterdayLbs: number): Alert | null {
  const change = Math.abs(todayLbs - yesterdayLbs);
  if (change >= 3) {
    return {
      title: 'Rapid Weight Change',
      message: `Weight changed by ${change.toFixed(1)} lbs overnight. Significant fluid shifts can be relevant for cardiac patients — monitor and mention to your cardiologist if recurring.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }
  return null;
}

/**
 * Check sleep quality and correlate with next-day performance.
 * Garmin Fenix 8 tracks sleep stages — poor sleep should preemptively suggest lighter workouts.
 */
export function checkSleepQuality(params: {
  sleep_score: number;
  sleep_duration_min: number;
  sleep_target_min: number;
  rolling_7day_debt_min?: number;
}): Alert | null {
  const { sleep_score, sleep_duration_min, sleep_target_min, rolling_7day_debt_min } = params;

  // Critical: very poor sleep
  if (sleep_score < 40 || sleep_duration_min < sleep_target_min * 0.6) {
    return {
      title: 'Poor Sleep — Reduce Today\'s Load',
      message: `Sleep score ${sleep_score}/100 (${(sleep_duration_min / 60).toFixed(1)}h). After poor sleep, drop intensity by 15-20% and avoid HIIT. Your body needs more recovery.`,
      priority: 'warning',
      insight_type: 'readiness',
    };
  }

  // Accumulated sleep debt
  if (rolling_7day_debt_min != null && rolling_7day_debt_min < -180) {
    const hours = Math.abs(rolling_7day_debt_min / 60).toFixed(1);
    return {
      title: 'Significant Sleep Debt',
      message: `You're ${hours}h behind on sleep this week. Accumulated sleep debt compounds fatigue — prioritize sleep and consider a lighter training day.`,
      priority: 'warning',
      insight_type: 'recommendation',
    };
  }

  return null;
}

/**
 * Check BP in context of training load.
 * Elevated BP + high training load = reduce intensity.
 */
export function checkBPTrainingCorrelation(params: {
  latest_systolic: number;
  latest_diastolic: number;
  pre_or_post_workout?: string | null;
  tsb?: number | null;
  weekly_tss?: number;
}): Alert | null {
  const { latest_systolic, latest_diastolic, pre_or_post_workout, tsb, weekly_tss } = params;

  // Post-workout BP should decrease — if elevated, flag concern
  if (pre_or_post_workout === 'post_workout' && latest_systolic >= 140) {
    return {
      title: 'Post-Workout BP Elevated',
      message: `BP ${latest_systolic}/${latest_diastolic} after workout is higher than expected. Post-exercise BP should drop. If this persists, discuss with your cardiologist.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }

  // High BP combined with overreaching
  if (latest_systolic >= 135 && tsb != null && tsb < -10) {
    return {
      title: 'BP + Fatigue Concern',
      message: `BP is elevated (${latest_systolic}/${latest_diastolic}) while you're overreaching (TSB ${Math.round(tsb)}). Reduce training load and monitor BP closely.`,
      priority: 'warning',
      insight_type: 'recommendation',
    };
  }

  return null;
}

/**
 * Check medication timing relative to workout.
 * Carvedilol's HR suppression peaks 1-2 hours after dosing.
 */
export function checkMedicationTiming(params: {
  meds_taken_at: string;
  workout_start_time: string;
}): Alert | null {
  try {
    const medsTime = parseTimeToMinutes(params.meds_taken_at);
    const workoutTime = parseTimeToMinutes(params.workout_start_time);
    const gapMinutes = workoutTime - medsTime;

    if (gapMinutes >= 0 && gapMinutes <= 90) {
      return {
        title: 'Medication Timing Note',
        message: `Workout starts ${gapMinutes} min after Carvedilol. HR is most suppressed 60-120 min post-dose. Your HR may read artificially low — rely more on RPE for intensity today.`,
        priority: 'info',
        insight_type: 'recommendation',
      };
    }
  } catch {
    // Can't parse times — skip this check
  }
  return null;
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Check HR recovery trend (cool-down metric).
 * Improving HR recovery = strongest indicator of cardiac fitness.
 */
export function checkHrRecovery(params: {
  current_recovery_1min: number;
  avg_recovery_1min: number;
}): Alert | null {
  const { current_recovery_1min, avg_recovery_1min } = params;

  // Good sign: recovery improving
  if (current_recovery_1min > avg_recovery_1min + 5) {
    return {
      title: 'HR Recovery Improving',
      message: `HR dropped ${current_recovery_1min} bpm in 1 min post-workout (avg ${avg_recovery_1min}). This is a strong sign of improving cardiac fitness.`,
      priority: 'positive',
      insight_type: 'recommendation',
    };
  }

  // Concerning: recovery declining
  if (current_recovery_1min < avg_recovery_1min - 8 && current_recovery_1min < 20) {
    return {
      title: 'HR Recovery Slower Than Usual',
      message: `HR only dropped ${current_recovery_1min} bpm in 1 min (avg ${avg_recovery_1min}). Slow recovery can indicate fatigue or overtraining.`,
      priority: 'warning',
      insight_type: 'alert',
    };
  }

  return null;
}

/**
 * Run all metric checks and return any triggered alerts.
 */
export function runAllAlerts(metrics: {
  body_battery?: number | null;
  hrv_ms?: number | null;
  hrv_7day_avg?: number | null;
  resting_hr?: number | null;
  rhr_baseline?: number | null;
  tsb?: number | null;
  max_hr_today?: number | null;
  weight_today?: number | null;
  weight_yesterday?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  bp_pre_or_post_workout?: string | null;
  sleep_score?: number | null;
  sleep_duration_min?: number | null;
  sleep_target_min?: number;
  sleep_debt_7day_min?: number | null;
  meds_taken_at?: string | null;
  workout_start_time?: string | null;
  hr_recovery_1min?: number | null;
  avg_recovery_1min?: number | null;
}): Alert[] {
  const alerts: Alert[] = [];

  if (metrics.body_battery != null) {
    const a = checkBodyBattery(metrics.body_battery);
    if (a) alerts.push(a);
  }

  if (metrics.hrv_ms != null && metrics.hrv_7day_avg != null) {
    const a = checkHrv(metrics.hrv_ms, metrics.hrv_7day_avg);
    if (a) alerts.push(a);
  }

  if (metrics.resting_hr != null && metrics.rhr_baseline != null) {
    const a = checkRhr(metrics.resting_hr, metrics.rhr_baseline);
    if (a) alerts.push(a);
  }

  if (metrics.tsb != null) {
    const a = checkFormTsb(metrics.tsb);
    if (a) alerts.push(a);
  }

  if (metrics.max_hr_today != null) {
    const a = checkMaxHr(metrics.max_hr_today);
    if (a) alerts.push(a);
  }

  if (metrics.weight_today != null && metrics.weight_yesterday != null) {
    const a = checkWeightChange(metrics.weight_today, metrics.weight_yesterday);
    if (a) alerts.push(a);
  }

  // New checks: sleep quality
  if (metrics.sleep_score != null && metrics.sleep_duration_min != null) {
    const a = checkSleepQuality({
      sleep_score: metrics.sleep_score,
      sleep_duration_min: metrics.sleep_duration_min,
      sleep_target_min: metrics.sleep_target_min ?? 450,
      rolling_7day_debt_min: metrics.sleep_debt_7day_min ?? undefined,
    });
    if (a) alerts.push(a);
  }

  // New checks: BP + training correlation
  if (metrics.bp_systolic != null && metrics.bp_diastolic != null) {
    const bpAlert = checkBP(metrics.bp_systolic, metrics.bp_diastolic);
    if (bpAlert) alerts.push(bpAlert);

    const corrAlert = checkBPTrainingCorrelation({
      latest_systolic: metrics.bp_systolic,
      latest_diastolic: metrics.bp_diastolic,
      pre_or_post_workout: metrics.bp_pre_or_post_workout,
      tsb: metrics.tsb,
    });
    if (corrAlert) alerts.push(corrAlert);
  }

  // New checks: medication timing
  if (metrics.meds_taken_at && metrics.workout_start_time) {
    const a = checkMedicationTiming({
      meds_taken_at: metrics.meds_taken_at,
      workout_start_time: metrics.workout_start_time,
    });
    if (a) alerts.push(a);
  }

  // New checks: HR recovery
  if (metrics.hr_recovery_1min != null && metrics.avg_recovery_1min != null) {
    const a = checkHrRecovery({
      current_recovery_1min: metrics.hr_recovery_1min,
      avg_recovery_1min: metrics.avg_recovery_1min,
    });
    if (a) alerts.push(a);
  }

  return alerts;
}
