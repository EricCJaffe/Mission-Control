import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectAll, defaultClaudeDirs, parseClaudeDir } from './collect-logs.mjs';

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
