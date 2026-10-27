import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attributeRows, parseManual, newestPerHost, cleanLogRow } from './rows.mjs';
import { loadMapping } from './attribution.mjs';
import { collectClaude, collectCodex, etDay } from './collect-logs.mjs';

const map = loadMapping({ projects: { fsaos: { project: 'fsaos', client: 'FSA' } } });
const U = '00000000-0000-0000-0000-000000000001';

test('etDay uses America/New_York, not UTC', () => {
  assert.equal(etDay('2026-10-18T03:30:00Z'), '2026-10-17');
  assert.equal(etDay('2026-10-18T05:00:00Z'), '2026-10-18');
});

test('Claude: streamed duplicates count once, synthetic skipped, prompt text never emitted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-'));
  const f = join(dir, 's.jsonl');
  const mk = (id, rid, ts, u, model = 'claude-x') => JSON.stringify({ type: 'assistant', sessionId: 'S1', cwd: '/home/u/dev/fsaos', timestamp: ts, requestId: rid, message: { id, model, content: [{ type: 'text', text: 'SECRET PROMPT TEXT' }], usage: u } });
  writeFileSync(f, [
    mk('m1', 'r1', '2026-10-18T14:00:00Z', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    mk('m1', 'r1', '2026-10-18T14:00:01Z', { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 }),
    mk('m2', 'r2', '2026-10-18T15:00:00Z', { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }),
    mk('m3', 'r3', '2026-10-18T15:00:00Z', { input_tokens: 999, output_tokens: 0 }, '<synthetic>'),
    JSON.stringify({ type: 'user', message: { content: 'hello' } }),
    'not json',
  ].join('\n'));
  const rows = await collectClaude({ files: [f], host: 'h', sinceDay: '2026-10-01' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].messages, 2);
  assert.equal(rows[0].tokens_total, 135 + 10);
  assert.equal(rows[0].tokens_cache_read, 103);
  assert.ok(!JSON.stringify(rows).includes('SECRET'));
});

test('Codex: cumulative totals become deltas; rate limits kept; counter reset handled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cx-'));
  mkdirSync(join(dir, 'a'));
  const f = join(dir, 'a', 'rollout-x.jsonl');
  const tc = (ts, tot, pct) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: tot }, rate_limits: { primary: { used_percent: pct, window_minutes: 300, resets_at: 1792025320 }, secondary: { used_percent: pct * 2, window_minutes: 10080, resets_at: 1792495827 } } } });
  writeFileSync(f, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'C1', cwd: '/home/u/dev/fsaos', originator: 'codex_exec' } }),
    JSON.stringify({ type: 'turn_context', payload: { cwd: '/home/u/dev/fsaos', model: 'gpt-x' } }),
    tc('2026-10-18T14:00:00Z', { input_tokens: 100, cached_input_tokens: 60, output_tokens: 10, total_tokens: 110 }, 1),
    tc('2026-10-18T14:01:00Z', { input_tokens: 300, cached_input_tokens: 200, output_tokens: 30, total_tokens: 330 }, 3),
    tc('2026-10-18T14:02:00Z', { input_tokens: 300, cached_input_tokens: 200, output_tokens: 30, total_tokens: 330 }, 4),
  ].join('\n'));
  const rows = await collectCodex({ files: [f], host: 'h', sinceDay: '2026-10-01' });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.bot, 'codex-exec');
  assert.equal(r.tokens_total, 330);
  assert.equal(r.tokens_cache_read, 200);
  assert.equal(r.tokens_in, 100);
  assert.equal(r.tokens_out, 30);
  assert.equal(r.messages, 2);
  assert.equal(r.primary_used_pct, 4);
  assert.equal(r.secondary_used_pct, 8);
  assert.equal(r.secondary_window_minutes, 10080);
  assert.equal(r.meter_at, '2026-10-18T14:02:00Z');
});

test('attributeRows maps, merges same-key rows and keeps unattributed explicit', () => {
  const base = { plan_slug: 'claude-max', source: 'log', day: '2026-10-18', host: 'h', bot: 'claude-code', session_id: 'S', messages: 1, tokens_in: 1, tokens_out: 1, tokens_cache_read: 0, tokens_cache_write: 0, tokens_total: 2, last_at: '2026-10-18T10:00:00Z', first_at: '2026-10-18T10:00:00Z' };
  const rows = attributeRows([
    { ...base, cwd: '/home/u/dev/fsaos' },
    { ...base, cwd: '/home/u/dev/fsaos/src', last_at: '2026-10-18T11:00:00Z' },
    { ...base, cwd: '/home/u' },
    { ...base, plan_slug: 'evil', cwd: '/home/u' },
    { ...base, id: 7, user_id: 'x', tokens_total: 'NaN', cwd: '/tmp/zz' },
  ], map, U);
  assert.equal(rows.length, 2); // bad plan dropped; NaN row merged into unattributed with 0 tokens
  assert.ok(rows.every((r) => !('id' in r) && r.user_id === U && r.source === 'log'));
  assert.equal(rows.find((r) => r.project === 'unattributed').tokens_total, 2);
  const f = rows.find((r) => r.project === 'fsaos');
  assert.equal(f.tokens_total, 4);
  assert.equal(f.client, 'FSA');
  assert.equal(f.user_id, U);
  assert.equal(f.last_at, '2026-10-18T11:00:00Z');
  assert.ok(!('cwd' in f));
  assert.equal(rows.filter((r) => r.project === 'unattributed').every((r) => r.client === null), true);
});

test('parseManual validates, dedupes and maps fields', () => {
  const text = [
    '# Grok Bot Ultra readings',
    '{"date":"2026-10-18","plan":"grok-ultra","used_pct":40,"resets_at":"2026-10-25","window":"weekly"}',
    '{"date":"2026-10-18","plan":"grok-ultra","used_pct":42,"resets_at":"2026-10-25","window":"weekly","note":"after lunch"}',
    '{"date":"2026-10-18","plan":"nope","used_pct":1}',
    '{"date":"10/18","plan":"grok-ultra","used_pct":1}',
    '{"date":"2026-10-18","plan":"grok-ultra"}',
    'garbage',
  ].join('\n');
  const { rows, errors } = parseManual(text, { userId: U, planSlugs: ['grok-ultra', 'claude-max'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primary_used_pct, 42);
  assert.equal(rows[0].primary_window_minutes, 10080);
  assert.equal(rows[0].source, 'manual');
  assert.equal(rows[0].bot, 'cos');
  assert.equal(rows[0].note, 'after lunch');
  assert.equal(errors.length, 4);
});

test('manual count readings become a percent; used without limit is rejected', () => {
  const { rows, errors } = parseManual('{"date":"2026-10-18","plan":"grok-ultra","used":80,"limit":200,"unit":"credits"}\n{"date":"2026-10-18","plan":"grok-ultra","used":5,"by":"x"}', { userId: U, planSlugs: ['grok-ultra'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primary_used_pct, 40);
  assert.equal(errors.length, 1);
});

test('newestPerHost supersedes older payloads instead of summing them', () => {
  const { keep, superseded } = newestPerHost([
    { host: 'box', generated_at: '2026-10-18T01:00:00Z', path: 'a' },
    { host: 'box', generated_at: '2026-10-18T02:00:00Z', path: 'b' },
    { host: 'mac-mini', generated_at: '2026-10-18T01:00:00Z', path: 'c' },
  ]);
  assert.deepEqual(keep.map((k) => k.path).sort(), ['b', 'c']);
  assert.deepEqual(superseded, ['a']);
  assert.equal(cleanLogRow({ plan_slug: 'claude-max', day: 'x' }), null);
});

test('a date-only resets_at is midnight ET', () => {
  const { rows } = parseManual('{"date":"2026-10-18","plan":"grok-ultra","used_pct":1,"resets_at":"2026-10-25"}\n{"date":"2026-12-01","plan":"grok-ultra","used_pct":1,"resets_at":"2026-12-07","by":"y"}', { userId: U, planSlugs: ['grok-ultra'] });
  assert.equal(rows[0].primary_resets_at, '2026-10-25T04:00:00.000Z');
  assert.equal(rows[1].primary_resets_at, '2026-12-07T05:00:00.000Z');
});

test('impossible dates are per-line errors, never a crash', () => {
  const { rows, errors } = parseManual('{"date":"2026-10-18","plan":"grok-ultra","used_pct":1,"resets_at":"2026-13-01"}\n{"date":"2026-02-31","plan":"grok-ultra","used_pct":1}\n{"date":"2026-10-18","plan":"grok-ultra","used_pct":3,"by":"ok"}', { userId: U, planSlugs: ['grok-ultra'] });
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 2);
});

test('meter rows: one per plan on the same host/day under the unique key, percentages kept', () => {
  const m = (plan, pct, at) => ({ plan_slug: plan, source: 'log', day: '2026-10-18', host: 'ubuntu-dev', bot: 'claude-usage', session_id: 'meter', cwd: null,
    messages: 0, tokens_in: 0, tokens_out: 0, tokens_cache_read: 0, tokens_cache_write: 0, tokens_total: 0,
    primary_used_pct: 3, primary_window_minutes: 300, primary_resets_at: null,
    secondary_used_pct: pct, secondary_window_minutes: 10080, secondary_resets_at: '2026-10-20T22:59:00.000Z', meter_at: at, first_at: null, last_at: null });
  const out = attributeRows([m('claude-max', 51, '2026-10-18T18:07:05.000Z'), m('claude-4lot', 1, '2026-10-18T18:59:00.000Z')], loadMapping({ projects: [] }), 'u');
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => [r.plan_slug, r.project, r.secondary_used_pct, r.tokens_total]).sort(), [['claude-4lot', 'unattributed', 1, 0], ['claude-max', 'unattributed', 51, 0]]);
});

test('Codex meter rows: kept, merged by meter_at on their own key, never added to rollout rows', () => {
  const meter = (at, pct) => ({ plan_slug: 'chatgpt-codex', day: '2026-10-24', host: 'ubuntu-dev', bot: 'codex-usage', session_id: 'meter', cwd: null, tokens_total: 0, secondary_used_pct: pct, secondary_window_minutes: 10080, secondary_resets_at: '2026-10-30T18:18:56.000Z', meter_at: at });
  const rollout = { plan_slug: 'chatgpt-codex', day: '2026-10-24', host: 'ubuntu-dev', bot: 'codex', session_id: 's1', cwd: '/home/x/dev/fsaos', tokens_total: 900, messages: 2, secondary_used_pct: 50, secondary_window_minutes: 10080, meter_at: '2026-10-24T10:00:00.000Z' };
  const out = attributeRows([meter('2026-10-24T13:00:00.000Z', 30), meter('2026-10-24T12:00:00.000Z', 20), rollout], map, U);
  assert.equal(out.length, 2);
  const m = out.find((r) => r.bot === 'codex-usage');
  assert.equal(m.secondary_used_pct, 30);
  assert.equal(m.meter_at, '2026-10-24T13:00:00.000Z');
  assert.equal(m.tokens_total, 0);
  assert.equal(m.source, 'log');
  const r = out.find((x) => x.bot === 'codex');
  assert.equal(r.tokens_total, 900);
  assert.equal(r.secondary_used_pct, 50);
});
