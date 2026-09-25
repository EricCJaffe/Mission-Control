/**
 * Trip work as ordinary tasks, so it reaches /tasks, the weekly brief and the
 * dashboard with nothing new to read it.
 *
 * Three kinds, all filed under one "RV & Travel" project and linked to their
 * trip through mission.rv_trip_tasks:
 *   - to-dos, typed by hand on the trip page;
 *   - the Pre-Trip checklist reminder, created when a trip has dates, due three
 *     days before departure, and closed by finishing the checklist itself
 *     (see closePretripTask in runs.ts);
 *   - one "keep or cancel?" decision per reservation with a cancel-by
 *     deadline, re-derived from the reservations on every change, so moving a
 *     deadline moves the task and canceling a booking removes it.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { addDays } from '@/lib/day';
import { span } from './trips';

const PROJECT_SLUG = 'rv-travel';

export async function ensureRvProject(db: MissionClient, userId: string): Promise<string> {
  const { data: existing } = await db.from('projects').select('id').eq('user_id', userId).eq('slug', PROJECT_SLUG).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await db
    .from('projects')
    .insert({
      user_id: userId,
      title: 'RV & Travel',
      slug: PROJECT_SLUG,
      description: 'Trip to-dos, Pre-Trip readiness and reservation deadlines. Managed from /rv.',
      status: 'active',
      domain: 'family',
      // Not a repo. The harvester must never try to read one for it.
      sync_enabled: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the RV project');
  return data.id as string;
}

export async function addTripTask(
  db: MissionClient,
  userId: string,
  tripId: string,
  task: { title: string; due: string | null; kind?: 'todo' | 'pretrip'; description?: string | null; sourceRef?: string | null; done?: boolean; priority?: number },
): Promise<string> {
  const projectId = await ensureRvProject(db, userId);
  const { data, error } = await db
    .from('tasks')
    .insert({
      user_id: userId,
      project_id: projectId,
      title: task.title,
      description: task.description ?? null,
      status: task.done ? 'done' : 'todo',
      priority: task.priority ?? 2,
      due_date: task.due,
      domain: 'family',
      category: 'travel',
      source: 'manual',
      source_ref: task.sourceRef ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add the task');
  const { error: linkError } = await db
    .from('rv_trip_tasks')
    .insert({ task_id: data.id, trip_id: tripId, user_id: userId, kind: task.kind ?? 'todo' });
  if (linkError) {
    await db.from('tasks').delete().eq('id', data.id);
    throw new Error(linkError.message);
  }
  return data.id as string;
}

/** Creates or re-dates the trip's Pre-Trip reminder from its current dates. */
export async function ensurePretripTask(db: MissionClient, userId: string, tripId: string): Promise<void> {
  const [{ data: trip }, { data: stops }, { data: links }] = await Promise.all([
    db.from('rv_trips').select('name,status').eq('id', tripId).maybeSingle(),
    db.from('rv_trip_stops').select('arrive_on,depart_on').eq('trip_id', tripId),
    db.from('rv_trip_tasks').select('task_id').eq('trip_id', tripId).eq('kind', 'pretrip'),
  ]);
  if (!trip || trip.status === 'canceled' || trip.status === 'complete') return;
  const { start } = span((stops ?? []) as Array<{ arrive_on: string | null; depart_on: string | null }>);
  if (!start) return;
  const due = addDays(start, -3);
  const ids = (links ?? []).map((l) => l.task_id as string);
  if (ids.length) {
    await db.from('tasks').update({ due_date: due, updated_at: new Date().toISOString() }).in('id', ids).neq('status', 'done');
    return;
  }
  await addTripTask(db, userId, tripId, {
    title: `Run the Pre-Trip checklist — ${trip.name}`,
    due,
    kind: 'pretrip',
    description: 'Open /rv/checklists/pretrip. Finishing the checklist closes this task.',
  });
}

/** Re-derives the "keep or cancel?" tasks from the trip's reservations. */
export async function syncDeadlineTasks(db: MissionClient, userId: string, tripId: string): Promise<void> {
  const [{ data: trip }, { data: reservations }, { data: existing }] = await Promise.all([
    db.from('rv_trips').select('name,status').eq('id', tripId).maybeSingle(),
    db.from('rv_reservations').select('id,vendor,status,cancel_by,cancel_policy,stop:rv_trip_stops(name)').eq('trip_id', tripId),
    db.from('tasks').select('id,source_ref,status').like('source_ref', 'rv-cancel:%').eq('user_id', userId),
  ]);
  const want = new Map<string, { title: string; due: string; description: string | null }>();
  if (trip && trip.status !== 'canceled') {
    for (const r of reservations ?? []) {
      if (!r.cancel_by || r.status === 'canceled') continue;
      const at = new Date(r.cancel_by as string);
      const day = at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const time = at.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
      // The stop's name, not the vendor's: two KOAs on one trip read as one.
      const stop = (r as unknown as { stop: { name: string } | null }).stop;
      want.set(`rv-cancel:${r.id}`, {
        title: `Keep or cancel ${stop?.name ?? r.vendor ?? 'reservation'}? Cancel-by ${time} (${trip.name})`,
        due: day,
        description: (r.cancel_policy as string | null) ?? null,
      });
    }
  }
  const byRef = new Map((existing ?? []).map((t) => [t.source_ref as string, t]));
  const mine = new Set((reservations ?? []).map((r) => `rv-cancel:${r.id}`));

  for (const [ref, t] of want) {
    const have = byRef.get(ref);
    if (have) {
      // A decision already made (ticked) stays made; only re-date an open one.
      if (have.status !== 'done') {
        await db.from('tasks').update({ title: t.title, due_date: t.due, description: t.description, updated_at: new Date().toISOString() }).eq('id', have.id);
      }
    } else {
      await addTripTask(db, userId, tripId, { title: t.title, due: t.due, description: t.description, sourceRef: ref });
    }
  }
  // Only this trip's reservations are ours to remove.
  for (const [ref, t] of byRef) {
    if (mine.has(ref) && !want.has(ref)) await db.from('tasks').delete().eq('id', t.id);
  }
}
