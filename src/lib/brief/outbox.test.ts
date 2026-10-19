/*
 * outbox tests. Run with:
 *
 *   node --test src/lib/brief/outbox.test.ts
 *
 * The guarded property: a red alert that could not be queued must come back
 * as a failure the cron can see (non-2xx), never as a quiet 200.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueAlert, queueResponse, type OutboxClient } from './outbox.ts';

function fakeClient(result: { data: { id: string } | null; error: { message: string } | null } | Error) {
  const inserted: Record<string, unknown>[] = [];
  const client: OutboxClient = {
    from: () => ({
      insert: (row) => {
        inserted.push(row);
        return {
          select: () => ({
            single: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
          }),
        };
      },
    }),
  };
  return { client, inserted };
}

const input = {
  userId: 'u1',
  subject: 'Apple Health has been quiet for 2 days',
  html: '<p>quiet</p>',
  severity: 'red' as const,
  day: '2026-10-19',
};

test('a stored alert is queued for handoff and answers 200', async () => {
  const { client, inserted } = fakeClient({ data: { id: 'b1' }, error: null });
  const result = await queueAlert(client, input);
  assert.deepEqual(result, { ok: true, id: 'b1' });
  assert.equal(inserted[0]?.kind, 'alert');
  assert.equal(inserted[0]?.severity, 'red');
  assert.ok(inserted[0]?.handoff_requested_at, 'handoff_requested_at must be set');
  assert.equal(queueResponse(result).status, 200);
});

test('a red alert that fails to store is a 500, never a silent 200', async () => {
  const { client } = fakeClient({ data: null, error: { message: 'permission denied' } });
  const result = await queueAlert(client, input);
  assert.equal(result.ok, false);
  const res = queueResponse(result);
  assert.equal(res.status, 500);
  assert.equal(res.body.alerted, false);
});

test('a thrown client error is a 500 too', async () => {
  const { client } = fakeClient(new Error('fetch failed'));
  const res = queueResponse(await queueAlert(client, input));
  assert.equal(res.status, 500);
  assert.match(JSON.stringify(res.body), /fetch failed/);
});

test('an insert that returns no row is a failure', async () => {
  const { client } = fakeClient({ data: null, error: null });
  assert.equal(queueResponse(await queueAlert(client, input)).status, 500);
});

import { kindLabel, deliveryStatus } from './outbox.ts';

test('alerts are labeled as alerts, not daily briefs', () => {
  assert.equal(kindLabel('alert'), 'Alert');
  assert.equal(kindLabel('weekly'), 'Weekly');
  assert.equal(kindLabel('daily'), 'Daily');
});

test('delivery status reads the handoff columns', () => {
  const base = { sent_at: null, sent_to: null };
  assert.deepEqual(deliveryStatus(base), { text: 'stored only', warn: false });
  assert.deepEqual(deliveryStatus({ ...base, handoff_requested_at: 'x' }), { text: 'waiting for grokbot', warn: true });
  assert.deepEqual(
    deliveryStatus({ ...base, handoff_requested_at: 'x', handed_off_at: 'y' }),
    { text: 'handed to grokbot', warn: false },
  );
  assert.equal(deliveryStatus({ sent_at: 'z', sent_to: 'a@b' }).text, 'sent to a@b');
});
