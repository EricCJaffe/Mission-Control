import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBearerSha256, createLimiter, sha256Hex } from './auth.ts';
import * as h from './handlers.ts';
import type { Deps } from './handlers.ts';

const TOKEN = 'muse-test-token-not-a-secret-0123456789abcdef';
const CRON = 'cron-test-secret';
const USER = '00000000-0000-4000-8000-000000000001';
const ID = '11111111-1111-4111-8111-111111111111';

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'x',
  MC_USER_ID: USER,
  MUSE_MAILBOX_TOKEN_SHA256: sha256Hex(TOKEN),
  CRON_SECRET: CRON,
};

type Call = { table: string; ops: [string, unknown[]][] };

/**
 * A fake supabase client: records every from() and chained call, and answers
 * each query with the next queued result. Every query must consume a result,
 * so a test also proves how many queries ran.
 */
function fakeDb(results: { data?: unknown; error?: { message: string } | null }[]) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const next = () => {
        const r = results.shift();
        if (!r) throw new Error(`unexpected query on ${table}`);
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
      };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'update', 'insert']) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return builder;
        };
      }
      builder.single = builder.maybeSingle = () => next();
      builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => next().then(ok, bad);
      return builder;
    },
  };
  return { db, calls };
}

function deps(results: Parameters<typeof fakeDb>[0] = [], env: Record<string, string | undefined> = ENV) {
  const f = fakeDb(results);
  const d: Deps = { env, db: () => f.db as unknown as ReturnType<Deps['db']>, limiter: createLimiter() };
  return { d, calls: f.calls };
}

const req = (path: string, auth?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
  new Request(`http://mc.test${path}`, {
    method,
    headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const muse = `Bearer ${TOKEN}`;
const cron = `Bearer ${CRON}`;

test('token check: only the hashed token passes; bad env fails closed', () => {
  assert.equal(checkBearerSha256(muse, sha256Hex(TOKEN)), 'ok');
  assert.equal(checkBearerSha256(muse, sha256Hex(TOKEN).toUpperCase()), 'ok');
  assert.equal(checkBearerSha256('Bearer nope', sha256Hex(TOKEN)), 'unauthorized');
  assert.equal(checkBearerSha256(TOKEN, sha256Hex(TOKEN)), 'unauthorized');
  assert.equal(checkBearerSha256(null, sha256Hex(TOKEN)), 'unauthorized');
  assert.equal(checkBearerSha256(muse, undefined), 'unconfigured');
  assert.equal(checkBearerSha256(muse, TOKEN), 'unconfigured'); // plaintext in env is not accepted
});

test('muse inbox: no token 401 with WWW-Authenticate, wrong token 401, no DB call', async () => {
  for (const auth of [undefined, 'Bearer wrong', cron]) {
    const { d, calls } = deps();
    const r = await h.museInbox(req('/api/muse/inbox', auth), d);
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate') ?? '', /^Bearer/);
    assert.equal(calls.length, 0);
  }
});

test('muse inbox: missing token hash or server env is 503', async () => {
  const { d } = deps([], { ...ENV, MUSE_MAILBOX_TOKEN_SHA256: undefined });
  assert.equal((await h.museInbox(req('/api/muse/inbox', muse), d)).status, 503);
  const { d: d2 } = deps([], { ...ENV, MC_USER_ID: undefined });
  assert.equal((await h.museInbox(req('/api/muse/inbox', muse), d2)).status, 503);
});

test('muse inbox: right token lists open asks from muse_mail only, scoped to the user', async () => {
  const { d, calls } = deps([
    { data: [{ id: ID, from_agent: 'cos', ask: 'hi', status: 'new', created_at: '2026-10-26T00:00:00Z' }] },
  ]);
  const r = await h.museInbox(req('/api/muse/inbox', muse), d);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.items, [{ id: ID, from: 'cos', ask: 'hi', status: 'new', created_at: '2026-10-26T00:00:00Z' }]);
  assert.deepEqual(calls.map((c) => c.table), ['muse_mail']);
  assert.deepEqual(calls[0].ops.find(([m, a]) => m === 'eq' && a[0] === 'user_id'), ['eq', ['user_id', USER]]);
  assert.deepEqual(calls[0].ops.find(([m]) => m === 'in'), ['in', ['status', ['new', 'taken']]]);
});

test('take: new -> taken; 409 when not new; 404 when unknown or not a uuid', async () => {
  let { d } = deps([{ data: [{ id: ID }] }]);
  const r = await h.museTake(req(`/api/muse/inbox/${ID}/take`, muse, {}), ID, d);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'taken');

  ({ d } = deps([{ data: [] }, { data: { id: ID } }]));
  assert.equal((await h.museTake(req('/x', muse, {}), ID, d)).status, 409);

  ({ d } = deps([{ data: [] }, { data: null }]));
  assert.equal((await h.museTake(req('/x', muse, {}), ID, d)).status, 404);

  const n = deps();
  assert.equal((await h.museTake(req('/x', muse, {}), 'muse_mail; drop table', n.d)).status, 404);
  assert.equal(n.calls.length, 0);
});

test('take only moves rows whose status is new', async () => {
  const { d, calls } = deps([{ data: [{ id: ID }] }]);
  await h.museTake(req('/x', muse, {}), ID, d);
  assert.deepEqual(calls[0].ops.find(([m, a]) => m === 'eq' && a[0] === 'status'), ['eq', ['status', 'new']]);
});

test('reply: sets done; 409 when already done; 400 on empty or oversized reply', async () => {
  let { d, calls } = deps([{ data: [{ id: ID }] }]);
  let r = await h.museReply(req('/x', muse, { reply: 'done it' }), ID, d);
  assert.equal(r.status, 200);
  const upd = calls[0].ops.find(([m]) => m === 'update')!;
  assert.equal((upd[1][0] as { status: string }).status, 'done');
  assert.equal((upd[1][0] as { reply: string }).reply, 'done it');

  ({ d } = deps([{ data: [] }, { data: { id: ID } }]));
  assert.equal((await h.museReply(req('/x', muse, { reply: 'again' }), ID, d)).status, 409);

  for (const bad of [{}, { reply: '' }, { reply: '   ' }, { reply: 'x'.repeat(20_001) }, 'not json', [1]]) {
    ({ d, calls } = deps());
    r = await h.museReply(req('/x', muse, bad), ID, d);
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  }
});

test('rate limit: about 120 an hour, then 429; counted only after auth', async () => {
  const limiter = createLimiter(2, 1000);
  const mk = () => {
    const f = fakeDb([{ data: [] }]);
    return { env: ENV, db: () => f.db as unknown as ReturnType<Deps['db']>, limiter } as Deps;
  };
  for (let i = 0; i < 5; i++) assert.equal((await h.museInbox(req('/x', 'Bearer wrong'), mk())).status, 401);
  assert.equal((await h.museInbox(req('/x', muse), mk())).status, 200);
  assert.equal((await h.museInbox(req('/x', muse), mk())).status, 200);
  assert.equal((await h.museInbox(req('/x', muse), mk())).status, 429);
  const l = createLimiter(1, 1000);
  assert.equal(l.hit('k', 0), true);
  assert.equal(l.hit('k', 10), false);
  assert.equal(l.hit('k', 1000), true);
});

test('the muse token cannot use the bot-side routes, and CRON_SECRET cannot use Muse routes', async () => {
  for (const fn of [h.outboxReplies, h.outboxAsk, h.outboxAck]) {
    const { d, calls } = deps();
    assert.equal((await fn(req('/x', muse, { from: 'cos', ask: 'x' }), d)).status, 401);
    assert.equal(calls.length, 0);
  }
  const { d } = deps();
  assert.equal((await h.museInbox(req('/x', cron), d)).status, 401);
});

test('bot ask: inserts a new row for the user; 400 on a bad from or ask; 503 without CRON_SECRET', async () => {
  let { d, calls } = deps([{ data: { id: ID } }]);
  const r = await h.outboxAsk(req('/x', cron, { from: 'cos', ask: 'What changed?' }), d);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).id, ID);
  const ins = calls[0].ops.find(([m]) => m === 'insert')!;
  assert.deepEqual(ins[1][0], { user_id: USER, from_agent: 'cos', ask: 'What changed?', status: 'new' });

  for (const bad of [{ from: 'COS!', ask: 'x' }, { from: 'cos', ask: '' }, { ask: 'x' }]) {
    ({ d, calls } = deps());
    assert.equal((await h.outboxAsk(req('/x', cron, bad), d)).status, 400);
    assert.equal(calls.length, 0);
  }
  ({ d } = deps([], { ...ENV, CRON_SECRET: undefined }));
  assert.equal((await h.outboxAsk(req('/x', cron, { from: 'cos', ask: 'x' }), d)).status, 503);
});

test('outbox: lists done rows not handed off; ack is once only (404 the second time)', async () => {
  let { d, calls } = deps([
    { data: [{ id: ID, from_agent: 'cos', ask: 'a', reply: 'b', created_at: 't0', done_at: '2026-10-26T00:00:00Z' }] },
  ]);
  const r = await h.outboxReplies(req('/x', cron), d);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).pending[0].reply, 'b');
  assert.deepEqual(calls[0].ops.find(([m]) => m === 'is'), ['is', ['handed_off_at', null]]);

  ({ d, calls } = deps([{ data: [{ id: ID }] }]));
  assert.equal((await h.outboxAck(req('/x', cron, { id: ID, ref: 'channel/to-grokbot/x.md' }), d)).status, 200);
  assert.deepEqual(calls[0].ops.find(([m]) => m === 'is'), ['is', ['handed_off_at', null]]);

  ({ d } = deps([{ data: [] }]));
  assert.equal((await h.outboxAck(req('/x', cron, { id: ID, ref: 'channel/to-grokbot/x.md' }), d)).status, 404);

  ({ d, calls } = deps());
  assert.equal((await h.outboxAck(req('/x', cron, { id: ID }), d)).status, 400);
  assert.equal(calls.length, 0);
});

test('no handler ever names a table other than muse_mail', async () => {
  const tables = new Set<string>();
  // Drive every handler down its success and its not-found paths.
  const cases: [(d: Deps) => Promise<Response>, Parameters<typeof fakeDb>[0]][] = [
    [(d) => h.museInbox(req('/x', muse), d), [{ data: [] }]],
    [(d) => h.museTake(req('/x', muse, {}), ID, d), [{ data: [] }, { data: null }]],
    [(d) => h.museReply(req('/x', muse, { reply: 'r' }), ID, d), [{ data: [] }, { data: { id: ID } }]],
    [(d) => h.outboxAsk(req('/x', cron, { from: 'cos', ask: 'a' }), d), [{ data: { id: ID } }]],
    [(d) => h.outboxReplies(req('/x', cron), d), [{ data: [] }]],
    [(d) => h.outboxAck(req('/x', cron, { id: ID, ref: 'r' }), d), [{ data: [] }]],
  ];
  for (const [fn, results] of cases) {
    const f = fakeDb(results);
    await fn({ env: ENV, db: () => f.db as unknown as ReturnType<Deps['db']>, limiter: createLimiter() });
    f.calls.forEach((c) => tables.add(c.table));
  }
  assert.deepEqual([...tables], ['muse_mail']);
});
