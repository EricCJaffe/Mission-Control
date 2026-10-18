import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageJson, routingLine } from './routing.mjs';
import { planStatus } from './forecast.mjs';

const now = new Date('2026-10-18T18:00:00Z');
const iso = (h) => new Date(now.getTime() + h * 3600000).toISOString();

test('usage json carries used, projected-at-reset, reset and reading age per plan', () => {
  const claude = { slug: 'claude-max', name: 'Claude Max (main)', limit_kind: 'tokens', limit_value: null, reset_cadence: 'weekly' };
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: null, reset_cadence: 'weekly' };
  const s1 = planStatus(claude, [{ source: 'manual', day: '2026-10-18', primary_used_pct: 51, primary_window_minutes: 10080, primary_resets_at: iso(53), meter_at: iso(-0.3), captured_at: iso(0) }], now);
  const s2 = planStatus(lot, [], now);
  const j = usageJson([s1, s2], now);
  assert.equal(j.version, 1);
  const m = j.plans['claude-max'];
  assert.equal(m.used_pct, 51);
  assert.equal(m.reset_at, iso(53));
  assert.ok(m.projected_at_reset_pct > 51 && m.projected_at_reset_pct < 100, String(m.projected_at_reset_pct));
  assert.equal(m.reading_age_h, 0.3);
  assert.equal(m.no_cap, false);
  assert.deepEqual([j.plans['claude-4lot'].no_cap, j.plans['claude-4lot'].used_pct], [true, null]);
});

test('routing line: latest decision per note in the last 24h', () => {
  const log = [
    { at: iso(-30), action: 'dispatch', plan: 'claude-4lot', note: 'old' },
    { at: iso(-5), action: 'dispatch', plan: 'claude-4lot', note: 'a', reason_short: 'main at 72%' },
    { at: iso(-4), action: 'dispatch', plan: 'claude-4lot', note: 'b', reason_short: 'main at 72%' },
    { at: iso(-3), action: 'dispatch', plan: 'claude-max', note: 'c' },
    { at: iso(-2), action: 'hold', note: 'd', reason_short: 'main >= 90%' },
    { at: iso(-1), action: 'plan', note: 'e' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n';
  assert.equal(routingLine(log, now), 'routing (24h): 2 jobs to 4lot (main at 72%); 1 job to main; 1 held (main >= 90%). Log: runs/dispatch-routing.jsonl');
  assert.equal(routingLine('', now), '');
});
