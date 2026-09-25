/** Reads for the /rv pages: every trip with everything that hangs off it. */

import type { MissionClient } from '@/lib/supabase/schema';
import {
  ordered, span, RESERVATION_COLUMNS, STOP_COLUMNS, TRIP_COLUMNS,
  type FuelStop, type Poi, type Reservation, type Stop, type Trip,
} from './trips';

export type TripTask = { task_id: string; kind: 'todo' | 'pretrip'; title: string; status: string | null; due_date: string | null; source_ref: string | null; priority: number | null };
export type TripDoc = { id: string; trip_id: string | null; reservation_id: string | null; title: string; kind: string | null; bucket: string; path: string | null; url: string | null; filename: string | null; mime: string | null; source_note: string | null };

export type TripBundle = {
  trip: Trip;
  stops: Stop[];
  reservations: Reservation[];
  pois: Poi[];
  fuel: FuelStop[];
  tasks: TripTask[];
  docs: TripDoc[];
  start: string | null;
  end: string | null;
};

export async function loadTrips(db: MissionClient, onlyTripId?: string): Promise<TripBundle[]> {
  // The builders' generics are deep enough to stall the checker when passed
  // through a helper, and there is no generated Database type to lean on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any, col = 'trip_id') => (onlyTripId ? q.eq(col, onlyTripId) : q);
  const [trips, stops, reservations, fuel, links, docs] = await Promise.all([
    scope(db.from('rv_trips').select(TRIP_COLUMNS), 'id'),
    scope(db.from('rv_trip_stops').select(STOP_COLUMNS)),
    scope(db.from('rv_reservations').select(RESERVATION_COLUMNS)),
    scope(db.from('rv_fuel_stops').select('id,trip_id,drive_date,leg,miles,route,primary_stop,backup,notes').order('drive_date')),
    scope(db.from('rv_trip_tasks').select('task_id,trip_id,kind,task:tasks(title,status,due_date,source_ref,priority)')),
    scope(db.from('rv_documents').select('id,trip_id,reservation_id,title,kind,bucket,path,url,filename,mime,source_note').order('created_at')),
  ]);
  const stopRows = (stops.data ?? []) as Stop[];
  const stopIds = stopRows.map((s) => s.id);
  const { data: poiRows } = stopIds.length
    ? await db.from('rv_pois').select('id,stop_id,name,description,garden,chosen').in('stop_id', stopIds).order('created_at')
    : { data: [] };

  return ((trips.data ?? []) as Trip[]).map((trip) => {
    const own = ordered(stopRows.filter((s) => s.trip_id === trip.id));
    const ownIds = new Set(own.map((s) => s.id));
    const { start, end } = span(own);
    type LinkRow = { task_id: string; trip_id: string; kind: 'todo' | 'pretrip'; task: { title: string; status: string | null; due_date: string | null; source_ref: string | null; priority: number | null } | null };
    return {
      trip: { ...trip, data: trip.data ?? {} },
      stops: own,
      reservations: ((reservations.data ?? []) as Reservation[]).filter((r) => r.trip_id === trip.id),
      pois: ((poiRows ?? []) as Poi[]).filter((p) => ownIds.has(p.stop_id)),
      fuel: ((fuel.data ?? []) as FuelStop[]).filter((f) => f.trip_id === trip.id),
      tasks: ((links.data ?? []) as unknown as LinkRow[])
        .filter((l) => l.trip_id === trip.id && l.task)
        .map((l) => ({ task_id: l.task_id, kind: l.kind, title: l.task!.title, status: l.task!.status, due_date: l.task!.due_date, source_ref: l.task!.source_ref, priority: l.task!.priority }))
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
      docs: ((docs.data ?? []) as TripDoc[]).filter((d) => d.trip_id === trip.id),
      start,
      end,
    };
  });
}
