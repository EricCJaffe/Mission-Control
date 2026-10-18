/*
 * Where a plan's current reset window starts and when it next resets.
 *
 * Three sources, in order of trust:
 *   1. vendor   the reset instant the vendor itself reported (Codex CLI logs
 *               `resets_at` with every rate-limit reading; a manual reading can
 *               carry one too). Only used while it is still in the future.
 *   2. anchor   `ai_plans.reset_anchor`, any one past reset; the next reset is
 *               anchor + n * window.
 *   3. calendar no anchor at all: daily resets at midnight ET, weekly on
 *               Monday 00:00 ET, monthly on the 1st. A '5h' plan with neither
 *               is treated as daily, because usage rows are per day anyway.
 *
 * Usage rows are bucketed by ET day, so token sums for a window use
 * `day >= startDay`: a window that starts mid-day counts that whole day. The
 * page says "estimate" wherever this matters.
 */

import { APP_TIMEZONE, addDays, dayOf, today } from '../day.ts';
import type { AiPlan } from './types.ts';

export type ResetWindow = {
  startAt: Date;
  resetAt: Date;
  /** ET day the window starts on, YYYY-MM-DD. */
  startDay: string;
  source: 'vendor' | 'anchor' | 'calendar';
};

const HOUR = 3_600_000;
export const DAY_MS = 24 * HOUR;

const FIXED_MS: Record<string, number> = {
  '5h': 5 * HOUR,
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Minutes ET is behind UTC at this instant (300 in winter, 240 in summer). */
function etOffsetMinutes(at: Date): number {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((Math.floor(at.getTime() / 1000) * 1000 - asUtc) / 60_000);
}

/** 00:00 America/New_York on a YYYY-MM-DD, as an instant. */
export function etMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  // 05:00 UTC is 00:00 EST or 01:00 EDT: either way the same side of the 2am
  // DST switch as midnight, so its offset is midnight's offset.
  const off = etOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 5)));
  return new Date(Date.UTC(y, m - 1, d) + off * 60_000);
}

function addMonths(at: Date, n: number): Date {
  const d = new Date(at.getTime());
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

function windowBefore(resetAt: Date, cadence: AiPlan['reset_cadence']): Date {
  if (cadence === 'monthly') return addMonths(resetAt, -1);
  return new Date(resetAt.getTime() - (FIXED_MS[cadence] ?? DAY_MS));
}

function build(startAt: Date, resetAt: Date, source: ResetWindow['source']): ResetWindow {
  return { startAt, resetAt, startDay: dayOf(startAt), source };
}

export function resetWindow(
  plan: Pick<AiPlan, 'reset_cadence' | 'reset_anchor'>,
  now: Date,
  vendorResetsAt?: string | null,
): ResetWindow {
  const cadence = plan.reset_cadence;

  if (vendorResetsAt) {
    const reset = new Date(vendorResetsAt);
    if (!Number.isNaN(reset.getTime()) && reset.getTime() > now.getTime()) {
      return build(windowBefore(reset, cadence), reset, 'vendor');
    }
  }

  if (plan.reset_anchor) {
    const anchor = new Date(plan.reset_anchor);
    if (!Number.isNaN(anchor.getTime())) {
      if (cadence === 'monthly') {
        const months =
          (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
        let reset = addMonths(anchor, Math.max(months - 1, 0));
        while (reset.getTime() <= now.getTime()) reset = addMonths(reset, 1);
        return build(addMonths(reset, -1), reset, 'anchor');
      }
      const ms = FIXED_MS[cadence] ?? DAY_MS;
      const n = Math.floor((now.getTime() - anchor.getTime()) / ms) + 1;
      const reset = new Date(anchor.getTime() + n * ms);
      return build(new Date(reset.getTime() - ms), reset, 'anchor');
    }
  }

  const todayEt = today(now);
  if (cadence === 'weekly') {
    const [y, m, d] = todayEt.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const monday = addDays(todayEt, -((dow + 6) % 7));
    return build(etMidnight(monday), etMidnight(addDays(monday, 7)), 'calendar');
  }
  if (cadence === 'monthly') {
    const first = `${todayEt.slice(0, 7)}-01`;
    const [y, m] = first.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return build(etMidnight(first), etMidnight(next), 'calendar');
  }
  return build(etMidnight(todayEt), etMidnight(addDays(todayEt, 1)), 'calendar');
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, weekday: 'short' });
const SHORT = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric' });

/** "Thu" when within a week of `now`, else "Thu, Oct 22". */
export function formatReset(at: Date, now: Date): string {
  const days = (at.getTime() - now.getTime()) / DAY_MS;
  return days >= 0 && days < 6.5 ? WEEKDAY.format(at) : SHORT.format(at);
}
