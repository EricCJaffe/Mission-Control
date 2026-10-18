/*
 * Per plan: how much of the current window is used, how fast it is going,
 * and whether it runs out before it resets.
 *
 * Used:
 *   percent plans  the latest vendor reading. Codex logs primary = 5h and
 *                  secondary = weekly. A log row's primary counts only for a
 *                  5h plan; every longer plan uses the secondary (weekly)
 *                  meter alone, and a row with only a 5h number leaves it
 *                  unknown. A manual reading carries its percent in primary.
 *                  A reading whose own `resets_at` has passed, or that was
 *                  taken before this window began, is not current: the plan
 *                  shows gray ("reset since last reading"), never red.
 *   token plans    tokens since the window started ÷ `limit_value`, labeled an
 *                  estimate when `limit_is_estimate`. A manual percent reading
 *                  inside the window and under 48h old overrides it (it is
 *                  the number off the vendor's own usage page).
 *
 * Burn, per day:
 *   token basis    tokens over the last 7 ET days ÷ 7, as percent of limit.
 *   percent basis  used ÷ days from the window start to the READING (a floor
 *                  of 6 hours, so one early reading does not project a run-out
 *                  by lunch). Run-out is projected from the reading too.
 *
 * Observation time: a log reading is `meter_at ?? last_at`, never
 * `captured_at` (re-importing old history must not make it look fresh). A
 * manual reading is `meter_at ?? midday ET of its day`, ties broken by
 * `captured_at`. Between a manual reading and a CLI meter, the newer wins.
 *
 * Freshness: on a percent basis, "Last reading" and the 48h cutoff come from
 * the selected percent reading ONLY. A recent token-only or 5h-only row says
 * nothing about the weekly meter and must not make a 3-day-old one look live.
 * On a token basis every row with an observation time counts.
 *
 * Red / yellow / green (the framework's words, never "amber"):
 *   none    no reading in 48 hours. Shown gray: no reading is not a green.
 *   (thresholds in config/ai-usage-thresholds.json)
 *   early   first ~day / 15% of a window: green with 'too early to forecast',
 *           red only at ≥ 80% used.
 *   red     ≥ 90% used, or run-out before the reset AND ≥ 25% used.
 *   yellow  ≥ 70% used, run-out before reset under 25%, or within a day after it.
 *   green   otherwise.
 */

import { addDays, today } from '../day.ts';
import T from '../../../config/ai-usage-thresholds.json' with { type: 'json' };
import type { AiPlan, AiUsageSnapshot } from './types.ts';
import { DAY_MS, etMidnight, resetWindow, type ResetWindow } from './window.ts';

export type Rag = 'red' | 'yellow' | 'green' | 'none';

export const STALE_AFTER_HOURS = 48;
export const THRESHOLDS = T;
export const RED_AT = T.redAtPct;
export const YELLOW_AT = T.yellowAtPct;

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
  /** Why a plan with readings is still gray. */
  note: 'reset-since-reading' | 'no-cap-known' | 'too-early' | null;
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
  | 'meter_at'
  | 'last_at'
  | 'captured_at'
>;

type Reading = {
  pct: number;
  resetsAt: string | null;
  /** Which window the percent came from; a log row's primary is Codex's 5h window. */
  resetFrom: 'secondary' | 'primary' | null;
  at: Date;
  /** Tie-break for readings observed at the same instant. */
  capturedMs: number;
  source: Row['source'];
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ms = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** When a row's numbers were observed; null when a log row says nothing about it. */
export function observedAt(r: Pick<Row, 'source' | 'day' | 'meter_at' | 'last_at' | 'captured_at'>): Date | null {
  if (r.source === 'manual') {
    // When the reading was taken, else midday ET of the day it is for (the
    // collector's convention). captured_at is when it was saved, which for a
    // backdated entry is not when it was true.
    const t = ms(r.meter_at);
    if (t !== null) return new Date(t);
    if (!r.day) return null;
    return new Date(etMidnight(r.day).getTime() + 12 * 3_600_000);
  }
  const t = ms(r.meter_at) ?? ms(r.last_at);
  return t === null ? null : new Date(t);
}

/** Display name without a price: flat plans are not billed per token, so no "$" by default. */
export function planLabel(name: string): string {
  return name.replace(/\s*\(?\$\s?[\d,.]+\)?/g, '').trim() || name;
}

/**
 * The percent a row carries for a plan of this cadence, and the reset that
 * goes with it. A log row's primary is the 5h meter; it counts only for a 5h
 * plan.
 */
export function rowReading(r: Row, cadence: AiPlan['reset_cadence'] = 'weekly'): Reading | null {
  const at = observedAt(r);
  if (!at) return null;
  let pct: number | null = null;
  let resetsAt: string | null = null;
  let resetFrom: Reading['resetFrom'] = null;
  const secondary = toNum(r.secondary_used_pct);
  const primary = toNum(r.primary_used_pct);
  if (r.source === 'manual') {
    if (primary !== null) [pct, resetsAt, resetFrom] = [primary, r.primary_resets_at, 'primary'];
    else if (secondary !== null) [pct, resetsAt, resetFrom] = [secondary, r.secondary_resets_at, 'secondary'];
  } else if (cadence === '5h') {
    if (primary !== null) [pct, resetsAt, resetFrom] = [primary, r.primary_resets_at, 'primary'];
  } else if (secondary !== null) {
    [pct, resetsAt, resetFrom] = [secondary, r.secondary_resets_at, 'secondary'];
  }
  if (pct === null) {
    const used = toNum(r.used_value);
    const limit = toNum(r.limit_value);
    if (used !== null && limit) pct = (used / limit) * 100;
  }
  if (pct === null) return null;
  return { pct, resetsAt, resetFrom, at, capturedMs: ms(r.captured_at) ?? 0, source: r.source };
}

const newer = (a: Reading, b: Reading) =>
  a.at.getTime() !== b.at.getTime() ? a.at.getTime() > b.at.getTime() : a.capturedMs > b.capturedMs;

function latestReading(rows: Row[], cadence: AiPlan['reset_cadence'], source?: Row['source']): Reading | null {
  let best: Reading | null = null;
  for (const r of rows) {
    if (source && r.source !== source) continue;
    const reading = rowReading(r, cadence);
    if (reading && (!best || newer(reading, best))) best = reading;
  }
  return best;
}

/**
 * Early in a window the pace is noise: a few hours of use projected over a
 * week cried wolf (Codex red at 4% on 2026-10-18). Early = under
 * earlyWindowFraction of the window, or under earlyMinHours (capped at half
 * a short window).
 */
export function isEarly(elapsedMs: number, windowMs: number): boolean {
  const H = 3_600_000;
  return elapsedMs < windowMs * T.earlyWindowFraction || elapsedMs < Math.min(T.earlyMinHours * H, windowMs / 2);
}

export function rag(input: { usedPct: number | null; runOutAt: Date | null; resetAt: Date; stale: boolean; early?: boolean }): Rag {
  const { usedPct, runOutAt, resetAt, stale, early } = input;
  if (stale || usedPct === null) return 'none';
  if (usedPct >= RED_AT) return 'red';
  if (early) return usedPct >= T.earlyRedAtPct ? 'red' : usedPct >= YELLOW_AT ? 'yellow' : 'green';
  const beforeReset = !!runOutAt && runOutAt.getTime() < resetAt.getTime();
  if (beforeReset && usedPct >= T.runOutRedFloorPct) return 'red';
  if (usedPct >= YELLOW_AT || beforeReset) return 'yellow';
  if (runOutAt && runOutAt.getTime() - resetAt.getTime() <= T.yellowAfterResetHours * 3_600_000) return 'yellow';
  return 'green';
}

export function planStatus(
  plan: Pick<AiPlan, 'slug' | 'name' | 'limit_kind' | 'limit_value' | 'limit_is_estimate' | 'reset_cadence' | 'reset_anchor'>,
  allRows: Row[],
  now: Date,
): PlanStatus {
  const rows = allRows.filter((r) => r.plan_slug === plan.slug);
  const todayEt = today(now);

  let rowsLastAt: Date | null = null;
  let rowsLastSource: PlanStatus['lastSource'] = null;
  for (const r of rows) {
    const at = observedAt(r);
    if (at && (!rowsLastAt || at.getTime() > rowsLastAt.getTime())) {
      rowsLastAt = at;
      rowsLastSource = r.source;
    }
  }

  const cadence = plan.reset_cadence;
  const reading =
    plan.limit_kind === 'percent' ? latestReading(rows, cadence) : latestReading(rows, cadence, 'manual');
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
  let note: PlanStatus['note'] = null;
  // Where the projection starts: the reading for a percent basis, now for tokens.
  let measuredAt = now;

  // Burn is the pace up to when the reading was taken, not up to now: a
  // reading a day old divided by a day more would understate it.
  const burnOf = (r: Reading, pctUsed: number) =>
    // At least burnMinHours of window, so a first-hours spike is not the pace.
    pctUsed / Math.max((r.at.getTime() - window.startAt.getTime()) / DAY_MS, T.burnMinHours / 24);

  if (plan.limit_kind === 'percent') {
    if (reading) {
      basis = 'percent';
      const current = readingInWindow(reading);
      if (current) {
        usedPct = current.pct;
        burnPctPerDay = burnOf(current, usedPct);
        measuredAt = current.at;
      } else {
        note = 'reset-since-reading';
      }
    }
  } else {
    const manual = readingInWindow(reading);
    const fresh = manual && (now.getTime() - manual.at.getTime()) / 3_600_000 <= STALE_AFTER_HOURS;
    if (manual && fresh) {
      basis = 'percent';
      usedPct = manual.pct;
      burnPctPerDay = burnOf(manual, usedPct);
      measuredAt = manual.at;
    } else if (limitTokens && limitTokens > 0 && rows.length) {
      basis = 'tokens';
      usedPct = (tokensInWindow / limitTokens) * 100;
      isEstimate = !!plan.limit_is_estimate;
      burnPctPerDay = (tokensPerDay7 / limitTokens) * 100;
    } else if (!limitTokens) {
      // No published cap and no % reading: neutral gray, never red.
      note = 'no-cap-known';
    }
  }

  // Percent basis: the selected reading is the only evidence about the meter.
  // A percent plan is only ever observed through its meter: with no reading,
  // there is no last reading, however recent its token or 5h rows are.
  const meterOnly = plan.limit_kind === 'percent' || basis === 'percent';
  const percentReading = plan.limit_kind === 'percent' ? reading : basis === 'percent' ? readingInWindow(reading) : null;
  const lastReadingAt = meterOnly ? (percentReading?.at ?? null) : rowsLastAt;
  const lastSource = meterOnly ? (percentReading?.source ?? null) : rowsLastSource;
  const hoursSinceReading = lastReadingAt ? (now.getTime() - lastReadingAt.getTime()) / 3_600_000 : null;
  const stale = hoursSinceReading === null || hoursSinceReading > STALE_AFTER_HOURS;

  let runOutAt: Date | null = null;
  if (usedPct !== null) {
    if (usedPct >= 100) runOutAt = measuredAt;
    else if (burnPctPerDay && burnPctPerDay > 0) {
      runOutAt = new Date(measuredAt.getTime() + ((100 - usedPct) / burnPctPerDay) * DAY_MS);
    }
  }

  const windowMs = window.resetAt.getTime() - window.startAt.getTime();
  const early = basis === 'percent' && usedPct !== null && isEarly(measuredAt.getTime() - window.startAt.getTime(), windowMs);
  const status = rag({ usedPct, runOutAt, resetAt: window.resetAt, stale, early });
  if (early && note === null) note = 'too-early';

  return {
    slug: plan.slug,
    name: planLabel(plan.name),
    basis,
    usedPct,
    isEstimate,
    tokensInWindow,
    limitTokens,
    burnPctPerDay,
    tokensPerDay7,
    runOutAt,
    window,
    rag: status,
    lastReadingAt,
    hoursSinceReading,
    lastSource,
    note,
  };
}
