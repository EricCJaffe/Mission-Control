/**
 * RV trips on the calendar: every travel day, every ferry and day trip, and
 * every cancel-by deadline.
 *
 * Projected from the trip tables at page load, like maintenance, so moving a
 * reservation moves the calendar with nothing to keep in sync. A nine-night
 * stay is two events (arrive, depart), not nine: the calendar is for the days
 * something has to happen.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { addDays } from '@/lib/day';

type Ev = Record<string, unknown>;

function event(id: string, title: string, date: string, hour: string, tripId: string, notes: string | null): Ev {
  return {
    id,
    title,
    // No offset on purpose: the calendar reads start_at as local time.
    start_at: `${date}T${hour}:00`,
    end_at: `${date}T${hour.slice(0, 2)}:45:00`,
    event_type: 'RV Trip',
    domain: 'Family',
    alignment_tag: `rv-trip:${tripId}`,
    recurrence_rule: null,
    recurrence_until: null,
    goal_id: null,
    task_id: null,
    note_id: null,
    review_id: null,
    notes,
    completed: false,
  };
}

export async function rvEvents(db: MissionClient, aroundIso: string): Promise<Ev[]> {
  const from = addDays(aroundIso, -62);
  const to = addDays(aroundIso, 366);
  const inRange = (d: string | null): d is string => Boolean(d) && d! >= from && d! <= to;

  const [{ data: stops }, { data: reservations }] = await Promise.all([
    db
      .from('rv_trip_stops')
      .select('id,trip_id,kind,name,site,arrive_on,depart_on,day_summary,trip:rv_trips!inner(name,status)')
      .neq('trip.status', 'canceled'),
    db
      .from('rv_reservations')
      .select('id,trip_id,vendor,cancel_by,cancel_policy,status,trip:rv_trips!inner(status)')
      .not('cancel_by', 'is', null)
      .neq('status', 'canceled')
      .neq('trip.status', 'canceled'),
  ]);

  type StopRow = { id: string; trip_id: string; kind: string; name: string; site: string | null; arrive_on: string | null; depart_on: string | null; day_summary: string | null; trip: { name: string } };
  type ResRow = { id: string; trip_id: string; vendor: string | null; cancel_by: string; cancel_policy: string | null };

  const out: Ev[] = [];
  for (const s of (stops ?? []) as unknown as StopRow[]) {
    if (s.kind === 'home') continue;
    const note = [s.trip.name, s.day_summary].filter(Boolean).join(' — ');
    if (s.kind === 'ferry' || s.kind === 'excursion') {
      if (inRange(s.arrive_on)) out.push(event(`rv-${s.id}-go`, `${s.kind === 'ferry' ? 'Ferry' : 'Day trip'}: ${s.name}`, s.arrive_on, '08:00', s.trip_id, note));
      continue;
    }
    // Departure in the morning, arrival in the afternoon: the order of a travel day.
    if (inRange(s.depart_on)) out.push(event(`rv-${s.id}-depart`, `Depart: ${s.name}`, s.depart_on, '09:00', s.trip_id, note));
    if (inRange(s.arrive_on)) {
      out.push(event(`rv-${s.id}-arrive`, `Arrive: ${s.name}${s.site ? ` (site ${s.site})` : ''}`, s.arrive_on, '14:00', s.trip_id, note));
    }
  }
  for (const r of (reservations ?? []) as unknown as ResRow[]) {
    const day = new Date(r.cancel_by).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const time = new Date(r.cancel_by).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    if (inRange(day)) out.push(event(`rv-cancel-${r.id}`, `Cancel-by ${time}: ${r.vendor ?? 'reservation'}`, day, '07:00', r.trip_id, r.cancel_policy));
  }
  return out;
}
