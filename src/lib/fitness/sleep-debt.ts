// ============================================================
// SLEEP DEBT TRACKER
// Running balance of sleep surplus/deficit
// Compounds over time — critical for cardiac patient recovery
// ============================================================

import type { SleepDebt, SleepDebtStatus } from './types';

/**
 * Calculate sleep debt from nightly records
 */
export function calculateSleepDebt(params: {
  nightly_records: { date: string; sleep_duration_min: number | null }[];
  target_min: number;
}): SleepDebt {
  const { nightly_records, target_min } = params;

  // Take last 14 days of records
  const sorted = [...nightly_records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const last7 = sorted.slice(0, 7);
  const last14 = sorted.slice(0, 14);

  const sum7 = last7.reduce((acc, r) => acc + ((r.sleep_duration_min ?? 0) - target_min), 0);
  const sum14 = last14.reduce((acc, r) => acc + ((r.sleep_duration_min ?? 0) - target_min), 0);

  const status = classifySleepDebt(sum7);

  // Estimate impact on readiness: significant debt reduces readiness
  // ~1 point per 30 min of weekly deficit
  const impact = Math.max(-15, Math.min(5, Math.round(sum7 / 30)));

  return {
    target_min,
    rolling_7day_balance_min: sum7,
    rolling_14day_balance_min: sum14,
    status,
    impact_on_readiness: impact,
  };
}

function classifySleepDebt(balance7day: number): SleepDebtStatus {
  if (balance7day > 30) return 'surplus';
  if (balance7day >= -30) return 'balanced';
  if (balance7day >= -120) return 'mild_debt';
  if (balance7day >= -300) return 'significant_debt';
  return 'critical_debt';
}

/**
 * Format sleep debt for display
 */
export function formatSleepDebt(debt: SleepDebt): { text: string; color: string } {
  const balance = debt.rolling_7day_balance_min;
  const absMinutes = Math.abs(balance);

  let text: string;
  if (absMinutes < 60) {
    text = `${balance >= 0 ? '+' : '-'}${absMinutes} min this week`;
  } else {
    const hours = (absMinutes / 60).toFixed(1);
    text = `${balance >= 0 ? '+' : '-'}${hours}h this week`;
  }

  const color =
    debt.status === 'surplus' || debt.status === 'balanced'
      ? 'green'
      : debt.status === 'mild_debt'
        ? 'yellow'
        : 'red';

  return { text, color };
}
