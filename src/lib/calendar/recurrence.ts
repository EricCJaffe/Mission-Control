/*
 * When does a recurring event actually happen?
 *
 * There were two answers to this in the app and only one of them ran.
 * CalendarClient expanded `daily` / `weekly` / `monthly` inline, so the
 * calendar page showed recurring events correctly. The brief and the priority
 * matrix read `calendar_events` straight out of the database and took every
 * row literally — so a standing Tuesday meeting counted once, on the week it
 * was created, and never again.
 *
 * That is not a cosmetic gap. The alignment check is built on scheduled hours
 * per domain, and the most reliable hours in anyone's week are the recurring
 * ones: training, church, the standing client call. Missing them means the
 * matrix under-reports exactly the commitments that are actually kept.
 *
 * One expander now, used by the page, the brief and the matrix, so they cannot
 * disagree about what week it is.
 *
 * THE RULE IS FREE TEXT, deliberately. The column is a text field people type
 * into ("weekly", "every weekday"), and the calendar form is a plain input
 * with no validation. Parsing loosely and failing to "never recurs" keeps a
 * typo from inventing events that are not real — the safe direction to fail.
 */

export type RecurrencePattern =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'mon-sat'
  | 'weekly'
  | 'monthly';

/*
 * Longest and most specific first. "every weekday" contains "week", so a
 * naive check for "weekly" would swallow it and turn a Monday-to-Friday
 * commitment into a once-a-week one.
 */
export function normalizeRule(rule: string | null | undefined): RecurrencePattern {
  const text = (rule ?? '').toLowerCase().trim();
  if (!text) return 'none';
  if (/\bmon(day)?\s*[-–—to]+\s*sat(urday)?\b|\bsix days\b|\bmon-sat\b/.test(text)) return 'mon-sat';
  if (/\bweekday|\bmon(day)?\s*[-–—to]+\s*fri(day)?\b|\bmon-fri\b/.test(text)) return 'weekdays';
  if (/\bdaily\b|\bevery day\b/.test(text)) return 'daily';
  if (/\bmonthly\b|\bevery month\b/.test(text)) return 'monthly';
  if (/\bweekly\b|\bevery week\b/.test(text)) return 'weekly';
  return 'none';
}

/** `YYYY-MM-DD` of an ISO timestamp, read in the given zone. */
function dayIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` string. */
function weekdayOf(dateIso: string): number {
  // Noon UTC, so a timezone offset either side cannot roll the date over.
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Does an event that starts on `baseDate` occur on `dateIso`?
 *
 * `until` is inclusive; an event never occurs before its own start.
 */
export function occursOn(
  baseDate: string,
  rule: string | null | undefined,
  dateIso: string,
  until?: string | null,
): boolean {
  if (baseDate === dateIso) return true;

  const pattern = normalizeRule(rule);
  if (pattern === 'none') return false;
  if (until && dateIso > until) return false;

  const delta = daysBetween(baseDate, dateIso);
  if (delta < 0) return false;

  const day = weekdayOf(dateIso);
  switch (pattern) {
    case 'daily':
      return true;
    case 'weekdays':
      return day >= 1 && day <= 5;
    case 'mon-sat':
      return day >= 1 && day <= 6;
    case 'weekly':
      return delta % 7 === 0;
    case 'monthly':
      return weekdayOf(baseDate) === day ? delta % 28 === 0 : baseDate.slice(8) === dateIso.slice(8);
    default:
      return false;
  }
}

export type RecurringEvent = {
  start_at: string;
  end_at: string;
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
};

/**
 * Every occurrence of `events` between two dates, as concrete start/end pairs.
 *
 * The time of day is carried over from the base event and the date is
 * replaced, which is what makes a 6:30am anchor stay at 6:30am rather than
 * drifting by the offset between the base date and the target.
 */
export function expandInRange<T extends RecurringEvent>(
  events: T[],
  fromDate: string,
  toDate: string,
  timeZone = 'America/New_York',
): Array<T & { occurrenceDate: string; startAt: string; endAt: string }> {
  const out: Array<T & { occurrenceDate: string; startAt: string; endAt: string }> = [];

  for (const event of events) {
    const baseDate = dayIn(event.start_at, timeZone);
    const startClock = event.start_at.slice(11, 19) || '00:00:00';
    const endClock = event.end_at?.slice(11, 19) || startClock;
    // An event whose end time is before its start crosses midnight.
    const endsNextDay = endClock < startClock;

    for (let d = fromDate; d <= toDate; d = addDay(d)) {
      if (!occursOn(baseDate, event.recurrence_rule, d, event.recurrence_until)) continue;
      out.push({
        ...event,
        occurrenceDate: d,
        startAt: `${d}T${startClock}${zoneSuffix(event.start_at)}`,
        endAt: `${endsNextDay ? addDay(d) : d}T${endClock}${zoneSuffix(event.end_at ?? event.start_at)}`,
      });
    }
  }

  return out.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
}

/** Keep whatever offset the stored timestamp carried, `Z` included. */
function zoneSuffix(iso: string): string {
  const m = iso.match(/(Z|[+-]\d{2}:?\d{2})$/);
  return m ? m[1] : 'Z';
}

function addDay(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
