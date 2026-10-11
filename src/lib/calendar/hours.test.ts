/*
 * Overlap hours. A multi-day event is charged to the days it shares with
 * the period, at ALL_DAY_HOURS each, not to the week it started.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

/*
 * `hours.ts` imports `@/lib/...`. The Next bundler resolves that; plain Node
 * does not. Same in-process hook as `src/lib/brief/collect.test.ts`.
 */
type ResolveHook = (
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => unknown,
) => unknown;

const SRC_URL = new URL('../../', import.meta.url);

(nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const rest = specifier.slice(2);
      return next(new URL(/\.[a-z]+$/i.test(rest) ? rest : `${rest}.ts`, SRC_URL).href, context);
    }
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { ALL_DAY_HOURS, eventHoursInPeriod, familyTripHours, spansFromStops } = await import('./hours.ts');

const WEEK = { start: '2026-10-12', end: '2026-10-18' };

test('a multi-day all-day event clipped to a week inside it is 7 × 12h', () => {
  // Oct 10 00:00Z through Oct 30 00:00Z is the 20-day shape that used to
  // land as 480h in the week of the 10th. Graph stores all-day events as
  // UTC midnight when no timezone preference is sent.
  const hours = eventHoursInPeriod(
    { startAt: '2026-10-10T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z', allDay: true },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(hours, 7 * ALL_DAY_HOURS);
  assert.equal(hours, 84);
  assert.equal(ALL_DAY_HOURS, 12);
});

test('the same trip stored as Eastern midnight still clips to 84h', () => {
  // Midnight in America/New_York during EDT is 04:00Z. Duration alone
  // (no allDay flag) is enough to treat it as multi-day.
  const hours = eventHoursInPeriod(
    { startAt: '2026-10-10T04:00:00.000Z', endAt: '2026-10-30T04:00:00.000Z' },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(hours, 84);
});

test('partial overlap counts only the days inside the period', () => {
  // Ends at Oct 14 00:00Z, so the covered dates are Oct 10–13. The week
  // starts Oct 12, so two days.
  const early = eventHoursInPeriod(
    { startAt: '2026-10-10T00:00:00.000Z', endAt: '2026-10-14T00:00:00.000Z', allDay: true },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(early, 2 * ALL_DAY_HOURS);

  // Starts Thursday Oct 16, inside a week that runs through Sunday Oct 18.
  const late = eventHoursInPeriod(
    { startAt: '2026-10-16T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z', allDay: true },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(late, 3 * ALL_DAY_HOURS);

  const none = eventHoursInPeriod(
    { startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-05T00:00:00.000Z', allDay: true },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(none, 0);
});

test('a timed event crossing midnight counts the real overlap, split by day', () => {
  // Tuesday Oct 13 22:00 EDT through Wednesday Oct 14 02:00 EDT. Four
  // hours, two of them on each calendar day. Not 12h, and not 24h.
  const event = { startAt: '2026-10-14T02:00:00.000Z', endAt: '2026-10-14T06:00:00.000Z' };
  assert.equal(eventHoursInPeriod(event, WEEK.start, WEEK.end), 4);
  assert.equal(eventHoursInPeriod(event, '2026-10-13', '2026-10-13'), 2);
  assert.equal(eventHoursInPeriod(event, '2026-10-14', '2026-10-14'), 2);
});

test('a one-day all-day event is 12h, not 24h', () => {
  const hours = eventHoursInPeriod(
    { startAt: '2026-10-13T00:00:00.000Z', endAt: '2026-10-14T00:00:00.000Z', allDay: true },
    WEEK.start,
    WEEK.end,
  );
  assert.equal(hours, ALL_DAY_HOURS);
});

test('a trip span ignores home and a canceled trip', () => {
  const spans = spansFromStops([
    { tripId: 't', kind: 'home', arriveOn: '2026-10-01', departOn: '2026-10-09', status: 'booked' },
    { tripId: 't', kind: 'campground', arriveOn: '2026-10-10', departOn: '2026-10-20', status: 'booked' },
    { tripId: 't', kind: 'campground', arriveOn: '2026-10-20', departOn: '2026-10-30', status: 'booked' },
    { tripId: 'x', kind: 'campground', arriveOn: '2026-11-01', departOn: '2026-11-05', status: 'canceled' },
  ]);
  assert.deepEqual(spans, [{ start: '2026-10-10', end: '2026-10-30' }]);
});

test('RV trip days count as family unless a day-rated calendar event already covers them', () => {
  const trip = [{ start: '2026-10-10', end: '2026-10-30' }];
  const alone = familyTripHours(trip, [], WEEK.start, WEEK.end);
  assert.equal(alone, 84);

  const sameTripOnTheCalendar = [
    { startAt: '2026-10-10T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z', allDay: true },
  ];
  assert.equal(familyTripHours(trip, sameTripOnTheCalendar, WEEK.start, WEEK.end), 0);

  // The calendar covers only the first three days of the week. The other
  // four still come from the trip. A two-hour dinner does not replace a day.
  const partial = familyTripHours(
    trip,
    [
      { startAt: '2026-10-12T00:00:00.000Z', endAt: '2026-10-15T00:00:00.000Z', allDay: true },
      { startAt: '2026-10-16T22:00:00.000Z', endAt: '2026-10-17T00:00:00.000Z' },
    ],
    WEEK.start,
    WEEK.end,
  );
  assert.equal(partial, 4 * ALL_DAY_HOURS);
});
