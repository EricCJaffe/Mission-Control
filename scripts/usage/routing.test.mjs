import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageJson, routingLine, routeScoreLine, stallLine } from './routing.mjs';
import { planStatus } from './forecast.mjs';

const now = new Date('2026-10-18T18:00:00Z');
const iso = (h) => new Date(now.getTime() + h * 3600000).toISOString();

test('usage json carries used, projected-at-reset, reset and reading age per plan', () => {
  const claude = { slug: 'claude-max', name: 'Claude Max (main)', limit_kind: 'tokens', limit_value: null, reset_cadence: 'weekly' };
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 325000000, limit_is_estimate: true, reset_cadence: 'weekly' };
  const s1 = planStatus(claude, [{ source: 'manual', day: '2026-10-18', primary_used_pct: 51, primary_window_minutes: 10080, primary_resets_at: iso(53), meter_at: iso(-0.3), captured_at: iso(0) }], now);
  const s2 = planStatus(lot, [], now);
  const cap = { max_weekly_tokens_baseline: 5.2e9, job_size_tokens: { S: 5e7 }, plans: { 'claude-max': { weight: 1, overflow_target: true }, 'claude-4lot': { weight: 0.0625, overflow_target: true, small_jobs_only: true } } };
  const j = usageJson([s1, s2], now, { plans: [claude, lot], capacity: cap });
  assert.equal(j.version, 2);
  assert.equal(j.max_weekly_tokens_baseline, 5.2e9);
  assert.deepEqual([j.plans['claude-4lot'].limit_tokens, j.plans['claude-4lot'].capacity_weight, j.plans['claude-4lot'].small_jobs_only], [325000000, 0.0625, true]);
  const m = j.plans['claude-max'];
  assert.equal(m.used_pct, 51);
  assert.equal(m.reset_at, iso(53));
  assert.ok(m.projected_at_reset_pct > 51 && m.projected_at_reset_pct < 100, String(m.projected_at_reset_pct));
  assert.equal(m.reading_age_h, 0.3);
  assert.equal(m.no_cap, false);
  assert.deepEqual([j.plans['claude-4lot'].no_cap, j.plans['claude-4lot'].used_pct, j.plans['claude-4lot'].idle], [false, 0, true]);
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

test('an idle token-budget plan (4lot with an estimated cap) reports 0% used, not unknown', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 325000000, limit_is_estimate: true, reset_cadence: 'weekly', reset_anchor: null };
  const s = planStatus(lot, [], now);
  assert.equal(s.status, 'grey');
  assert.equal(s.pct, 0);
  assert.equal(usageJson([s], now).plans['claude-4lot'].used_pct, 0);
});

test('an idle-48h plan keeps what it already used this window (exhausted 4lot is not empty)', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 325000000, limit_is_estimate: true, reset_cadence: 'weekly', reset_anchor: null };
  const old = iso(-72);
  const s = planStatus(lot, [{ source: 'log', day: old.slice(0, 10), tokens_total: 350000000, last_at: old, captured_at: old }], now);
  assert.equal(s.idle, true);
  assert.ok(s.pct > 100, String(s.pct));
  const j = usageJson([s], now).plans['claude-4lot'];
  assert.ok(j.used_pct > 100);
  assert.ok(j.reading_age_h >= 71, String(j.reading_age_h));
});

test('a log-derived reading carries the newest log time, not now', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 325000000, reset_cadence: 'weekly', reset_anchor: null };
  const at = iso(-10);
  const s = planStatus(lot, [{ source: 'log', day: at.slice(0, 10), tokens_total: 30000000, last_at: at, captured_at: iso(-1) }], now);
  assert.equal(usageJson([s], now).plans['claude-4lot'].reading_age_h, 10);
});

test('routing line: order by time, not file order; JSON null lines are skipped', () => {
  const log = [
    JSON.stringify({ at: iso(-1), action: 'dispatch', plan: 'claude-max', note: 'a' }),
    'null',
    JSON.stringify({ at: iso(-3), action: 'hold', note: 'a', reason_short: 'main >= 90%' }),
  ].join('\n');
  assert.equal(routingLine(log, now), 'routing (24h): 1 job to main. Log: runs/dispatch-routing.jsonl');
});

test('weekly route score: first-try per plan/tier, economy under 80% flagged to move up, escalations counted', () => {
  const o = (h, plan, tier, ok, extra = {}) => JSON.stringify({ at: iso(-h), action: 'outcome', plan, tier, first_try: ok, ...extra });
  const log = [
    o(1, 'claude-max', 'strong', true), o(2, 'claude-max', 'strong', true), o(3, 'claude-max', 'strong', false),
    ...[1, 2, 3, 4, 5].map((h) => o(h, 'claude-4lot', 'economy', h <= 3)),
    o(4, 'claude-max', 'strong', true, { backfill: true }),
    o(24 * 8, 'claude-max', 'economy', false),
    JSON.stringify({ at: iso(-2), action: 'escalate', note: 'x' }),
    JSON.stringify({ at: iso(-1), action: 'needs-eric', note: 'y' }),
  ].join('\n');
  assert.equal(routeScoreLine(log, now), 'routes (7d, first-try): 4lot/economy 3/5 (60%, below 80%: moves up a tier) · main/strong 2/3 (67%) · 1 escalated · 1 needs Eric');
  assert.equal(routeScoreLine('', now), '');
});

test('an exhausted plan stays exhausted after 48h without logs (stale manual reading until its reset)', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 325000000, limit_is_estimate: true, reset_cadence: 'weekly', reset_anchor: null };
  const s = planStatus(lot, [{ source: 'manual', day: iso(-60).slice(0, 10), primary_used_pct: 100, primary_window_minutes: 10080, primary_resets_at: iso(40), meter_at: iso(-60), captured_at: iso(-60) }], now);
  assert.deepEqual([s.pct, s.exhausted, s.status], [100, true, 'red']);
  const j = usageJson([s], now).plans['claude-4lot'];
  assert.deepEqual([j.used_pct, j.runout_before_reset, j.projected_at_reset_pct], [100, true, 100]);
});

test('route score counts each escalated note once', () => {
  const e = JSON.stringify({ at: iso(-1), action: 'escalate', note: 'x' });
  assert.equal(routeScoreLine([e, e].join('\n'), now), 'routes (7d, first-try): 1 escalated');
});

test('stall line: notes auto-start gave up on in 24h; a later dispatch clears it', () => {
  const log = [
    { at: iso(-30), action: 'give-up', label: 'old', note: 'channel/to-old/a.md', reason_short: 'prompted 2x today' },
    { at: iso(-5), action: 'give-up', label: 'fsaos', note: 'channel/to-fsaos/2026-10-18-fsaos-brain-replan.md', reason_short: 'prompted 2x today' },
    { at: iso(-4), action: 'give-up', label: 'honeylakeos', note: 'channel/to-honeylakeos/b.md', reason_short: 'prompted 2x today' },
    { at: iso(-1), action: 'dispatch', ok: true, label: 'honeylakeos', note: 'channel/to-honeylakeos/b.md', plan: 'claude-max' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n';
  assert.equal(stallLine(log, now), 'auto-start stalled (24h): fsaos 2026-10-18-fsaos-brain-replan.md (prompted 2x today); grok-inbox escalates. Log: runs/dispatch-routing.jsonl');
  assert.equal(stallLine('', now), '');
  const failed = log + JSON.stringify({ at: iso(-0.5), action: 'dispatch', ok: false, label: 'fsaos', note: 'channel/to-fsaos/2026-10-18-fsaos-brain-replan.md' }) + '\n';
  assert.match(stallLine(failed, now), /fsaos 2026-10-18-fsaos-brain-replan\.md/); // a failed launch does not clear it
  // The routing line ignores give-ups.
  assert.equal(routingLine(log, now), 'routing (24h): 1 job to main. Log: runs/dispatch-routing.jsonl');
});

test('forecast: the Claude /usage meter row is the reading for a token plan, labeled', () => {
  const claude = { slug: 'claude-max', name: 'Claude Max (main)', limit_kind: 'tokens', limit_value: null, reset_cadence: 'weekly' };
  const meter = { source: 'log', bot: 'claude-usage', day: '2026-10-18', primary_used_pct: 3, primary_window_minutes: 300, secondary_used_pct: 51, secondary_window_minutes: 10080, secondary_resets_at: iso(52), meter_at: iso(-1), captured_at: iso(0) };
  const s = planStatus(claude, [meter], now);
  assert.equal(s.pct, 51);
  assert.match(s.line, /Claude \/usage meter/);
  const manual = { source: 'manual', day: '2026-10-18', primary_used_pct: 60, primary_window_minutes: 10080, primary_resets_at: iso(52), meter_at: iso(-0.5), captured_at: iso(0) };
  assert.equal(planStatus(claude, [meter, manual], now).pct, 60);
  assert.equal(planStatus(claude, [meter, { ...manual, meter_at: iso(-3) }], now).pct, 51);
});

test('forecast: 4lot meter beats its token estimate; a 13h-old meter falls back to the estimate', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 1000, limit_is_estimate: true, reset_cadence: 'weekly' };
  const tok = { source: 'log', bot: 'claude-code', day: '2026-10-18', tokens_total: 500, last_at: iso(-1), captured_at: iso(0) };
  const meter = { source: 'log', bot: 'claude-usage', day: '2026-10-18', secondary_used_pct: 2, secondary_window_minutes: 10080, secondary_resets_at: iso(130), meter_at: iso(-1), captured_at: iso(0) };
  const s = planStatus(lot, [tok, meter], now);
  assert.equal(s.pct, 2);
  assert.match(s.line, /Claude \/usage meter/);
  const old = planStatus(lot, [tok, { ...meter, meter_at: iso(-13) }], now);
  assert.notEqual(old.pct, 2);
  assert.match(old.line, /estimate/);
});

test('forecast: a stale meter never hides an exhausted manual reading on an idle plan; an old meter also holds', () => {
  const lot = { slug: 'claude-4lot', name: 'Claude Team (4lot)', limit_kind: 'tokens', limit_value: 1000, limit_is_estimate: true, reset_cadence: 'weekly' };
  const tok = { source: 'log', bot: 'claude-code', day: '2026-10-15', tokens_total: 100, last_at: iso(-72), captured_at: iso(0) };
  const manual = { source: 'manual', day: '2026-10-17', primary_used_pct: 100, primary_window_minutes: 10080, primary_resets_at: iso(60), meter_at: iso(-60), captured_at: iso(0) };
  const meter = { source: 'log', bot: 'claude-usage', day: '2026-10-18', secondary_used_pct: 10, secondary_window_minutes: 10080, secondary_resets_at: iso(60), meter_at: iso(-13), captured_at: iso(0) };
  const base = planStatus(lot, [tok, manual], now);
  assert.equal(base.pct, 100);
  const s = planStatus(lot, [tok, manual, meter], now);
  assert.equal(s.pct, 100);
  assert.equal(s.status, 'red');
  assert.equal(s.exhausted, true);
  const held = planStatus(lot, [tok, { ...meter, secondary_used_pct: 95, meter_at: iso(-50) }], now);
  assert.equal(held.idle, true);
  assert.equal(held.pct, 95);
});
