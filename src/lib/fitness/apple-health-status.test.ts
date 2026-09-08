/*
 * The Apple Health watchdog.
 *
 * These encode the actual incident: the feed went quiet on 2026-08-16 with
 * every prior payload reporting success, and nothing noticed for three weeks.
 * The case that matters most is the one in the middle — an overall "last sync"
 * that looks recent while one automation has silently stopped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summariseAppleHealth,
  describeAge,
  shouldAlert,
  STALE_AFTER_HOURS,
  type SyncLogRow,
} from './apple-health-status.ts';

const NOW = new Date('2026-09-08T12:00:00Z');

function row(over: Partial<SyncLogRow> & { received_at: string }): SyncLogRow {
  return {
    status: 'success',
    automation_name: 'Workouts',
    workouts_written: 1,
    body_metrics_written: 0,
    daily_written: 0,
    error_message: null,
    metrics_unmapped: null,
    ...over,
  };
}

test('never having synced is not reported as stale', () => {
  // Otherwise the watchdog emails someone who has not set the phone up yet.
  const s = summariseAppleHealth([], NOW);
  assert.equal(s.everSynced, false);
  assert.equal(s.stale, false);
  assert.equal(s.lastAt, null);
});

test('a recent payload is healthy', () => {
  const s = summariseAppleHealth([row({ received_at: '2026-09-08T06:00:00Z' })], NOW);
  assert.equal(s.stale, false);
  assert.equal(Math.round(s.ageHours!), 6);
});

test('silence past the threshold is stale, even with no errors', () => {
  // The real failure: every payload succeeded, then they stopped coming.
  const s = summariseAppleHealth([row({ received_at: '2026-08-16T17:58:00Z' })], NOW);
  assert.equal(s.stale, true);
  assert.equal(s.problems.length, 0);
});

test('the boundary is exclusive, so exactly the threshold is still fresh', () => {
  const at = new Date(NOW.getTime() - STALE_AFTER_HOURS * 3_600_000).toISOString();
  assert.equal(summariseAppleHealth([row({ received_at: at })], NOW).stale, false);
});

test('one stopped automation is visible even when the feed looks current', () => {
  const s = summariseAppleHealth(
    [
      row({ received_at: '2026-09-08T06:00:00Z', automation_name: 'Health' }),
      row({ received_at: '2026-08-16T17:58:00Z', automation_name: 'Workouts' }),
    ],
    NOW,
  );

  // Overall the feed is fine — which is exactly why per-automation matters.
  assert.equal(s.stale, false);

  const workouts = s.automations.find((a) => a.name === 'Workouts')!;
  const health = s.automations.find((a) => a.name === 'Health')!;
  assert.equal(workouts.stale, true);
  assert.equal(health.stale, false);
});

test('an automation is reported from its newest payload only', () => {
  const s = summariseAppleHealth(
    [
      row({ received_at: '2026-09-08T06:00:00Z', automation_name: 'Workouts', workouts_written: 2 }),
      row({ received_at: '2026-09-01T06:00:00Z', automation_name: 'Workouts', workouts_written: 9 }),
    ],
    NOW,
  );
  assert.equal(s.automations.length, 1);
  assert.equal(s.automations[0]!.lastWrote, 2);
});

test('payloads with no automation name are grouped, not dropped', () => {
  const s = summariseAppleHealth([row({ received_at: '2026-09-08T06:00:00Z', automation_name: null })], NOW);
  assert.deepEqual(s.automations.map((a) => a.name), ['Unnamed']);
});

test('problems are collected newest first and capped', () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    row({
      received_at: `2026-09-0${i + 1}T06:00:00Z`,
      status: 'partial',
      error_message: `boom ${i + 1}`,
    }),
  );
  const s = summariseAppleHealth(rows, NOW);
  assert.equal(s.problems.length, 5);
  assert.equal(s.problems[0]!.message, 'boom 8');
});

test('a success row carrying an error message still counts as a problem', () => {
  const s = summariseAppleHealth(
    [row({ received_at: '2026-09-08T06:00:00Z', status: 'success', error_message: 'partial write' })],
    NOW,
  );
  assert.equal(s.problems.length, 1);
});

test('unmapped metrics are merged and deduplicated across payloads', () => {
  const s = summariseAppleHealth(
    [
      row({ received_at: '2026-09-08T06:00:00Z', metrics_unmapped: ['vo2_max', 'foo'] }),
      row({ received_at: '2026-09-07T06:00:00Z', metrics_unmapped: ['foo'] }),
    ],
    NOW,
  );
  assert.deepEqual(s.unmapped, ['foo', 'vo2_max']);
});

test('rows in any order give the same newest', () => {
  const a = row({ received_at: '2026-09-01T06:00:00Z' });
  const b = row({ received_at: '2026-09-08T06:00:00Z' });
  assert.equal(summariseAppleHealth([a, b], NOW).lastAt, summariseAppleHealth([b, a], NOW).lastAt);
});

test('ages read the way a person would say them', () => {
  assert.equal(describeAge(0.5), 'under an hour');
  assert.equal(describeAge(6), '6 hours');
  assert.equal(describeAge(72), '3 days');
  assert.equal(describeAge(24 * 23), '3 weeks');
});

test('the watchdog escalates rather than nagging daily', () => {
  const h = (days: number) => days * 24 + 1;
  assert.equal(shouldAlert(h(1)), false, 'day 1 is inside the threshold');
  assert.equal(shouldAlert(h(2)), true, 'day 2 is the first alert');
  assert.equal(shouldAlert(h(3)), false);
  assert.equal(shouldAlert(h(5)), false);
  assert.equal(shouldAlert(h(7)), true, 'then weekly');
  assert.equal(shouldAlert(h(14)), true);
  assert.equal(shouldAlert(h(21)), true);
});
