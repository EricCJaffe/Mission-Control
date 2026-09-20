import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  carryFrom,
  formatValue,
  hasLine,
  overallStatus,
  rankOf,
  unconfiguredCount,
  verdictFor,
} from './status.ts';

const HIGHER = { greenAt: 8, yellowAt: 6, direction: 'higher_is_better' as const };
const LOWER = { greenAt: 0, yellowAt: 10, direction: 'lower_is_better' as const };

// THE rule this module exists for. Eric, 2026-09-20: "No reading would be red."
test('no reading is red, never grey', () => {
  const v = verdictFor({ hasReading: false, value: null }, HIGHER);
  assert.equal(v.status, 'red');
  assert.match(v.reason, /No reading/);
});

// Configuration is judged BEFORE the reading, and the order is the design.
// honeylakeos puts it best: "Red accuses the number; this accuses the setup."
test('an area with no line reads unknown, not red and not green', () => {
  const noLine = { greenAt: null, yellowAt: null, direction: 'higher_is_better' as const };

  assert.equal(verdictFor({ hasReading: false, value: null }, noLine).status, 'unknown');
  assert.equal(verdictFor({ hasReading: true, value: 3 }, noLine).status, 'unknown');
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

test('hasLine agrees exactly with the statuses verdictFor hands out', () => {
  // The invariant honeylakeos states: an area hasLine refuses is precisely an
  // area that reads unknown, and no other.
  const cases = [
    { greenAt: 8, yellowAt: null, direction: 'higher_is_better' as const },
    { greenAt: null, yellowAt: 6, direction: 'higher_is_better' as const },
    { greenAt: null, yellowAt: null, direction: 'higher_is_better' as const },
    { greenAt: 1, yellowAt: 2, direction: 'within_range' as const },
    { greenAt: 1, yellowAt: 2, targetValue: 7, direction: 'within_range' as const },
    { greenAt: 8, yellowAt: 6, direction: 'sideways' as unknown as 'higher_is_better' },
  ];
  for (const line of cases) {
    const unknown = verdictFor({ hasReading: true, value: 5 }, line).status === 'unknown';
    assert.equal(unknown, !hasLine(line), JSON.stringify(line));
  }
});

// Both too high and too low are failures — weight, sleep hours, blood
// pressure. The tolerances are sign-insensitive and the tighter one is green,
// whichever field it was typed into.
test('within_range bands around a center', () => {
  const sleep = { greenAt: 1, yellowAt: 2, targetValue: 7, direction: 'within_range' as const };

  assert.equal(verdictFor({ hasReading: true, value: 7 }, sleep).status, 'green');
  assert.equal(verdictFor({ hasReading: true, value: 6 }, sleep).status, 'green', 'at the tight edge');
  assert.equal(verdictFor({ hasReading: true, value: 5.5 }, sleep).status, 'yellow');
  assert.equal(verdictFor({ hasReading: true, value: 9 }, sleep).status, 'yellow', 'too much is not green');
  assert.equal(verdictFor({ hasReading: true, value: 4 }, sleep).status, 'red');
  assert.equal(verdictFor({ hasReading: true, value: 10 }, sleep).status, 'red');

  const flipped = { greenAt: -2, yellowAt: 1, targetValue: 7, direction: 'within_range' as const };
  assert.equal(verdictFor({ hasReading: true, value: 6 }, flipped).status, 'green', 'signs and order do not matter');
});

test('an unusable number is no reading, not a zero', () => {
  assert.equal(verdictFor({ hasReading: true, value: Number.NaN }, HIGHER).status, 'red');
  assert.equal(verdictFor({ hasReading: true, value: Number.POSITIVE_INFINITY }, HIGHER).status, 'red');
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

test('not_due and unknown never contribute to the verdict', () => {
  assert.equal(overallStatus(['green', 'not_due']), 'green');
  // An area nobody has drawn a line for is a setup problem. Letting it color
  // the week either way makes the verdict a statement about the configuration.
  assert.equal(overallStatus(['green', 'unknown']), 'green');
  assert.equal(overallStatus(['not_due', 'unknown']), null, 'nothing measured is not a green quarter');
  assert.equal(overallStatus([]), null);
  assert.equal(unconfiguredCount(['green', 'unknown', 'unknown', 'red']), 2);
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
  assert.ok(rankOf('green') > rankOf('unknown'));
});

test('values print without trailing zeros', () => {
  assert.equal(formatValue(8), '8');
  assert.equal(formatValue(8, '/10'), '8 /10');
  assert.equal(formatValue(7.25), '7.3');
});
