/**
 * Trip arithmetic: a trip's dates are the span of its stops, and "where are
 * we" is read off today's date, never stored.
 */

export type Stop = {
  id: string;
  trip_id: string;
  campground: string;
  location: string | null;
  site: string | null;
  arrive_on: string;
  depart_on: string | null;
  confirmation: string | null;
  cost: number | null;
  hookups: string | null;
  url: string | null;
  phone: string | null;
  notes: string | null;
};

export type Trip = {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'done' | 'canceled';
  notes: string | null;
};

export function span(stops: Stop[]): { start: string | null; end: string | null } {
  if (stops.length === 0) return { start: null, end: null };
  const start = stops.map((s) => s.arrive_on).sort()[0];
  const end = stops.map((s) => s.depart_on ?? s.arrive_on).sort().at(-1) ?? null;
  return { start, end };
}

export function nights(stop: Pick<Stop, 'arrive_on' | 'depart_on'>): number | null {
  if (!stop.depart_on) return null;
  const a = Date.UTC(+stop.arrive_on.slice(0, 4), +stop.arrive_on.slice(5, 7) - 1, +stop.arrive_on.slice(8, 10));
  const d = Date.UTC(+stop.depart_on.slice(0, 4), +stop.depart_on.slice(5, 7) - 1, +stop.depart_on.slice(8, 10));
  return Math.round((d - a) / 86_400_000);
}

/**
 * Where the rig is today, for a checklist run to name itself after.
 *
 * Arrival on a travel day means the stop arriving today; departure means the
 * stop departing today. Otherwise, the stop we are currently parked at.
 */
export function stopForToday(stops: Stop[], todayIso: string, checklistId: string): Stop | null {
  if (checklistId === 'arrival') {
    const arriving = stops.find((s) => s.arrive_on === todayIso);
    if (arriving) return arriving;
  }
  if (checklistId === 'departure') {
    const leaving = stops.find((s) => s.depart_on === todayIso);
    if (leaving) return leaving;
  }
  return stops.find((s) => s.arrive_on <= todayIso && (s.depart_on ?? s.arrive_on) >= todayIso) ?? null;
}

/**
 * The status a trip SHOULD have by date. Shown next to the stored one rather
 * than overwriting it: canceled is a decision, and dates cannot make it.
 */
export function statusByDate(stops: Stop[], todayIso: string): Trip['status'] | null {
  const { start, end } = span(stops);
  if (!start || !end) return null;
  if (todayIso < start) return 'planned';
  if (todayIso > end) return 'done';
  return 'active';
}
