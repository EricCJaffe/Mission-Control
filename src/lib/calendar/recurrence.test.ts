/*
 * Recurrence expansion.
 *
 * Written because the brief and the priority matrix did not expand recurrence
 * at all, so the most dependable hours in a week — training, church, the
 * standing client call — counted once and then never again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule, occursOn, expandInRange } from './recurrence.ts';

test('reads the phrases people actually type', () => {
  assert.equal(normalizeRule('weekly'), 'weekly');
  assert.equal(normalizeRule('Every week'), 'weekly');
  assert.equal(normalizeRule('daily'), 'daily');
  assert.equal(normalizeRule('monthly'), 'monthly');
  assert.equal(normalizeRule('Mon-Sat'), 'mon-sat');
  assert.equal(normalizeRule('Monday to Saturday'), 'mon-sat');
  assert.equal(normalizeRule('weekdays'), 'weekdays');
  assert.equal(normalizeRule('Mon-Fri'), 'weekdays');
});

test('"every weekday" is not weekly', () => {
  // It contains "week". Checking for weekly first would turn a five-day
  // commitment into a one-day one — the specific reason the patterns are
  // matched longest-first.
  assert.equal(normalizeRule('every weekday'), 'weekdays');
});

test('an unparseable rule never recurs', () => {
  // The column is a free-text box with no validation. Failing to "never"
  // means a typo shows one event; failing the other way would invent a
  // standing commitment that does not exist.
  assert.equal(normalizeRule('fortnightly on alternate Tuesdays'), 'none');
  assert.equal(normalizeRule(''), 'none');
  assert.equal(normalizeRule(null), 'none');
});

test('an event always occurs on its own date, rule or not', () => {
  assert.equal(occursOn('2026-09-07', null, '2026-09-07'), true);
  assert.equal(occursOn('2026-09-07', 'weekly', '2026-09-07'), true);
});

test('mon-sat covers six days and skips Sunday', () => {
  // 2026-09-07 is a Monday.
  const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];
  for (const d of days) assert.equal(occursOn('2026-09-07', 'Mon-Sat', d), true, d);
  assert.equal(occursOn('2026-09-07', 'Mon-Sat', '2026-09-13'), false, 'Sunday');
});

test('weekdays skips the weekend', () => {
  assert.equal(occursOn('2026-09-07', 'weekdays', '2026-09-11'), true, 'Friday');
  assert.equal(occursOn('2026-09-07', 'weekdays', '2026-09-12'), false, 'Saturday');
  assert.equal(occursOn('2026-09-07', 'weekdays', '2026-09-13'), false, 'Sunday');
});

test('weekly lands on the same weekday', () => {
  assert.equal(occursOn('2026-09-08', 'weekly', '2026-09-15'), true);
  assert.equal(occursOn('2026-09-08', 'weekly', '2026-09-22'), true);
  assert.equal(occursOn('2026-09-08', 'weekly', '2026-09-14'), false);
});

test('nothing occurs before it started', () => {
  assert.equal(occursOn('2026-09-07', 'daily', '2026-09-06'), false);
});

test('recurrence_until ends it, inclusively', () => {
  assert.equal(occursOn('2026-09-07', 'daily', '2026-09-10', '2026-09-10'), true);
  assert.equal(occursOn('2026-09-07', 'daily', '2026-09-11', '2026-09-10'), false);
});

test('expansion keeps the time of day', () => {
  // The whole point of a 6:30am anchor is that it is at 6:30 every day, not
  // drifting by the gap between the base date and the target.
  const out = expandInRange(
    [{ start_at: '2026-09-07T10:30:00Z', end_at: '2026-09-07T11:15:00Z', recurrence_rule: 'Mon-Sat' }],
    '2026-09-07',
    '2026-09-13',
  );
  assert.equal(out.length, 6);
  assert.ok(out.every((o) => o.startAt.includes('T10:30:00')));
  assert.ok(out.every((o) => o.endAt.includes('T11:15:00')));
  assert.deepEqual(out.map((o) => o.occurrenceDate).at(-1), '2026-09-12');
});

test('a one-off appears once and only in range', () => {
  const event = { start_at: '2026-09-09T14:00:00Z', end_at: '2026-09-09T15:00:00Z', recurrence_rule: null };
  assert.equal(expandInRange([event], '2026-09-07', '2026-09-13').length, 1);
  assert.equal(expandInRange([event], '2026-09-14', '2026-09-20').length, 0);
});

test('an event crossing midnight ends on the next day', () => {
  const out = expandInRange(
    [{ start_at: '2026-09-07T23:00:00Z', end_at: '2026-09-08T00:30:00Z', recurrence_rule: 'daily' }],
    '2026-09-07',
    '2026-09-08',
  );
  assert.equal(out[0].startAt.slice(0, 10), '2026-09-07');
  assert.equal(out[0].endAt.slice(0, 10), '2026-09-08');
});

test('results come back in time order across events', () => {
  const out = expandInRange(
    [
      { start_at: '2026-09-07T13:00:00Z', end_at: '2026-09-07T14:00:00Z', recurrence_rule: 'Mon-Sat' },
      { start_at: '2026-09-07T10:30:00Z', end_at: '2026-09-07T11:15:00Z', recurrence_rule: 'Mon-Sat' },
    ],
    '2026-09-07',
    '2026-09-08',
  );
  const times = out.map((o) => o.startAt);
  assert.deepEqual([...times].sort(), times);
});

test('an evening event keeps its own date, not the UTC one', () => {
  // 8:00 PM Eastern on Tuesday is stored as Wednesday 00:00Z. Building the
  // occurrence from a local date and a UTC clock put it on Monday evening —
  // every commitment after 8pm landed a day early, and evenings are
  // disproportionately Family and Health.
  const out = expandInRange(
    [{ start_at: '2026-09-09T00:00:00Z', end_at: '2026-09-09T01:30:00Z', recurrence_rule: null }],
    '2026-09-07',
    '2026-09-13',
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].occurrenceDate, '2026-09-08', 'Tuesday, the local date');
  assert.equal(out[0].startAt, '2026-09-09T00:00:00Z', 'the stored instant is untouched');
});

test('a recurring evening event repeats on the right local evenings', () => {
  const out = expandInRange(
    [{ start_at: '2026-09-08T00:00:00Z', end_at: '2026-09-08T01:00:00Z', recurrence_rule: 'daily' }],
    '2026-09-07',
    '2026-09-09',
  );
  // 8pm Eastern on the 7th, 8th and 9th.
  assert.deepEqual(out.map((o) => o.occurrenceDate), ['2026-09-07', '2026-09-08', '2026-09-09']);
  for (const o of out) {
    const localHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hour12: false,
    }).format(new Date(o.startAt));
    assert.equal(localHour, '20', o.occurrenceDate);
  }
});

test('the wall clock survives the end of daylight saving', () => {
  // US DST ends 2026-11-01. A 6:30am anchor is at 6:30am on both sides of it,
  // which means the UTC instant it maps to has to shift by an hour.
  const out = expandInRange(
    [{ start_at: '2026-10-30T10:30:00Z', end_at: '2026-10-30T11:30:00Z', recurrence_rule: 'daily' }],
    '2026-10-30',
    '2026-11-03',
  );
  for (const o of out) {
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(o.startAt));
    assert.equal(local, '06:30', o.occurrenceDate);
  }
  // And the UTC instants really do differ either side of the change.
  const before = out.find((o) => o.occurrenceDate === '2026-10-31')!.startAt.slice(11, 16);
  const after = out.find((o) => o.occurrenceDate === '2026-11-02')!.startAt.slice(11, 16);
  assert.notEqual(before, after);
});
