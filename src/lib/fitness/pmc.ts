// ============================================================
// Performance Management Chart (PMC) Calculations
// CTL = Chronic Training Load (42-day EWA of daily TSS)
// ATL = Acute Training Load (7-day EWA of daily TSS)
// TSB = Training Stress Balance (CTL yesterday - ATL yesterday)
// ============================================================

import type { FormStatus } from './types';

export type PMCDay = {
  date: string;       // YYYY-MM-DD
  daily_tss: number;
  ctl: number;
  atl: number;
  tsb: number;
  form_status: FormStatus;
  ramp_rate_7d: number | null;
  ramp_rate_28d: number | null;
};

const CTL_DAYS = 42;
const ATL_DAYS = 7;

function ewmaFactor(days: number) {
  return 1 / days;
}

/**
 * Derive FormStatus from TSB value.
 */
export function getFormStatus(tsb: number): FormStatus {
  if (tsb > 15) return 'fresh';
  if (tsb >= 0) return 'optimal';
  if (tsb >= -10) return 'fatigued';
  if (tsb >= -25) return 'overreaching';
  return 'critical';
}

/**
 * Calculate the full PMC from a sorted array of { date, daily_tss } entries.
 * Returns one PMCDay per calendar day in the range.
 * Seed CTL/ATL with 0 if no prior data exists.
 */
export function calcPmc(
  tssHistory: Array<{ date: string; daily_tss: number }>,
  seedCtl = 0,
  seedAtl = 0,
): PMCDay[] {
  if (tssHistory.length === 0) return [];

  // Build a map for fast TSS lookup
  const tssMap = new Map(tssHistory.map((d) => [d.date, d.daily_tss]));

  // Fill in every calendar day from first to last entry
  const sorted = [...tssHistory].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = new Date(sorted[0].date);
  const endDate = new Date(sorted[sorted.length - 1].date);

  const days: PMCDay[] = [];
  let prevCtl = seedCtl;
  let prevAtl = seedAtl;
  const ctlFactor = ewmaFactor(CTL_DAYS);
  const atlFactor = ewmaFactor(ATL_DAYS);

  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10);
    const tss = tssMap.get(dateStr) ?? 0;

    const tsb = prevCtl - prevAtl;
    const ctl = prevCtl + (tss - prevCtl) * ctlFactor;
    const atl = prevAtl + (tss - prevAtl) * atlFactor;

    const rampRate7d = days.length >= 7
      ? round2(ctl - days[days.length - 7].ctl)
      : null;
    const rampRate28d = days.length >= 28
      ? round2(ctl - days[days.length - 28].ctl)
      : null;

    days.push({
      date: dateStr,
      daily_tss: tss,
      ctl: round2(ctl),
      atl: round2(atl),
      tsb: round2(tsb),
      form_status: getFormStatus(tsb),
      ramp_rate_7d: rampRate7d,
      ramp_rate_28d: rampRate28d,
    });

    prevCtl = ctl;
    prevAtl = atl;
  }

  return days;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Convenience: calculate a single day's PMC values given previous CTL/ATL.
 */
export function calcNextPmcDay(params: {
  today_tss: number;
  prev_ctl: number;
  prev_atl: number;
}): { ctl: number; atl: number; tsb: number; form_status: FormStatus } {
  const { today_tss, prev_ctl, prev_atl } = params;
  const tsb = prev_ctl - prev_atl;
  const ctl = round2(prev_ctl + (today_tss - prev_ctl) * ewmaFactor(CTL_DAYS));
  const atl = round2(prev_atl + (today_tss - prev_atl) * ewmaFactor(ATL_DAYS));
  return { ctl, atl, tsb: round2(tsb), form_status: getFormStatus(tsb) };
}
