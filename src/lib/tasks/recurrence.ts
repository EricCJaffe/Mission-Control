/**
 * Task recurrence using RFC 5545 RRULE, the iCalendar standard.
 *
 * The existing field was free text normalised by substring match — "weekly"
 * anywhere in the string meant weekly. That cannot express "every other
 * Tuesday and Thursday", it cannot round-trip, and nothing else in the world
 * can read it. RRULE is what Google Calendar, Outlook, Apple Calendar and
 * every CalDAV server already speak, so a task written here can be exported
 * later without a translation layer.
 *
 * This implements the subset that covers ordinary task recurrence — FREQ,
 * INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL — rather than the whole spec.
 * BYSETPOS, BYYEARDAY and the rest exist, and are not what anyone reaches for
 * when adding "bins out every other Tuesday".
 *
 * Legacy free-text values are still parsed, so tasks written before this
 * keep working.
 */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** RFC 5545 weekday codes, Sunday-first to match Date.getDay(). */
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat',
};

export type Recurrence = {
  freq: Freq;
  /** Every N periods. 1 = every period. */
  interval: number;
  /** WEEKLY only: which days. Empty means "the anchor's own weekday". */
  byDay: Weekday[];
  /** MONTHLY only: day of month. Null means "the anchor's own date". */
  byMonthDay: number | null;
  /** Stop after N occurrences. */
  count: number | null;
  /** Stop on or before this date, 'YYYY-MM-DD'. */
  until: string | null;
};

export const DEFAULT_RECURRENCE: Recurrence = {
  freq: 'WEEKLY',
  interval: 1,
  byDay: [],
  byMonthDay: null,
  count: null,
  until: null,
};

/** Serialises to an RRULE string, e.g. `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH`. */
export function toRRule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'WEEKLY' && r.byDay.length) parts.push(`BYDAY=${r.byDay.join(',')}`);
  if (r.freq === 'MONTHLY' && r.byMonthDay) parts.push(`BYMONTHDAY=${r.byMonthDay}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  // UNTIL is a date-time in the spec; tasks are day-granular, so it is written
  // as an all-day value rather than pretending to a precision we do not have.
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}`);
  return parts.join(';');
}

/**
 * Parses an RRULE, falling back to reading the old free-text values.
 *
 * Returns null when there is nothing recurring to read, so callers can tell
 * "no recurrence" from "a recurrence I could not understand" — the latter
 * comes back as a best-effort object rather than silently becoming nothing.
 */
export function parseRRule(input: string | null | undefined): Recurrence | null {
  if (!input || !input.trim()) return null;
  const text = input.trim();

  if (!/FREQ=/i.test(text)) {
    // Legacy free text: "weekly", "every month", and so on.
    const lower = text.toLowerCase();
    if (lower.includes('year')) return { ...DEFAULT_RECURRENCE, freq: 'YEARLY' };
    if (lower.includes('month')) return { ...DEFAULT_RECURRENCE, freq: 'MONTHLY' };
    if (lower.includes('week')) return { ...DEFAULT_RECURRENCE, freq: 'WEEKLY' };
    if (lower.includes('dai') || lower.includes('every day')) {
      return { ...DEFAULT_RECURRENCE, freq: 'DAILY' };
    }
    return null;
  }

  const parts = new Map<string, string>();
  for (const chunk of text.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) parts.set(k.toUpperCase(), v.toUpperCase());
  }

  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  const intervalRaw = Number(parts.get('INTERVAL'));
  const countRaw = Number(parts.get('COUNT'));
  const monthDayRaw = Number(parts.get('BYMONTHDAY'));
  const untilRaw = parts.get('UNTIL');

  return {
    freq,
    interval: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1,
    byDay: (parts.get('BYDAY') ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d)),
    byMonthDay: Number.isFinite(monthDayRaw) && monthDayRaw >= 1 && monthDayRaw <= 31 ? monthDayRaw : null,
    count: Number.isFinite(countRaw) && countRaw > 0 ? countRaw : null,
    until: untilRaw && /^\d{8}/.test(untilRaw)
      ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`
      : null,
  };
}

/** Plain-language summary, so the picker can show what the rule actually means. */
export function describeRRule(input: string | null | undefined): string | null {
  const r = parseRRule(input);
  if (!r) return null;

  const every =
    r.interval === 1
      ? { DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month', YEARLY: 'Every year' }[r.freq]
      : `Every ${r.interval} ${{ DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' }[r.freq]}`;

  let detail = '';
  if (r.freq === 'WEEKLY' && r.byDay.length) {
    detail = ` on ${r.byDay.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
  } else if (r.freq === 'MONTHLY' && r.byMonthDay) {
    detail = ` on day ${r.byMonthDay}`;
  }

  let ending = '';
  if (r.count) ending = `, ${r.count} times`;
  else if (r.until) ending = `, until ${r.until}`;

  return `${every}${detail}${ending}`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The next occurrence strictly after `after`.
 *
 * Used to roll a recurring task forward when it is completed: the task itself
 * is the series, and its due date moves rather than spawning a row per
 * occurrence. A hundred rows for "bins out weekly" is a list nobody can read.
 *
 * Returns null once COUNT or UNTIL is exhausted, which is how the caller knows
 * to stop recurring and let the task close for good.
 */
export function nextOccurrence(
  rule: string | null | undefined,
  anchorIso: string,
  after: string,
  occurrencesSoFar = 0
): string | null {
  const r = parseRRule(rule);
  if (!r) return null;
  if (r.count !== null && occurrencesSoFar + 1 >= r.count) return null;

  const cursor = new Date(`${(after >= anchorIso ? after : anchorIso)}T00:00:00Z`);
  const limit = r.until ? new Date(`${r.until}T00:00:00Z`) : null;

  // Step forward day by day and test membership. Slower than closed-form
  // arithmetic and far easier to get right for BYDAY, and the loop is bounded
  // by a couple of years for even the sparsest sensible rule.
  const MAX_DAYS = 366 * 4;
  for (let i = 1; i <= MAX_DAYS; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (limit && cursor > limit) return null;
    if (matches(r, cursor, new Date(`${anchorIso}T00:00:00Z`))) return iso(cursor);
  }
  return null;
}

function matches(r: Recurrence, date: Date, anchor: Date): boolean {
  const dayDiff = Math.round((date.getTime() - anchor.getTime()) / 86_400_000);

  if (r.freq === 'DAILY') return dayDiff % r.interval === 0;

  if (r.freq === 'WEEKLY') {
    // Weeks are counted from the anchor's week, so INTERVAL=2 means every
    // other week relative to when the task started, not relative to the epoch.
    const anchorWeekStart = new Date(anchor);
    anchorWeekStart.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
    const dateWeekStart = new Date(date);
    dateWeekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const weeksApart = Math.round(
      (dateWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * 86_400_000)
    );
    if (weeksApart % r.interval !== 0) return false;
    if (r.byDay.length === 0) return date.getUTCDay() === anchor.getUTCDay();
    return r.byDay.includes(WEEKDAYS[date.getUTCDay()]);
  }

  if (r.freq === 'MONTHLY') {
    const monthsApart =
      (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (date.getUTCMonth() - anchor.getUTCMonth());
    if (monthsApart % r.interval !== 0) return false;
    return date.getUTCDate() === (r.byMonthDay ?? anchor.getUTCDate());
  }

  // YEARLY
  const yearsApart = date.getUTCFullYear() - anchor.getUTCFullYear();
  if (yearsApart % r.interval !== 0) return false;
  return (
    date.getUTCMonth() === anchor.getUTCMonth() && date.getUTCDate() === anchor.getUTCDate()
  );
}
