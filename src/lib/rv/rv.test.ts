import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { CHECKLISTS, getChecklist, itemIds, progress, durationMinutes } from './checklists.ts';
import { span, nights, stopForToday, statusByDate, stillToBook, deadlines, todayView, callSheet, type Stop, type Reservation } from './trips.ts';

test('both checklists load with unique item ids', () => {
  assert.deepEqual(CHECKLISTS.map((c) => c.id), ['pretrip', 'arrival', 'departure']);
  assert.equal(itemIds(getChecklist('pretrip')!).length, 65);
  const ids = CHECKLISTS.flatMap(itemIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(itemIds(getChecklist('arrival')!).length, 44);
  assert.equal(itemIds(getChecklist('departure')!).length, 51);
});

test('progress ignores ids that are no longer in the file', () => {
  const c = getChecklist('departure')!;
  const p = progress(c, ['departure-s1-i1', 'gone-item']);
  assert.equal(p.done, 1);
  assert.equal(p.total, 51);
  assert.equal(p.complete, false);
  assert.equal(progress(c, itemIds(c)).complete, true);
});

test('duration in minutes', () => {
  assert.equal(durationMinutes('2026-10-01T12:00:00Z', '2026-10-01T12:47:30Z'), 48);
  assert.equal(durationMinutes('2026-10-01T12:00:00Z', null), null);
});

const stop = (p: Partial<Stop>): Stop => ({
  id: 'x', trip_id: 't', seq: null, kind: 'campground', name: 'c', location: null, address: null, site: null,
  arrive_on: '2026-10-01', depart_on: null, leg: null, day_summary: null,
  confirmation: null, cost: null, hookups: null, url: null, phone: null, notes: null, ...p,
});

const res = (p: Partial<Reservation>): Reservation => ({
  id: 'r', trip_id: 't', stop_id: null, vendor: null, kind: 'campground', status: 'confirmed', conf_number: 'C1',
  secondary_ref: null, site_type: null, pull_through: true, amp: 30, hookups: 'full', check_in: null, check_out: null,
  paid: null, balance_due: null, booking_fee: null, cancel_by: null, cancel_policy: null, day_of_notes: null, ...p,
});

test('a trip spans its stops; dates only ever suggest under way or over', () => {
  const stops = [stop({ id: 'b', arrive_on: '2026-10-05', depart_on: '2026-10-09' }), stop({ id: 'a', arrive_on: '2026-10-01', depart_on: '2026-10-05' })];
  assert.deepEqual(span(stops), { start: '2026-10-01', end: '2026-10-09' });
  assert.equal(nights(stops[0]), 4);
  assert.equal(statusByDate(stops, '2026-09-30'), null);
  assert.equal(statusByDate(stops, '2026-10-03'), 'in-progress');
  assert.equal(statusByDate(stops, '2026-10-10'), 'complete');
  assert.deepEqual(span([stop({ arrive_on: null })]), { start: null, end: null });
});

test('on a travel day, departure names the stop we leave and arrival the one we reach', () => {
  const stops = [
    stop({ id: 'a', arrive_on: '2026-10-01', depart_on: '2026-10-05' }),
    stop({ id: 'f', kind: 'ferry', arrive_on: '2026-10-05', depart_on: '2026-10-05' }),
    stop({ id: 'b', arrive_on: '2026-10-05', depart_on: '2026-10-09' }),
  ];
  assert.equal(stopForToday(stops, '2026-10-05', 'departure')?.id, 'a');
  assert.equal(stopForToday(stops, '2026-10-05', 'arrival')?.id, 'b');
  assert.equal(stopForToday(stops, '2026-11-01', 'arrival'), null);
});

test('still to book: to-book reservations, unreserved stops, undated stops; never home', () => {
  const stops = [
    stop({ id: 'home', kind: 'home' }),
    stop({ id: 'a' }),
    stop({ id: 'b' }),
    stop({ id: 'nan', kind: 'excursion', arrive_on: null }),
  ];
  const reservations = [res({ id: 'ra', stop_id: 'a' }), res({ id: 'rb', stop_id: 'b', status: 'to-book' }), res({ id: 'rn', stop_id: 'nan' })];
  const list = stillToBook(stops, reservations);
  assert.deepEqual(list.map((x) => `${x.stop?.id}:${x.reason}`), ['b:Not booked yet', 'nan:Date not set']);
});

test('deadlines within the window, soonest first; past and canceled drop out', () => {
  const reservations = [
    res({ id: '1', vendor: 'MV ferry', cancel_by: '2026-10-06T23:59:00-04:00' }),
    res({ id: '2', vendor: 'PWF', cancel_by: '2026-10-21T14:00:00-04:00' }),
    res({ id: '3', vendor: 'Old', cancel_by: '2026-09-01T12:00:00-04:00' }),
    res({ id: '4', vendor: 'Gone', cancel_by: '2026-10-02T12:00:00-04:00', status: 'canceled' }),
  ];
  assert.deepEqual(deadlines(reservations, [], '2026-09-25T15:00:00Z').map((d) => d.label), ['Cancel-by: MV ferry', 'Cancel-by: PWF']);
  // A stop name wins over a generic vendor: two KOAs on one trip must not read alike.
  assert.equal(deadlines([res({ vendor: 'KOA', stop_id: 'a', cancel_by: '2026-10-15T16:00:00-04:00' })], [stop({ id: 'a', name: 'Newburgh KOA' })], '2026-09-25T15:00:00Z')[0].label, 'Cancel-by: Newburgh KOA');
});

test('today on a driving day: leaving, arriving, the fuel stop, the hazards', () => {
  const stops = [stop({ id: 'a', arrive_on: '2026-10-10', depart_on: '2026-10-12' }), stop({ id: 'b', arrive_on: '2026-10-12', depart_on: '2026-10-14' })];
  const reservations = [res({ stop_id: 'b', check_in: '2:00 PM' })];
  const fuel = [{ id: 'f', trip_id: 't', drive_date: '2026-10-12', leg: 'A -> B', miles: 350, route: null, primary_stop: 'Kenly 95', backup: null, notes: null }];
  const trip = { data: { hazards: [{ where: 'CBBT', rule: 'Propane OFF' }] } };
  const drive = todayView(trip, stops, reservations, fuel, '2026-10-12');
  assert.equal(drive.leaving?.id, 'a');
  assert.equal(drive.arriving?.id, 'b');
  assert.equal(drive.arrivingReservation?.check_in, '2:00 PM');
  assert.equal(drive.fuel?.primary_stop, 'Kenly 95');
  assert.equal(drive.hazards.length, 1);
  const parked = todayView(trip, stops, reservations, fuel, '2026-10-13');
  assert.equal(parked.parkedAt?.id, 'b');
  assert.equal(parked.hazards.length, 0);
});

test('call sheet flags what the playbook cares about', () => {
  const s = stop({ location: 'Cape Charles, VA' });
  const flags = callSheet(s, res({ pull_through: false, amp: 50, cancel_by: null })).flags.join(' | ');
  assert.match(flags, /Not a pull-through/);
  assert.match(flags, /dogbone/);
  assert.match(flags, /No cancel-by/);
  assert.match(callSheet(s, res({ hookups: 'water+electric (NO sewer)', site_type: 'Pull-Thru, water & electric only' })).flags.join(' '), /No sewer/);
  assert.match(callSheet(stop({ location: 'East Falmouth, MA', arrive_on: '2026-10-17' }), res({ cancel_by: '2026-10-01T00:00:00Z' })).flags.join(' '), /Columbus Day/);
});

import { GUIDES, getGuide } from './guides.ts';

test('every guide parses, and every checklist link points at one', () => {
  assert.equal(GUIDES.length, 11);
  assert.ok(getGuide('black-tank')?.body.includes('Black valve OPEN first'));
  for (const c of CHECKLISTS) for (const s of c.sections) if (s.guide) assert.ok(getGuide(s.guide), `${s.id} -> ${s.guide}`);
});
