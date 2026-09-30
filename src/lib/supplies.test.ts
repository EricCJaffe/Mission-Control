import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { byStore, shoppingList, stockOf, type Supply } from './supplies.ts';

const s = (over: Partial<Supply>): Supply => ({
  id: over.name ?? 'x',
  name: 'x',
  category: 'other',
  store: null,
  unit: null,
  on_hand: 0,
  keep_min: null,
  need: false,
  need_note: null,
  part_number: null,
  asset_id: null,
  notes: null,
  last_bought_on: null,
  ...over,
});

test('stock: out at zero, low under keep-at-least, ok otherwise', () => {
  assert.equal(stockOf({ on_hand: 0, keep_min: null }), 'out');
  assert.equal(stockOf({ on_hand: 1, keep_min: 2 }), 'low');
  assert.equal(stockOf({ on_hand: 2, keep_min: 2 }), 'ok');
  assert.equal(stockOf({ on_hand: 1, keep_min: null }), 'ok');
});

test('below keep-at-least: buy back up to it', () => {
  const [line] = shoppingList([s({ name: 'Bug spray', on_hand: 1, keep_min: 3 })], []);
  assert.equal(line.qty, 2);
  assert.deepEqual(line.reasons, ['below 3']);
});

test('at or above keep-at-least and not flagged: not on the list', () => {
  assert.equal(shoppingList([s({ name: 'Bags', on_hand: 3, keep_min: 3 })], []).length, 0);
  // No keep-at-least and none on hand is not a reason on its own: a spark plug
  // nobody stocks should not nag.
  assert.equal(shoppingList([s({ name: 'Plug', on_hand: 0 })], []).length, 0);
});

test('flagged with the shelf at target: buy one', () => {
  const [line] = shoppingList([s({ name: 'Oil', on_hand: 2, keep_min: 2, need: true, need_note: 'wrong weight' })], []);
  assert.equal(line.qty, 1);
  assert.deepEqual(line.reasons, ['flagged: wrong weight']);
});

test('open jobs needing more than the shelf holds: buy the difference, name the jobs', () => {
  const supply = s({ name: 'Mix oil', on_hand: 1, keep_min: 1 });
  const [line] = shoppingList([supply], [
    { supply_id: supply.id, qty: 2, task_title: 'Chainsaw' },
    { supply_id: supply.id, qty: 1, task_title: 'Trimmer' },
  ]);
  assert.equal(line.qty, 2);
  assert.deepEqual(line.reasons, ['for Chainsaw, Trimmer']);
});

test('the larger of keep-at-least and job demand wins, not the sum', () => {
  const supply = s({ name: 'Gas', on_hand: 0, keep_min: 5, unit: 'gal' });
  const [line] = shoppingList([supply], [{ supply_id: supply.id, qty: 2, task_title: 'Mow' }]);
  assert.equal(line.qty, 5);
});

test('grouped by store, case-insensitively, with no-store last', () => {
  const lines = shoppingList(
    [
      s({ name: 'Weed killer', store: 'tractor supply', need: true }),
      s({ name: 'Bleach', store: 'Walmart', need: true }),
      s({ name: 'Bar oil', store: 'Tractor Supply', need: true }),
      s({ name: 'Zip ties', need: true }),
    ],
    [],
  );
  const groups = byStore(lines);
  assert.deepEqual(groups.map((g) => g.store), ['Tractor Supply', 'Walmart', 'Anywhere']);
  assert.deepEqual(groups[0].lines.map((l) => l.supply.name), ['Bar oil', 'Weed killer']);
});
