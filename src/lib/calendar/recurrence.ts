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

/** The wall-clock parts of an instant, as read in a given zone. */
function localPartsIn(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // Intl renders midnight as hour 24 in some engines.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}:${get('second')}`,
  };
}

/** Minutes a zone is ahead of UTC at a given instant. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const { date, time } = localPartsIn(instant.toISOString(), timeZone);
  const asIfUtc = Date.parse(`${date}T${time}Z`);
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * A wall-clock time in a zone, as a real instant.
 *
 * Two passes: guess by reading the local time as though it were UTC, measure
 * the zone's offset at that guess, then correct. The second pass is what makes
 * it right across a DST boundary, where the offset on the occurrence date is
 * not the offset on the base date.
 */
function zonedToUtc(dateIso: string, timeIso: string, timeZone: string): Date {
  const guess = new Date(`${dateIso}T${timeIso}Z`);
  const corrected = new Date(guess.getTime() - offsetMinutesAt(guess, timeZone) * 60_000);
  // One more pass, because the offset at the guess can differ from the offset
  // at the corrected instant right at a transition.
  return new Date(guess.getTime() - offsetMinutesAt(corrected, timeZone) * 60_000);
}

/**
 * Every occurrence of `events` between two dates, as concrete start/end pairs.
 *
 * THE LOCAL WALL CLOCK IS WHAT REPEATS, not the UTC one. A 6:30am anchor is at
 * 6:30am on every occurrence, which means the instant it maps to changes when
 * the clocks do.
 *
 * An earlier version built each occurrence as `${localDate}T${utcClock}` —
 * mixing a date read in the app timezone with a clock read in UTC. Anything
 * scheduled after 8pm Eastern is stored as the NEXT day in UTC, so it came
 * back a day early: an 8pm Tuesday dinner rendered on Monday. It went
 * unnoticed because the events being tested were all mid-morning, where the
 * two dates happen to agree. Evening commitments are disproportionately Family
 * and Health, which are exactly the buckets the matrix exists to protect.
 */
export function expandInRange<T extends RecurringEvent>(
  events: T[],
  fromDate: string,
  toDate: string,
  timeZone = 'America/New_York',
): Array<T & { occurrenceDate: string; startAt: string; endAt: string }> {
  const out: Array<T & { occurrenceDate: string; startAt: string; endAt: string }> = [];

  for (const event of events) {
    const base = localPartsIn(event.start_at, timeZone);
    const durationMs = Math.max(
      0,
      new Date(event.end_at ?? event.start_at).getTime() - new Date(event.start_at).getTime(),
    );

    for (let d = fromDate; d <= toDate; d = addDay(d)) {
      if (!occursOn(base.date, event.recurrence_rule, d, event.recurrence_until)) continue;

      // The base occurrence is already a correct instant; leave it alone
      // rather than round-tripping it through the zone maths.
      if (d === base.date) {
        out.push({ ...event, occurrenceDate: d, startAt: event.start_at, endAt: event.end_at });
        continue;
      }

      const start = zonedToUtc(d, base.time, timeZone);
      // Duration rather than a rebuilt end clock: it carries a meeting across
      // midnight without special-casing, and stays right across a DST change.
      const end = new Date(start.getTime() + durationMs);
      out.push({
        ...event,
        occurrenceDate: d,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    }
  }

  return out.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
}

function addDay(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
