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
 * How: runs `claude -p --no-session-persistence /usage` with
 * CLAUDE_CONFIG_DIR set to that account's config dir (what the claude-4lot
 * wrapper does), from /tmp, stdin closed, 90 s timeout, TZ=America/New_York
 * (resets print in local time). /usage is a local command that prints the
 * plan's meters; it makes no model call (checked on 2.1.302: its transcript
 * has no assistant message) and, with --no-session-persistence, writes no
 * transcript. Auth overrides that would beat the config dir's login
 * (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, provider switches, ...) are
 * removed from the child's environment by NAME, so the reading is that
 * account's; values are never read or printed. This script never opens any file in the config dir
 * (credentials included) and never changes which account a session uses;
 * Claude Code reads its own login. Output kept: the percentages and resets
 * only (no account name, no usage drivers).
 *
 * --min-interval-min N (default 55): skip when the last GOOD reading is newer,
 * so a 30-minute collector still records about hourly; after a failed one it
 * retries in --retry-min (default 15) minutes.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const expand = (p) => (p && p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** Env vars that would make Claude Code use some other credential than the config dir's login. */
export const AUTH_OVERRIDES = [
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_BASE_URL', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_FOUNDRY_BASE_URL',
  'ANTHROPIC_FOUNDRY_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'CLAUDE_CONFIG_DIR',
];

/** The child's environment: this account's config dir, ET clock, no auth overrides. */
export function meterEnv(env, configDir) {
  const out = { ...env };
  for (const k of AUTH_OVERRIDES) delete out[k];
  out.CLAUDE_CONFIG_DIR = configDir;
  out.TZ = 'America/New_York';
  return out;
}

/** `/usage` text -> a claude-usage style record (plus `tz`, the zone label it printed). */
export function parseUsage(text, at = new Date()) {
  const t = String(text ?? '');
  const out = { at: at.toISOString(), ok: false };
  for (const [key, label] of [['session', 'Current session'], ['week', 'Current week \\(all models\\)']]) {
    // The reset part is optional (a fresh window may print a bare "0% used").
    const m = new RegExp(`${label}:\\s*(\\d+)% used(?:\\s*·\\s*resets\\s*([^\\n(]+)(?:\\(([^)\\n]+)\\))?)?`).exec(t);
    if (m) {
      out[`${key}_pct`] = Number(m[1]);
      if (m[2]) out[`${key}_resets`] = m[2].trim();
      if (m[3]) out.tz = m[3].trim();
    }
  }
  if (typeof out.week_pct === 'number') out.ok = true;
  else out.error = /log ?in|logged out|not logged|authenticat/i.test(t) ? 'not logged in' : 'no weekly meter in /usage output';
  return out;
}

/** A finished child -> the record to log: a non-zero exit, signal or spawn error is a failure. */
export function recordOf(r, at = new Date()) {
  const rec = parseUsage(r.stdout, at);
  const failed = r.error || r.signal || (r.status !== 0 && r.status != null);
  if (failed) {
    const why = r.error ? `claude: ${r.error.code ?? r.error.message}` : r.signal ? `claude killed (${r.signal})` : `claude exited ${r.status}`;
    return { at: rec.at, ok: false, error: why.slice(0, 120) };
  }
  return rec;
}

/** Epoch ms of the log's newest line and newest ok line (0 if none). Reads only the log we write. */
export function lastTimes(file) {
  const out = { any: 0, ok: 0 };
  if (!existsSync(file)) return out;
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0 && !out.ok; i--) {
    let r;
    try { r = JSON.parse(lines[i]); } catch { continue; }
    const t = Date.parse(r?.at);
    if (!Number.isFinite(t)) continue;
    if (!out.any) out.any = t;
    if (r.ok === true) out.ok = t;
  }
  return out;
}

/** Skip reason, or null to record now. */
export function shouldSkip(times, now, minIntervalMin = 55, retryMin = 15) {
  const okAge = (now - times.ok) / 60000;
  const anyAge = (now - times.any) / 60000;
  if (times.ok && okAge < minIntervalMin) return `last reading ${okAge.toFixed(0)} min ago`;
  if (times.any && times.any > times.ok && anyAge < retryMin) return `last attempt failed ${anyAge.toFixed(0)} min ago; retry after ${retryMin} min`;
  return null;
}

function args(argv) {
  const a = { configDir: null, log: null, minIntervalMin: 55, retryMin: 15, claude: process.env.CLAUDE_BIN || 'claude' };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--config-dir') a.configDir = expand(argv[++i]);
    else if (v === '--log') a.log = expand(argv[++i]);
    else if (v === '--min-interval-min') a.minIntervalMin = Number(argv[++i]);
    else if (v === '--retry-min') a.retryMin = Number(argv[++i]);
    else if (v === '--claude') a.claude = argv[++i];
    else if (v === '--help' || v === '-h') {
      console.log('Usage: claude-meter.mjs --config-dir DIR --log FILE [--min-interval-min N] [--retry-min N] [--claude BIN]');
      process.exit(0);
    }
  }
  if (!a.configDir || !a.log) throw new Error('--config-dir and --log are required');
  return a;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const a = args(process.argv.slice(2));
  const skip = shouldSkip(lastTimes(a.log), Date.now(), a.minIntervalMin, a.retryMin);
  if (skip) {
    console.log(`[meter] ${a.log.split('/').pop()}: ${skip}; skipped`);
    process.exit(0);
  }
  if (!existsSync(a.configDir)) {
    console.log(`[meter] ${a.configDir} does not exist; skipped`);
    process.exit(0);
  }
  const r = spawnSync(a.claude, ['-p', '--no-session-persistence', '/usage'], {
    cwd: '/tmp', encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
    env: meterEnv(process.env, a.configDir),
  });
  const rec = recordOf(r, new Date());
  mkdirSync(dirname(a.log), { recursive: true });
  appendFileSync(a.log, JSON.stringify(rec) + '\n');
  console.log(rec.ok
    ? `[meter] ${a.log.split('/').pop()}: week ${rec.week_pct}% (resets ${rec.week_resets}), session ${rec.session_pct ?? '?'}%`
    : `[meter] ${a.log.split('/').pop()}: unreadable (${rec.error})`);
  process.exit(rec.ok ? 0 : 1);
}
