import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthFromKey, previousMonth, contains } from './month.ts';

test('a month runs from its first instant to the next month exclusive', () => {
  const m = monthFromKey('2026-08');
  assert.equal(m.startIso, '2026-08-01T00:00:00.000Z');
  assert.equal(m.endIso, '2026-09-01T00:00:00.000Z');
  assert.equal(m.label, 'August 2026');
});

test('December rolls the year, not the month index', () => {
  const m = monthFromKey('2026-12');
  assert.equal(m.endIso, '2027-01-01T00:00:00.000Z');
});

test('firing on 1 January reconciles the previous December', () => {
  const m = previousMonth(new Date('2027-01-01T06:17:00Z'));
  assert.equal(m.key, '2026-12');
  assert.equal(m.label, 'December 2026');
});

test('firing on 1 September reconciles August', () => {
  assert.equal(previousMonth(new Date('2026-09-01T10:17:00Z')).key, '2026-08');
});

test('the end instant is exclusive, so 1 Sep is not in August', () => {
  const aug = monthFromKey('2026-08');
  assert.ok(contains(aug, '2026-08-31T23:59:59.999Z'));
  assert.ok(!contains(aug, '2026-09-01T00:00:00.000Z'));
  assert.ok(!contains(aug, '2026-07-31T23:59:59.999Z'));
});

test('a malformed month is refused rather than coerced', () => {
  assert.throws(() => monthFromKey('Aug 2026'), /--month must look like/);
  assert.throws(() => monthFromKey('2026-13'), /not a month/);
});
