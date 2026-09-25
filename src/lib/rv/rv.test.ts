import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { CHECKLISTS, getChecklist, itemIds, progress, durationMinutes } from './checklists.ts';
import { span, nights, stopForToday, statusByDate, type Stop } from './trips.ts';

test('both checklists load with unique item ids', () => {
  assert.deepEqual(CHECKLISTS.map((c) => c.id), ['arrival', 'departure']);
  const ids = CHECKLISTS.flatMap(itemIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(itemIds(getChecklist('arrival')!).length, 44);
  assert.equal(itemIds(getChecklist('departure')!).length, 50);
});

test('progress ignores ids that are no longer in the file', () => {
  const c = getChecklist('departure')!;
  const p = progress(c, ['departure-s1-i1', 'gone-item']);
  assert.equal(p.done, 1);
  assert.equal(p.total, 50);
  assert.equal(p.complete, false);
  assert.equal(progress(c, itemIds(c)).complete, true);
});

test('duration in minutes', () => {
  assert.equal(durationMinutes('2026-10-01T12:00:00Z', '2026-10-01T12:47:30Z'), 48);
  assert.equal(durationMinutes('2026-10-01T12:00:00Z', null), null);
});

const stop = (p: Partial<Stop>): Stop => ({
  id: 'x', trip_id: 't', campground: 'c', location: null, site: null, arrive_on: '2026-10-01', depart_on: null,
  confirmation: null, cost: null, hookups: null, url: null, phone: null, notes: null, ...p,
});

test('a trip spans its stops', () => {
  const stops = [stop({ id: 'b', arrive_on: '2026-10-05', depart_on: '2026-10-09' }), stop({ id: 'a', arrive_on: '2026-10-01', depart_on: '2026-10-05' })];
  assert.deepEqual(span(stops), { start: '2026-10-01', end: '2026-10-09' });
  assert.equal(nights(stops[0]), 4);
  assert.equal(statusByDate(stops, '2026-09-30'), 'planned');
  assert.equal(statusByDate(stops, '2026-10-03'), 'active');
  assert.equal(statusByDate(stops, '2026-10-10'), 'done');
});

test('on a travel day, departure names the stop we leave and arrival the one we reach', () => {
  const stops = [stop({ id: 'a', arrive_on: '2026-10-01', depart_on: '2026-10-05' }), stop({ id: 'b', arrive_on: '2026-10-05', depart_on: '2026-10-09' })];
  assert.equal(stopForToday(stops, '2026-10-05', 'departure')?.id, 'a');
  assert.equal(stopForToday(stops, '2026-10-05', 'arrival')?.id, 'b');
  assert.equal(stopForToday(stops, '2026-10-03', 'departure')?.id, 'a');
  assert.equal(stopForToday(stops, '2026-11-01', 'arrival'), null);
});
