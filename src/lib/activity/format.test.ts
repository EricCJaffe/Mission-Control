import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageLabel, botInitials, botTone, etDayOf, etTime, splitByAge, startLabel, TAGS } from './format.ts';

const now = new Date('2026-10-27T22:00:00Z'); // 6:00 PM ET

test('ages read as minutes, hours, then days', () => {
  assert.equal(ageLabel('2026-10-27T21:55:00Z', now), '5m');
  assert.equal(ageLabel('2026-10-27T20:00:00Z', now), '2h');
  assert.equal(ageLabel('2026-10-25T21:00:00Z', now), '2d');
  assert.equal(ageLabel('2026-10-28T00:00:00Z', now), '0m'); // clock skew is not negative
});

test('times and days are Eastern, not UTC', () => {
  // 02:30 UTC on the 28th is 22:30 on the 27th in New York.
  assert.equal(etDayOf('2026-10-28T02:30:00Z'), '2026-10-27');
  assert.equal(etTime('2026-10-28T02:30:00Z'), '22:30');
  assert.equal(etTime('2026-10-26T17:00:00Z', true), 'Mon 13:00');
});

test('start labels: weekday and time this week, "Since" before it', () => {
  assert.equal(startLabel('2026-10-26T17:00:00Z', now), 'Mon 13:00');
  assert.equal(startLabel('2026-10-01T13:00:00Z', now), 'Since Oct 1');
});

test('initials match the reference: CS, P, XB', () => {
  assert.equal(botInitials('Chief of Staff'), 'CS');
  assert.equal(botInitials('Partnerships'), 'P');
  assert.equal(botInitials('X Bot'), 'XB');
  assert.equal(botInitials('SJCOS session'), 'SJ');
  assert.equal(botInitials('Fourlot (Team)'), 'F');
});

test('avatar tones are stable and never green', () => {
  assert.equal(botTone('Coding'), botTone('Coding'));
  for (const b of ['Coding', 'Dispatch', 'Chief of Staff', 'Verify', 'Inbox']) {
    assert.doesNotMatch(botTone(b), /green|emerald/);
  }
});

test('Due today is the only red pill', () => {
  const red = Object.entries(TAGS).filter(([, t]) => t.className.includes('red'));
  assert.deepEqual(red.map(([k]) => k), ['due_today']);
});

test('waiting items older than 14 days fold behind Show older', () => {
  const rows = [
    { id: 'a', occurred_at: '2026-10-27T12:00:00Z' },
    { id: 'b', occurred_at: '2026-10-14T00:00:00Z' }, // 13.9 days
    { id: 'c', occurred_at: '2026-10-13T21:00:00Z' }, // just over 14
    { id: 'd', occurred_at: '2026-09-25T12:00:00Z' },
  ];
  const { recent, older } = splitByAge(rows, now);
  assert.deepEqual(recent.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(older.map((r) => r.id), ['c', 'd']);
});
