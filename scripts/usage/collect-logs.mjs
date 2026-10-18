#!/usr/bin/env node
/*
 * AI usage meter, collector half: parse local CLI logs READ ONLY and print
 * aggregated usage rows as JSON. No database, no secrets, no dependencies,
 * plain ESM so it runs on any Node >= 18 (the box has 20, ubuntu-dev 24,
 * mac-mini 26) and can be piped over ssh:
 *
 *   node scripts/usage/collect-logs.mjs --host ubuntu-dev > /tmp/u.json
 *   ssh mac-mini 'node --input-type=module - --host mac-mini' < scripts/usage/collect-logs.mjs
 *
 * What it reads, and nothing else:
 *   - Claude Code:  <config dir>/projects/**\/*.jsonl  (assistant message.usage,
 *     cwd, sessionId, timestamp, model). Read only; never writes there.
 *     One config dir per Claude ACCOUNT (CLAUDE_CONFIG_DIR keeps logins and
 *     logs apart), so the dir a log sits in says which plan it bills:
 *       ~/.claude          -> claude-max   (main, ejaffejax@gmail.com, Max)
 *       ~/.claude-4lot     -> claude-4lot  (ejaffe@4lot.org, Team; claude-4lot wrapper)
 *       ~/.claude-reserve  -> claude-4lot  (same 4lot login; herdr-fleet --reserve)
 *     Verified 2026-10-18 with `claude auth status` per dir (account names
 *     only). Override with --claude-dir DIR=PLAN (repeatable) or
 *     AI_USAGE_CLAUDE_DIRS="DIR=PLAN,DIR=PLAN". A message copied into two
 *     accounts' dirs (a resumed session) is still counted once, under the
 *     copy the dedupe keeps. Only the `projects` folder is
 *     walked; credential files in those dirs are never opened.
 *   - Codex CLI:    ~/.codex/sessions/**\/rollout-*.jsonl (session_meta /
 *     turn_context cwd, event_msg token_count usage and rate_limits).
 *     Never opens ~/.codex/auth.json or any other file in ~/.codex.
 *
 * Window: the last 28 days by default (Claude Code prunes its own logs after
 * 30), so a re-run never overwrites a complete day with a pruned one.
 *
 * What it emits: counts and metadata per (plan, bot, session, cwd, day ET).
 * Never prompt or response text. `cwd` travels so the uploader can attribute
 * it to a project; it is not stored in the database.
 */

import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { homedir, hostname } from 'node:os';

const TZ = 'America/New_York';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** ISO timestamp → YYYY-MM-DD in America/New_York. */
export function etDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return dayFmt.format(d);
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function emptyRow(base) {
  return {
    plan_slug: base.plan_slug, source: 'log', day: base.day, host: base.host, bot: base.bot,
    session_id: base.session_id, cwd: base.cwd ?? null, model: base.model ?? null,
    messages: 0, tokens_in: 0, tokens_out: 0, tokens_cache_read: 0, tokens_cache_write: 0, tokens_total: 0,
    primary_used_pct: null, primary_window_minutes: null, primary_resets_at: null,
    secondary_used_pct: null, secondary_window_minutes: null, secondary_resets_at: null,
    meter_at: null, first_at: null, last_at: null,
  };
}

function touch(row, ts) {
  if (!ts) return;
  if (!row.first_at || ts < row.first_at) row.first_at = ts;
  if (!row.last_at || ts > row.last_at) row.last_at = ts;
}

/** Recursively list files under dir matching pred, skipping files older than sinceMs. */
export function walk(dir, pred, sinceMs = 0, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, sinceMs, out);
    else if (e.isFile() && pred(e.name)) {
      try { if (statSync(p).mtimeMs >= sinceMs) out.push(p); } catch { /* vanished */ }
    }
  }
  return out;
}

async function* lines(file) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

/**
 * Claude Code. A streamed reply is logged more than once under the same
 * message id and request id, and a resumed session copies history into a new
 * file, so usage is de-duplicated globally on `${message.id}:${requestId}`
 * (the latest record wins, ties to the larger output count, so the result
 * does not depend on file order).
 */
export async function collectClaude({ files, host, sinceDay, plan = 'claude-max', planOf = null }) {
  const byKey = new Map();
  for (const file of files) {
    const filePlan = planOf ? planOf(file) : plan;
    for await (const line of lines(file)) {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec?.type !== 'assistant') continue;
      const msg = rec.message;
      const u = msg?.usage;
      if (!u || !rec.timestamp) continue;
      const day = etDay(rec.timestamp);
      if (!day || (sinceDay && day < sinceDay)) continue;
      if (msg.model === '<synthetic>') continue;
      const key = `${msg.id ?? ''}:${rec.requestId ?? ''}`;
      const entry = {
        plan: filePlan, day, ts: rec.timestamp, session_id: String(rec.sessionId ?? ''), cwd: rec.cwd ?? null, model: msg.model ?? null,
        tin: num(u.input_tokens), tout: num(u.output_tokens),
        cr: num(u.cache_read_input_tokens), cw: num(u.cache_creation_input_tokens),
      };
      if (key === ':') { byKey.set(Symbol('anon'), entry); continue; }
      // Deterministic across files: the latest record wins; on a tie, the
      // one with more output (the final streamed count).
      const prev = byKey.get(key);
      if (!prev || entry.ts > prev.ts || (entry.ts === prev.ts && entry.tout > prev.tout)) byKey.set(key, entry);
    }
  }
  const rows = new Map();
  for (const e of byKey.values()) {
    const k = [e.plan, e.session_id, e.cwd ?? '', e.day].join('\u0000');
    let row = rows.get(k);
    if (!row) {
      row = emptyRow({ plan_slug: e.plan, day: e.day, host, bot: 'claude-code', session_id: e.session_id, cwd: e.cwd, model: e.model });
      rows.set(k, row);
    }
    row.messages += 1;
    row.tokens_in += e.tin;
    row.tokens_out += e.tout;
    row.tokens_cache_read += e.cr;
    row.tokens_cache_write += e.cw;
    row.tokens_total += e.tin + e.tout + e.cr + e.cw;
    if (e.model && (!row.last_at || e.ts >= row.last_at)) row.model = e.model;
    touch(row, e.ts);
  }
  return [...rows.values()];
}

function rateWindow(w) {
  if (!w || typeof w !== 'object') return [null, null, null];
  const pct = typeof w.used_percent === 'number' ? w.used_percent : null;
  const mins = typeof w.window_minutes === 'number' ? w.window_minutes : null;
  const resets = typeof w.resets_at === 'number' ? new Date(w.resets_at * 1000).toISOString() : null;
  return [pct, mins, resets];
}

/**
 * Codex CLI. token_count events carry the session's cumulative
 * total_token_usage; usage for an event is the delta from the previous one in
 * the same file (a counter that goes backwards restarts the baseline). Codex's
 * input_tokens include cached_input_tokens, so uncached = input - cached.
 * rate_limits are the CLI's own reading; the latest of each day is kept.
 */
export async function collectCodex({ files, host, sinceDay }) {
  const rows = new Map();
  for (const file of files) {
    let sessionId = '';
    let cwd = null;
    let model = null;
    let bot = 'codex';
    let repo = null;
    let prev = null;
    for await (const line of lines(file)) {
      if (!line.includes('"session_meta"') && !line.includes('"turn_context"') && !line.includes('"token_count"')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const p = rec?.payload ?? {};
      if (rec.type === 'session_meta') {
        sessionId = String(p.id ?? sessionId);
        cwd = p.cwd ?? cwd;
        if (p.originator === 'codex_exec' || p.source === 'exec') bot = 'codex-exec';
        const url = p.git?.repository_url;
        if (typeof url === 'string') repo = url.replace(/\.git$/, '').split(/[/:]/).pop() || null;
        continue;
      }
      if (rec.type === 'turn_context') {
        cwd = p.cwd ?? cwd;
        model = p.model ?? model;
        continue;
      }
      if (rec.type !== 'event_msg' || p.type !== 'token_count') continue;
      const ts = rec.timestamp;
      const day = ts ? etDay(ts) : null;
      if (!day) continue;
      const total = p.info?.total_token_usage ?? null;
      let delta = null;
      if (total) {
        const cur = {
          input: num(total.input_tokens), cached: num(total.cached_input_tokens),
          cw: num(total.cache_write_input_tokens), out: num(total.output_tokens), all: num(total.total_tokens),
        };
        const base = prev && cur.all >= prev.all ? prev : { input: 0, cached: 0, cw: 0, out: 0, all: 0 };
        delta = {
          input: Math.max(0, cur.input - base.input), cached: Math.max(0, cur.cached - base.cached),
          cw: Math.max(0, cur.cw - base.cw), out: Math.max(0, cur.out - base.out), all: Math.max(0, cur.all - base.all),
        };
        prev = cur;
      }
      if (sinceDay && day < sinceDay) continue;
      const k = [sessionId, cwd ?? '', day].join('\u0000');
      let row = rows.get(k);
      if (!row) {
        row = emptyRow({ plan_slug: 'chatgpt-codex', day, host, bot, session_id: sessionId, cwd, model });
        row.repo = repo;
        rows.set(k, row);
      }
      if (delta && delta.all > 0) {
        row.messages += 1;
        row.tokens_in += Math.max(0, delta.input - delta.cached);
        row.tokens_cache_read += delta.cached;
        row.tokens_cache_write += delta.cw;
        row.tokens_out += delta.out;
        row.tokens_total += delta.all;
      }
      if (model) row.model = model;
      // The meter reading carries its own observation time (meter_at); token
      // activity without a reading must not make an old percentage look new.
      const rl = p.rate_limits;
      if (rl && (rl.primary || rl.secondary) && (!row.meter_at || ts >= row.meter_at)) {
        [row.primary_used_pct, row.primary_window_minutes, row.primary_resets_at] = rateWindow(rl.primary);
        [row.secondary_used_pct, row.secondary_window_minutes, row.secondary_resets_at] = rateWindow(rl.secondary);
        row.meter_at = ts;
      }
      touch(row, ts);
    }
  }
  return [...rows.values()].filter((r) => r.tokens_total > 0 || r.primary_used_pct !== null || r.secondary_used_pct !== null);
}

/** Claude config dir (its `projects` folder) -> plan slug, per account. */
export const DEFAULT_CLAUDE_ACCOUNTS = [
  ['.claude', 'claude-max'],
  ['.claude-4lot', 'claude-4lot'],
  ['.claude-reserve', 'claude-4lot'],
];

/** "DIR=PLAN" -> { dir: DIR/projects (unless DIR already ends in projects), plan }. */
export function parseClaudeDir(spec, home = homedir()) {
  const i = spec.lastIndexOf('=');
  let dir = i > 0 ? spec.slice(0, i) : spec;
  const plan = i > 0 ? spec.slice(i + 1) : 'claude-max';
  if (dir.startsWith('~/')) dir = join(home, dir.slice(2));
  if (!/[\\/]projects\/?$/.test(dir)) dir = join(dir, 'projects');
  return { dir, plan };
}

export function defaultClaudeDirs(env = process.env, home = homedir()) {
  if (env.AI_USAGE_CLAUDE_DIRS) return env.AI_USAGE_CLAUDE_DIRS.split(',').map((x) => x.trim()).filter(Boolean).map((x) => parseClaudeDir(x, home));
  return DEFAULT_CLAUDE_ACCOUNTS.map(([d, plan]) => ({ dir: join(home, d, 'projects'), plan }));
}

function parseArgs(argv) {
  const a = { host: hostname(), days: 28, claudeDirs: null, codexDir: join(homedir(), '.codex', 'sessions') };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--host') a.host = argv[++i];
    else if (v === '--days') a.days = Number(argv[++i]);
    else if (v === '--claude-dir') (a.claudeDirs ??= []).push(parseClaudeDir(argv[++i]));
    else if (v === '--codex-dir') a.codexDir = argv[++i];
    else if (v === '--help' || v === '-h') {
      console.log('Usage: collect-logs.mjs [--host NAME] [--days N] [--claude-dir DIR[=PLAN]]... [--codex-dir DIR]\nPrints aggregated usage JSON to stdout. Read only.');
      process.exit(0);
    }
  }
  a.claudeDirs ??= defaultClaudeDirs();
  return a;
}

export async function collectAll({ host, days, claudeDirs, claudeDir, codexDir, now = Date.now() }) {
  const sinceDay = etDay(new Date(now - days * 86400000).toISOString());
  // Files are picked by mtime from a day BEFORE the window's first ET day, so
  // every event on since_day is seen (the uploader replaces whole days from
  // since_day on; a file skipped on an exact-timestamp cut would erase usage).
  const sinceMs = Date.parse(`${sinceDay}T00:00:00Z`) - 86400000;
  const dirs = claudeDirs ?? (claudeDir ? [{ dir: claudeDir, plan: 'claude-max' }] : defaultClaudeDirs());
  // The same folder reached twice (a symlink) is walked once.
  const seen = new Set();
  const planByFile = new Map();
  const byPlan = {};
  for (const { dir, plan } of dirs) {
    if (!existsSync(dir)) continue;
    let real;
    try { real = realpathSync(dir); } catch { continue; }
    if (seen.has(real)) continue;
    seen.add(real);
    for (const f of walk(dir, (n) => n.endsWith('.jsonl'), sinceMs)) {
      if (planByFile.has(f)) continue;
      planByFile.set(f, plan);
      byPlan[plan] = (byPlan[plan] ?? 0) + 1;
    }
  }
  const claudeFiles = [...planByFile.keys()];
  const codexFiles = existsSync(codexDir) ? walk(codexDir, (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'), sinceMs) : [];
  const rows = [
    ...(await collectClaude({ files: claudeFiles, host, sinceDay, planOf: (f) => planByFile.get(f) })),
    ...(await collectCodex({ files: codexFiles, host, sinceDay })),
  ];
  return { host, generated_at: new Date(now).toISOString(), since_day: sinceDay, files: { claude: claudeFiles.length, claude_by_plan: byPlan, codex: codexFiles.length }, rows };
}

const isMain = (() => {
  try {
    if (!process.argv[1] || process.argv[1] === '-') return true;
    return import.meta.url === new URL(`file://${process.argv[1]}`).href || process.argv[1].endsWith('collect-logs.mjs');
  } catch { return true; }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2).filter((x) => x !== '-'));
  const out = await collectAll(args);
  process.stdout.write(JSON.stringify(out) + '\n');
}
