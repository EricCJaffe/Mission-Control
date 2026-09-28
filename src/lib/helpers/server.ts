/**
 * Server-side helper access: the service-role client, the session behind the
 * cookie, and the only reads and writes a helper can cause.
 *
 * EVERY QUERY HERE IS FILTERED TWICE: by the owner the helper belongs to, and
 * to shared rows. The service role bypasses RLS, so these filters are the
 * boundary — which is why they live in one file and nowhere else.
 */

import { cookies } from 'next/headers';
import { helperSupplies } from '@/lib/supplies-load';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA, type MissionClient } from '@/lib/supabase/schema';
import { today } from '@/lib/day';
import { completionPatch } from '@/lib/tasks/complete';
import { HELPER_COOKIE, hashToken } from './auth';
import { helperView, type HelperItem, type WorkRow } from './list';

export function serviceClient(): MissionClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, key, { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });
}

export type HelperSession = {
  account_id: string;
  owner_id: string;
  worker: { id: string; name: string; skills: string[]; tracks_hours: boolean };
};

/** The helper behind this request's cookie, or null. Disabled accounts and expired sessions are null. */
export async function currentHelper(): Promise<HelperSession | null> {
  const token = (await cookies()).get(HELPER_COOKIE)?.value;
  if (!token) return null;
  const db = serviceClient();
  const { data: session } = await db
    .from('helper_sessions')
    .select('account_id,expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!session || new Date(session.expires_at as string) < new Date()) return null;

  const { data: account } = await db
    .from('helper_accounts')
    .select('id,user_id,disabled_at,worker:workers!inner(id,name,skills,tracks_hours,active)')
    .eq('id', session.account_id)
    .maybeSingle();
  const worker = account?.worker as unknown as { id: string; name: string; skills: string[]; tracks_hours: boolean; active: boolean } | undefined;
  if (!account || account.disabled_at || !worker?.active) return null;
  return {
    account_id: account.id as string,
    owner_id: account.user_id as string,
    worker: { id: worker.id, name: worker.name, skills: worker.skills ?? ['helper'], tracks_hours: worker.tracks_hours },
  };
}

/** Shared work rows for an owner. The only read of tasks a helper can cause. */
export async function sharedRows(db: MissionClient, ownerId: string): Promise<WorkRow[]> {
  const { data: items } = await db.from('work_items').select('*').eq('user_id', ownerId).eq('shared', true);
  const ids = (items ?? []).map((i) => i.task_id as string);
  if (ids.length === 0) return [];
  const { data: tasks } = await db
    .from('tasks')
    .select('id,title,status,due_date,recurrence_rule,created_at')
    .eq('user_id', ownerId)
    .in('id', ids);
  const byId = new Map((tasks ?? []).map((t) => [t.id as string, t]));
  // Blocking tasks may not be shared themselves, so their status is read separately.
  const blockerIds = [...new Set((items ?? []).map((i) => i.blocked_by as string | null).filter((x): x is string => Boolean(x)))];
  const { data: blockers } = blockerIds.length
    ? await db.from('tasks').select('id,status').eq('user_id', ownerId).in('id', blockerIds)
    : { data: [] as Array<{ id: string; status: string }> };
  const openBlockers = new Set((blockers ?? []).filter((b) => b.status !== 'done').map((b) => b.id as string));
  return (items ?? []).flatMap((i) => {
    const t = byId.get(i.task_id as string);
    if (!t) return [];
    return [{
      task_id: t.id, title: t.title, status: t.status, due_date: t.due_date, recurrence_rule: t.recurrence_rule, created_at: t.created_at,
      shared: i.shared, skill: i.skill, location_label: i.location_label, pinned: i.pinned, sort_order: i.sort_order,
      assignee_worker_id: i.assignee_worker_id, assignee_name: i.assignee_name, instructions: i.instructions,
      materials: i.materials, gift_card_note: i.gift_card_note, gift_card_sent_at: i.gift_card_sent_at,
      claimed_at: i.claimed_at,
      blocked_by: i.blocked_by, blocked_open: Boolean(i.blocked_by && openBlockers.has(i.blocked_by as string)),
    } as WorkRow];
  });
}

export async function workerNames(db: MissionClient, ownerId: string): Promise<Map<string, string>> {
  const { data } = await db.from('workers').select('id,name').eq('user_id', ownerId);
  return new Map((data ?? []).map((w) => [w.id as string, w.name as string]));
}

export type OpenClock = { task_id: string | null; task_title: string; started_at: string };

export async function openClock(db: MissionClient, workerId: string): Promise<OpenClock | null> {
  const { data } = await db.from('work_time').select('task_id,task_title,started_at').eq('worker_id', workerId).is('ended_at', null).maybeSingle();
  return (data as OpenClock | null) ?? null;
}

export type HourEntry = { task_title: string; started_at: string; ended_at: string | null };

/** What the helper page renders. Their own hours only, last 14 days. */
export async function helperPage(
  h: HelperSession,
): Promise<{
  maintenance: HelperItem[];
  oneOff: HelperItem[];
  clock: OpenClock | null;
  hours: HourEntry[];
  supplies: { byTask: Record<string, string[]>; shelf: Array<{ id: string; name: string }> };
}> {
  const db = serviceClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [rows, names, clock, hours] = await Promise.all([
    sharedRows(db, h.owner_id),
    workerNames(db, h.owner_id),
    openClock(db, h.worker.id),
    db.from('work_time').select('task_title,started_at,ended_at').eq('worker_id', h.worker.id).gte('started_at', since).order('started_at', { ascending: false }),
  ]);
  const view = helperView(rows, { worker_id: h.worker.id, skills: h.worker.skills }, names, today());
  // Only the jobs on this helper's screen, so a job they cannot see names nothing.
  const supplies = await helperSupplies(db, h.owner_id, [...view.maintenance, ...view.oneOff].map((i) => i.id));
  return {
    ...view,
    clock,
    hours: (hours.data ?? []) as HourEntry[],
    supplies,
  };
}

/** The job, if this helper may act on it right now; otherwise null. */
async function visibleItem(db: MissionClient, h: HelperSession, taskId: string): Promise<HelperItem | null> {
  const rows = (await sharedRows(db, h.owner_id)).filter((r) => r.task_id === taskId);
  const v = helperView(rows, { worker_id: h.worker.id, skills: h.worker.skills }, new Map(), today());
  return [...v.maintenance, ...v.oneOff][0] ?? null;
}

/**
 * Mark a job done, exactly as Eric ticking it would: a one-off closes, a
 * recurring maintenance task rolls forward (and the maintenance trigger logs
 * it). Who did it is recorded, and any open clock on it is stopped.
 */
export async function completeAsHelper(h: HelperSession, taskId: string, note: string | null): Promise<void> {
  const db = serviceClient();
  const item = await visibleItem(db, h, taskId);
  if (!item) throw new Error('That job is not on your list');

  const { data: task } = await db
    .from('tasks')
    .select('recurrence_rule,recurrence_anchor,due_date,recurrence_count')
    .eq('id', taskId)
    .eq('user_id', h.owner_id)
    .single();
  const now = new Date().toISOString();
  const patch = { ...completionPatch(task, today(), now), edited_at: now, updated_at: now };
  const { error } = await db.from('tasks').update(patch).eq('id', taskId).eq('user_id', h.owner_id);
  if (error) throw new Error(error.message);

  await db.from('work_completions').insert({
    user_id: h.owner_id, task_id: taskId, task_title: item.title, worker_id: h.worker.id, account_id: h.account_id, note: note?.trim() || null,
  });
  await db.from('work_time').update({ ended_at: now }).eq('worker_id', h.worker.id).eq('task_id', taskId).is('ended_at', null);
}

/** Clock in on a job (closing any other open clock first), or clock out. */
export async function clockAsHelper(h: HelperSession, action: 'in' | 'out', taskId: string | null): Promise<void> {
  if (!h.worker.tracks_hours) throw new Error('Hours are not tracked for you');
  const db = serviceClient();
  // Check the job BEFORE touching the open clock: a refused clock-in must not
  // stop the one already running.
  let title = 'General work';
  if (action === 'in' && taskId) {
    const item = await visibleItem(db, h, taskId);
    if (!item) throw new Error('That job is not on your list');
    title = item.title;
  }
  const now = new Date().toISOString();
  await db.from('work_time').update({ ended_at: now }).eq('worker_id', h.worker.id).is('ended_at', null);
  if (action === 'out') return;

  const { error } = await db.from('work_time').insert({
    user_id: h.owner_id, task_id: taskId, task_title: title, worker_id: h.worker.id, account_id: h.account_id, started_at: now,
  });
  if (error) throw new Error(error.message);
}

/**
 * Take a job off the open board. The update only matches while the job is
 * still unassigned, so when two helpers tap at once exactly one row changes
 * and the other is told who got there first.
 */
export async function claimAsHelper(h: HelperSession, taskId: string): Promise<void> {
  const db = serviceClient();
  const item = await visibleItem(db, h, taskId);
  if (!item) throw new Error('That job is not on your list');
  if (!item.board) throw new Error('That job is already taken');
  const { data } = await db
    .from('work_items')
    .update({ assignee_worker_id: h.worker.id, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .eq('user_id', h.owner_id)
    .eq('shared', true)
    .is('assignee_worker_id', null)
    .is('assignee_name', null)
    .select('task_id');
  if (!data?.length) {
    const { data: now } = await db.from('work_items').select('assignee_worker_id').eq('task_id', taskId).eq('user_id', h.owner_id).maybeSingle();
    const who = now?.assignee_worker_id ? (await workerNames(db, h.owner_id)).get(now.assignee_worker_id as string) : null;
    throw new Error(who ? `${who} just took that one` : 'Someone just took that one');
  }
}

/** Put a job back on the open board: "I can't get to this after all." Only your own. */
export async function releaseAsHelper(h: HelperSession, taskId: string): Promise<void> {
  const db = serviceClient();
  const { data } = await db
    .from('work_items')
    .update({ assignee_worker_id: null, claimed_at: null, updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .eq('user_id', h.owner_id)
    .eq('assignee_worker_id', h.worker.id)
    .select('task_id');
  if (!data?.length) throw new Error('That job is not yours to put back');
  // Stop the clock on it too: hours on a job you handed back are still hours, but not open ones.
  await db.from('work_time').update({ ended_at: new Date().toISOString() }).eq('worker_id', h.worker.id).eq('task_id', taskId).is('ended_at', null);
}
