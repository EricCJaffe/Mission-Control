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

  return alerts;
}
