/**
 * RV trips on the calendar: a travel day for every arrival and departure.
 *
 * Projected from rv_trip_stops at page load, like maintenance, so moving a
 * reservation moves the calendar with nothing to keep in sync. Only the two
 * days that need the checklists are shown — a nine-night stay as nine events
 * would bury everything else on those days.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { addDays } from '@/lib/day';

export async function rvEvents(db: MissionClient, aroundIso: string) {
  const from = addDays(aroundIso, -62);
  const to = addDays(aroundIso, 366);
  const { data } = await db
    .from('rv_trip_stops')
    .select('id,trip_id,campground,site,arrive_on,depart_on,notes,trip:rv_trips!inner(name,status)')
    .gte('arrive_on', addDays(from, -60))
    .lte('arrive_on', to)
    .neq('trip.status', 'canceled');

  type Row = { id: string; trip_id: string; campground: string; site: string | null; arrive_on: string; depart_on: string | null; notes: string | null; trip: { name: string } };

  const events: Array<Record<string, unknown>> = [];
  const push = (row: Row, date: string, kind: 'Arrive' | 'Depart', hour: string) => {
    if (date < from || date > to) return;
    events.push({
      id: `rv-${row.id}-${kind}`,
      title: `${kind}: ${row.campground}${row.site && kind === 'Arrive' ? ` (site ${row.site})` : ''}`,
      start_at: `${date}T${hour}:00`,
      end_at: `${date}T${hour.slice(0, 2)}:45:00`,
      event_type: 'RV Trip',
      domain: 'Family',
      alignment_tag: `rv-trip:${row.trip_id}`,
      recurrence_rule: null,
      recurrence_until: null,
      goal_id: null,
      task_id: null,
      note_id: null,
      review_id: null,
      notes: `${row.trip.name}${row.notes ? ` — ${row.notes}` : ''}`,
      completed: false,
    });
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    // Departure in the morning, arrival in the afternoon: the order of a travel day.
    if (row.depart_on) push(row, row.depart_on, 'Depart', '09:00');
    push(row, row.arrive_on, 'Arrive', '14:00');
  }
  return events;
}
