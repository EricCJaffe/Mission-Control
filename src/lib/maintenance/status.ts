/**
 * Is it due? The maintenance module's one verdict, in red / yellow / green.
 *
 * Red: overdue by date, or past its hours/miles interval.
 * Yellow: due within two weeks, or 80% of the way through its meter interval —
 *         the window to order the filter or book the shop.
 * Green: nothing needed.
 *
 * Whichever of date and meter is worse wins — "every 50 hours or every year,
 * whichever comes first" means exactly that.
 */

import { daysBetween } from '../day.ts';
import { nextOccurrence } from '../tasks/recurrence.ts';

export type Verdict = 'red' | 'yellow' | 'green';

export const SOON_DAYS = 14;
export const METER_WARN = 0.8;

export type MeterState = { reading: number | null; last: number | null; interval: number | null };

export function verdictFor(
  dueDate: string | null,
  todayIso: string,
  meter?: MeterState,
): { verdict: Verdict; days: number | null; meterUsed: number | null } {
  const days = dueDate ? daysBetween(todayIso, dueDate) : null;
  let verdict: Verdict = 'green';
  if (days !== null && days < 0) verdict = 'red';
  else if (days !== null && days <= SOON_DAYS) verdict = 'yellow';

  let meterUsed: number | null = null;
  if (meter?.interval && meter.reading !== null && meter.reading !== undefined) {
    // No reading at last service yet: count from zero, which is conservative
    // on a new machine and harmless on an old one (it goes red, you log it).
    meterUsed = meter.reading - (meter.last ?? 0);
    if (meterUsed >= meter.interval) verdict = 'red';
    else if (meterUsed >= meter.interval * METER_WARN && verdict === 'green') verdict = 'yellow';
  }
  return { verdict, days, meterUsed };
}

export function dueLabel(days: number | null): string {
  if (days === null) return 'no date';
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days}d`;
}

/**
 * Future dates of a recurring task between two days, inclusive, starting from
 * its current due date. The calendar uses this to show what is coming, not
 * just what is next — a year of filter changes is the point of a schedule.
 */
export function occurrencesBetween(
  task: { due_date: string | null; recurrence_rule: string | null; recurrence_anchor: string | null },
  fromIso: string,
  toIso: string,
  max = 60,
): string[] {
  if (!task.due_date) return [];
  const out: string[] = [];
  let current: string | null = task.due_date;
  const anchor = task.recurrence_anchor ?? task.due_date;
  while (current && current <= toIso && out.length < max) {
    if (current >= fromIso) out.push(current);
    if (!task.recurrence_rule) break;
    current = nextOccurrence(task.recurrence_rule, anchor, current);
  }
  return out;
}
