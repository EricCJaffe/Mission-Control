/**
 * Checklist runs: the one open run per checklist, its ticks, and Reset.
 *
 * Every tick is a row, written the moment it is tapped, so closing the app,
 * losing signal at the campground or switching phones loses nothing. Reset is
 * the only thing that clears the list, and it clears it by archiving the run
 * with its numbers, not by deleting ticks.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { today } from '@/lib/day';
import { getChecklist, progress } from './checklists';
import { ordered, span, stopForToday, STOP_COLUMNS, type Stop } from './trips';

export type Run = {
  id: string;
  checklist_id: string;
  stop_id: string | null;
  trip_id: string | null;
  location: string | null;
  started_at: string;
  completed_at: string | null;
  archived_at: string | null;
  items_total: number | null;
  items_checked: number | null;
};

const RUN_COLUMNS = 'id,checklist_id,stop_id,trip_id,location,started_at,completed_at,archived_at,items_total,items_checked';

/** The stop the rig is at today, across every trip not canceled. */
async function todaysStop(db: MissionClient, checklistId: string): Promise<Stop | null> {
  const t = today();
  const { data } = await db
    .from('rv_trip_stops')
    .select(`${STOP_COLUMNS},trip:rv_trips!inner(status)`)
    .lte('arrive_on', t)
    .or(`depart_on.gte.${t},depart_on.is.null`)
    .neq('trip.status', 'canceled');
  return stopForToday((data ?? []) as unknown as Stop[], t, checklistId);
}

/**
 * The trip a Pre-Trip run is for: the one under way, or else the next to
 * start. A Pre-Trip run with no trip is still allowed — it just belongs to
 * nothing.
 */
async function tripForPretrip(db: MissionClient): Promise<{ id: string; name: string } | null> {
  const t = today();
  const { data: trips } = await db.from('rv_trips').select('id,name,status').not('status', 'in', '(canceled,complete)');
  const { data: stops } = await db.from('rv_trip_stops').select('trip_id,seq,arrive_on,depart_on');
  let best: { id: string; name: string; start: string } | null = null;
  for (const trip of trips ?? []) {
    const own = ordered(((stops ?? []) as Array<Pick<Stop, 'trip_id' | 'seq' | 'arrive_on' | 'depart_on'>>).filter((s) => s.trip_id === trip.id));
    const { start, end } = span(own);
    if (!start || !end || end < t) continue;
    if (!best || start < best.start) best = { id: trip.id as string, name: trip.name as string, start };
  }
  return best ? { id: best.id, name: best.name } : null;
}

/**
 * The open run, opened if there is none. The partial unique index makes a
 * second concurrent open fail; that loser re-reads the winner's row.
 */
export async function openRun(db: MissionClient, userId: string, checklistId: string): Promise<Run> {
  const existing = await db
    .from('rv_checklist_runs')
    .select(RUN_COLUMNS)
    .eq('user_id', userId)
    .eq('checklist_id', checklistId)
    .is('archived_at', null)
    .maybeSingle();
  if (existing.data) return existing.data as Run;

  const stop = checklistId === 'pretrip' ? null : await todaysStop(db, checklistId);
  const trip = checklistId === 'pretrip' ? await tripForPretrip(db) : null;
  const { data, error } = await db
    .from('rv_checklist_runs')
    .insert({
      user_id: userId,
      checklist_id: checklistId,
      stop_id: stop?.id ?? null,
      trip_id: trip?.id ?? stop?.trip_id ?? null,
      location: stop
        ? [stop.name, stop.site && `site ${stop.site}`].filter(Boolean).join(', ')
        : trip
          ? `for ${trip.name}`
          : null,
    })
    .select(RUN_COLUMNS)
    .single();
  if (data) return data as Run;

  const again = await db
    .from('rv_checklist_runs')
    .select(RUN_COLUMNS)
    .eq('user_id', userId)
    .eq('checklist_id', checklistId)
    .is('archived_at', null)
    .single();
  if (again.data) return again.data as Run;
  throw new Error(error?.message ?? 'Could not open a checklist run');
}

export async function checkedIds(db: MissionClient, runId: string): Promise<string[]> {
  const { data } = await db.from('rv_checklist_checks').select('item_id').eq('run_id', runId);
  return (data ?? []).map((r) => r.item_id as string);
}

/**
 * Tick or untick one item, then keep `completed_at` honest: set at the moment
 * the last item is ticked, cleared if anything is unticked afterwards.
 */
export async function setChecked(
  db: MissionClient,
  userId: string,
  checklistId: string,
  itemId: string,
  checked: boolean,
): Promise<{ done: number; total: number; complete: boolean }> {
  const checklist = getChecklist(checklistId);
  if (!checklist) throw new Error('Unknown checklist');
  const run = await openRun(db, userId, checklistId);

  if (checked) {
    const { error } = await db
      .from('rv_checklist_checks')
      .upsert({ run_id: run.id, item_id: itemId, user_id: userId }, { onConflict: 'run_id,item_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from('rv_checklist_checks').delete().eq('run_id', run.id).eq('item_id', itemId);
    if (error) throw new Error(error.message);
  }

  const p = progress(checklist, await checkedIds(db, run.id));
  if (p.complete !== Boolean(run.completed_at)) {
    await db
      .from('rv_checklist_runs')
      .update({ completed_at: p.complete ? new Date().toISOString() : null })
      .eq('id', run.id);
    if (p.complete && checklistId === 'pretrip' && run.trip_id) await closePretripTask(db, run.trip_id);
  }
  return { done: p.done, total: p.total, complete: p.complete };
}

/** Reset: freeze the open run's numbers, archive it, open a fresh one. */
export async function resetRun(db: MissionClient, userId: string, checklistId: string): Promise<void> {
  const checklist = getChecklist(checklistId);
  if (!checklist) throw new Error('Unknown checklist');
  const run = await openRun(db, userId, checklistId);
  const p = progress(checklist, await checkedIds(db, run.id));

  // An untouched run is not history. Archiving it would count a "run" that
  // never happened and drag the skipped-items average toward 100%.
  if (p.done === 0) return;

  const { error } = await db
    .from('rv_checklist_runs')
    .update({ archived_at: new Date().toISOString(), items_total: p.total, items_checked: p.done })
    .eq('id', run.id);
  if (error) throw new Error(error.message);
  await openRun(db, userId, checklistId);
}

/*
 * Finishing the Pre-Trip checklist closes the trip's "Run the Pre-Trip
 * checklist" task. Without this the task and the checklist are two claims
 * about the same thing, and the brief would nag about a job already done.
 * Goes through the tasks table directly: a pretrip task never recurs.
 */
async function closePretripTask(db: MissionClient, tripId: string): Promise<void> {
  const { data } = await db.from('rv_trip_tasks').select('task_id').eq('trip_id', tripId).eq('kind', 'pretrip');
  const ids = (data ?? []).map((r) => r.task_id as string);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await db
    .from('tasks')
    .update({ status: 'done', last_completed_at: now, edited_at: now, updated_at: now })
    .in('id', ids)
    .neq('status', 'done');
}
