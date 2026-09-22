/**
 * Period arithmetic for review cycles.
 *
 * Nothing else in the module is allowed to invent a window. A review is a
 * judgement about a whole period, and a "week" that runs Thursday to Wednesday
 * because that is when someone happened to press the button makes two cycles
 * incomparable — which destroys the only thing a review history is for.
 *
 * Weeks are Monday-based, matching `weekKey` in `src/lib/spirit/practices.ts`,
 * so a Sunday church visit belongs to the week it ends rather than the week it
 * starts. Every date here is a plain 'YYYY-MM-DD' string in the app timezone;
 * see `src/lib/day.ts` for why Date objects are kept out of this.
 */

import { addDays, daysBetween, today as todayInAppTz } from '@/lib/day';

export const CYCLE_KINDS = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
export type CycleKind = (typeof CYCLE_KINDS)[number];

export function isCycleKind(value: unknown): value is CycleKind {
  return typeof value === 'string' && (CYCLE_KINDS as readonly string[]).includes(value);
}

export const CYCLE_LABEL: Record<CycleKind, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export type Period = {
  kind: CycleKind;
  /** Inclusive. */
  start: string;
  /** Inclusive. */
  end: string;
};

/** Day of week with Monday as 0, from a 'YYYY-MM-DD' string. */
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Last day of the given month, 1-indexed month. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The period of the given kind that `on` falls inside. */
export function periodFor(kind: CycleKind, on: string = todayInAppTz()): Period {
  const { y, m } = parts(on);

  if (kind === 'weekly') {
    const start = addDays(on, -mondayIndex(on));
    return { kind, start, end: addDays(start, 6) };
  }

  if (kind === 'monthly') {
    return { kind, start: iso(y, m, 1), end: iso(y, m, lastDayOfMonth(y, m)) };
  }

  if (kind === 'quarterly') {
    const firstMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const lastMonth = firstMonth + 2;
    return {
      kind,
      start: iso(y, firstMonth, 1),
      end: iso(y, lastMonth, lastDayOfMonth(y, lastMonth)),
    };
  }

  return { kind, start: iso(y, 1, 1), end: iso(y, 12, 31) };
}

/** The period of the same kind immediately before `period`. */
export function previousPeriod(period: Period): Period {
  return periodFor(period.kind, addDays(period.start, -1));
}

/**
 * The period a review should be opened for right now.
 *
 * A weekly review is about the week that has just ENDED, so on any day other
 * than the first of a period the answer is the current one — you are reviewing
 * it as it runs, which is what makes it possible to still act. The distinction
 * only matters on the boundary: opening Monday morning and being handed a week
 * that is seven hours old, with nothing in it, is how a review becomes a chore.
 */
export function periodToReview(kind: CycleKind, on: string = todayInAppTz()): Period {
  const current = periodFor(kind, on);
  return current.start === on ? previousPeriod(current) : current;
}

/** Human label: "Sep 15 – Sep 21", "September 2026", "2026 Q3", "2026". */
export function periodLabel(period: Period): string {
  const { y, m } = parts(period.start);

  if (period.kind === 'annual') return String(y);
  if (period.kind === 'quarterly') return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
  if (period.kind === 'monthly') {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  const fmt = (value: string) => {
    const p = parts(value);
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

/** Whole days in the period, inclusive of both ends. */
export function periodDays(period: Period): number {
  return daysBetween(period.start, period.end) + 1;
}

/** Has the period finished as of `on`? A closed period can no longer improve. */
export function periodIsComplete(period: Period, on: string = todayInAppTz()): boolean {
  return period.end < on;
}

/** How far through the period we are, 0–1. 1 once it has ended. */
export function periodProgress(period: Period, on: string = todayInAppTz()): number {
  if (on < period.start) return 0;
  if (on > period.end) return 1;
  return (daysBetween(period.start, on) + 1) / periodDays(period);
}

/** Does an ISO date fall inside the period? */
export function inPeriod(period: Period, day: string): boolean {
  return Boolean(day) && day >= period.start && day <= period.end;
}
