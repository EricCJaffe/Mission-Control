import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { meterEnv, readRateLimits, recordFromResult } from './codex-meter.mjs';

const AT = new Date('2026-10-24T13:00:00Z');

/** A fake `codex` that answers initialize, then replies to rateLimits/read with `reply` (or never, or exits). */
function fakeCodex(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fake-'));
  const bin = join(dir, 'codex');
  writeFileSync(bin, `#!/usr/bin/env node
const mode = ${JSON.stringify(mode)};
if (process.argv[2] !== 'app-server') process.exit(9);
if (mode === 'exit') process.exit(3);
if (mode === 'env') process.stderr.write('');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
    if (m.id === 1) { out({ method: 'noise/notification', params: {} }); out({ id: 1, result: { userAgent: 'fake' } }); }
    if (m.id === 2) {
      if (mode === 'hang') continue;
      if (mode === 'error') out({ id: 2, error: { code: -32000, message: 'not logged in' } });
      if (mode === 'env') out({ id: 2, result: { rateLimits: { primary: { usedPercent: process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY ? 99 : 5 } } } });
      if (mode === 'good') out({ id: 2, result: {
        accountId: 'acct-secret', ordinaryUsageAllowed: true, rateLimitUpsell: { text: 'buy more' },
        rateLimits: { primary: { usedPercent: 50 } },
        rateLimitsByLimitId: { codex: {
          planType: 'team', credits: { balance: '12', hasCredits: true, unlimited: false }, limitName: 'x',
          primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1793120000 },
          secondary: { usedPercent: 34, windowDurationMins: 10080, resetsAt: 1793500000 },
        } },
      } });
    }
  }
});
`);
  chmodSync(bin, 0o755);
  return bin;
}

test('good reply: rate-limit fields only, ISO resets, codex bucket preferred', async () => {
  const rec = await readRateLimits({ codex: fakeCodex('good'), timeoutMs: 10000, now: () => AT });
  assert.deepEqual(rec, {
    at: AT.toISOString(), ok: true, plan: 'chatgpt-codex',
    primary_used_pct: 12, primary_window_minutes: 300, primary_resets_at: new Date(1793120000 * 1000).toISOString(),
    secondary_used_pct: 34, secondary_window_minutes: 10080, secondary_resets_at: new Date(1793500000 * 1000).toISOString(),
    plan_type: 'team',
  });
  const s = JSON.stringify(rec);
  for (const dropped of ['acct-secret', 'credits', 'buy more', 'limitName']) assert.ok(!s.includes(dropped), dropped);
});

test('error reply is a failed reading', async () => {
  const rec = await readRateLimits({ codex: fakeCodex('error'), timeoutMs: 10000, now: () => AT });
  assert.equal(rec.ok, false);
  assert.match(rec.error, /not logged in/);
});

test('timeout is a failed reading', async () => {
  const rec = await readRateLimits({ codex: fakeCodex('hang'), timeoutMs: 800, now: () => AT });
  assert.equal(rec.ok, false);
  assert.match(rec.error, /timed out/);
});

test('non-zero exit and a missing binary are failed readings', async () => {
  const ex = await readRateLimits({ codex: fakeCodex('exit'), timeoutMs: 10000, now: () => AT });
  assert.equal(ex.ok, false);
  assert.match(ex.error, /exited 3/);
  const missing = await readRateLimits({ codex: '/nonexistent/codex', timeoutMs: 10000, now: () => AT });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /ENOENT/);
});

test('auth-override env vars never reach the child', async () => {
  const rec = await readRateLimits({ codex: fakeCodex('env'), env: { ...process.env, OPENAI_API_KEY: 'x', CODEX_API_KEY: 'y' }, timeoutMs: 10000, now: () => AT });
  assert.equal(rec.primary_used_pct, 5);
  assert.equal(meterEnv({ OPENAI_API_KEY: 'x', PATH: '/bin' }).OPENAI_API_KEY, undefined);
  assert.equal(meterEnv({ PATH: '/bin' }).PATH, '/bin');
});

test('recordFromResult: snake_case windows, single-bucket fallback, empty reply', () => {
  const r = recordFromResult({ rateLimits: { secondary: { used_percent: 7, window_minutes: 10080, resets_at: 1793500000 } } }, AT);
  assert.equal(r.ok, true);
  assert.equal(r.secondary_used_pct, 7);
  assert.equal(r.primary_used_pct, null);
  assert.equal(r.plan_type, undefined);
  assert.deepEqual(recordFromResult({ rateLimits: {} }, AT), { at: AT.toISOString(), ok: false, error: 'no rate limits in the reply' });
});
