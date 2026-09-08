/*
 * Scheduling, which was silently dead.
 *
 * `cadence`, `cadence_anchor` and `due_date` were optional on PrayerRequest and
 * the prayer page's query did not select them. Everything therefore read as
 * `undefined`, `isDueToday` took the `?? 'rotation'` branch and returned false
 * for every prayer, and nothing was ever "scheduled for today" — while the
 * cadence dropdown displayed "Once" for rows stored as "rotation" and wrote
 * that back when touched.
 *
 * The type is required now, so omitting the columns is a compile error. These
 * cover the behaviour underneath it: that a cadence actually decides when
 * something comes round.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDueToday, selectTodaysList, type PrayerRequest } from './prayer.ts';

const NOW = new Date('2026-09-08T14:00:00Z');

function req(over: Partial<PrayerRequest> = {}): PrayerRequest {
  return {
    id: Math.random().toString(36).slice(2),
    subject_id: null,
    body: 'a prayer',
    mode: null,
    status: 'open',
    urgent: false,
    last_prayed_at: null,
    prayed_count: 0,
    cadence: 'rotation',
    cadence_anchor: null,
    due_date: null,
    ...over,
  };
}

// --- isDueToday ------------------------------------------------------------

test('a rotation prayer is never "scheduled"', () => {
  assert.equal(isDueToday(req({ cadence: 'rotation' }), NOW), false);
});

test('a daily prayer never prayed is due', () => {
  assert.equal(isDueToday(req({ cadence: 'daily' }), NOW), true);
});

test('a daily prayer already prayed today is not due again', () => {
  const r = req({ cadence: 'daily', last_prayed_at: '2026-09-08T09:00:00Z' });
  assert.equal(isDueToday(r, NOW), false);
});

test('a weekly prayer is due once the interval has passed, not before', () => {
  assert.equal(isDueToday(req({ cadence: 'weekly', last_prayed_at: '2026-09-05T09:00:00Z' }), NOW), false);
  assert.equal(isDueToday(req({ cadence: 'weekly', last_prayed_at: '2026-09-01T09:00:00Z' }), NOW), true);
});

test('a one-off is due until it is prayed, then never again', () => {
  assert.equal(isDueToday(req({ cadence: 'once' }), NOW), true);
  assert.equal(isDueToday(req({ cadence: 'once', last_prayed_at: '2026-09-07T09:00:00Z' }), NOW), false);
});

test('a one-off dated in the future is not due yet', () => {
  assert.equal(isDueToday(req({ cadence: 'once', due_date: '2026-12-25' }), NOW), false);
});

test('answered and closed prayers are never due', () => {
  assert.equal(isDueToday(req({ cadence: 'daily', status: 'answered' }), NOW), false);
  assert.equal(isDueToday(req({ cadence: 'daily', status: 'closed' }), NOW), false);
});

// --- selectTodaysList ------------------------------------------------------

test('scheduled prayers reach the scheduled list, rotation ones do not', () => {
  const daily = req({ cadence: 'daily' });
  const spinning = req({ cadence: 'rotation' });
  const { scheduled, rotation } = selectTodaysList([daily, spinning], { now: NOW });

  assert.deepEqual(scheduled.map((r) => r.id), [daily.id]);
  assert.deepEqual(rotation.map((r) => r.id), [spinning.id]);
});

test('scheduled prayers are never truncated by the rotation size', () => {
  // Asking for something daily and having it silently dropped would make the
  // schedule a suggestion.
  const dailies = Array.from({ length: 8 }, () => req({ cadence: 'daily' }));
  const { scheduled, rotation } = selectTodaysList(dailies, { now: NOW, size: 3 });

  assert.equal(scheduled.length, 8);
  assert.equal(rotation.length, 0);
});

test('a prayer already prayed today counts as done, not outstanding', () => {
  const r = req({ cadence: 'daily', last_prayed_at: '2026-09-08T09:00:00Z' });
  const list = selectTodaysList([r], { now: NOW });

  assert.deepEqual(list.done.map((x) => x.id), [r.id]);
  assert.equal(list.scheduled.length, 0);
  assert.equal(list.complete, true);
});

test('every cadence value the UI offers is one selectTodaysList understands', () => {
  // The dropdown writes these strings straight through to the column, so a
  // value the scheduler does not know would simply never come round again.
  for (const cadence of ['daily', 'weekly', 'monthly', 'once'] as const) {
    const r = req({ cadence });
    const { scheduled } = selectTodaysList([r], { now: NOW });
    assert.equal(scheduled.length, 1, `${cadence} should be schedulable`);
  }
});
