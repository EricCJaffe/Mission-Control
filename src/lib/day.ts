/**
 * What day it is, for a personal app used by one person in one timezone.
 *
 * Every "did I do this today" check in this app was comparing UTC dates. On
 * Vercel the server runs in UTC, so at 8pm in Jacksonville it is already
 * tomorrow as far as the server is concerned, and anything done that afternoon
 * stopped counting as today's. It broke the prayer list and the reading plan in
 * exactly the same way, every single evening.
 *
 * Fixing it with local Date methods only works client-side; the server is UTC
 * no matter what. So the day boundary is stated explicitly here instead of
 * being inherited from wherever the code happens to run.
 *
 * This is a single-user app. When that stops being true, this reads from a
 * profile column rather than a constant — the call sites do not change.
 */

export const APP_TIMEZONE = 'America/New_York';

/**
 * Today's date in the app's timezone, as 'YYYY-MM-DD'.
 *
 * en-CA is used because it formats as YYYY-MM-DD, which sorts and compares as
 * a string — the format the rest of the app already stores dates in.
 */
export function today(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/** The calendar day an instant falls on, in the app's timezone. */
export function dayOf(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/** Whole calendar days from `from` to `to`, both 'YYYY-MM-DD'. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (!y1 || !y2) return 0;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Shifts a 'YYYY-MM-DD' by whole days without touching timezones. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Longest run of consecutive days ending today or yesterday.
 *
 * Yesterday still counts as a live streak: a plan read every morning should
 * not read as broken from midnight until you next open the app. It breaks once
 * a full day has been missed.
 */
export function currentStreak(dates: string[], todayIso: string = today()): number {
  if (dates.length === 0) return 0;
  const unique = [...new Set(dates.filter(Boolean))].sort().reverse();

  const gapToNewest = daysBetween(unique[0], todayIso);
  if (gapToNewest > 1) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    if (daysBetween(unique[i], unique[i - 1]) === 1) streak += 1;
    else break;
  }
  return streak;
}
