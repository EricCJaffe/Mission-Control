import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectAll, collectClaudeMeters, defaultClaudeDirs, defaultClaudeMeters, parseClaudeDir, parseEtReset } from './collect-logs.mjs';
import { lastAt, parseUsage } from './claude-meter.mjs';

const NOW = Date.parse('2026-10-18T18:00:00Z');
const line = (id, req, ts, out = 10, cwd = '/home/u/dev/fsaos') =>
  JSON.stringify({ type: 'assistant', timestamp: ts, sessionId: `s-${id}`, cwd, requestId: req, message: { id, model: 'm', usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });

function home() {
  const h = mkdtempSync(join(tmpdir(), 'aiu-'));
  for (const [d, id] of [['.claude', 'main'], ['.claude-4lot', 'lot'], ['.claude-reserve', 'res']]) {
    mkdirSync(join(h, d, 'projects', 'p'), { recursive: true });
    writeFileSync(join(h, d, 'projects', 'p', `${id}.jsonl`), line(id, `r-${id}`, '2026-10-18T15:00:00Z') + '\n');
    // A credentials file that must never be read (it is not JSONL and not under projects).
    writeFileSync(join(h, d, '.credentials.json'), '{"never":"read"}');
  }
  mkdirSync(join(h, '.codex', 'sessions'), { recursive: true });
  return h;
}

test('each Claude config dir bills its own account: main -> claude-max, 4lot and reserve -> claude-4lot', async () => {
  const h = home();
  const out = await collectAll({ host: 'h', days: 28, claudeDirs: defaultClaudeDirs({}, h), codexDir: join(h, '.codex', 'sessions'), now: NOW });
  const by = Object.fromEntries(out.rows.map((r) => [r.session_id, r.plan_slug]));
  assert.deepEqual(by, { 's-main': 'claude-max', 's-lot': 'claude-4lot', 's-res': 'claude-4lot' });
  assert.deepEqual(out.files.claude_by_plan, { 'claude-max': 1, 'claude-4lot': 2 });
});

test('a symlinked projects folder is walked once', async () => {
  const h = home();
  symlinkSync(join(h, '.claude', 'projects'), join(h, 'alias'));
  const dirs = [...defaultClaudeDirs({}, h), { dir: join(h, 'alias'), plan: 'claude-4lot' }];
  const out = await collectAll({ host: 'h', days: 28, claudeDirs: dirs, codexDir: join(h, '.codex', 'sessions'), now: NOW });
  assert.equal(out.rows.filter((r) => r.session_id === 's-main').length, 1);
  assert.equal(out.rows.find((r) => r.session_id === 's-main').plan_slug, 'claude-max');
});

test('AI_USAGE_CLAUDE_DIRS and DIR=PLAN override the defaults', () => {
  assert.deepEqual(defaultClaudeDirs({ AI_USAGE_CLAUDE_DIRS: '~/.claude=claude-4lot, /x/y/projects=claude-max' }, '/h'), [
    { dir: '/h/.claude/projects', plan: 'claude-4lot' },
    { dir: '/x/y/projects', plan: 'claude-max' },
  ]);
  assert.deepEqual(parseClaudeDir('/a/b'), { dir: '/a/b/projects', plan: 'claude-max' });
});

test('legacy single claudeDir still bills claude-max', async () => {
  const h = home();
  const out = await collectAll({ host: 'h', days: 28, claudeDir: join(h, '.claude', 'projects'), codexDir: join(h, '.codex', 'sessions'), now: NOW });
  assert.deepEqual(out.rows.map((r) => r.plan_slug), ['claude-max']);
});

test('parseEtReset: ET wall clock near the reading, DST-correct, year from the reading', () => {
  const at = Date.parse('2026-10-18T18:07:05Z');
  assert.equal(parseEtReset('Oct 20, 6:59pm', at), '2026-10-20T22:59:00.000Z');
  assert.equal(parseEtReset('Oct 18, 6pm (America/New_York)', at), '2026-10-18T22:00:00.000Z');
  assert.equal(parseEtReset('Nov 3, 12am', at), '2026-11-03T05:00:00.000Z'); // after DST ends: EST
  assert.equal(parseEtReset('Jan 2, 9:30am', Date.parse('2026-12-30T15:00:00Z')), '2027-01-02T14:30:00.000Z');
  assert.equal(parseEtReset('Oct 17, 1pm', at), null); // before the reading: not a reset
  assert.equal(parseEtReset('soon', at), null);
});

test('collectClaudeMeters: newest ok reading per ET day -> one meter row, no tokens', () => {
  const text = [
    JSON.stringify({ at: '2026-10-17T23:07:00-04:00', ok: true, session_pct: 9, session_resets: 'Oct 18, 1am', week_pct: 49, week_resets: 'Oct 20, 7pm' }),
    JSON.stringify({ at: '2026-10-18T13:07:06-04:00', ok: true, session_pct: 1, session_resets: 'Oct 18, 5:59pm', week_pct: 51, week_resets: 'Oct 20, 6:59pm', drivers_24h: ['x'] }),
    JSON.stringify({ at: '2026-10-18T14:07:05-04:00', ok: true, session_pct: 3, session_resets: 'Oct 18, 5:59pm', week_pct: 52, week_resets: 'Oct 20, 6:59pm' }),
    JSON.stringify({ at: '2026-10-18T15:07:05-04:00', ok: false, error: 'unreadable' }),
    'not json',
    JSON.stringify({ at: '2026-10-10T10:00:00-04:00', ok: true, week_pct: 5, week_resets: 'Oct 13, 7pm' }),
  ].join('\n');
  const rows = collectClaudeMeters({ text, plan: 'claude-4lot', host: 'ubuntu-dev', sinceDay: '2026-10-17' });
  assert.equal(rows.length, 2);
  const r = rows.find((x) => x.day === '2026-10-18');
  assert.equal(r.plan_slug, 'claude-4lot');
  assert.equal(r.bot, 'claude-usage');
  assert.equal(r.tokens_total, 0);
  assert.equal(r.secondary_used_pct, 52);
  assert.equal(r.secondary_window_minutes, 10080);
  assert.equal(r.secondary_resets_at, '2026-10-20T22:59:00.000Z');
  assert.equal(r.primary_used_pct, 3);
  assert.equal(r.primary_window_minutes, 300);
  assert.equal(r.meter_at, '2026-10-18T18:07:05.000Z');
  assert.equal(r.last_at, null);
});

test('meters: read only when passed, default files under BRAIN_ROOT', async () => {
  const h = home();
  const brain = join(h, 'brain');
  mkdirSync(join(brain, 'runs'), { recursive: true });
  writeFileSync(join(brain, 'runs', 'claude-usage.jsonl'), JSON.stringify({ at: '2026-10-18T13:00:00-04:00', ok: true, week_pct: 51, week_resets: 'Oct 20, 6:59pm' }) + '\n');
  const meters = defaultClaudeMeters({ BRAIN_ROOT: brain }, h);
  assert.deepEqual(meters.map((m) => m.plan), ['claude-max', 'claude-4lot']);
  const withM = await collectAll({ host: 'x', days: 2, claudeDirs: defaultClaudeDirs({}, h), codexDir: join(h, 'none'), meters, now: NOW });
  assert.equal(withM.files.meter_rows, 1);
  assert.equal(withM.rows.filter((r) => r.bot === 'claude-usage' && r.plan_slug === 'claude-max').length, 1);
  const without = await collectAll({ host: 'x', days: 2, claudeDirs: defaultClaudeDirs({}, h), codexDir: join(h, 'none'), now: NOW });
  assert.equal(without.rows.filter((r) => r.bot === 'claude-usage').length, 0);
  assert.deepEqual(defaultClaudeMeters({ AI_USAGE_CLAUDE_METERS: '~/a.jsonl=claude-4lot' }, '/h'), [{ file: '/h/a.jsonl', plan: 'claude-4lot' }]);
});

test('claude-meter parseUsage: the /usage text for the 4lot login', () => {
  const out = 'You are currently using your subscription to power your Claude Code usage\n\nCurrent session: 5% used · resets Oct 18, 6pm (America/New_York)\nCurrent week (all models): 1% used · resets Oct 24, 12pm (America/New_York)\nCurrent week (Fable): 0% used · resets Oct 24, 12pm (America/New_York)\n';
  const r = parseUsage(out, new Date('2026-10-18T18:53:00Z'));
  assert.deepEqual(r, { at: '2026-10-18T18:53:00.000Z', ok: true, session_pct: 5, session_resets: 'Oct 18, 6pm', week_pct: 1, week_resets: 'Oct 24, 12pm' });
  assert.equal(parseUsage('Please run /login', new Date()).ok, false);
  assert.equal(parseUsage('Please run /login', new Date()).error, 'not logged in');
  const rows = collectClaudeMeters({ text: JSON.stringify(r), plan: 'claude-4lot', host: 'h', sinceDay: '2026-10-18' });
  assert.equal(rows[0].secondary_resets_at, '2026-10-24T16:00:00.000Z');
});

test('claude-meter lastAt: last parseable line of its own log', () => {
  const h = mkdtempSync(join(tmpdir(), 'aiu-m-'));
  const f = join(h, 'm.jsonl');
  assert.equal(lastAt(f), 0);
  writeFileSync(f, JSON.stringify({ at: '2026-10-18T14:00:00-04:00' }) + '\nbroken\n');
  assert.equal(lastAt(f), Date.parse('2026-10-18T18:00:00Z'));
});
