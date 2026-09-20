import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as nodeModule from 'node:module';

/*
 * `periods.ts` imports `@/lib/day` by alias, which the Next bundler resolves
 * and plain Node does not. Same in-process resolver hook as
 * `src/lib/brief/collect.test.ts` — see the long comment there — so this file
 * runs under bare `node --test` with no build step and no loader flag.
 */
type ResolveHook = (
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => unknown,
) => unknown;

/** `src/`, from `src/lib/reviews/periods.test.ts`. */
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

const {
  periodFor,
  periodToReview,
  previousPeriod,
  periodLabel,
  periodDays,
  periodIsComplete,
  inPeriod,
} = await import('./periods');

// Monday-based, matching weekKey in spirit/practices.ts. A Sunday church visit
// belongs to the week it ends, not the week it starts.
test('weeks run Monday to Sunday', () => {
  // 2026-09-20 is a Sunday.
  const week = periodFor('weekly', '2026-09-20');
  assert.equal(week.start, '2026-09-14', 'Monday');
  assert.equal(week.end, '2026-09-20', 'Sunday');
  assert.equal(periodDays(week), 7);

  const monday = periodFor('weekly', '2026-09-14');
  assert.deepEqual(monday, week, 'the Monday and the Sunday are the same week');
});

test('months, quarters and years are whole periods', () => {
  assert.deepEqual(periodFor('monthly', '2026-09-20'), {
    kind: 'monthly',
    start: '2026-09-01',
    end: '2026-09-30',
  });
  assert.deepEqual(periodFor('quarterly', '2026-09-20'), {
    kind: 'quarterly',
    start: '2026-07-01',
    end: '2026-09-30',
  });
  assert.deepEqual(periodFor('annual', '2026-09-20'), {
    kind: 'annual',
    start: '2026-01-01',
    end: '2026-12-31',
  });
});

test('February and leap years come out whole', () => {
  assert.equal(periodFor('monthly', '2027-02-10').end, '2027-02-28');
  assert.equal(periodFor('monthly', '2028-02-10').end, '2028-02-29');
});

test('previousPeriod steps back one whole period', () => {
  assert.equal(previousPeriod(periodFor('weekly', '2026-09-20')).start, '2026-09-07');
  assert.equal(previousPeriod(periodFor('monthly', '2026-01-15')).start, '2025-12-01');
  assert.equal(previousPeriod(periodFor('quarterly', '2026-01-15')).start, '2025-10-01');
});

// On the first morning of a period there is nothing in it yet. Being handed an
// empty week to review is how a review becomes a chore.
test('on the first day of a period, the review is of the period just ended', () => {
  const monday = periodToReview('weekly', '2026-09-14');
  assert.equal(monday.start, '2026-09-07');
  assert.equal(monday.end, '2026-09-13');

  const midweek = periodToReview('weekly', '2026-09-17');
  assert.equal(midweek.start, '2026-09-14', 'any other day reviews the current week');
});

test('labels read the way a person would say them', () => {
  assert.equal(periodLabel(periodFor('weekly', '2026-09-20')), 'Sep 14 – Sep 20');
  assert.equal(periodLabel(periodFor('monthly', '2026-09-20')), 'September 2026');
  assert.equal(periodLabel(periodFor('quarterly', '2026-09-20')), '2026 Q3');
  assert.equal(periodLabel(periodFor('annual', '2026-09-20')), '2026');
});

test('a period is complete only once it has ended', () => {
  const week = periodFor('weekly', '2026-09-20');
  assert.equal(periodIsComplete(week, '2026-09-20'), false, 'the last day is still live');
  assert.equal(periodIsComplete(week, '2026-09-21'), true);
});

test('inPeriod is inclusive at both ends', () => {
  const week = periodFor('weekly', '2026-09-20');
  assert.equal(inPeriod(week, '2026-09-14'), true);
  assert.equal(inPeriod(week, '2026-09-20'), true);
  assert.equal(inPeriod(week, '2026-09-21'), false);
  assert.equal(inPeriod(week, ''), false);
});
