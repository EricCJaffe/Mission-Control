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
import { stopForToday, type Stop } from './trips';

export type Run = {
  id: string;
  checklist_id: string;
  stop_id: string | null;
  location: string | null;
  started_at: string;
  completed_at: string | null;
  archived_at: string | null;
  items_total: number | null;
  items_checked: number | null;
};

const RUN_COLUMNS = 'id,checklist_id,stop_id,location,started_at,completed_at,archived_at,items_total,items_checked';

/** The stop the rig is at today, across every trip not canceled. */
async function todaysStop(db: MissionClient, checklistId: string): Promise<Stop | null> {
  const t = today();
  const { data } = await db
    .from('rv_trip_stops')
    .select('id,trip_id,campground,location,site,arrive_on,depart_on,confirmation,cost,hookups,url,phone,notes,trip:rv_trips!inner(status)')
    .lte('arrive_on', t)
    .or(`depart_on.gte.${t},depart_on.is.null`)
    .neq('trip.status', 'canceled');
  return stopForToday((data ?? []) as unknown as Stop[], t, checklistId);
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

  const stop = await todaysStop(db, checklistId);
  const { data, error } = await db
    .from('rv_checklist_runs')
    .insert({
      user_id: userId,
      checklist_id: checklistId,
      stop_id: stop?.id ?? null,
      location: stop ? [stop.campground, stop.site && `site ${stop.site}`].filter(Boolean).join(', ') : null,
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
