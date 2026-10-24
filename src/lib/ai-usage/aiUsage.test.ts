/*
 * AI usage meter: forecast, red/yellow/green, percent shares, suggestions,
 * CSV. Synthetic fixtures only; no real session ids or paths.
 *
 *   node --test src/lib/ai-usage/*.test.ts
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildUsageCsv, csvCell, isMonth, monthRange } from './csv.ts';
import { isMeterRow, observedAt, planLabel, planStatus, rag, isEarly, type PlanStatus } from './forecast.ts';
import { parseManual } from './manual.ts';
import { projectShares, shareBy } from './shares.ts';
import { suggestions } from './suggestions.ts';
import type { AiPlan, AiUsageSnapshot } from './types.ts';
import { etMidnight, resetWindow } from './window.ts';

// Wednesday 2026-10-14, noon ET (EDT, UTC-4).
const NOW = new Date('2026-10-14T16:00:00Z');

const plan = (over: Partial<AiPlan>): AiPlan => ({
  id: 'p',
  user_id: 'u',
  slug: 'claude-max',
  name: 'Claude Max',
  vendor: 'Anthropic',
  price_usd_month: 200,
  limit_kind: 'tokens',
  limit_value: 1000,
  limit_is_estimate: true,
  reset_cadence: 'weekly',
  reset_anchor: null,
  active: true,
  notes: null,
  ...over,
});

let seq = 0;
const row = (over: Partial<AiUsageSnapshot>): AiUsageSnapshot => ({
  id: ++seq,
  user_id: 'u',
  plan_slug: 'claude-max',
  source: 'log',
  day: '2026-10-14',
  host: 'host-a',
  bot: 'claude-code',
  session_id: `s${seq}`,
  project: 'alpha',
  client: null,
  model: null,
  messages: 1,
  tokens_in: 0,
  tokens_out: 0,
  tokens_cache_read: 0,
  tokens_cache_write: 0,
  tokens_total: 0,
  primary_used_pct: null,
  primary_window_minutes: null,
  primary_resets_at: null,
  secondary_used_pct: null,
  secondary_window_minutes: null,
  secondary_resets_at: null,
  used_value: null,
  limit_value: null,
  unit: null,
  note: null,
  first_at: null,
  meter_at: null,
  last_at: '2026-10-14T15:00:00Z',
  captured_at: '2026-10-14T15:00:00Z',
  ...over,
});

// ---------------------------------------------------------------- window

test('etMidnight handles both sides of DST', () => {
  assert.equal(etMidnight('2026-10-14').toISOString(), '2026-10-14T04:00:00.000Z');
  assert.equal(etMidnight('2026-12-01').toISOString(), '2026-12-01T05:00:00.000Z');
  // Fall-back day (Nov 1 2026): midnight is still EDT.
  assert.equal(etMidnight('2026-11-01').toISOString(), '2026-11-01T04:00:00.000Z');
});

test('weekly calendar window runs Monday to Monday ET', () => {
  const w = resetWindow({ reset_cadence: 'weekly', reset_anchor: null }, NOW);
  assert.equal(w.source, 'calendar');
  assert.equal(w.startDay, '2026-10-12');
  assert.equal(w.resetAt.toISOString(), '2026-10-19T04:00:00.000Z');
});

test('vendor reset wins while in the future, anchor steps forward otherwise', () => {
  const v = resetWindow({ reset_cadence: 'weekly', reset_anchor: null }, NOW, '2026-10-15T20:00:00Z');
  assert.equal(v.source, 'vendor');
  assert.equal(v.startDay, '2026-10-08');
  const past = resetWindow({ reset_cadence: 'weekly', reset_anchor: '2026-09-03T20:00:00Z' }, NOW, '2026-10-01T00:00:00Z');
  assert.equal(past.source, 'anchor');
  assert.equal(past.resetAt.toISOString(), '2026-10-15T20:00:00.000Z');
  const monthly = resetWindow({ reset_cadence: 'monthly', reset_anchor: '2026-01-20T00:00:00Z' }, NOW);
  assert.equal(monthly.resetAt.toISOString(), '2026-10-20T00:00:00.000Z');
  assert.equal(monthly.startAt.toISOString(), '2026-09-20T00:00:00.000Z');
});

// ---------------------------------------------------------------- rag

test('isEarly: first day or 15% of a weekly window', () => {
  const H = 3_600_000, W = 7 * 24 * H;
  assert.equal(isEarly(5 * H, W), true);
  assert.equal(isEarly(24 * H, W), true); // 24h < 15% of a week (25.2h)
  assert.equal(isEarly(30 * H, W), false);
  assert.equal(isEarly(1 * H, 5 * H), true);
  assert.equal(isEarly(3 * H, 5 * H), false);
});

test('rag thresholds', () => {
  const reset = new Date('2026-10-19T04:00:00Z');
  const later = new Date('2026-10-25T00:00:00Z');
  assert.equal(rag({ usedPct: 50, runOutAt: later, resetAt: reset, stale: false }), 'green');
  assert.equal(rag({ usedPct: 50, runOutAt: null, resetAt: reset, stale: false }), 'green');
  assert.equal(rag({ usedPct: 70, runOutAt: later, resetAt: reset, stale: false }), 'yellow');
  assert.equal(rag({ usedPct: 90, runOutAt: later, resetAt: reset, stale: false }), 'red');
  // Run-out before reset is red only from the 25% floor; under it, yellow.
  assert.equal(rag({ usedPct: 30, runOutAt: new Date('2026-10-18T00:00:00Z'), resetAt: reset, stale: false }), 'red');
  assert.equal(rag({ usedPct: 10, runOutAt: new Date('2026-10-18T00:00:00Z'), resetAt: reset, stale: false }), 'yellow');
  // Early in a window: never red below 80%, whatever the projection says.
  assert.equal(rag({ usedPct: 4, runOutAt: new Date('2026-10-18T00:00:00Z'), resetAt: reset, stale: false, early: true }), 'green');
  assert.equal(rag({ usedPct: 85, runOutAt: null, resetAt: reset, stale: false, early: true }), 'red');
  assert.equal(rag({ usedPct: 10, runOutAt: new Date('2026-10-19T20:00:00Z'), resetAt: reset, stale: false }), 'yellow');
  assert.equal(rag({ usedPct: 95, runOutAt: null, resetAt: reset, stale: true }), 'none');
  assert.equal(rag({ usedPct: null, runOutAt: null, resetAt: reset, stale: false }), 'none');
});

// ---------------------------------------------------------------- forecast

test('token plan: window sum over estimate limit, burn from the last 7 days', () => {
  const rows = [
    row({ day: '2026-10-11', tokens_total: 700 }), // Sunday: previous window, still in 7-day burn
    row({ day: '2026-10-12', tokens_total: 100 }),
    row({ day: '2026-10-14', tokens_total: 200 }),
    row({ day: '2026-10-14', plan_slug: 'chatgpt-codex', tokens_total: 9999 }),
  ];
  const s = planStatus(plan({}), rows, NOW);
  assert.equal(s.basis, 'tokens');
  assert.equal(s.tokensInWindow, 300);
  assert.equal(s.usedPct, 30);
  assert.equal(s.isEstimate, true);
  assert.ok(Math.abs(s.burnPctPerDay! - 100 / 7) < 1e-9); // 1000 tokens / 7 days of a 1000 limit
  // 70% left at ~14.3%/day ≈ 4.9 days → Oct 19 ~ after Monday reset: yellow at most.
  assert.ok(s.runOutAt && s.runOutAt.getTime() > s.window.resetAt.getTime());
  assert.equal(s.rag, 'yellow');
});

test('token plan: a fresh manual percent reading overrides the estimate', () => {
  const rows = [
    row({ tokens_total: 900 }),
    row({ source: 'manual', host: 'manual', bot: 'manual-form', session_id: '', primary_used_pct: 20, captured_at: '2026-10-14T14:00:00Z' }),
  ];
  const s = planStatus(plan({}), rows, NOW);
  assert.equal(s.basis, 'percent');
  assert.equal(s.usedPct, 20);
  assert.equal(s.isEstimate, false);
});

test('token plan: the Claude /usage meter (claude-usage log row) overrides the estimate; a newer manual wins', () => {
  const meter = row({ bot: 'claude-usage', session_id: 'meter', project: 'unattributed', messages: 0, last_at: null,
    primary_used_pct: 3, primary_window_minutes: 300, secondary_used_pct: 51, secondary_window_minutes: 10080,
    secondary_resets_at: '2026-10-20T22:59:00Z', meter_at: '2026-10-14T15:07:00Z' });
  const s = planStatus(plan({ limit_value: null }), [row({ tokens_total: 900 }), meter], NOW);
  assert.equal(s.basis, 'percent');
  assert.equal(s.usedPct, 51);
  assert.equal(s.window.source, 'vendor');
  assert.equal(s.lastSource, 'log');
  const manual = row({ source: 'manual', host: 'manual', bot: 'manual-form', session_id: '', primary_used_pct: 60, meter_at: '2026-10-14T15:30:00Z' });
  assert.equal(planStatus(plan({ limit_value: null }), [meter, manual], NOW).usedPct, 60);
  const older = row({ source: 'manual', host: 'manual', bot: 'manual-form', session_id: '', primary_used_pct: 40, meter_at: '2026-10-14T13:00:00Z' });
  assert.equal(planStatus(plan({ limit_value: null }), [meter, older], NOW).usedPct, 51);
  // A meter older than METER_STALE_HOURS (recorder failing) falls back to the estimate.
  const staleMeter = { ...meter, id: ++seq, meter_at: '2026-10-14T02:00:00Z' };
  const fb = planStatus(plan({}), [row({ tokens_total: 200 }), staleMeter], NOW);
  assert.equal(fb.basis, 'tokens');
  assert.equal(fb.usedPct, 20);
  // ...and a stale meter never hides an older manual reading that is still valid.
  const manual20h = row({ source: 'manual', host: 'manual', bot: 'manual-form', session_id: '', primary_used_pct: 45, meter_at: '2026-10-13T20:00:00Z' });
  const kept = planStatus(plan({ limit_value: null }), [manual20h, staleMeter], NOW);
  assert.equal(kept.basis, 'percent');
  assert.equal(kept.usedPct, 45);
  // A 5h-only meter row says nothing about the week: the token estimate stands.
  const fiveH = row({ bot: 'claude-usage', session_id: 'meter', primary_used_pct: 80, primary_window_minutes: 300, meter_at: '2026-10-14T15:07:00Z' });
  assert.equal(planStatus(plan({}), [row({ tokens_total: 200 }), fiveH], NOW).basis, 'tokens');
});

test('percent plan (Codex): uses the weekly secondary reading and its reset', () => {
  const codex = plan({ slug: 'chatgpt-codex', name: 'Codex', limit_kind: 'percent', limit_value: 100, limit_is_estimate: false });
  const rows = [
    row({ plan_slug: 'chatgpt-codex', primary_used_pct: 99, secondary_used_pct: 40, secondary_resets_at: '2026-10-15T20:00:00Z', last_at: '2026-10-14T10:00:00Z' }),
    row({ plan_slug: 'chatgpt-codex', primary_used_pct: 5, secondary_used_pct: 92, secondary_resets_at: '2026-10-15T20:00:00Z', last_at: '2026-10-14T15:30:00Z' }),
  ];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.usedPct, 92);
  assert.equal(s.window.source, 'vendor');
  assert.equal(s.rag, 'red');
});

test('percent plan: a reading whose own reset has passed is gray, not current', () => {
  const grok = plan({ slug: 'grok-ultra', name: 'Grok', limit_kind: 'percent', limit_value: 100 });
  const rows = [row({ plan_slug: 'grok-ultra', source: 'manual', primary_used_pct: 80, primary_resets_at: '2026-10-13T00:00:00Z', captured_at: '2026-10-13T12:00:00Z' })];
  const s = planStatus(grok, rows, NOW);
  assert.equal(s.usedPct, null);
  assert.equal(s.note, 'reset-since-reading');
  assert.equal(s.rag, 'none');
});

test('an expired 95% reading is gray, never red', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const rows = [row({ plan_slug: 'chatgpt-codex', secondary_used_pct: 95, secondary_resets_at: '2026-10-14T12:00:00Z', meter_at: '2026-10-14T11:00:00Z' })];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.rag, 'none');
  assert.equal(s.note, 'reset-since-reading');
  assert.ok(suggestions([s], {}, NOW)[0].text.includes('reset since last reading'));
});

test('no reading in 48h is "none", not green', () => {
  const rows = [row({ tokens_total: 1, last_at: '2026-10-11T00:00:00Z', captured_at: '2026-10-11T00:00:00Z', day: '2026-10-10' })];
  const s = planStatus(plan({}), rows, NOW);
  assert.equal(s.rag, 'none');
  assert.ok(s.hoursSinceReading! > 48);
  assert.equal(planStatus(plan({}), [], NOW).rag, 'none');
});

// ---------------------------------------------------------------- shares

test('project shares are percent of the plan, unattributed always present and last', () => {
  const rows = [
    row({ project: 'alpha', client: 'Client A', tokens_total: 600, session_id: 'x' }),
    row({ project: 'alpha', tokens_total: 200, session_id: 'x' }),
    row({ project: 'unattributed', tokens_total: 100 }),
    row({ project: 'beta', tokens_total: 100 }),
  ];
  const shares = projectShares(rows);
  assert.deepEqual(shares.map((s) => s.key), ['alpha', 'beta', 'unattributed']);
  assert.equal(shares[0].percent, 80);
  assert.equal(shares[0].client, 'Client A');
  assert.equal(shares[0].sessions, 1);
  assert.equal(shares[2].percent, 10);
  const total = shares.reduce((s, x) => s + x.percent, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('unattributed row exists at zero, and empty plans do not divide by zero', () => {
  const shares = projectShares([row({ project: 'alpha', tokens_total: 5 })]);
  assert.equal(shares.at(-1)!.key, 'unattributed');
  assert.equal(shares.at(-1)!.percent, 0);
  assert.deepEqual(projectShares([]).map((s) => [s.key, s.percent]), [['unattributed', 0]]);
});

test('shareBy session ids are scoped per host', () => {
  const rows = [row({ host: 'a', session_id: 'same', tokens_total: 1 }), row({ host: 'b', session_id: 'same', tokens_total: 1 })];
  assert.equal(shareBy(rows, 'bot')[0].sessions, 2);
});

// ---------------------------------------------------------------- suggestions

const status = (over: Partial<PlanStatus>): PlanStatus => ({
  slug: 'claude-max',
  name: 'Claude Max',
  basis: 'tokens',
  usedPct: 10,
  isEstimate: false,
  tokensInWindow: 0,
  limitTokens: null,
  burnPctPerDay: 1,
  tokensPerDay7: 0,
  runOutAt: null,
  window: resetWindow({ reset_cadence: 'weekly', reset_anchor: null }, NOW, '2026-10-15T20:00:00Z'),
  rag: 'green',
  lastReadingAt: NOW,
  hoursSinceReading: 1,
  lastSource: 'log',
  note: null,
  ...over,
});

test('suggestions: strained Codex moves reviews to a green Claude', () => {
  const out = suggestions(
    [status({ slug: 'chatgpt-codex', name: 'Codex', usedPct: 92, rag: 'red', basis: 'percent' }), status({})],
    {},
    NOW,
  );
  assert.equal(out[0].tone, 'red');
  assert.equal(out[0].text, 'Codex weekly at 92%, resets Thu: move reviews to Claude main until then');
});

test('suggestions: heavy project on a strained plan, missing Grok reading, high unattributed', () => {
  const out = suggestions(
    [
      status({ usedPct: 75, rag: 'yellow' }),
      status({ slug: 'grok-ultra', name: 'Grok', rag: 'none', hoursSinceReading: 50, lastSource: 'manual' }),
      status({ slug: 'chatgpt-codex', name: 'Codex', usedPct: 75, rag: 'yellow' }),
    ],
    {
      'claude-max': [
        { key: 'fsaos', client: null, tokens: 48, percent: 48, sessions: 3, messages: 9 },
        { key: 'unattributed', client: null, tokens: 30, percent: 30, sessions: 1, messages: 1 },
      ],
    },
    NOW,
  );
  const texts = out.map((s) => s.text);
  assert.ok(texts.includes('fsaos is 48% of Claude main this window: pause low-value fsaos sessions'));
  // The Grok reader landed 2026-10-24: a missing Grok reading is flagged again.
  assert.ok(texts.includes('Grok reading missing for 2 days: add a reading'));
  assert.ok(texts.some((t) => t.startsWith('30% of Claude main is unattributed')));
  // No 4lot plan in this set, so Claude main is told to pause, not to move.
  assert.ok(texts.some((t) => t.startsWith('Claude main weekly at 75%') && t.endsWith('pause low-value sessions until then')));
  assert.ok(!texts.some((t) => t.includes('unattributed is')));
});

test('suggestions: all green says nothing', () => {
  assert.deepEqual(suggestions([status({})], {}, NOW), []);
});

// ---------------------------------------------------------------- csv

test('csv: month helpers', () => {
  assert.ok(isMonth('2026-10'));
  assert.ok(!isMonth('2026-13'));
  assert.ok(!isMonth('2026-1'));
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
});

test('csv: one row per plan and project, unattributed per plan, no dollars', () => {
  const rows = [
    row({ day: '2026-10-02', project: 'alpha', client: 'Acme, Inc.', tokens_total: 300, session_id: 'a' }),
    row({ day: '2026-10-03', project: 'unattributed', tokens_total: 100, session_id: 'b' }),
    row({ day: '2026-09-30', project: 'alpha', tokens_total: 9999 }), // previous month, excluded
  ];
  const csv = buildUsageCsv('2026-10', ['claude-max', 'grok-ultra'], rows);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'month,plan,project,client,tokens_total,percent_of_plan,sessions');
  assert.deepEqual(lines.slice(1), [
    '2026-10,claude-max,alpha,"Acme, Inc.",300,75.00,1',
    '2026-10,claude-max,unattributed,,100,25.00,1',
    '2026-10,grok-ultra,unattributed,,0,0.00,0',
  ]);
  assert.ok(!/usd|\$|cost/i.test(lines[0]));
});

test('csv: formula-looking text is neutralized', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(-5), '-5');
});

// ---------------------------------------------------------------- manual form

test('manual: a valid reading becomes a manual-form row keyed per plan per day', () => {
  const r = parseManual(
    { plan: 'grok-ultra', day: '2026-10-14', used_pct: '42', resets_at: '2026-10-16T12:00:00-04:00', note: '  from usage page ' },
    ['grok-ultra'],
    NOW,
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.row.source, 'manual');
  assert.equal(r.row.host, 'manual');
  assert.equal(r.row.bot, 'manual-form');
  assert.equal(r.row.session_id, '');
  assert.equal(r.row.project, 'unattributed');
  assert.equal(r.row.primary_used_pct, 42);
  assert.equal(r.row.primary_resets_at, '2026-10-16T16:00:00.000Z');
  assert.equal(r.row.note, 'from usage page');
});

test('manual: rejects unknown plans, bad days, negative numbers and empty readings', () => {
  const plans = ['grok-ultra'];
  assert.equal(parseManual({ plan: 'nope', day: '2026-10-14', used_pct: 1 }, plans, NOW).ok, false);
  assert.equal(parseManual({ plan: 'grok-ultra', day: '10/14/2026', used_pct: 1 }, plans, NOW).ok, false);
  assert.equal(parseManual({ plan: 'grok-ultra', day: '2026-10-14', used_pct: -1 }, plans, NOW).ok, false);
  assert.equal(parseManual({ plan: 'grok-ultra', day: '2026-10-14' }, plans, NOW).ok, false);
  assert.equal(parseManual({ plan: 'grok-ultra', day: '2026-10-14', used_value: 3, limit_value: 10 }, plans, NOW).ok, true);
  assert.equal(parseManual(null, plans, NOW).ok, false);
});

// ---------------------------------------------------------------- review fixes

test('monthly windows cap the day at month end and count from the anchor', () => {
  const v = resetWindow({ reset_cadence: 'monthly', reset_anchor: null }, new Date('2026-03-10T00:00:00Z'), '2026-03-31T12:00:00Z');
  assert.equal(v.startAt.toISOString(), '2026-02-28T12:00:00.000Z');
  const a = resetWindow({ reset_cadence: 'monthly', reset_anchor: '2026-01-31T12:00:00Z' }, new Date('2026-03-15T00:00:00Z'));
  assert.equal(a.resetAt.toISOString(), '2026-03-31T12:00:00.000Z');
  assert.equal(a.startAt.toISOString(), '2026-02-28T12:00:00.000Z');
});

test('weekly anchors stay on ET midnight across DST', () => {
  // Anchor: Monday 2026-09-07 00:00 EDT. In December the reset is Monday 00:00 EST.
  const w = resetWindow({ reset_cadence: 'weekly', reset_anchor: '2026-09-07T04:00:00Z' }, new Date('2026-12-02T17:00:00Z'));
  assert.equal(w.startAt.toISOString(), '2026-11-30T05:00:00.000Z');
  assert.equal(w.startDay, '2026-11-30');
  assert.equal(w.resetAt.toISOString(), '2026-12-07T05:00:00.000Z');
});

test('a lone 5h primary never stands in for a weekly plan', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const rows = [row({ plan_slug: 'chatgpt-codex', primary_used_pct: 30, primary_resets_at: '2026-10-14T19:00:00Z', last_at: '2026-10-14T15:00:00Z' })];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.usedPct, null);
  assert.equal(s.rag, 'none');
  assert.equal(s.window.source, 'calendar');
  assert.equal(s.window.resetAt.toISOString(), '2026-10-19T04:00:00.000Z');
});

test('burn is measured to the reading, not to now', () => {
  const grok = plan({ slug: 'grok-ultra', limit_kind: 'percent', limit_value: 100 });
  // Window starts Mon Oct 12 04:00Z; reading 1.5 days in at 30%; now is 2.5 days in.
  const rows = [row({ plan_slug: 'grok-ultra', source: 'manual', day: '2026-10-13', primary_used_pct: 30, captured_at: '2026-10-13T16:00:00Z' })];
  const s = planStatus(grok, rows, NOW);
  assert.ok(Math.abs(s.burnPctPerDay! - 20) < 1e-9);
});

test('a backdated manual reading is dated to its own day', () => {
  const grok = plan({ slug: 'grok-ultra', limit_kind: 'percent', limit_value: 100 });
  const rows = [row({ plan_slug: 'grok-ultra', source: 'manual', day: '2026-10-09', primary_used_pct: 80, captured_at: '2026-10-14T15:00:00Z' })];
  const s = planStatus(grok, rows, NOW);
  assert.equal(s.usedPct, null); // last week's number, not this window's
  assert.equal(s.rag, 'none'); // and no reading in 48h
});

// ---------------------------------------------------------------- grokbot / Codex review fixes

test('log readings are ordered and aged by meter_at, never captured_at', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const reset = '2026-10-15T20:00:00Z';
  const rows = [
    // Re-imported old history: captured just now, observed four days ago.
    row({ plan_slug: 'chatgpt-codex', secondary_used_pct: 88, secondary_resets_at: reset, meter_at: '2026-10-10T12:00:00Z', last_at: '2026-10-14T15:59:00Z', captured_at: '2026-10-14T15:59:00Z' }),
    row({ plan_slug: 'chatgpt-codex', secondary_used_pct: 20, secondary_resets_at: reset, meter_at: '2026-10-14T09:00:00Z', captured_at: '2026-10-14T09:05:00Z' }),
  ];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.usedPct, 20);
  // Only re-imported history, observed 4 days ago: stale, whatever captured_at says.
  const old = planStatus(codex, [{ ...rows[0], meter_at: '2026-10-10T12:00:00Z', last_at: '2026-10-10T12:00:00Z' }], NOW);
  assert.equal(old.rag, 'none');
  // captured_at alone is not an observation time.
  assert.equal(observedAt({ source: 'log', day: '2026-10-14', meter_at: null, last_at: null, captured_at: '2026-10-14T15:00:00Z' }), null);
});

test('manual readings order by day, then captured_at', () => {
  const grok = plan({ slug: 'grok-ultra', limit_kind: 'percent', limit_value: 100 });
  const m = (day: string, pct: number, captured: string) =>
    row({ plan_slug: 'grok-ultra', source: 'manual', day, primary_used_pct: pct, last_at: null, captured_at: captured });
  // Yesterday's entry typed in after today's: today's still wins.
  const s = planStatus(grok, [m('2026-10-14', 30, '2026-10-14T13:00:00Z'), m('2026-10-13', 25, '2026-10-14T15:00:00Z')], NOW);
  assert.equal(s.usedPct, 30);
  // Same day: the later save wins.
  const t = planStatus(grok, [m('2026-10-14', 30, '2026-10-14T13:00:00Z'), m('2026-10-14', 35, '2026-10-14T14:00:00Z')], NOW);
  assert.equal(t.usedPct, 35);
});

test('run-out is projected from the reading, not from now', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100, reset_cadence: 'weekly' });
  const start = new Date('2026-10-12T04:00:00Z'); // Monday ET, calendar window
  const at = new Date(start.getTime() + 2.5 * 86_400_000);
  const viewed = new Date(at.getTime() + 1.5 * 86_400_000);
  const rows = [row({ plan_slug: 'chatgpt-codex', day: '2026-10-14', secondary_used_pct: 40, meter_at: at.toISOString() })];
  const s = planStatus(codex, rows, viewed);
  assert.equal(s.window.startAt.toISOString(), start.toISOString());
  assert.equal(s.runOutAt!.toISOString(), new Date(start.getTime() + 6.25 * 86_400_000).toISOString());
  assert.equal(s.rag, 'red'); // day 6.25 is before the day-7 reset
});

test('manual: impossible dates and non-numeric types are rejected', () => {
  const plans = ['grok-ultra'];
  const base = { plan: 'grok-ultra', day: '2026-10-14' };
  assert.equal(parseManual({ ...base, day: '2026-02-31', used_pct: 1 }, plans, NOW).ok, false);
  assert.equal(parseManual({ ...base, day: '2026-13-01', used_pct: 1 }, plans, NOW).ok, false);
  for (const bad of [true, [], {}, [5], 'abc', '1e3x', ' ']) {
    assert.equal(parseManual({ ...base, used_pct: bad }, plans, NOW).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseManual({ ...base, used_pct: '42.5' }, plans, NOW).ok, true);
  assert.equal(parseManual({ ...base, used_pct: 42 }, plans, NOW).ok, true);
  assert.equal(parseManual({ ...base, used_pct: 1, limit_value: false }, plans, NOW).ok, false);
  assert.equal(parseManual([], plans, NOW).ok, false);
});

test('no dollars by default: plan labels drop a price, the page never reads price_usd_month', () => {
  assert.equal(planLabel('Claude Max ($200)'), 'Claude Max');
  assert.equal(planLabel('Claude Max $200'), 'Claude Max');
  assert.equal(planLabel('Grok Bot Ultra'), 'Grok Bot Ultra');
  assert.equal(planStatus(plan({ name: 'Claude Max ($200)' }), [], NOW).name, 'Claude Max');
  const cfg = JSON.parse(readFileSync(new URL('../../../config/ai-usage-plans.json', import.meta.url), 'utf8'));
  for (const p of cfg.plans) assert.ok(!planLabel(p.name).includes('$'), p.name);
  const files = [
    '../../app/ai-usage/page.tsx',
    '../../components/ai-usage/BreakdownTables.tsx',
    '../../components/ai-usage/ManualEntryForm.tsx',
    '../../components/ai-usage/HistoryChart.tsx',
    '../../components/ai-usage/format.ts',
    './load.ts',
    './csv.ts',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/price_usd_month|\bUSD\b|['"`>]\s*\$\s*\d|['"`]\$['"`]/.test(src), f);
  }
});

// ---------------------------------------------------------------- grokbot re-review (fixes 2)

test('freshness on a percent basis comes from the selected reading only', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const weeklyAt = new Date(NOW.getTime() - 72 * 3_600_000).toISOString();
  const rows = [
    // The only weekly meter: 72h old.
    row({ plan_slug: 'chatgpt-codex', day: '2026-10-11', secondary_used_pct: 50, secondary_resets_at: '2026-10-15T20:00:00Z', meter_at: weeklyAt }),
    // Recent rows that say nothing about the weekly meter.
    row({ plan_slug: 'chatgpt-codex', tokens_total: 5000, meter_at: '2026-10-14T15:30:00Z' }),
    row({ plan_slug: 'chatgpt-codex', primary_used_pct: 10, meter_at: '2026-10-14T15:45:00Z' }),
  ];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.rag, 'none');
  assert.equal(s.lastReadingAt!.toISOString(), weeklyAt);
  assert.ok(Math.abs(s.hoursSinceReading! - 72) < 1e-9);
});

test('manual readings: meter_at, else midday ET of the day; newer of manual and CLI wins', () => {
  assert.equal(
    observedAt({ source: 'manual', day: '2026-10-13', meter_at: null, last_at: null, captured_at: '2026-10-14T15:00:00Z' })!.toISOString(),
    '2026-10-13T16:00:00.000Z',
  );
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const reset = '2026-10-15T20:00:00Z';
  const cli = row({ plan_slug: 'chatgpt-codex', secondary_used_pct: 60, secondary_resets_at: reset, meter_at: '2026-10-14T10:00:00Z' });
  const manualNewer = row({ plan_slug: 'chatgpt-codex', source: 'manual', primary_used_pct: 65, primary_resets_at: reset, meter_at: '2026-10-14T14:00:00Z' });
  const manualOlder = row({ plan_slug: 'chatgpt-codex', source: 'manual', primary_used_pct: 55, primary_resets_at: reset, meter_at: '2026-10-14T08:00:00Z' });
  assert.equal(planStatus(codex, [cli, manualNewer], NOW).usedPct, 65);
  assert.equal(planStatus(codex, [cli, manualOlder], NOW).usedPct, 60);
});

test('the 48h cutoff applies to a manual reading by its own time', () => {
  const grok = plan({ slug: 'grok-ultra', limit_kind: 'percent', limit_value: 100, reset_cadence: 'monthly' });
  // Day 2026-10-12, no meter_at: midday ET = 16:00Z, 48h before NOW. Saved just now.
  const r = row({ plan_slug: 'grok-ultra', source: 'manual', day: '2026-10-12', primary_used_pct: 20, last_at: null, captured_at: '2026-10-14T15:59:00Z' });
  assert.equal(planStatus(grok, [r], NOW).rag, 'green');
  assert.equal(planStatus(grok, [r], new Date(NOW.getTime() + 60_000)).rag, 'none');
});

test('manual form stamps meter_at for today, leaves it null for a backdated day', () => {
  const t = parseManual({ plan: 'grok-ultra', day: '2026-10-14', used_pct: 5 }, ['grok-ultra'], NOW);
  const b = parseManual({ plan: 'grok-ultra', day: '2026-10-10', used_pct: 5 }, ['grok-ultra'], NOW);
  assert.ok(t.ok && b.ok);
  if (t.ok) assert.equal(t.row.meter_at, NOW.toISOString());
  if (b.ok) assert.equal(b.row.meter_at, null);
});

// ---------------------------------------------------------------- grokbot re-review (fixes 3)

test('a weekly percent plan with only token and 5h rows has no last reading and is gray', () => {
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100, reset_cadence: 'weekly' });
  const rows = [
    row({ plan_slug: 'chatgpt-codex', tokens_total: 5000, meter_at: '2026-10-14T15:30:00Z' }),
    row({ plan_slug: 'chatgpt-codex', primary_used_pct: 40, primary_resets_at: '2026-10-14T19:00:00Z', meter_at: '2026-10-14T15:45:00Z' }),
  ];
  const s = planStatus(codex, rows, NOW);
  assert.equal(s.basis, 'none');
  assert.equal(s.usedPct, null);
  assert.equal(s.lastReadingAt, null);
  assert.equal(s.hoursSinceReading, null);
  assert.equal(s.lastSource, null);
  assert.equal(s.rag, 'none');
});

test('a token plan with no cap and no reading is gray with no-cap-known, never red', () => {
  const s = planStatus(
    { slug: 'claude-max', name: 'Claude Max', limit_kind: 'tokens', limit_value: null, limit_is_estimate: true, reset_cadence: 'weekly', reset_anchor: null },
    [{ plan_slug: 'claude-max', source: 'log', day: '2026-10-18', tokens_total: 9e9, primary_used_pct: null, primary_resets_at: null, secondary_used_pct: null, secondary_resets_at: null, used_value: null, limit_value: null, meter_at: null, last_at: '2026-10-18T15:00:00Z', captured_at: '2026-10-18T15:05:00Z' }],
    new Date('2026-10-18T16:00:00Z'),
  );
  assert.equal(s.usedPct, null);
  assert.equal(s.note, 'no-cap-known');
  assert.notEqual(s.rag, 'red');
});

test('suggestions: strained Claude main moves only small jobs to a green Claude 4lot, never to Codex', () => {
  const out = suggestions(
    [
      status({ usedPct: 92, rag: 'red' }),
      status({ slug: 'claude-4lot', name: 'Claude Team (4lot)', usedPct: 10, rag: 'green' }),
      status({ slug: 'chatgpt-codex', name: 'Codex', usedPct: 5, rag: 'green' }),
    ],
    {},
    NOW,
  );
  assert.ok(out[0].text.startsWith('Claude main weekly at 92%'));
  assert.ok(out[0].text.endsWith('move small jobs and short follow-ups (big builds wait for main) to Claude 4lot until then'));
});

test('suggestions: a no-cap 4lot plan with no reading takes Claude main overflow and is not nagged', () => {
  const lot = status({ slug: 'claude-4lot', name: 'Claude Team (4lot)', usedPct: null, rag: 'none', note: 'no-cap-known', lastReadingAt: null, hoursSinceReading: null });
  const out = suggestions([status({ usedPct: 92, rag: 'red' }), lot], {}, NOW);
  assert.ok(out[0].text.endsWith('move small jobs and short follow-ups (big builds wait for main) to Claude 4lot until then'));
  assert.ok(!out.some((x) => x.plan === 'claude-4lot'));
});

// ---------------------------------------------------------------- glance
import { glanceNote, glanceAnchor, glanceReset } from './glance.ts';

test('glance note restates the card status', () => {
  const resetAt = new Date('2026-10-25T12:29:00Z');
  const w = { resetAt } as never;
  assert.equal(glanceNote({ usedPct: 4, note: 'too-early', runOutAt: new Date('2026-10-23T12:00:00Z'), window: w, rag: 'green' }), 'too early to forecast');
  assert.equal(glanceNote({ usedPct: 40, note: null, runOutAt: new Date('2026-10-23T16:00:00Z'), window: w, rag: 'red' }), 'runs out Fri');
  assert.equal(glanceNote({ usedPct: 40, note: null, runOutAt: new Date('2026-10-27T16:00:00Z'), window: w, rag: 'green' }), 'lasts to reset');
  assert.equal(glanceNote({ usedPct: null, note: 'no-cap-known', runOutAt: null, window: w, rag: 'none' }), 'no cap known');
  assert.equal(glanceAnchor('claude-4lot'), 'plan-claude-4lot');
  assert.equal(glanceReset(new Date('2026-10-20T23:00:00Z'), new Date('2026-10-18T18:00:00Z')), 'Tue 7:00 PM');
});

test('Codex rate-limit meter rows (codex-usage) are plan-meter rows: newest wins, stale after 12h', () => {
  assert.ok(isMeterRow({ bot: 'codex-usage' }) && isMeterRow({ bot: 'claude-usage' }) && !isMeterRow({ bot: 'codex' }));
  const codex = plan({ slug: 'chatgpt-codex', limit_kind: 'percent', limit_value: 100 });
  const rollout = row({ plan_slug: 'chatgpt-codex', bot: 'codex', secondary_used_pct: 40, secondary_resets_at: '2026-10-19T12:00:00Z', meter_at: '2026-10-14T06:00:00Z' });
  const fresh = row({ plan_slug: 'chatgpt-codex', bot: 'codex-usage', session_id: 'meter', tokens_total: 0, secondary_used_pct: 44, secondary_resets_at: '2026-10-19T12:00:00Z', meter_at: '2026-10-14T15:30:00Z' });
  assert.equal(planStatus(codex, [rollout, fresh], NOW).usedPct, 44);
  const stale = { ...fresh, meter_at: '2026-10-14T02:00:00Z', secondary_used_pct: 99 };
  assert.equal(planStatus(codex, [rollout, stale], NOW).usedPct, 40);
});

test('suggestions: a manual-only plan with no reading asks for a reading; a pending-automation plan is never nagged', () => {
  const statuses = [
    status({ slug: 'claude-4lot', name: 'Claude 4lot', rag: 'none', hoursSinceReading: 50, lastSource: 'manual' }),
    status({ slug: 'future-plan', name: 'Future', rag: 'none', hoursSinceReading: null, lastSource: null }),
  ];
  assert.deepEqual(suggestions(statuses, {}, NOW, ['future-plan']).map((s) => s.text), ['Claude 4lot reading missing for 2 days: add a reading']);
  // Off the list, the same plan is nagged like any other.
  assert.ok(suggestions(statuses, {}, NOW, []).some((s) => s.plan === 'future-plan'));
});
