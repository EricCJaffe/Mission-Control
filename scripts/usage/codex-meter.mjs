#!/usr/bin/env node
/*
 * AI usage meter: record the ChatGPT / Codex plan's own rate-limit reading
 * (5-hour primary and weekly secondary %, with resets), so the page updates
 * itself with no manual upload. Eric, 2026-10-24 9:29 AM ET.
 *
 *   node scripts/usage/codex-meter.mjs --log ~/dev/brain/runs/codex-usage.jsonl
 *
 * How: spawns `codex app-server` (stdio JSON-RPC, one JSON object per line),
 * sends `initialize`, then `account/rateLimits/read`, keeps the rate-limit
 * fields only, and kills the child. Checked on codex-cli 0.164.0
 * (`codex app-server generate-json-schema`, v2/GetAccountRateLimitsResponse).
 * No model call, no thread, so no session or transcript is written.
 *
 * Credentials: Codex reads its own login. This script never opens anything in
 * ~/.codex, and removes the auth-override env vars (OPENAI_API_KEY,
 * CODEX_API_KEY, ...) from the child by NAME, so the reading is the ChatGPT
 * login's limits; values are never read or printed. Kept: percentages, window
 * lengths, resets and the plan type. Dropped: account id, credits, banners.
 *
 * Runs on ubuntu-dev only (deploy/ai-usage/ubuntu-collect.sh, every collector
 * run): one account, so one reading is enough. A failed reading is logged as
 * {ok:false} and exits 1; the collector only warns.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const expand = (p) => (p && p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** Env vars that would make Codex use some other credential than its ChatGPT login. */
export const AUTH_OVERRIDES = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_ORGANIZATION', 'OPENAI_PROJECT'];

export function meterEnv(env) {
  const out = { ...env };
  for (const k of AUTH_OVERRIDES) delete out[k];
  return out;
}

const iso = (s) => (typeof s === 'number' && Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** One window, camelCase (app-server v2) or snake_case (rollout logs). */
function win(w) {
  if (!w || typeof w !== 'object') return [null, null, null];
  return [num(w.usedPercent ?? w.used_percent), num(w.windowDurationMins ?? w.window_minutes), iso(w.resetsAt ?? w.resets_at)];
}

/**
 * `account/rateLimits/read` result -> the record we log. Prefers the `codex`
 * bucket of rateLimitsByLimitId, else the single-bucket view. Everything else
 * in the reply is dropped.
 */
export function recordFromResult(result, at = new Date()) {
  const snap = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits ?? null;
  const [p, pw, pr] = win(snap?.primary);
  const [s, sw, sr] = win(snap?.secondary);
  if (p === null && s === null) return { at: at.toISOString(), ok: false, error: 'no rate limits in the reply' };
  const rec = {
    at: at.toISOString(), ok: true, plan: 'chatgpt-codex',
    primary_used_pct: p, primary_window_minutes: pw, primary_resets_at: pr,
    secondary_used_pct: s, secondary_window_minutes: sw, secondary_resets_at: sr,
  };
  if (typeof snap?.planType === 'string') rec.plan_type = snap.planType.slice(0, 40);
  return rec;
}

/**
 * Ask a `codex app-server` child for the rate limits. Resolves to the logged
 * record; never rejects. Spawn error, early exit, an error reply or the
 * timeout is a failed reading.
 */
export function readRateLimits({ codex = 'codex', env = process.env, timeoutMs = 30000, now = () => new Date() } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let buf = '';
    let child;
    const finish = (rec) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child?.kill('SIGKILL'); } catch { /* gone */ }
      resolve(rec);
    };
    const fail = (why) => finish({ at: now().toISOString(), ok: false, error: String(why).slice(0, 120) });
    const timer = setTimeout(() => fail(`codex app-server timed out after ${Math.round(timeoutMs / 1000)} s`), timeoutMs);
    try {
      child = spawn(codex, ['app-server'], { cwd: '/tmp', env: meterEnv(env), stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
      fail(`codex: ${e.code ?? e.message}`);
      return;
    }
    const send = (o) => { try { child.stdin.write(JSON.stringify(o) + '\n'); } catch { /* exit handler reports it */ } };
    child.on('error', (e) => fail(`codex: ${e.code ?? e.message}`));
    child.on('exit', (code, signal) => fail(signal ? `codex app-server killed (${signal})` : `codex app-server exited ${code}`));
    child.stdin.on('error', () => { /* exit handler reports it */ });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) {
          if (m.error) return fail(`initialize: ${m.error.message ?? 'error'}`);
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read' });
        } else if (m.id === 2) {
          if (m.error) return fail(`rateLimits/read: ${m.error.message ?? 'error'}`);
          return finish(recordFromResult(m.result, now()));
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'mission-control-usage-meter', version: '1' } } });
  });
}

function args(argv) {
  const a = { log: null, codex: process.env.CODEX_BIN || 'codex', timeoutMs: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--log') a.log = expand(argv[++i]);
    else if (v === '--codex') a.codex = argv[++i];
    else if (v === '--timeout-s') a.timeoutMs = Number(argv[++i]) * 1000;
    else if (v === '--help' || v === '-h') {
      console.log('Usage: codex-meter.mjs --log FILE [--codex BIN] [--timeout-s N]');
      process.exit(0);
    }
  }
  if (!a.log) throw new Error('--log is required');
  return a;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const a = args(process.argv.slice(2));
  const rec = await readRateLimits({ codex: a.codex, timeoutMs: a.timeoutMs });
  mkdirSync(dirname(a.log), { recursive: true });
  appendFileSync(a.log, JSON.stringify(rec) + '\n');
  console.log(rec.ok
    ? `[codex-meter] week ${rec.secondary_used_pct ?? '?'}% (resets ${rec.secondary_resets_at ?? '?'}), 5h ${rec.primary_used_pct ?? '?'}%`
    : `[codex-meter] unreadable (${rec.error})`);
  process.exit(rec.ok ? 0 : 1);
}
