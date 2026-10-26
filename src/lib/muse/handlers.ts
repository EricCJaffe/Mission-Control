import type { SupabaseClient } from '@supabase/supabase-js';
import { checkBearerSha256, createLimiter } from './auth.ts';
import * as mail from './mail.ts';

/**
 * HTTP layer for the Muse mailbox, kept out of the route files so the tests
 * can drive it with a plain Request and a fake client.
 *
 *   Muse side (Bearer MUSE_MAILBOX_TOKEN, sha256 in MUSE_MAILBOX_TOKEN_SHA256):
 *     GET  /api/muse/inbox              open asks
 *     POST /api/muse/inbox/{id}/take    new -> taken (409 otherwise)
 *     POST /api/muse/inbox/{id}/reply   {reply} -> done
 *   Bot side (Bearer CRON_SECRET, like every cron here):
 *     POST /api/cron/muse-outbox/ask    {from, ask} -> new row
 *     GET  /api/cron/muse-outbox        answered, not yet delivered
 *     POST /api/cron/muse-outbox        {id, ref} -> handed_off_at
 *
 * Never log the Authorization header or the token; nothing here does.
 */
type Db = Pick<SupabaseClient, 'from'>;
export type Env = Record<string, string | undefined>;
export type Deps = { env: Env; db: () => Db; limiter?: ReturnType<typeof createLimiter> };

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, headers });

const defaultLimiter = createLimiter();

function serverEnv(env: Env) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, MC_USER_ID: userId } = env;
  return url && key && userId ? { userId } : null;
}

function museGate(req: Request, deps: Deps): { userId: string } | Response {
  const base = serverEnv(deps.env);
  const check = checkBearerSha256(req.headers.get('authorization'), deps.env.MUSE_MAILBOX_TOKEN_SHA256);
  if (!base || check === 'unconfigured') {
    return json({ error: 'The Muse mailbox is not configured on this deployment.' }, 503);
  }
  if (check !== 'ok') {
    return json({ error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer realm="muse-mailbox"' });
  }
  // One token, so one bucket. Counted only after auth, so a stranger cannot
  // spend Muse's allowance.
  if (!(deps.limiter ?? defaultLimiter).hit('muse')) {
    return json({ error: 'Rate limit: about 120 requests an hour.' }, 429, { 'Retry-After': '300' });
  }
  return base;
}

function cronGate(req: Request, deps: Deps): { userId: string } | Response {
  const base = serverEnv(deps.env);
  const secret = deps.env.CRON_SECRET;
  if (!base || !secret) return json({ error: 'The Muse outbox is not configured on this deployment.' }, 503);
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
  }
  return base;
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function transition(r: mail.Transition, id: string, status: string): Response {
  if (r === 'ok') return json({ ok: true, id, status });
  if (r === 'missing') return json({ error: 'No mail with that id' }, 404);
  if (r === 'conflict') return json({ error: `Not allowed from its current status (want ${status})` }, 409);
  return json({ error: r.error }, 500);
}

export async function museInbox(req: Request, deps: Deps): Promise<Response> {
  const g = museGate(req, deps);
  if (g instanceof Response) return g;
  const rows = await mail.listOpen(deps.db(), g.userId);
  if ('error' in rows) return json({ error: rows.error }, 500);
  return json({ ok: true, items: rows, count: rows.length });
}

export async function museTake(req: Request, id: string, deps: Deps): Promise<Response> {
  const g = museGate(req, deps);
  if (g instanceof Response) return g;
  if (!mail.isUuid(id)) return json({ error: 'No mail with that id' }, 404);
  return transition(await mail.take(deps.db(), g.userId, id), id, 'taken');
}

export async function museReply(req: Request, id: string, deps: Deps): Promise<Response> {
  const g = museGate(req, deps);
  if (g instanceof Response) return g;
  if (!mail.isUuid(id)) return json({ error: 'No mail with that id' }, 404);
  const b = await body(req);
  if (!b || !mail.isText(b.reply)) {
    return json({ error: `Body must be JSON {reply}: non-empty, at most ${mail.MAX_TEXT} characters` }, 400);
  }
  return transition(await mail.reply(deps.db(), g.userId, id, b.reply), id, 'done');
}

export async function outboxAsk(req: Request, deps: Deps): Promise<Response> {
  const g = cronGate(req, deps);
  if (g instanceof Response) return g;
  const b = await body(req);
  if (!b || !mail.isAgent(b.from) || !mail.isText(b.ask)) {
    return json({ error: `Body must be JSON {from, ask}: from like "cos", ask at most ${mail.MAX_TEXT} characters` }, 400);
  }
  const r = await mail.postAsk(deps.db(), g.userId, b.from, b.ask);
  if ('error' in r) return json({ error: r.error }, 500);
  return json({ ok: true, id: r.id }, 201);
}

export async function outboxReplies(req: Request, deps: Deps): Promise<Response> {
  const g = cronGate(req, deps);
  if (g instanceof Response) return g;
  const rows = await mail.listReplies(deps.db(), g.userId);
  if ('error' in rows) return json({ error: rows.error }, 500);
  const oldest = rows[0]?.done_at;
  const hours = oldest ? Math.round(((Date.now() - new Date(oldest).getTime()) / 3_600_000) * 10) / 10 : null;
  return json({ ok: true, pending: rows, count: rows.length, oldest_pending_hours: hours });
}

export async function outboxAck(req: Request, deps: Deps): Promise<Response> {
  const g = cronGate(req, deps);
  if (g instanceof Response) return g;
  const b = await body(req);
  if (!b || typeof b.ref !== 'string' || !b.ref || b.ref.length > 500 || typeof b.id !== 'string') {
    return json({ error: 'Body must be JSON: {id, ref}' }, 400);
  }
  // Not a uuid can't be a pending row: same answer as an unknown id.
  if (!mail.isUuid(b.id)) return json({ error: 'No pending reply with that id' }, 404);
  const r = await mail.ack(deps.db(), g.userId, b.id, b.ref);
  if (r === 'ok') return json({ ok: true, id: b.id, ref: b.ref });
  // Unknown id or already acked: the caller must not think it just closed it.
  if (r === 'missing') return json({ error: 'No pending reply with that id' }, 404);
  return json({ error: r.error }, 500);
}
