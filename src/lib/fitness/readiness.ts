// ============================================================
// COMPOSITE READINESS SCORE — Whoop-style 0-100
// Weights tuned for cardiac patient on beta-blockers
// ============================================================

import type { ReadinessInputs, ReadinessResult, ReadinessFactor } from './types';
import { summariseRecovery, recoveryNudge, type RecoverySessionInput } from './recovery-readiness';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const WEIGHTS = {
  hrv: 0.25,
  rhr: 0.20,
  sleep: 0.15,
  bodyBattery: 0.10,
  form: 0.13,
  bloodPressure: 0.10,
  // Self-rated soreness / perceived recovery. Small on purpose: it is the only
  // musculoskeletal signal in the model, but it is also the only self-reported
  // one, and self-reports drift. Taken from form, which already overlaps with
  // it — TSB is a modelled proxy for exactly the fatigue this measures directly.
  musculoskeletal: 0.05,
  weather: 0.02,
} as const;

function calcHrvScore(hrv: number, baseline: number): { score: number; detail: string } {
  const deviation = ((hrv - baseline) / baseline) * 100;
  const score = clamp(70 + deviation * 3, 0, 100);
  const dir = deviation >= 0 ? '+' : '';
  return { score: Math.round(score), detail: `${dir}${deviation.toFixed(0)}% from baseline` };
}

function calcRhrScore(rhr: number, baseline: number): { score: number; detail: string } {
  const deviation = rhr - baseline;
  const score = clamp(80 - deviation * 10, 0, 100);
  const dir = deviation >= 0 ? '+' : '';
  return { score: Math.round(score), detail: `${dir}${deviation} bpm from baseline` };
}

function calcSleepScore(
  sleepScore: number,
  durationMin: number,
  targetMin: number,
): { score: number; detail: string } {
  const durationRatio = durationMin / targetMin;
  const durationScore = clamp(durationRatio * 100, 0, 100);
  const combined = sleepScore * 0.6 + durationScore * 0.4;
  const hours = (durationMin / 60).toFixed(1);
  return { score: Math.round(combined), detail: `${hours}h sleep, score ${sleepScore}` };
}

function calcFormScore(tsb: number): { score: number; detail: string } {
  let score: number;
  let label: string;
  if (tsb > 15) { score = 90; label = 'Very fresh (possible detraining)'; }
  else if (tsb >= 5) { score = 100; label = 'Optimal form'; }
  else if (tsb >= 0) { score = 80; label = 'Good form'; }
  else if (tsb >= -10) { score = 50; label = 'Fatigued'; }
  else if (tsb >= -25) { score = 20; label = 'Overreaching'; }
  else { score = 0; label = 'Critical — rest required'; }
  return { score, detail: `TSB ${tsb.toFixed(0)}: ${label}` };
}

function calcBpScore(
  systolic: number | null,
  diastolic: number | null,
): { score: number | null; detail: string } {
  // Was 80 — a fabricated "probably fine". Downstream, a made-up score is
  // indistinguishable from a measured one, so a missing reading quietly
  // propped the total up. It now drops out and the other weights renormalise.
  if (systolic === null || diastolic === null) {
    return { score: null, detail: 'No recent reading' };
  }
  if (systolic < 120 && diastolic < 80) return { score: 100, detail: `${systolic}/${diastolic} — normal` };
  if (systolic < 130) return { score: 70, detail: `${systolic}/${diastolic} — elevated` };
  if (systolic < 140) return { score: 40, detail: `${systolic}/${diastolic} — high stage 1` };
  return { score: 10, detail: `${systolic}/${diastolic} — high stage 2+` };
}

function calcWeatherScore(
  heatIndex: number | null,
  outdoorPlanned: boolean,
): { score: number | null; detail: string } {
  // Indoor genuinely is a perfect weather score — nothing outside can hurt the
  // session. Missing data is a different thing entirely and drops out.
  if (!outdoorPlanned) return { score: 100, detail: 'Indoor session' };
  if (heatIndex === null) return { score: null, detail: 'No weather data' };
  if (heatIndex < 80) return { score: 100, detail: `${heatIndex}°F — comfortable` };
  if (heatIndex < 85) return { score: 80, detail: `${heatIndex}°F — warm` };
  if (heatIndex < 90) return { score: 50, detail: `${heatIndex}°F — caution` };
  if (heatIndex < 95) return { score: 25, detail: `${heatIndex}°F — reduce intensity` };
  return { score: 10, detail: `${heatIndex}°F — danger zone` };
}

export function calculateReadinessScore(inputs: ReadinessInputs): ReadinessResult {
  const hrv = calcHrvScore(inputs.hrv_status, inputs.hrv_7day_baseline);
  const rhr = calcRhrScore(inputs.resting_hr, inputs.rhr_baseline);
  const sleep = calcSleepScore(inputs.sleep_score, inputs.sleep_duration_min, inputs.sleep_target_min);
  const bb = { score: inputs.body_battery, detail: `Body Battery ${inputs.body_battery}` };
  const form = calcFormScore(inputs.form_tsb);
  const bp = calcBpScore(inputs.latest_bp_systolic, inputs.latest_bp_diastolic);
  const weather = calcWeatherScore(inputs.heat_index_f, inputs.outdoor_planned);

  const recovery = summariseRecovery(inputs.recovery_sessions ?? [], inputs.now ?? new Date());

  const raw: Array<{ name: string; score: number | null; weight: number; detail: string }> = [
    { name: 'HRV', score: hrv.score, weight: WEIGHTS.hrv, detail: hrv.detail },
    { name: 'Resting HR', score: rhr.score, weight: WEIGHTS.rhr, detail: rhr.detail },
    { name: 'Sleep', score: sleep.score, weight: WEIGHTS.sleep, detail: sleep.detail },
    { name: 'Body Battery', score: bb.score, weight: WEIGHTS.bodyBattery, detail: bb.detail },
    { name: 'Form (TSB)', score: form.score, weight: WEIGHTS.form, detail: form.detail },
    { name: 'Blood Pressure', score: bp.score, weight: WEIGHTS.bloodPressure, detail: bp.detail },
    { name: 'Soreness', score: recovery.score, weight: WEIGHTS.musculoskeletal, detail: recovery.detail },
    { name: 'Weather', score: weather.score, weight: WEIGHTS.weather, detail: weather.detail },
  ];

  // Renormalise over the factors that actually have data, so a missing input
  // neither drags the score down nor silently props it up. With everything
  // present this is identical to the fixed weights.
  const available = raw.filter((f) => f.score !== null);
  const availableWeight = available.reduce((sum, f) => sum + f.weight, 0);

  const factors: ReadinessFactor[] = raw.map((f) => {
    const weight = f.score === null || availableWeight === 0 ? 0 : f.weight / availableWeight;
    return {
      name: f.name,
      score: f.score,
      weight,
      weighted_contribution: f.score === null ? 0 : f.score * weight,
      detail: f.detail,
    };
  });

  const score = availableWeight === 0
    ? 0
    : Math.round(factors.reduce((sum, f) => sum + f.weighted_contribution, 0));

  const color = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
  const label = score >= 70 ? 'Primed' : score >= 40 ? 'Moderate' : 'Recovery';

  let recommendation: string;
  if (score >= 80) recommendation = "You're primed. Hit today's session hard.";
  else if (score >= 70) recommendation = 'Good recovery. Execute as planned.';
  else if (score >= 55) recommendation = 'Moderate readiness. Consider reducing intensity 10-15%.';
  else if (score >= 40) recommendation = 'Below average. Drop to Zone 1-2 only, reduce volume 30%.';
  else recommendation = 'Recovery day. Swap for a light walk or complete rest.';

  return {
    score,
    color,
    label,
    factors,
    recommendation,
    recovery: {
      sessions_last_14d: recovery.sessionsInWindow,
      days_since_last: recovery.daysSinceLast,
      modalities: recovery.modalities,
      nudge: recoveryNudge(recovery, score),
    },
    missing_factors: raw.filter((f) => f.score === null).map((f) => f.name),
  };
}
