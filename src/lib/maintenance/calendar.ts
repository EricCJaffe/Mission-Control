/**
 * Maintenance on the calendar.
 *
 * Eric, 2026-09-24: "Most all tasks are going to be recurring. And could
 * appear on calendar."
 *
 * Projected, not stored. Each schedule is one recurring task whose due date
 * rolls forward, so writing a calendar_events row per occurrence would create
 * a second copy that goes stale the first time a filter is changed a week
 * early. Instead the occurrences are computed from the task's RRULE at page
 * load: the current due date, then every date after it for a year.
 *
 * They are all-day in spirit, shown at 8:00 so they sort first in a day, and
 * marked `alignment_tag = maintenance:<asset id>` so a click opens the
 * machine rather than an event editor.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { addDays } from '@/lib/day';
import { occurrencesBetween } from './status';

export async function maintenanceEvents(db: MissionClient, aroundIso: string) {
  const from = addDays(aroundIso, -62);
  const to = addDays(aroundIso, 366);

  const { data } = await db
    .from('maintenance_plans')
    .select('asset_id,task:tasks(id,title,description,status,due_date,recurrence_rule,recurrence_anchor),asset:maintenance_assets(status)');

  type Row = {
    asset_id: string;
    task: { id: string; title: string; description: string | null; status: string | null; due_date: string | null; recurrence_rule: string | null; recurrence_anchor: string | null } | null;
    asset: { status: string } | null;
  };

  const events: Array<Record<string, unknown>> = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const task = row.task;
    if (!task || task.status === 'done' || row.asset?.status === 'retired') continue;
    for (const date of occurrencesBetween(task, from, to)) {
      events.push({
        id: `maint-${task.id}-${date}`,
        title: task.title,
        // No offset on purpose: the calendar reads start_at as local time.
        start_at: `${date}T08:00:00`,
        end_at: `${date}T08:30:00`,
        event_type: 'Maintenance',
        domain: 'Family',
        alignment_tag: `maintenance:${row.asset_id}`,
        recurrence_rule: null,
        recurrence_until: null,
        goal_id: null,
        task_id: task.id,
        note_id: null,
        review_id: null,
        notes: task.description,
        completed: false,
      });
    }
  }
  return events;
}
