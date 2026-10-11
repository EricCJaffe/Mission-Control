/**
 * How many hours of an event fall inside a period.
 *
 * The matrix and the weekly review used to charge the whole event to the
 * week it started. A 20-day RV trip (midnight to midnight, twenty days
 * later) is 480 hours, and all 480 landed in one week. An all-day or
 * multi-day event is not twenty-four hours of attention: it counts as
 * ALL_DAY_HOURS per day it actually overlaps the period. A timed event,
 * including one that crosses midnight, counts the real overlap.
 *
 * Days are America/New_York dates (`src/lib/day.ts`). Graph all-day events
 * requested without a timezone preference come back as UTC midnight; those
 * dates are the calendar dates Outlook showed, so they are read as UTC
 * dates rather than shifted an evening earlier into Eastern.
 */

import { addDays, dayOf, APP_TIMEZONE } from '@/lib/day';
import { zonedDayStart } from '@/lib/calendar/recurrence';

/** Hours credited for one day of an all-day or multi-day event. */
export const ALL_DAY_HOURS = 12;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type SpanEvent = {
  startAt: string;
  endAt: string | null;
  /** Set when the source knows. Duration still decides when this is absent. */
  allDay?: boolean;
};

export type TripSpan = { start: string; end: string };

export type TripStop = {
  tripId: string;
  kind: string;
  arriveOn: string | null;
  departOn: string | null;
  status?: string | null;
};

function isUtcMidnight(ms: number): boolean {
  return Number.isFinite(ms) && ms % DAY_MS === 0;
}

function isLocalMidnight(ms: number): boolean {
  const day = dayOf(new Date(ms));
  if (!day) return false;
  return zonedDayStart(day, APP_TIMEZONE).getTime() === ms;
}

function isDayRated(event: SpanEvent, startMs: number, endMs: number): boolean {
  if (event.allDay) return true;
  const duration = endMs - startMs;
  if (duration >= DAY_MS) return true;
  // A one-day all-day block is midnight to the next midnight. Across the
  // spring-forward transition that is 23 hours, which the 24-hour test misses.
  return duration >= 23 * HOUR_MS && isLocalMidnight(startMs) && isLocalMidnight(endMs);
}

/** Inclusive date list from `start` through `end`. Empty when the range is backwards. */
function datesInclusive(start: string, end: string): string[] {
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Calendar dates a day-rated event occupies inside the period.
 * Empty when the event is timed, or when it misses the period.
 */
export function dayRatedDatesInPeriod(event: SpanEvent, periodStart: string, periodEnd: string): string[] {
  if (!event.endAt) return [];
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  if (!isDayRated(event, startMs, endMs)) return [];

  const periodStartMs = zonedDayStart(periodStart, APP_TIMEZONE).getTime();
  const periodEndMs = zonedDayStart(addDays(periodEnd, 1), APP_TIMEZONE).getTime();
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs) || periodEndMs <= periodStartMs) {
    return [];
  }

  // Graph's unzoned all-day shape: both ends on UTC midnight. The date in
  // the timestamp is the date on the calendar, end exclusive.
  if (isUtcMidnight(startMs) && isUtcMidnight(endMs)) {
    const eventStart = new Date(startMs).toISOString().slice(0, 10);
    const eventEnd = addDays(new Date(endMs).toISOString().slice(0, 10), -1);
    const from = eventStart > periodStart ? eventStart : periodStart;
    const to = eventEnd < periodEnd ? eventEnd : periodEnd;
    return datesInclusive(from, to);
  }

  const clipStart = Math.max(startMs, periodStartMs);
  const clipEnd = Math.min(endMs, periodEndMs);
  if (clipEnd <= clipStart) return [];
  const first = dayOf(new Date(clipStart));
  const last = dayOf(new Date(clipEnd - 1));
  return datesInclusive(first, last);
}

/** Hours of `event` that fall inside the inclusive period. */
export function eventHoursInPeriod(event: SpanEvent, periodStart: string, periodEnd: string): number {
  if (!event.endAt) return 0;
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  if (isDayRated(event, startMs, endMs)) {
    return dayRatedDatesInPeriod(event, periodStart, periodEnd).length * ALL_DAY_HOURS;
  }

  const periodStartMs = zonedDayStart(periodStart, APP_TIMEZONE).getTime();
  const periodEndMs = zonedDayStart(addDays(periodEnd, 1), APP_TIMEZONE).getTime();
  const clipStart = Math.max(startMs, periodStartMs);
  const clipEnd = Math.min(endMs, periodEndMs);
  if (clipEnd <= clipStart) return 0;
  return (clipEnd - clipStart) / HOUR_MS;
}

/**
 * One inclusive span per trip, from the earliest stop date to the latest.
 * Home is where the trip is not. A canceled trip contributes nothing.
 */
export function spansFromStops(stops: readonly TripStop[]): TripSpan[] {
  const byTrip = new Map<string, TripSpan>();
  for (const stop of stops) {
    if (stop.status === 'canceled') continue;
    if (stop.kind === 'home') continue;
    const days = [stop.arriveOn, stop.departOn].filter((d): d is string => Boolean(d)).sort();
    if (days.length === 0) continue;
    const start = days[0] as string;
    const end = days[days.length - 1] as string;
    const prev = byTrip.get(stop.tripId);
    if (!prev) {
      byTrip.set(stop.tripId, { start, end });
      continue;
    }
    byTrip.set(stop.tripId, {
      start: start < prev.start ? start : prev.start,
      end: end > prev.end ? end : prev.end,
    });
  }
  return [...byTrip.values()];
}

/**
 * Family hours from RV trips that the calendar is not already counting.
 *
 * A trip that is also a family all-day (or multi-day) event would be 84h
 * twice in the same week. Days that event already covers are skipped. A
 * timed family event on one of those days — dinner, a ferry — does not
 * stand in for the trip, so the trip day still counts.
 */
export function familyTripHours(
  trips: readonly TripSpan[],
  calendarEvents: readonly SpanEvent[],
  periodStart: string,
  periodEnd: string,
): number {
  const covered = new Set<string>();
  for (const event of calendarEvents) {
    for (const day of dayRatedDatesInPeriod(event, periodStart, periodEnd)) covered.add(day);
  }

  const seen = new Set<string>();
  for (const trip of trips) {
    const from = trip.start > periodStart ? trip.start : periodStart;
    const to = trip.end < periodEnd ? trip.end : periodEnd;
    for (const day of datesInclusive(from, to)) {
      if (covered.has(day) || seen.has(day)) continue;
      seen.add(day);
    }
  }
  return seen.size * ALL_DAY_HOURS;
}
