#!/usr/bin/env node
/*
 * AI usage meter: record one Claude plan's own /usage reading (session % and
 * week %, with resets) for an account that `claude-usage --record` does not
 * cover. claude-usage (ubuntu-dev, hourly) records the main account (~/.claude)
 * into $BRAIN_ROOT/runs/claude-usage.jsonl; this records another account the
 * same way, in the same line format, e.g. the 4lot login:
 *
 *   node scripts/usage/claude-meter.mjs --config-dir ~/.claude-4lot \
 *     --log ~/dev/brain/runs/claude-usage-4lot.jsonl
 *
 * How: runs `claude -p /usage` with CLAUDE_CONFIG_DIR set to that account's
 * config dir (what the claude-4lot wrapper does), from /tmp, stdin closed,
 * 90 s timeout. /usage is a local command that prints the plan's meters; it
 * makes no model call. This script never opens any file in the config dir
 * (credentials included) and never changes which account a session uses;
 * Claude Code reads its own login. Output kept: the percentages and resets
 * only (no account name, no usage drivers).
 *
 * --min-interval-min N (default 55): skip when the log's last line is newer,
 * so a 30-minute collector still records about hourly.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const expand = (p) => (p && p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** `/usage` text -> a claude-usage style record. */
export function parseUsage(text, at = new Date()) {
  const t = String(text ?? '');
  const out = { at: at.toISOString(), ok: false };
  for (const [key, label] of [['session', 'Current session'], ['week', 'Current week \\(all models\\)']]) {
    const m = new RegExp(`${label}:\\s*(\\d+)% used\\s*·\\s*resets\\s*([^\\n(]+)`).exec(t);
    if (m) {
      out[`${key}_pct`] = Number(m[1]);
      out[`${key}_resets`] = m[2].trim();
    }
  }
  if (typeof out.week_pct === 'number') out.ok = true;
  else out.error = /log ?in|logged out|not logged|authenticat/i.test(t) ? 'not logged in' : 'no weekly meter in /usage output';
  return out;
}

/** Epoch ms of the log's last line, or 0. Reads only the log we write. */
export function lastAt(file) {
  if (!existsSync(file)) return 0;
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const t = Date.parse(JSON.parse(lines[i]).at); if (Number.isFinite(t)) return t; } catch { /* skip */ }
  }
  return 0;
}

function args(argv) {
  const a = { configDir: null, log: null, minIntervalMin: 55, claude: process.env.CLAUDE_BIN || 'claude' };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--config-dir') a.configDir = expand(argv[++i]);
    else if (v === '--log') a.log = expand(argv[++i]);
    else if (v === '--min-interval-min') a.minIntervalMin = Number(argv[++i]);
    else if (v === '--claude') a.claude = argv[++i];
    else if (v === '--help' || v === '-h') {
      console.log('Usage: claude-meter.mjs --config-dir DIR --log FILE [--min-interval-min N] [--claude BIN]');
      process.exit(0);
    }
  }
  if (!a.configDir || !a.log) throw new Error('--config-dir and --log are required');
  return a;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const a = args(process.argv.slice(2));
  const age = (Date.now() - lastAt(a.log)) / 60000;
  if (age < a.minIntervalMin) {
    console.log(`[meter] ${a.log.split('/').pop()}: last reading ${age.toFixed(0)} min ago; skipped`);
    process.exit(0);
  }
  if (!existsSync(a.configDir)) {
    console.log(`[meter] ${a.configDir} does not exist; skipped`);
    process.exit(0);
  }
  const r = spawnSync(a.claude, ['-p', '/usage'], {
    cwd: '/tmp', encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_CONFIG_DIR: a.configDir },
  });
  const rec = parseUsage(r.stdout, new Date());
  if (!rec.ok && r.error) rec.error = `claude: ${r.error.code ?? r.error.message}`.slice(0, 120);
  mkdirSync(dirname(a.log), { recursive: true });
  appendFileSync(a.log, JSON.stringify(rec) + '\n');
  console.log(rec.ok
    ? `[meter] ${a.log.split('/').pop()}: week ${rec.week_pct}% (resets ${rec.week_resets}), session ${rec.session_pct ?? '?'}%`
    : `[meter] ${a.log.split('/').pop()}: unreadable (${rec.error})`);
  process.exit(rec.ok ? 0 : 1);
}
