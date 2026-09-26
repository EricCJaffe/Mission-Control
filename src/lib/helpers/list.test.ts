import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helperView, minutesWorked, formatHours, addDays, type WorkRow } from './list.ts';

const base: WorkRow = {
  task_id: 't',
  title: 'Job',
  status: 'todo',
  due_date: null,
  recurrence_rule: null,
  created_at: '2026-09-01T00:00:00Z',
  shared: true,
  skill: 'helper',
  location_label: '6175 Bobby Padgett Rd',
  pinned: false,
  sort_order: null,
  assignee_worker_id: null,
  assignee_name: null,
  instructions: null,
  materials: null,
  gift_card_note: null,
  gift_card_sent_at: null,
  claimed_at: null,
};
const row = (o: Partial<WorkRow>): WorkRow => ({ ...base, ...o });
const names = new Map([['w-steve', 'Steve']]);
const today = '2026-09-26';
const helper = { worker_id: 'w-tyler', skills: ['helper'] };

test('nothing is shown that is not shared, or is closed', () => {
  const v = helperView([row({ task_id: 'a', shared: false }), row({ task_id: 'b', status: 'done' }), row({ task_id: 'c' })], helper, names, today);
  assert.deepEqual(v.oneOff.map((i) => i.id), ['c']);
});

test('a helper sees their own jobs and the open board in their skill, nothing else', () => {
  const rows = [
    row({ task_id: 'switch', skill: 'electrician' }),
    row({ task_id: 'posts', skill: 'helper' }),
    row({ task_id: 'mine', skill: 'carpenter', assignee_worker_id: 'w-tyler' }),
    row({ task_id: 'steves', skill: 'helper', assignee_worker_id: 'w-steve' }),
    row({ task_id: 'other', skill: 'helper', assignee_name: 'Roofer Bob' }),
  ];
  const v = helperView(rows, helper, names, today).oneOff;
  assert.deepEqual(v.map((i) => i.id).sort(), ['mine', 'posts']);
  assert.deepEqual(v.map((i) => [i.id, i.board, i.mine]).sort(), [['mine', false, true], ['posts', true, false]]);
  assert.equal(helperView(rows, { worker_id: null, skills: null }, names, today).oneOff.length, 5, 'Eric sees all');
});

test('claimed means I took it, not that Eric gave it to me', () => {
  const v = helperView(
    [row({ task_id: 'took', assignee_worker_id: 'w-tyler', claimed_at: '2026-09-26T20:00:00Z' }), row({ task_id: 'given', assignee_worker_id: 'w-tyler' })],
    helper, names, today,
  ).oneOff;
  assert.deepEqual(v.map((i) => [i.id, i.claimed]).sort(), [['given', false], ['took', true]]);
});

test('one-offs: pinned first, then his order, then due, then oldest', () => {
  const rows = [
    row({ task_id: 'late', created_at: '2026-09-03T00:00:00Z' }),
    row({ task_id: 'early', created_at: '2026-09-02T00:00:00Z' }),
    row({ task_id: 'second', sort_order: 2 }),
    row({ task_id: 'first', sort_order: 1 }),
    row({ task_id: 'pin', pinned: true, sort_order: 9 }),
  ];
  assert.deepEqual(helperView(rows, helper, names, today).oneOff.map((i) => i.id), ['pin', 'first', 'second', 'early', 'late']);
});

test('maintenance shows only when coming due, soonest first, overdue flagged', () => {
  const rows = [
    row({ task_id: 'far', recurrence_rule: 'FREQ=MONTHLY', due_date: addDays(today, 30) }),
    row({ task_id: 'soon', recurrence_rule: 'FREQ=MONTHLY', due_date: addDays(today, 10) }),
    row({ task_id: 'late', recurrence_rule: 'FREQ=MONTHLY', due_date: '2026-09-20' }),
  ];
  const v = helperView(rows, helper, names, today);
  assert.deepEqual(v.maintenance.map((i) => i.id), ['late', 'soon']);
  assert.equal(v.maintenance[0].overdue, true);
  assert.equal(v.oneOff.length, 0);
});

test('the item carries only the helper-facing fields', () => {
  const [item] = helperView([row({ assignee_worker_id: 'w-steve', gift_card_note: '$100 Home Depot' })], { worker_id: null, skills: null }, names, today).oneOff;
  assert.deepEqual(Object.keys(item).sort(), [
    'assignee', 'board', 'claimed', 'due_date', 'gift_card', 'id', 'instructions', 'location', 'materials', 'mine', 'overdue', 'pinned', 'skill', 'title',
  ]);
  assert.equal(item.assignee, 'Steve');
});

test('hours', () => {
  assert.equal(minutesWorked('2026-09-26T13:00:00Z', '2026-09-26T15:30:00Z'), 150);
  assert.equal(formatHours(150), '2h 30m');
  assert.equal(formatHours(45), '45m');
});
