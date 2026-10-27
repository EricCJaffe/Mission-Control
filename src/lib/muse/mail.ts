import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Every query the Muse mailbox can run. This module is the allowlist.
 *
 * The table name is a constant and no function takes a table, column or filter
 * from the caller, so a Muse token cannot reach tasks, notes, briefs, mail or
 * any health or fitness table: there is no code path that names them. Keep it
 * that way; a "generic" helper here would undo the whole boundary.
 */
export const MUSE_TABLE = 'muse_mail';

export const MAX_TEXT = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT = /^[a-z0-9_-]{1,40}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const isAgent = (v: unknown): v is string => typeof v === 'string' && AGENT.test(v);
export const isText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;

type Db = Pick<SupabaseClient, 'from'>;
type Fail = { error: string };

export type InboxItem = { id: string; from: string; ask: string; status: 'new' | 'taken'; created_at: string };

/** Muse: open asks, oldest first. */
export async function listOpen(db: Db, userId: string): Promise<InboxItem[] | Fail> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .select('id, from_agent, ask, status, created_at')
    .eq('user_id', userId)
    .in('status', ['new', 'taken'])
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return { error: error.message };
  return (data ?? []).map((r) => ({
    id: r.id,
    from: r.from_agent,
    ask: r.ask,
    status: r.status,
    created_at: r.created_at,
  }));
}

export type Transition = 'ok' | 'missing' | 'conflict' | Fail;

/** Zero rows updated: tell "no such row" (404) from "wrong state" (409). */
async function explain(db: Db, userId: string, id: string): Promise<Transition> {
  const { data, error } = await db.from(MUSE_TABLE).select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) return { error: error.message };
  return data ? 'conflict' : 'missing';
}

/** Muse: new -> taken. */
export async function take(db: Db, userId: string, id: string, now = new Date()): Promise<Transition> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .update({ status: 'taken', taken_at: now.toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'new')
    .select('id');
  if (error) return { error: error.message };
  return data && data.length > 0 ? 'ok' : explain(db, userId, id);
}

/** Muse: new|taken -> done, with the answer. A done row is never rewritten. */
export async function reply(db: Db, userId: string, id: string, text: string, now = new Date()): Promise<Transition> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .update({ status: 'done', reply: text, done_at: now.toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', ['new', 'taken'])
    .select('id');
  if (error) return { error: error.message };
  return data && data.length > 0 ? 'ok' : explain(db, userId, id);
}

/** Bots: post an ask. */
export async function postAsk(db: Db, userId: string, from: string, ask: string): Promise<{ id: string } | Fail> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .insert({ user_id: userId, from_agent: from, ask, status: 'new' })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export type Reply = { id: string; from: string; ask: string; reply: string; created_at: string; done_at: string };

/** Bots: answered rows not yet delivered, oldest answer first. */
export async function listReplies(db: Db, userId: string): Promise<Reply[] | Fail> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .select('id, from_agent, ask, reply, created_at, done_at')
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('handed_off_at', null)
    .order('done_at', { ascending: true })
    .limit(20);
  if (error) return { error: error.message };
  return (data ?? []).map((r) => ({
    id: r.id,
    from: r.from_agent,
    ask: r.ask,
    reply: r.reply,
    created_at: r.created_at,
    done_at: r.done_at,
  }));
}

/** Bots: ack one delivered reply. Zero rows = unknown or already acked. */
export async function ack(db: Db, userId: string, id: string, ref: string, now = new Date()): Promise<'ok' | 'missing' | Fail> {
  const { data, error } = await db
    .from(MUSE_TABLE)
    .update({ handed_off_at: now.toISOString(), handoff_ref: ref })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'done')
    .is('handed_off_at', null)
    .select('id');
  if (error) return { error: error.message };
  return data && data.length > 0 ? 'ok' : 'missing';
}
