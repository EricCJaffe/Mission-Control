/**
 * Trip arithmetic and the planner's derived views.
 *
 * Nothing here is stored twice. A trip's dates are the span of its stops;
 * "Still to Book" is every stop or reservation not yet booked; the Today view
 * is read off today's date; deadlines come from the reservations' cancel-by
 * times. Change a reservation and every view follows.
 *
 * The playbook rules (docs from the "Travel RV and Vacations" project,
 * 04-planning-playbook) are encoded in RIG_LIMITS and callSheet() below.
 */

export type StopKind = 'home' | 'campground' | 'ferry' | 'excursion' | 'hotel' | 'storage';

export type Stop = {
  id: string;
  trip_id: string;
  seq: number | null;
  kind: StopKind;
  name: string;
  location: string | null;
  address: string | null;
  site: string | null;
  arrive_on: string | null;
  depart_on: string | null;
  leg: string | null;
  day_summary: string | null;
  confirmation: string | null;
  cost: number | null;
  hookups: string | null;
  url: string | null;
  phone: string | null;
  notes: string | null;
};

export const STOP_COLUMNS =
  'id,trip_id,seq,kind,name,location,address,site,arrive_on,depart_on,leg,day_summary,confirmation,cost,hookups,url,phone,notes';

export type TripStatus = 'planning' | 'booking' | 'booked' | 'in-progress' | 'complete' | 'canceled';
export const TRIP_STATUSES: TripStatus[] = ['planning', 'booking', 'booked', 'in-progress', 'complete', 'canceled'];

export type Hazard = { where: string; rule: string };
export type Person = { role: string; where: string; address?: string; visit?: string };
export type Leg = { label: string; color?: string; dates?: string };

export type TripData = {
  legs?: Record<string, Leg>;
  hazards?: Hazard[];
  fuel_rules?: string[];
  people?: Person[];
  payment_card_last4?: string;
};

export type Trip = {
  id: string;
  slug: string | null;
  name: string;
  status: TripStatus;
  summary: string | null;
  notes: string | null;
  data: TripData;
};

export const TRIP_COLUMNS = 'id,slug,name,status,summary,notes,data';

export type ReservationStatus = 'to-book' | 'booked' | 'confirmed' | 'canceled';

export type Reservation = {
  id: string;
  trip_id: string;
  stop_id: string | null;
  vendor: string | null;
  kind: string;
  status: ReservationStatus;
  conf_number: string | null;
  secondary_ref: string | null;
  site_type: string | null;
  pull_through: boolean | null;
  amp: number | null;
  hookups: string | null;
  check_in: string | null;
  check_out: string | null;
  paid: number | null;
  balance_due: number | null;
  booking_fee: number | null;
  cancel_by: string | null;
  cancel_policy: string | null;
  day_of_notes: string | null;
};

export const RESERVATION_COLUMNS =
  'id,trip_id,stop_id,vendor,kind,status,conf_number,secondary_ref,site_type,pull_through,amp,hookups,check_in,check_out,paid,balance_due,booking_fee,cancel_by,cancel_policy,day_of_notes';

export type Poi = { id: string; stop_id: string; name: string; description: string | null; garden: boolean; chosen: boolean };
export type FuelStop = {
  id: string;
  trip_id: string;
  drive_date: string | null;
  leg: string | null;
  miles: number | null;
  route: string | null;
  primary_stop: string | null;
  backup: string | null;
  notes: string | null;
};

/* The numbers every booking is checked against. From the rig profile. */
export const RIG_LIMITS = { length: `32'6"`, combined: `~50'+`, height: `11'8"`, amps: 30 };

/** Stops that hold a reservation of their own — home and nothing else do not. */
export function isBookable(stop: Pick<Stop, 'kind'>): boolean {
  return stop.kind !== 'home';
}

export function span(stops: Array<Pick<Stop, 'arrive_on' | 'depart_on'>>): { start: string | null; end: string | null } {
  const days = stops.flatMap((s) => [s.arrive_on, s.depart_on]).filter((d): d is string => Boolean(d)).sort();
  return { start: days[0] ?? null, end: days.at(-1) ?? null };
}

export function nights(stop: Pick<Stop, 'arrive_on' | 'depart_on'>): number | null {
  if (!stop.arrive_on || !stop.depart_on) return null;
  const a = Date.UTC(+stop.arrive_on.slice(0, 4), +stop.arrive_on.slice(5, 7) - 1, +stop.arrive_on.slice(8, 10));
  const d = Date.UTC(+stop.depart_on.slice(0, 4), +stop.depart_on.slice(5, 7) - 1, +stop.depart_on.slice(8, 10));
  return Math.round((d - a) / 86_400_000);
}

/** Stops in trip order: by sequence when set, then by date. */
export function ordered<T extends Pick<Stop, 'seq' | 'arrive_on'>>(stops: T[]): T[] {
  return [...stops].sort(
    (a, b) => (a.seq ?? 9999) - (b.seq ?? 9999) || (a.arrive_on ?? '9999').localeCompare(b.arrive_on ?? '9999'),
  );
}

/**
 * Where the rig is on a date, for a checklist run to name itself after.
 * Arrival on a travel day means the stop arriving that day; departure the stop
 * departing it. Only overnight stops count: the ferry is not where you park.
 */
export function stopForToday<T extends Pick<Stop, 'arrive_on' | 'depart_on' | 'kind'>>(
  stops: T[],
  todayIso: string,
  checklistId: string,
): T | null {
  const overnight = stops.filter((s) => s.kind === 'campground' || s.kind === 'storage' || s.kind === 'hotel');
  if (checklistId === 'arrival') {
    const arriving = overnight.find((s) => s.arrive_on === todayIso);
    if (arriving) return arriving;
  }
  if (checklistId === 'departure') {
    const leaving = overnight.find((s) => s.depart_on === todayIso);
    if (leaving) return leaving;
  }
  return overnight.find((s) => s.arrive_on && s.arrive_on <= todayIso && (s.depart_on ?? s.arrive_on) >= todayIso) ?? null;
}

/**
 * What the dates say the status should be, when it differs from the stored
 * one. Only the two transitions dates can prove: under way, and over.
 * Planning → booking → booked is a human judgment and is never suggested.
 */
export function statusByDate(stops: Array<Pick<Stop, 'arrive_on' | 'depart_on'>>, todayIso: string): TripStatus | null {
  const { start, end } = span(stops);
  if (!start || !end) return null;
  if (todayIso > end) return 'complete';
  if (todayIso >= start) return 'in-progress';
  return null;
}

export type ToBook = { stop: Pick<Stop, 'id' | 'name' | 'arrive_on' | 'kind'> | null; reservation: Reservation | null; reason: string };

/**
 * Still to Book: reservations marked to-book, plus bookable stops with no
 * live reservation at all, plus stops with no date. Derived every time.
 */
export function stillToBook(stops: Stop[], reservations: Reservation[]): ToBook[] {
  const out: ToBook[] = [];
  const live = reservations.filter((r) => r.status !== 'canceled');
  for (const r of live) {
    if (r.status === 'to-book') {
      out.push({ stop: stops.find((s) => s.id === r.stop_id) ?? null, reservation: r, reason: 'Not booked yet' });
    }
  }
  for (const s of stops) {
    if (!isBookable(s)) continue;
    const own = live.filter((r) => r.stop_id === s.id);
    if (own.length === 0) out.push({ stop: s, reservation: null, reason: 'No reservation recorded' });
    else if (!s.arrive_on) out.push({ stop: s, reservation: own[0], reason: 'Date not set' });
  }
  return out;
}

export type Deadline = { at: string; label: string; detail: string | null; tripId: string; kind: 'cancel-by' };

/** Cancel-by deadlines between today and `withinDays` from now, soonest first. */
export function deadlines(reservations: Reservation[], stops: Stop[], nowIso: string, withinDays = 45): Deadline[] {
  const now = new Date(nowIso).getTime();
  const limit = now + withinDays * 86_400_000;
  return reservations
    .filter((r) => r.cancel_by && r.status !== 'canceled')
    .filter((r) => {
      const at = new Date(r.cancel_by!).getTime();
      return at >= now && at <= limit;
    })
    .map((r) => ({
      at: r.cancel_by!,
      label: `Cancel-by: ${r.vendor ?? stops.find((s) => s.id === r.stop_id)?.name ?? 'reservation'}`,
      detail: r.cancel_policy,
      tripId: r.trip_id,
      kind: 'cancel-by' as const,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export type TodayView = {
  parkedAt: Stop | null;
  leaving: Stop | null;
  arriving: Stop | null;
  arrivingReservation: Reservation | null;
  leavingReservation: Reservation | null;
  excursions: Stop[];
  fuel: FuelStop | null;
  hazards: Hazard[];
};

/** One screen for a day on the road: where we are, where we go, what to watch. */
export function todayView(
  trip: Pick<Trip, 'data'>,
  stops: Stop[],
  reservations: Reservation[],
  fuel: FuelStop[],
  todayIso: string,
): TodayView {
  const overnight = stops.filter((s) => s.kind !== 'home' && s.kind !== 'ferry' && s.kind !== 'excursion');
  const leaving = overnight.find((s) => s.depart_on === todayIso) ?? null;
  const arriving = overnight.find((s) => s.arrive_on === todayIso) ?? null;
  const parkedAt =
    arriving ?? overnight.find((s) => s.arrive_on && s.arrive_on < todayIso && (s.depart_on ?? s.arrive_on) > todayIso) ?? null;
  const resFor = (s: Stop | null) => (s ? reservations.find((r) => r.stop_id === s.id && r.status !== 'canceled') ?? null : null);
  const drive = fuel.find((f) => f.drive_date === todayIso) ?? null;
  const excursions = stops.filter((s) => (s.kind === 'ferry' || s.kind === 'excursion') && s.arrive_on === todayIso);
  return {
    parkedAt,
    leaving,
    arriving,
    arrivingReservation: resFor(arriving),
    leavingReservation: resFor(leaving),
    excursions,
    fuel: drive,
    // On a driving day every route hazard is relevant; parked, none are.
    hazards: drive || leaving || excursions.length ? trip.data.hazards ?? [] : [],
  };
}

/**
 * The call sheet for one property: the booking script, the questions, and the
 * flags the playbook raises against what is known about the site.
 */
export function callSheet(stop: Stop, reservation: Reservation | null): { ask: string[]; flags: string[] } {
  const ask = [
    `Pull-through, full hookups, 30-amp, for a ${RIG_LIMITS.length} Class C towing a Jeep (${RIG_LIMITS.combined} combined, ${RIG_LIMITS.height} tall)?`,
    'Open for transients on these exact dates?',
    'Pet-friendly (small dog)?',
    'Which sites have the widest approach?',
    'Cancel-by date and policy — in writing, please.',
  ];
  const flags: string[] = [];
  const r = reservation;
  if (r) {
    if (r.pull_through === false) flags.push('Not a pull-through: unhook the Jeep and back in, or ask for a pull-through at check-in.');
    if (r.amp === 50) flags.push('50-amp pedestal: bring the 50→30 dogbone.');
    const hook = `${r.hookups ?? ''} ${r.site_type ?? ''}`.toLowerCase();
    const noSewer = /no sewer|water\s*(?:&|and|\+)\s*electric/.test(hook) || (hook.trim() && !/full|fhu|sewer/.test(hook));
    if (noSewer) {
      flags.push('No sewer hookup: arrive with the tanks near empty.');
    }
    if (!r.cancel_by && r.status !== 'to-book') flags.push('No cancel-by deadline recorded.');
    if (!r.conf_number && r.status !== 'to-book') flags.push('No confirmation number recorded.');
  } else if (isBookable(stop)) {
    flags.push('No reservation recorded yet.');
  }
  if (!stop.arrive_on) flags.push('Date not set.');
  if (stop.arrive_on) {
    const month = +stop.arrive_on.slice(5, 7);
    if (month >= 6 && month <= 11 && /\bFL\b|Florida|GA\b|SC\b/.test(`${stop.location ?? ''} ${stop.address ?? ''}`)) {
      flags.push('Hurricane season: ask about the named-storm cancellation policy.');
    }
    if (month >= 10 && /\b(MA|CT|NY|NH|VT|ME|RI)\b/.test(`${stop.location ?? ''} ${stop.address ?? ''}`)) {
      flags.push('Northeast in October: confirm the park is still open (many close Columbus Day weekend) and plan for freezing nights.');
    }
  }
  return { ask, flags };
}
