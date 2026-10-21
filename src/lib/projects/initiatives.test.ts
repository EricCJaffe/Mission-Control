import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortInitiatives, ragBadge } from './initiatives.ts';

test('red first, then yellow, green, unread; furthest behind first within a color', () => {
  const rows = [
    { title: 'g', rag: 'green' as const, plan_pct: 10 },
    { title: 'none', rag: null, plan_pct: 0 },
    { title: 'y80', rag: 'yellow' as const, plan_pct: 80 },
    { title: 'y20', rag: 'yellow' as const, plan_pct: 20 },
    { title: 'r', rag: 'red' as const, plan_pct: 90 },
  ];
  assert.deepEqual(sortInitiatives(rows).map((r) => r.title), ['r', 'y20', 'y80', 'g', 'none']);
});

test('no reading is never shown as green', () => {
  assert.equal(ragBadge(null).label, 'no rag');
  assert.doesNotMatch(ragBadge(null).className, /green/);
});
