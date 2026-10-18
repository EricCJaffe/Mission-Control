/*
 * AI usage meter: forecast, red/yellow/green, percent shares, suggestions,
 * CSV. Synthetic fixtures only; no real session ids or paths.
 *
 *   node --test src/lib/ai-usage/*.test.ts
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildUsageCsv, csvCell, isMonth, monthRange } from './csv.ts';
import { planStatus, rag, type PlanStatus } from './forecast.ts';
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
  last_at: null,
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

test('rag thresholds', () => {
  const reset = new Date('2026-10-19T04:00:00Z');
  const later = new Date('2026-10-25T00:00:00Z');
  assert.equal(rag({ usedPct: 50, runOutAt: later, resetAt: reset, stale: false }), 'green');
  assert.equal(rag({ usedPct: 50, runOutAt: null, resetAt: reset, stale: false }), 'green');
  assert.equal(rag({ usedPct: 70, runOutAt: later, resetAt: reset, stale: false }), 'yellow');
  assert.equal(rag({ usedPct: 90, runOutAt: later, resetAt: reset, stale: false }), 'red');
  assert.equal(rag({ usedPct: 10, runOutAt: new Date('2026-10-18T00:00:00Z'), resetAt: reset, stale: false }), 'red');
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

test('percent plan: a reading from before its own reset counts as a new, empty window', () => {
  const grok = plan({ slug: 'grok-ultra', name: 'Grok', limit_kind: 'percent', limit_value: 100 });
  const rows = [row({ plan_slug: 'grok-ultra', source: 'manual', primary_used_pct: 80, primary_resets_at: '2026-10-13T00:00:00Z', captured_at: '2026-10-13T12:00:00Z' })];
  const s = planStatus(grok, rows, NOW);
  assert.equal(s.usedPct, 0);
  assert.equal(s.rag, 'green');
});

test('no reading in 48h is "none", not green', () => {
  const rows = [row({ tokens_total: 1, captured_at: '2026-10-11T00:00:00Z', day: '2026-10-10' })];
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
  ...over,
});

test('suggestions: strained Codex moves reviews to a green Claude', () => {
  const out = suggestions(
    [status({ slug: 'chatgpt-codex', name: 'Codex', usedPct: 92, rag: 'red', basis: 'percent' }), status({})],
    {},
    NOW,
  );
  assert.equal(out[0].tone, 'red');
  assert.equal(out[0].text, 'Codex weekly at 92%, resets Thu: move reviews to Claude until then');
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
  assert.ok(texts.includes('fsaos is 48% of Claude this window: pause low-value fsaos sessions'));
  assert.ok(texts.includes('Grok reading missing for 2 days: ask CoS'));
  assert.ok(texts.some((t) => t.startsWith('30% of Claude is unattributed')));
  // Codex is strained too, so Claude does not get told to move work there.
  assert.ok(texts.some((t) => t.startsWith('Claude weekly at 75%') && t.endsWith('pause low-value sessions until then')));
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
