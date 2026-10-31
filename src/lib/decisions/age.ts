/*
 * "Oct 27 · 4d" on every /decisions card.
 *
 * Age is counted in calendar days in Eric's time zone (America/New_York), not
 * in elapsed 24-hour blocks. Elapsed time read one day low whenever the card's
 * clock time was later than the page's "now": a card added at 9:43 two days
 * ago, on a page loaded at 9:42, showed "1d" until the next tick. Calendar
 * days do not depend on the time of day, so a stale "now" can only be wrong
 * across midnight, and the board refreshes long before that matters.
 */

const TZ = "America/New_York";
const DAY = 86_400_000;

const dayKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(t));

/** Whole calendar days (ET) from `fromIso` to `now`; never negative. */
export function ageDays(fromIso: string, now: number): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  const a = Date.parse(`${dayKey(from)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY));
}

/** "Oct 27 · 4d", or "Oct 31 · today". */
export function addedLabel(fromIso: string, now: number): string {
  const day = new Date(fromIso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
  const days = ageDays(fromIso, now);
  return `${day} · ${days === 0 ? "today" : `${days}d`}`;
}
