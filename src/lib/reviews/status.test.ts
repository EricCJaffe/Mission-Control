import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { carryFrom, overallStatus, verdictFor, formatValue, rankOf } from './status.ts';

const HIGHER = { target: 8, warnAt: 6, direction: 'higher_better' as const };
const LOWER = { target: 0, warnAt: 10, direction: 'lower_better' as const };

// THE rule this module exists for. Eric, 2026-09-20: "No reading would be red."
test('no reading is red, never grey', () => {
  const v = verdictFor({ hasReading: false, value: null }, HIGHER);
  assert.equal(v.status, 'red');
  assert.match(v.reason, /No reading/);
});

test('no reading is red even when the line is unset', () => {
  const v = verdictFor({ hasReading: false, value: null }, { target: null, warnAt: null, direction: 'higher_better' });
  assert.equal(v.status, 'red');
});

// A reading of zero is NOT the same as no reading, and both are red — but for
// different reasons, and the reason is what goes on the agenda.
test('a reading of zero is red for a different reason than silence', () => {
  const measured = verdictFor({ hasReading: true, value: 0 }, HIGHER);
  const silent = verdictFor({ hasReading: false, value: null }, HIGHER);
  assert.equal(measured.status, 'red');
  assert.equal(silent.status, 'red');
  assert.notEqual(measured.reason, silent.reason);
});

test('higher_better bands', () => {
  assert.equal(verdictFor({ hasReading: true, value: 9 }, HIGHER).status, 'green');
  assert.equal(verdictFor({ hasReading: true, value: 8 }, HIGHER).status, 'green', 'at the line is green');
  assert.equal(verdictFor({ hasReading: true, value: 7 }, HIGHER).status, 'yellow');
  assert.equal(verdictFor({ hasReading: true, value: 6 }, HIGHER).status, 'yellow', 'at the warn line is still yellow');
  assert.equal(verdictFor({ hasReading: true, value: 5.9 }, HIGHER).status, 'red');
});

test('lower_better inverts the bands, which is how overdue tasks are scored', () => {
  assert.equal(verdictFor({ hasReading: true, value: 0 }, LOWER).status, 'green');
  assert.equal(verdictFor({ hasReading: true, value: 5 }, LOWER).status, 'yellow');
  assert.equal(verdictFor({ hasReading: true, value: 10 }, LOWER).status, 'yellow', 'at the warn line is yellow');
  assert.equal(verdictFor({ hasReading: true, value: 41 }, LOWER).status, 'red');
});

// "2, short of 0" is what one phrasing applied to both directions produces.
test('the reason line reads correctly in both directions', () => {
  assert.match(verdictFor({ hasReading: true, value: 7 }, HIGHER).reason, /short of 8/);
  assert.match(verdictFor({ hasReading: true, value: 5.9 }, HIGHER).reason, /below a floor of 6/);
  assert.match(verdictFor({ hasReading: true, value: 5 }, LOWER).reason, /over a line of 0/);
  assert.match(verdictFor({ hasReading: true, value: 41 }, LOWER).reason, /past a line of 10/);
});

test('no line means recorded, not judged', () => {
  const v = verdictFor({ hasReading: true, value: 3 }, { target: null, warnAt: null, direction: 'higher_better' });
  assert.equal(v.status, 'green');
  assert.match(v.reason, /No line set/);
});

test('not due is neither red nor green', () => {
  const v = verdictFor({ hasReading: false, value: null }, HIGHER, {
    notDue: true,
    notDueReason: 'Read monthly, not weekly.',
  });
  assert.equal(v.status, 'not_due');
  assert.equal(v.reason, 'Read monthly, not weekly.');
});

// Averaging would let three greens bury a red. That arithmetic is the reason
// a quarter can pass with one area quietly failing.
test('the cycle takes the worst color, not the average', () => {
  assert.equal(overallStatus(['green', 'green', 'green', 'red']), 'red');
  assert.equal(overallStatus(['green', 'yellow']), 'yellow');
  assert.equal(overallStatus(['green', 'green']), 'green');
});

test('not_due never contributes to the verdict', () => {
  assert.equal(overallStatus(['green', 'not_due']), 'green');
  assert.equal(overallStatus(['not_due', 'not_due']), null, 'nothing measured is not a green quarter');
  assert.equal(overallStatus([]), null);
});

test('carry counts consecutive periods at the same status', () => {
  assert.equal(carryFrom('red', null), 1, 'first time is one');
  assert.equal(carryFrom('red', { status: 'red', carried: 1 }), 2);
  assert.equal(carryFrom('red', { status: 'red', carried: 4 }), 5);
  assert.equal(carryFrom('green', { status: 'red', carried: 4 }), 1, 'a change resets the count');
});

test('rank orders worst first', () => {
  assert.ok(rankOf('red') > rankOf('yellow'));
  assert.ok(rankOf('yellow') > rankOf('green'));
  assert.ok(rankOf('green') > rankOf('not_due'));
});

test('values print without trailing zeros', () => {
  assert.equal(formatValue(8), '8');
  assert.equal(formatValue(8, '/10'), '8 /10');
  assert.equal(formatValue(7.25), '7.3');
});
