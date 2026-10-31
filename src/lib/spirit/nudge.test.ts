import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceNudge, nudgeSummary, unloggedPracticesDue } from './nudge.ts';
import type { Practice, PracticeLog } from './practices.ts';

// 2026-10-29 is a Thursday (UTC weekday 4).
const TODAY = '2026-10-29';

const daily = (id: string, label: string): Practice => ({
  id, key: id, label, cadence: 'daily', target_per_period: 1,
});
const PRACTICES: Practice[] = [
  daily('p1', 'Prayer'),
  daily('p2', 'Scripture'),
  { id: 'p3', key: 'church', label: 'Church', cadence: 'weekly', target_per_period: 1, due_weekday: 0 },
];
const log = (practice_id: string, log_date = TODAY, completed = true): PracticeLog => ({
  practice_id, log_date, completed,
});

test('shows the unlogged practices due today', () => {
  const n = practiceNudge(PRACTICES, [log('p1')], TODAY, null);
  assert.deepEqual(n, { show: true, remaining: [{ id: 'p2', label: 'Scripture' }] });
});

test('a practice not due today is not counted (Sunday church on a Thursday)', () => {
  const ids = unloggedPracticesDue(PRACTICES, [], TODAY).map((r) => r.id);
  assert.deepEqual(ids, ['p1', 'p2']);
});

test('hidden once everything due is logged', () => {
  assert.deepEqual(practiceNudge(PRACTICES, [log('p1'), log('p2')], TODAY, null), {
    show: false,
    reason: 'all_done',
  });
});

test('a log from another day or an unticked log does not count as done', () => {
  const n = practiceNudge(PRACTICES, [log('p1', '2026-10-28'), log('p2', TODAY, false)], TODAY, null);
  assert.equal(n.show, true);
  assert.equal(n.show && n.remaining.length, 2);
});

test('dismissed today stays hidden; yesterday\'s dismissal does not carry over', () => {
  assert.deepEqual(practiceNudge(PRACTICES, [], TODAY, TODAY), { show: false, reason: 'dismissed' });
  assert.equal(practiceNudge(PRACTICES, [], TODAY, '2026-10-28').show, true);
});

test('nothing due (or no practices) shows nothing', () => {
  assert.deepEqual(practiceNudge([], [], TODAY, null), { show: false, reason: 'none_due' });
  assert.deepEqual(practiceNudge([PRACTICES[2]], [], TODAY, null), { show: false, reason: 'none_due' });
});

test('summary names up to two practices', () => {
  assert.equal(nudgeSummary([{ label: 'Prayer' }]), 'Prayer');
  assert.equal(nudgeSummary([{ label: 'Prayer' }, { label: 'Scripture' }]), 'Prayer and Scripture');
  assert.equal(
    nudgeSummary([{ label: 'Prayer' }, { label: 'Scripture' }, { label: 'Fasting' }, { label: 'Journal' }]),
    'Prayer, Scripture and 2 more',
  );
});
