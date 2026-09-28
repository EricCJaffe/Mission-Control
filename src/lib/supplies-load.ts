/**
 * Reads for supplies, shared by the owner's pages (RLS client) and a helper's
 * phone (service client, filtered to the owner). Kept apart from supplies.ts,
 * which stays pure so node --test can run it.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { addDays, today } from '@/lib/day';
import { SUPPLY_COLUMNS, qtyText, shoppingList, type OpenNeed, type Supply, type ListLine } from '@/lib/supplies';

/*
 * A job reserves its supplies only when it is due within this many days, or
 * has no date. A yearly schedule should not hold a quart of oil on the list
 * for eleven months.
 */
export const RESERVE_DAYS = 30;

export type TaskNeed = { id: string; task_id: string; supply_id: string; qty: number };

export async function loadSupplies(db: MissionClient, ownerId: string): Promise<Supply[]> {
  const { data } = await db.from('supplies').select(SUPPLY_COLUMNS).eq('user_id', ownerId).eq('active', true).order('name');
  return ((data ?? []) as Supply[]).map((s) => ({ ...s, on_hand: Number(s.on_hand), keep_min: s.keep_min === null ? null : Number(s.keep_min) }));
}

/** Every job-to-supply link, for showing on a job. */
export async function loadNeeds(db: MissionClient, ownerId: string, taskIds?: string[]): Promise<TaskNeed[]> {
  let q = db.from('supply_needs').select('id,task_id,supply_id,qty').eq('user_id', ownerId);
  if (taskIds) {
    if (!taskIds.length) return [];
    q = q.in('task_id', taskIds);
  }
  const { data } = await q;
  return ((data ?? []) as TaskNeed[]).map((n) => ({ ...n, qty: Number(n.qty) }));
}

/** Links whose job is still open and due soon: the ones that should reserve stock. */
export async function openNeeds(db: MissionClient, ownerId: string): Promise<OpenNeed[]> {
  const needs = await loadNeeds(db, ownerId);
  if (!needs.length) return [];
  const horizon = addDays(today(), RESERVE_DAYS);
  const { data: tasks } = await db
    .from('tasks')
    .select('id,title,due_date')
    .eq('user_id', ownerId)
    .in('id', [...new Set(needs.map((n) => n.task_id))])
    .neq('status', 'done')
    .or(`due_date.is.null,due_date.lte.${horizon}`);
  const title = new Map(((tasks ?? []) as Array<{ id: string; title: string }>).map((t) => [t.id, t.title]));
  return needs.filter((n) => title.has(n.task_id)).map((n) => ({ supply_id: n.supply_id, qty: n.qty, task_title: title.get(n.task_id)! }));
}

export async function loadList(db: MissionClient, ownerId: string): Promise<{ supplies: Supply[]; list: ListLine[] }> {
  const [supplies, needs] = await Promise.all([loadSupplies(db, ownerId), openNeeds(db, ownerId)]);
  return { supplies, list: shoppingList(supplies, needs) };
}

/**
 * What a helper may see of the shelf: each shared job's supplies as a line of
 * text, and item names for the "we're out of…" picker. Names only; no counts
 * beyond "have N" on a job they are doing.
 */
export async function helperSupplies(
  db: MissionClient,
  ownerId: string,
  taskIds: string[],
): Promise<{ byTask: Record<string, string[]>; shelf: Array<{ id: string; name: string }> }> {
  const [supplies, needs] = await Promise.all([loadSupplies(db, ownerId), loadNeeds(db, ownerId, taskIds)]);
  const byId = new Map(supplies.map((s) => [s.id, s]));
  const byTask: Record<string, string[]> = {};
  for (const n of needs) {
    const s = byId.get(n.supply_id);
    if (!s) continue;
    const have = s.on_hand < n.qty ? ` (only ${qtyText(s.on_hand, s.unit)} on hand)` : '';
    (byTask[n.task_id] ??= []).push(`${s.name} × ${qtyText(n.qty, s.unit)}${have}`);
  }
  return { byTask, shelf: supplies.map((s) => ({ id: s.id, name: s.name })) };
}
