import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStatus } from './forecast.mjs';

const now = new Date('2026-10-18T16:00:00Z');
const codex = { slug: 'chatgpt-codex', name: 'Codex', limit_kind: 'percent', limit_value: 100, reset_cadence: 'weekly' };
const claude = { slug: 'claude-max', name: 'Claude Max', limit_kind: 'tokens', limit_value: 1000, limit_is_estimate: true, reset_cadence: 'weekly', reset_anchor: null };
const grok = { slug: 'grok-ultra', name: 'Grok', limit_kind: 'percent', limit_value: 100, reset_cadence: 'weekly' };
const iso = (h) => new Date(now.getTime() + h * 3600000).toISOString();

test('Codex weekly meter: on pace is green', () => {
  // Window started 3.5 days ago, 30% used, resets in 3.5 days → ~60-70% at reset.
  const s = planStatus(codex, [{ source: 'log', day: '2026-10-18', last_at: iso(-1), captured_at: iso(0), secondary_used_pct: 30, secondary_window_minutes: 10080, secondary_resets_at: iso(84) }], now);
  assert.equal(s.status, 'green');
  assert.equal(s.runsOutBeforeReset, false);
});

test('Codex burning fast is red with a run-out before reset', () => {
  const s = planStatus(codex, [{ source: 'log', day: '2026-10-18', last_at: iso(-1), captured_at: iso(0), secondary_used_pct: 80, secondary_window_minutes: 10080, secondary_resets_at: iso(120) }], now);
  assert.equal(s.status, 'red');
  assert.equal(s.runsOutBeforeReset, true);
  assert.match(s.line, /before reset/);
});

test('stale or missing readings are grey; Grok names the owed manual entry', () => {
  assert.equal(planStatus(codex, [{ source: 'log', day: '2026-10-10', last_at: iso(-200), captured_at: iso(-200), secondary_used_pct: 10, secondary_resets_at: iso(10) }], now).status, 'grey');
  const g = planStatus(grok, [], now);
  assert.equal(g.status, 'grey');
  assert.match(g.line, /Chief of Staff/);
});

test('Grok manual reading drives the status', () => {
  const s = planStatus(grok, [{ source: 'manual', day: '2026-10-18', captured_at: iso(0), primary_used_pct: 72, primary_window_minutes: 10080, primary_resets_at: iso(100) }], now);
  assert.equal(s.status, 'red'); // 72% after ~2.8 days of a 7-day window → runs out before reset
  assert.equal(s.pct, 72);
});

test('Claude token budget is an estimate over a rolling week', () => {
  const s = planStatus(claude, [{ source: 'log', day: '2026-10-17', last_at: iso(-10), captured_at: iso(0), tokens_total: 500 }], now);
  assert.equal(s.pct, 50);
  assert.match(s.line, /estimate/);
  assert.equal(s.status, 'green');
});
