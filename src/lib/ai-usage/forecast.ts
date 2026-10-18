/*
 * Per plan: how much of the current window is used, how fast it is going,
 * and whether it runs out before it resets.
 *
 * Used:
 *   percent plans  the latest vendor reading. `secondary_used_pct ?? primary`:
 *                  Codex logs primary = 5h and secondary = weekly, and the plan
 *                  budget is the weekly one; a manual reading carries only
 *                  primary. A reading whose own `resets_at` has passed belongs
 *                  to the previous window, so used is 0 until the next one.
 *   token plans    tokens since the window started ÷ `limit_value`, labeled an
 *                  estimate when `limit_is_estimate`. A manual percent reading
 *                  inside the window and under 48h old overrides it (it is
 *                  the number off the vendor's own usage page).
 *
 * Burn, per day:
 *   token basis    tokens over the last 7 ET days ÷ 7, as percent of limit.
 *   percent basis  used ÷ days elapsed in the window (a floor of 6 hours, so
 *                  one early reading does not project a run-out by lunch).
 *
 * Red / yellow / green (the framework's words, never "amber"):
 *   none    no reading in 48 hours. Shown gray: no reading is not a green.
 *   red     ≥ 90% used, or projected to run out before the reset.
 *   yellow  ≥ 70% used, or projected to run out within a day after it.
 *   green   otherwise.
 */

import { addDays, today } from '../day.ts';
import type { AiPlan, AiUsageSnapshot } from './types.ts';
import { DAY_MS, resetWindow, type ResetWindow } from './window.ts';

export type Rag = 'red' | 'yellow' | 'green' | 'none';

export const STALE_AFTER_HOURS = 48;
export const RED_AT = 90;
export const YELLOW_AT = 70;

export type PlanStatus = {
  slug: string;
  name: string;
  basis: 'tokens' | 'percent' | 'none';
  /** Percent of the window used, 0..100+ (null when unknown). */
  usedPct: number | null;
  /** True when usedPct is derived from an estimated token budget. */
  isEstimate: boolean;
  tokensInWindow: number;
  limitTokens: number | null;
  burnPctPerDay: number | null;
  tokensPerDay7: number;
  runOutAt: Date | null;
  window: ResetWindow;
  rag: Rag;
  lastReadingAt: Date | null;
  hoursSinceReading: number | null;
  lastSource: 'log' | 'manual' | null;
};

type Row = Pick<
  AiUsageSnapshot,
  | 'plan_slug'
  | 'source'
  | 'day'
  | 'tokens_total'
  | 'primary_used_pct'
  | 'primary_resets_at'
  | 'secondary_used_pct'
  | 'secondary_resets_at'
  | 'used_value'
  | 'limit_value'
  | 'last_at'
  | 'captured_at'
>;

type Reading = { pct: number; resetsAt: string | null; at: Date; source: Row['source'] };

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readingAt(r: Row): Date {
  const a = r.last_at ? new Date(r.last_at).getTime() : 0;
  const b = r.captured_at ? new Date(r.captured_at).getTime() : 0;
  return new Date(Math.max(a || 0, b || 0));
}

/** The percent a row carries, if any, and the reset that goes with it. */
export function rowReading(r: Row): Reading | null {
  const secondary = toNum(r.secondary_used_pct);
  const primary = toNum(r.primary_used_pct);
  let pct: number | null = null;
  let resetsAt: string | null = null;
  if (secondary !== null) {
    pct = secondary;
    resetsAt = r.secondary_resets_at;
  } else if (primary !== null) {
    pct = primary;
    resetsAt = r.primary_resets_at;
  } else {
    const used = toNum(r.used_value);
    const limit = toNum(r.limit_value);
    if (used !== null && limit) pct = (used / limit) * 100;
  }
  if (pct === null) return null;
  return { pct, resetsAt, at: readingAt(r), source: r.source };
}

function latestReading(rows: Row[], source?: Row['source']): Reading | null {
  let best: Reading | null = null;
  for (const r of rows) {
    if (source && r.source !== source) continue;
    const reading = rowReading(r);
    if (reading && (!best || reading.at.getTime() > best.at.getTime())) best = reading;
  }
  return best;
}

export function rag(input: { usedPct: number | null; runOutAt: Date | null; resetAt: Date; stale: boolean }): Rag {
  const { usedPct, runOutAt, resetAt, stale } = input;
  if (stale || usedPct === null) return 'none';
  if (usedPct >= RED_AT) return 'red';
  if (runOutAt && runOutAt.getTime() < resetAt.getTime()) return 'red';
  if (usedPct >= YELLOW_AT) return 'yellow';
  if (runOutAt && runOutAt.getTime() - resetAt.getTime() <= DAY_MS) return 'yellow';
  return 'green';
}

export function planStatus(
  plan: Pick<AiPlan, 'slug' | 'name' | 'limit_kind' | 'limit_value' | 'limit_is_estimate' | 'reset_cadence' | 'reset_anchor'>,
  allRows: Row[],
  now: Date,
): PlanStatus {
  const rows = allRows.filter((r) => r.plan_slug === plan.slug);
  const todayEt = today(now);

  let lastReadingAt: Date | null = null;
  let lastSource: PlanStatus['lastSource'] = null;
  for (const r of rows) {
    const at = readingAt(r);
    if (at.getTime() > 0 && (!lastReadingAt || at.getTime() > lastReadingAt.getTime())) {
      lastReadingAt = at;
      lastSource = r.source;
    }
  }
  const hoursSinceReading = lastReadingAt ? (now.getTime() - lastReadingAt.getTime()) / 3_600_000 : null;
  const stale = hoursSinceReading === null || hoursSinceReading > STALE_AFTER_HOURS;

  const reading = plan.limit_kind === 'percent' ? latestReading(rows) : latestReading(rows, 'manual');
  const window = resetWindow(plan, now, reading?.resetsAt);

  const tokensInWindow = rows
    .filter((r) => r.day >= window.startDay && r.day <= todayEt)
    .reduce((sum, r) => sum + (toNum(r.tokens_total) ?? 0), 0);
  const since7 = addDays(todayEt, -6);
  const tokensPerDay7 =
    rows.filter((r) => r.day >= since7 && r.day <= todayEt).reduce((s, r) => s + (toNum(r.tokens_total) ?? 0), 0) / 7;
  const limitTokens = plan.limit_kind === 'tokens' ? toNum(plan.limit_value) : null;

  const readingInWindow = (r: Reading | null): Reading | null => {
    if (!r) return null;
    if (r.resetsAt && new Date(r.resetsAt).getTime() <= now.getTime()) return null; // rolled over
    if (r.at.getTime() < window.startAt.getTime()) return null;
    return r;
  };

  let basis: PlanStatus['basis'] = 'none';
  let usedPct: number | null = null;
  let isEstimate = false;
  let burnPctPerDay: number | null = null;

  const elapsedDays = Math.max((now.getTime() - window.startAt.getTime()) / DAY_MS, 0.25);

  if (plan.limit_kind === 'percent') {
    if (reading) {
      basis = 'percent';
      const current = readingInWindow(reading);
      usedPct = current ? current.pct : 0;
      burnPctPerDay = usedPct / elapsedDays;
    }
  } else {
    const manual = readingInWindow(reading);
    const fresh = manual && (now.getTime() - manual.at.getTime()) / 3_600_000 <= STALE_AFTER_HOURS;
    if (manual && fresh) {
      basis = 'percent';
      usedPct = manual.pct;
      burnPctPerDay = usedPct / elapsedDays;
    } else if (limitTokens && limitTokens > 0 && rows.length) {
      basis = 'tokens';
      usedPct = (tokensInWindow / limitTokens) * 100;
      isEstimate = !!plan.limit_is_estimate;
      burnPctPerDay = (tokensPerDay7 / limitTokens) * 100;
    }
  }

  let runOutAt: Date | null = null;
  if (usedPct !== null) {
    if (usedPct >= 100) runOutAt = now;
    else if (burnPctPerDay && burnPctPerDay > 0) {
      runOutAt = new Date(now.getTime() + ((100 - usedPct) / burnPctPerDay) * DAY_MS);
    }
  }

  return {
    slug: plan.slug,
    name: plan.name,
    basis,
    usedPct,
    isEstimate,
    tokensInWindow,
    limitTokens,
    burnPctPerDay,
    tokensPerDay7,
    runOutAt,
    window,
    rag: rag({ usedPct, runOutAt, resetAt: window.resetAt, stale }),
    lastReadingAt,
    hoursSinceReading,
    lastSource,
  };
}
