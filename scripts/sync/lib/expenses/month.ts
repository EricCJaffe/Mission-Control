/*
 * The reporting month.
 *
 * The timer fires on the 1st and reconciles the month that just ended, so the
 * default is always "previous month" — never "this month", which on the 1st
 * would be a window a few hours wide.
 *
 * All arithmetic is on UTC parts. The alternative, building a local Date and
 * reading its month, silently rolls into the wrong month for anyone east or
 * west of UTC when the job fires near midnight — the same class of bug that
 * put calendar events a day early in the brief.
 */

export type Month = {
  /** 'YYYY-MM'. */
  key: string;
  /** Inclusive ISO instant of the first millisecond. */
  startIso: string;
  /** EXCLUSIVE ISO instant of the first millisecond of the next month. */
  endIso: string;
  /** e.g. "August 2026". */
  label: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthFromKey(key: string): Month {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`--month must look like 2026-08, got ${JSON.stringify(key)}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`month ${m[2]} is not a month`);

  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
  return {
    key,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

/** The month before the one containing `now`. */
export function previousMonth(now: Date = new Date()): Month {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; this IS the previous month, 1-based
  const year = m === 0 ? y - 1 : y;
  const month = m === 0 ? 12 : m;
  return monthFromKey(`${year}-${String(month).padStart(2, '0')}`);
}

/** True when an ISO timestamp falls inside the month. */
export function contains(month: Month, iso: string): boolean {
  return iso >= month.startIso && iso < month.endIso;
}
