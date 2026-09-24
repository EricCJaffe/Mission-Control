import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { firstDue, itemsFor, CATEGORY_KEYS, LIBRARY } from './library.ts';
import { verdictFor, occurrencesBetween } from './status.ts';
import { parseRRule, nextOccurrence, describeRRule } from '../tasks/recurrence.ts';
import { completionPatch } from '../tasks/complete.ts';

test('every library rule parses', () => {
  for (const cat of CATEGORY_KEYS) {
    for (const item of itemsFor(cat)) {
      assert.ok(parseRRule(item.rule), `${item.key}: ${item.rule}`);
      if (item.anchor) assert.match(item.anchor, /^\d{2}-\d{2}$/, item.key);
    }
  }
});

test('library keys are unique', () => {
  const keys = Object.values(LIBRARY).flat().map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

// Eric's own example: start the small engines monthly, over the winter.
test('the winter start runs monthly November to March and skips summer', () => {
  const rule = 'FREQ=MONTHLY;BYMONTH=11,12,1,2,3';
  assert.equal(describeRRule(rule), 'Every month in Nov, Dec, Jan, Feb, Mar');
  const { due } = firstDue(rule, '2026-09-24', { anchor: '11-01' });
  assert.equal(due, '2026-11-01');
  assert.equal(nextOccurrence(rule, '2025-11-01', '2027-03-01'), '2027-11-01');
  assert.equal(nextOccurrence(rule, '2025-11-01', '2026-12-01'), '2027-01-01');
});

test('spring and fall tune-up lands on the next of the two', () => {
  const { due } = firstDue('FREQ=YEARLY;BYMONTH=4,10', '2026-09-24', { anchor: '04-01' });
  assert.equal(due, '2026-10-01');
  assert.equal(nextOccurrence('FREQ=YEARLY;BYMONTH=4,10', '2026-04-01', '2026-10-01'), '2027-04-01');
});

test('a yearly item already past this year waits for next year', () => {
  assert.equal(firstDue('FREQ=YEARLY', '2026-09-24', { anchor: '03-01' }).due, '2027-03-01');
});

test('unanchored items stagger and never start after the 28th', () => {
  assert.equal(firstDue('FREQ=MONTHLY', '2026-09-24', { stagger: 3 }).due, '2026-09-27');
  const late = firstDue('FREQ=MONTHLY', '2026-09-24', { stagger: 6 });
  assert.equal(late.anchor, '2026-09-28');
});

test('completing late rolls from today, not from the missed date', () => {
  const patch = completionPatch(
    { recurrence_rule: 'FREQ=MONTHLY;INTERVAL=2', recurrence_anchor: '2026-06-05', due_date: '2026-08-05', recurrence_count: 1 },
    '2026-09-24',
  );
  assert.equal(patch.status, 'todo');
  assert.equal(patch.due_date, '2026-10-05');
});

test('a one-off closes', () => {
  const patch = completionPatch({ recurrence_rule: null, recurrence_anchor: null, due_date: '2026-09-01', recurrence_count: 0 }, '2026-09-24');
  assert.equal(patch.status, 'done');
});

test('verdict: date and meter, worse wins', () => {
  assert.equal(verdictFor('2026-12-01', '2026-09-24').verdict, 'green');
  assert.equal(verdictFor('2026-10-01', '2026-09-24').verdict, 'yellow');
  assert.equal(verdictFor('2026-09-20', '2026-09-24').verdict, 'red');
  // 50-hour oil change at 212 hours, last done at 160: past due by meter.
  assert.equal(verdictFor('2027-03-01', '2026-09-24', { reading: 212, last: 160, interval: 50 }).verdict, 'red');
  assert.equal(verdictFor('2027-03-01', '2026-09-24', { reading: 202, last: 160, interval: 50 }).verdict, 'yellow');
});

test('occurrences project a year of a two-monthly filter', () => {
  const dates = occurrencesBetween(
    { due_date: '2026-10-01', recurrence_rule: 'FREQ=MONTHLY;INTERVAL=2', recurrence_anchor: '2026-10-01' },
    '2026-09-01',
    '2027-09-30',
  );
  assert.deepEqual(dates, ['2026-10-01', '2026-12-01', '2027-02-01', '2027-04-01', '2027-06-01', '2027-08-01']);
});
