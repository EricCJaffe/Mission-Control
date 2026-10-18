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

test('a reading whose reset has passed is not current', () => {
  const s = planStatus(codex, [{ source: 'log', day: '2026-10-18', last_at: iso(-2), captured_at: iso(-2), secondary_used_pct: 95, secondary_window_minutes: 10080, secondary_resets_at: iso(-1) }], now);
  assert.equal(s.status, 'grey');
});

test('rolling Claude budget at 100% alerts', () => {
  const s = planStatus(claude, [{ source: 'log', day: '2026-10-17', last_at: iso(-10), captured_at: iso(0), tokens_total: 1200 }], now);
  assert.equal(s.status, 'red');
  assert.equal(s.runsOutBeforeReset, true);
});

test('meter_at, not later token activity, decides which reading is current', () => {
  const rows = [
    { source: 'log', day: '2026-10-18', meter_at: iso(-30), last_at: iso(-1), captured_at: iso(0), secondary_used_pct: 95, secondary_window_minutes: 10080, secondary_resets_at: iso(-2) },
    { source: 'log', day: '2026-10-18', meter_at: iso(-1.5), last_at: iso(-1.5), captured_at: iso(0), secondary_used_pct: 2, secondary_window_minutes: 10080, secondary_resets_at: iso(160) },
  ];
  const s = planStatus(codex, rows, now);
  assert.equal(s.pct, 2);
  assert.equal(s.status, 'green');
});

test('a lone 5h meter does not stand for a weekly plan', () => {
  const s = planStatus(codex, [{ source: 'log', day: '2026-10-18', meter_at: iso(-1), last_at: iso(-1), captured_at: iso(0), primary_used_pct: 99, primary_window_minutes: 300, primary_resets_at: iso(2) }], now);
  assert.equal(s.status, 'grey');
});

test('run-out is projected from the reading time, not now', () => {
  // 40% at 2.5 days into the week, viewed 1.5 days later: pace says run-out at day 6.25 → before reset (day 7).
  const s = planStatus(codex, [{ source: 'log', day: '2026-10-18', meter_at: iso(-36), last_at: iso(-36), captured_at: iso(0), secondary_used_pct: 40, secondary_window_minutes: 10080, secondary_resets_at: iso(72) }], now);
  assert.equal(s.runsOutBeforeReset, true);
});

test('manual readings: re-upload does not refresh them; a 5h manual reading does not override the weekly meter', () => {
  const r17 = { source: 'manual', day: '2026-10-17', meter_at: '2026-10-17T16:00:00Z', captured_at: iso(0), primary_used_pct: 50, primary_window_minutes: 10080, primary_resets_at: '2026-10-21T16:00:00Z' };
  assert.equal(planStatus(grok, [r17], now).runsOutBeforeReset, true);
  const s = planStatus(codex, [
    { source: 'manual', day: '2026-10-18', meter_at: iso(-1), captured_at: iso(0), primary_used_pct: 99, primary_window_minutes: 300, primary_resets_at: iso(3) },
    { source: 'log', day: '2026-10-18', meter_at: iso(-1), last_at: iso(-1), captured_at: iso(0), secondary_used_pct: 2, secondary_window_minutes: 10080, secondary_resets_at: iso(160) },
  ], now);
  assert.equal(s.pct, 2);
});

test('a 60-hour-old manual reading does not override a fresh meter; noon ET follows DST', async () => {
  const s = planStatus(codex, [
    { source: 'manual', day: '2026-10-16', meter_at: iso(-60), captured_at: iso(0), primary_used_pct: 95, primary_window_minutes: 10080, primary_resets_at: iso(100) },
    { source: 'log', day: '2026-10-18', meter_at: iso(-1), last_at: iso(-1), captured_at: iso(0), secondary_used_pct: 2, secondary_window_minutes: 10080, secondary_resets_at: iso(160) },
  ], now);
  assert.equal(s.pct, 2);
  const { etNoon } = await import('./rows.mjs');
  assert.equal(etNoon('2026-10-18'), '2026-10-18T16:00:00.000Z');
  assert.equal(etNoon('2026-12-15'), '2026-12-15T17:00:00.000Z');
});

test('a token plan with no cap is neutral grey, never red, until a % reading arrives', () => {
  const nocap = { ...claude, limit_value: null };
  const s = planStatus(nocap, [{ source: 'log', day: '2026-10-17', last_at: iso(-10), captured_at: iso(0), tokens_total: 9e9 }], now);
  assert.equal(s.status, 'grey');
  assert.match(s.line, /NO CAP KNOWN/);
  const m = planStatus(nocap, [{ source: 'manual', day: '2026-10-18', meter_at: iso(-1), captured_at: iso(0), primary_used_pct: 30, primary_window_minutes: 10080, primary_resets_at: iso(100) }], now);
  assert.equal(m.pct, 30);
});
