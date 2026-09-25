/**
 * Loads the RV handoff pack ("Travel RV and Vacations", exported 2026-09-25)
 * into Mission Control's tables.
 *
 *   npx tsx scripts/rv/seed-pack.mts <pack-dir>
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MC_USER_ID.
 *
 * ⚠️ THE PACK IS NEVER COMMITTED. This repo is public, and the pack holds VINs,
 * a plate, a ferry password, a card's last four and friends' home addresses.
 * This script carries no data of its own; it reads the pack from a local
 * directory and writes to tables behind RLS.
 *
 * Idempotent: trips, stops and reservations are matched on the pack's own ids
 * (kept as `slug`), assets and issues on their names, so a second run updates
 * rather than duplicates. Things to see and the fuel plan are replaced per
 * trip on each run — they have no ids in the pack to match on.
 *
 * Reads:  01-rig-profile.json, 02-trip-*.json, 03-trips-florida.json (a
 *         JSON rendering of 03-trips-florida.md), 06-maintenance-and-pretrip.json
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createAsset } from '@/lib/maintenance/service';
import { addTripTask, ensurePretripTask, syncDeadlineTasks } from '@/lib/rv/tasks';
import type { MissionClient } from '@/lib/supabase/schema';

type PackStop = {
  id: string; seq: number; kind: string; name: string; town?: string; address?: string; phone?: string; website?: string;
  arrive?: string | null; depart?: string | null; leg?: string; day_summary?: string; notes?: string;
};
type PackTrip = {
  trip: { id: string; title: string; status: string; summary?: string; notes?: string; legs?: unknown; payment_card_last4?: string };
  stops: PackStop[];
  reservations?: Array<Record<string, unknown> & { id: string; stop_id: string | null }>;
  pois?: Array<{ stop_id: string; name: string; description?: string; garden?: boolean }>;
  fuel_stops?: Array<Record<string, unknown>>;
  fuel_rules?: string[];
  hazards?: unknown[];
  todos?: Array<{ task: string; due: string | null; done: boolean }>;
  documents?: Array<{ title: string; kind?: string; file?: string; source_note?: string }>;
  people?: unknown[];
};

const dir = process.argv[2];
if (!dir) throw new Error('usage: seed-pack.mts <pack-dir>');
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'mission' },
  auth: { persistSession: false },
}) as unknown as MissionClient;
const userId = process.env.MC_USER_ID!;
if (!userId) throw new Error('MC_USER_ID is not set');

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// The rig: maintenance assets first, so the profile can point at them.
// ---------------------------------------------------------------------------
async function ensureAsset(name: string, input: Record<string, unknown> & { category: never | string }): Promise<string> {
  const { data } = await db.from('maintenance_assets').select('id').eq('user_id', userId).eq('name', name).maybeSingle();
  if (data?.id) {
    await db.from('maintenance_assets').update({ ...input, updated_at: new Date().toISOString() }).eq('id', data.id);
    return data.id as string;
  }
  return createAsset(db, userId, { name, ...(input as { category: 'rv' }) }, { staggerStart: 1 });
}

async function seedRig() {
  const rig = read('01-rig-profile.json');
  const coach = rig.vehicles.find((v: { id: string }) => v.id === 'coach');
  const jeep = rig.vehicles.find((v: { id: string }) => v.id === 'jeep');
  const gen = coach.systems.generator;

  const coachId = await ensureAsset('Coach — Esteem 29V', {
    category: 'rv', make: coach.make, model: `${coach.model} (${coach.chassis.make} ${coach.chassis.model} ${coach.chassis.engine})`,
    model_year: coach.year, serial_number: coach.chassis.vin, meter_unit: 'miles', location: 'RV',
    parts_notes: `Tires ${coach.tires.size} (${coach.tires.psi_front}/${coach.tires.psi_rear} psi cold, ${coach.tires.valve_stems} stems) · 55 gal regular · shore power ${coach.systems.shore_power}`,
    notes: 'The coach. Odometer baseline not recorded yet — enter it with the meter box to start the mileage clock.',
  });
  const genId = await ensureAsset('Generator — Onan QG 4000', {
    category: 'generator', make: 'Onan', model: gen.model, model_year: coach.year, meter_unit: 'hours',
    meter_reading: gen.hours_as_of.hours, meter_read_at: `${gen.hours_as_of.date}T12:00:00-04:00`, location: 'RV',
    notes: `${gen.watts} W, runs on the chassis tank. Warranty: Cummins 1-800-CUMMINS + Entegra owner support.`,
  });
  const jeepId = await ensureAsset('Jeep Wrangler (toad)', {
    category: 'vehicle', make: jeep.make, model: jeep.model, model_year: jeep.year, serial_number: jeep.vin, meter_unit: 'miles',
    parts_notes: `Tires ${jeep.tires.size} (${jeep.tires.psi} psi cold)`,
    notes: 'Flat-towed behind the coach. Flat-tow miles do not show on the odometer — log tow miles.',
  });

  await must(db.from('rv_profile').upsert({ user_id: userId, data: { ...rig, maintenance_assets: [coachId, genId, jeepId] }, updated_at: new Date().toISOString() }), 'rv_profile');
  return { coachId, genId, jeepId };
}

// ---------------------------------------------------------------------------
// Open issues, into the maintenance module.
// ---------------------------------------------------------------------------
async function seedIssues(ids: { coachId: string; genId: string; jeepId: string }) {
  const pack = read('06-maintenance-and-pretrip.json');
  for (const i of pack.issues as Array<{ title: string; system: string; status: string; next_step: string }>) {
    const assetId = i.system === 'Generator' ? ids.genId : ids.coachId;
    const status = /scheduled/i.test(i.status) ? 'scheduled' : /resolved/i.test(i.status) ? 'resolved' : 'open';
    const row = { user_id: userId, asset_id: assetId, title: i.title, system: i.system, status, details: `Status in the pack: ${i.status}`, next_step: i.next_step };
    const { data } = await db.from('maintenance_issues').select('id').eq('user_id', userId).eq('title', i.title).maybeSingle();
    if (data?.id) await must(db.from('maintenance_issues').update(row).eq('id', data.id), `issue ${i.title}`);
    else await must(db.from('maintenance_issues').insert({ ...row, opened_on: '2026-09-25' }), `issue ${i.title}`);
  }
}

// ---------------------------------------------------------------------------
// Trips.
// ---------------------------------------------------------------------------
async function seedTrip(p: PackTrip) {
  const t = p.trip;
  const data = {
    legs: t.legs ?? undefined,
    hazards: p.hazards ?? [],
    fuel_rules: p.fuel_rules ?? [],
    people: p.people ?? [],
    payment_card_last4: t.payment_card_last4,
  };
  const tripRow = { user_id: userId, slug: t.id, name: t.title, status: t.status, summary: t.summary ?? null, notes: t.notes ?? null, data, updated_at: new Date().toISOString() };
  const existing = await db.from('rv_trips').select('id').eq('user_id', userId).eq('slug', t.id).maybeSingle();
  const tripId = existing.data?.id
    ? (await must(db.from('rv_trips').update(tripRow).eq('id', existing.data.id).select('id').single(), 'trip')).id
    : (await must(db.from('rv_trips').insert(tripRow).select('id').single(), 'trip')).id;

  const stopIds = new Map<string, string>();
  for (const s of p.stops) {
    const row = {
      user_id: userId, trip_id: tripId, slug: s.id, seq: s.seq, kind: s.kind, name: s.name, location: s.town ?? null,
      address: s.address ?? null, phone: s.phone ?? null, url: s.website ?? null, arrive_on: s.arrive ?? null,
      depart_on: s.depart ?? null, leg: s.leg ?? null, day_summary: s.day_summary ?? null, notes: s.notes ?? null,
    };
    const have = await db.from('rv_trip_stops').select('id').eq('trip_id', tripId).eq('slug', s.id).maybeSingle();
    const id = have.data?.id
      ? (await must(db.from('rv_trip_stops').update(row).eq('id', have.data.id).select('id').single(), `stop ${s.id}`)).id
      : (await must(db.from('rv_trip_stops').insert(row).select('id').single(), `stop ${s.id}`)).id;
    stopIds.set(s.id, id as string);
  }

  for (const r of p.reservations ?? []) {
    const row = {
      user_id: userId, trip_id: tripId, slug: r.id, stop_id: r.stop_id ? stopIds.get(r.stop_id) ?? null : null,
      vendor: r.vendor ?? null, kind: r.kind ?? 'campground', status: r.status ?? 'to-book', conf_number: r.conf_number ?? null,
      secondary_ref: r.secondary_ref ?? null, site_type: r.site_type ?? null, pull_through: r.pull_through ?? null, amp: r.amp ?? null,
      hookups: r.hookups ?? null, check_in: r.check_in ?? null, check_out: r.check_out ?? null, paid: r.paid ?? null,
      balance_due: r.balance_due ?? null, booking_fee: r.booking_fee ?? null, cancel_by: r.cancel_by ?? null,
      cancel_policy: r.cancel_policy ?? null, day_of_notes: r.day_of_notes ?? null, updated_at: new Date().toISOString(),
    };
    const have = await db.from('rv_reservations').select('id').eq('trip_id', tripId).eq('slug', r.id).maybeSingle();
    if (have.data?.id) await must(db.from('rv_reservations').update(row).eq('id', have.data.id), `reservation ${r.id}`);
    else await must(db.from('rv_reservations').insert(row), `reservation ${r.id}`);
  }

  // No ids in the pack for these, so replace them wholesale.
  const allStopIds = [...stopIds.values()];
  if (allStopIds.length) await db.from('rv_pois').delete().in('stop_id', allStopIds);
  const pois = (p.pois ?? []).filter((x) => stopIds.has(x.stop_id));
  if (pois.length) {
    await must(db.from('rv_pois').insert(pois.map((x) => ({ user_id: userId, stop_id: stopIds.get(x.stop_id), name: x.name, description: x.description ?? null, garden: !!x.garden }))), 'pois');
  }
  await db.from('rv_fuel_stops').delete().eq('trip_id', tripId);
  if (p.fuel_stops?.length) {
    await must(db.from('rv_fuel_stops').insert(p.fuel_stops.map((f) => ({ ...f, user_id: userId, trip_id: tripId }))), 'fuel');
  }

  for (const d of p.documents ?? []) {
    const have = await db.from('rv_documents').select('id').eq('trip_id', tripId).eq('title', d.title).maybeSingle();
    if (!have.data) {
      await must(db.from('rv_documents').insert({ user_id: userId, trip_id: tripId, title: d.title, kind: d.kind ?? null, filename: d.file ?? null, source_note: d.source_note ?? null }), `doc ${d.title}`);
    }
  }

  // To-dos become tasks, matched on a stable ref so a re-run does not double them.
  for (const [i, todo] of (p.todos ?? []).entries()) {
    const ref = `rv-todo:${t.id}:${i}`;
    const have = await db.from('tasks').select('id').eq('user_id', userId).eq('source_ref', ref).maybeSingle();
    if (have.data) continue;
    const isPretrip = /pre-trip checklist/i.test(todo.task);
    await addTripTask(db, userId, tripId as string, {
      title: isPretrip ? `Run the Pre-Trip checklist — ${t.title}` : todo.task,
      due: todo.due,
      kind: isPretrip ? 'pretrip' : 'todo',
      description: isPretrip ? 'Open /rv/checklists/pretrip. Finishing the checklist closes this task.' : null,
      sourceRef: ref,
      done: todo.done,
    });
  }

  await syncDeadlineTasks(db, userId, tripId as string);
  await ensurePretripTask(db, userId, tripId as string);
  console.log(`trip ${t.id}: ${p.stops.length} stops, ${(p.reservations ?? []).length} reservations, ${pois.length} places, ${(p.fuel_stops ?? []).length} fuel days, ${(p.todos ?? []).length} to-dos`);
}

async function main() {
  const ids = await seedRig();
  console.log('rig: coach, generator, Jeep linked', ids);
  await seedIssues(ids);
  for (const f of readdirSync(dir).filter((f) => /^02-trip-.*\.json$/.test(f))) {
    const p = read(f);
    await seedTrip({ ...p, trip: p.trip, stops: p.stops });
  }
  for (const p of read('03-trips-florida.json').trips) await seedTrip(p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
