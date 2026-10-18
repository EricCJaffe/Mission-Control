#!/usr/bin/env node
/*
 * AI usage meter, uploader half. Runs on ubuntu-dev (where the service-role
 * key lives, in ~/.config/mission-control/sync.env, same as scripts/sync).
 *
 *   npm run usage:collect               # collect ubuntu-dev logs + inbox + manual, upload
 *   npm run usage:collect -- --dry-run  # same, print a summary, write nothing
 *
 * Inputs:
 *   1. This host's Claude Code / Codex logs (collect-logs.mjs, read only).
 *   2. $AI_USAGE_INBOX/*.json (default ~/.local/share/ai-usage/inbox):
 *      collector output pushed here from other hosts (the box, the Mac mini;
 *      see deploy/ai-usage/box-collect.sh). Moved to inbox/done/ after upload.
 *   3. $AI_USAGE_MANUAL (default $BRAIN_ROOT/ai-usage/manual.jsonl): manual
 *      readings, e.g. Grok Bot Ultra from its Usage settings page, appended
 *      daily by Chief of Staff. Format in rows.mjs parseManual.
 *
 * Writes: mission.ai_plans (from config/ai-usage-plans.json) and
 * mission.ai_usage_snapshots. Log rows: each host's window is REPLACED in
 * one transaction (mission.ai_usage_replace_log_window), so re-runs and
 * re-attribution are idempotent. Manual rows: upserted on the unique key. Every row carries user_id = MC_USER_ID explicitly (service role
 * bypasses RLS). Schema is always `mission`.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { collectAll, defaultClaudeDirs } from './collect-logs.mjs';
import { loadMapping } from './attribution.mjs';
import { attributeRows, newestPerHost, parseManual, UNIQUE_COLS } from './rows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

function args(argv) {
  const a = { dryRun: false, local: true, days: 28, host: process.env.AI_USAGE_HOST ?? 'ubuntu-dev' };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dry-run') a.dryRun = true;
    else if (v === '--no-local') a.local = false;
    else if (v === '--days') a.days = Number(argv[++i]);
    else if (v === '--host') a.host = argv[++i];
    else if (v === '--help' || v === '-h') {
      console.log('Usage: upload.mjs [--dry-run] [--no-local] [--days N] [--host NAME]');
      process.exit(0);
    }
  }
  return a;
}

function env(name, ...alts) {
  for (const n of [name, ...alts]) if (process.env[n]) return process.env[n];
  return null;
}

async function main() {
  const a = args(process.argv.slice(2));
  const userId = env('MC_USER_ID');
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!a.dryRun && (!userId || !url || !key)) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MC_USER_ID must be set (EnvironmentFile ~/.config/mission-control/sync.env).');
  }
  if (url && !url.includes('uivawtdmxqutqelwibra')) throw new Error('SUPABASE_URL is not the shared project uivawtdmxqutqelwibra; refusing.');
  const uid = userId ?? '00000000-0000-0000-0000-000000000000';

  const plans = JSON.parse(readFileSync(join(ROOT, 'config', 'ai-usage-plans.json'), 'utf8')).plans;
  const map = loadMapping(JSON.parse(readFileSync(join(ROOT, 'config', 'ai-usage-projects.json'), 'utf8')));

  let collected = [];
  if (a.local) collected.push(await collectAll({ host: a.host, days: a.days, claudeDirs: defaultClaudeDirs(), codexDir: join(homedir(), '.codex', 'sessions') }));

  const inbox = expand(process.env.AI_USAGE_INBOX ?? '~/.local/share/ai-usage/inbox');
  const inboxFiles = [];
  if (existsSync(inbox)) {
    try { chmodSync(inbox, 0o700); } catch { /* not ours */ }
    for (const n of readdirSync(inbox)) {
      const p = join(inbox, n);
      if (!n.endsWith('.json') || !statSync(p).isFile()) continue;
      try {
        const d = JSON.parse(readFileSync(p, 'utf8'));
        if (!Array.isArray(d.rows) || typeof d.host !== 'string') throw new Error('bad shape');
        // The host label comes from the file, but never let a pushed file claim to be this host.
        if (d.host === a.host || d.host === 'manual' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(d.host)) throw new Error(`bad host ${d.host}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.since_day ?? ''))) throw new Error('missing since_day');
        collected.push({ ...d, path: p });
        inboxFiles.push(p);
      } catch (e) {
        console.warn(`[usage] skipping inbox file ${n}: ${e.message}`);
      }
    }
  }

  // One payload per host: the newest. Older inbox files are superseded
  // (each is a full recount of its window), never added together.
  const { keep, superseded } = newestPerHost(collected);
  collected = keep;
  const perHost = collected.map((c) => ({ host: c.host, since: c.since_day, rows: attributeRows(c.rows.map((r) => ({ ...r, host: c.host })), map, uid) }));
  const logRows = perHost.flatMap((h) => h.rows);

  const manualPath = expand(process.env.AI_USAGE_MANUAL ?? join(process.env.BRAIN_ROOT ?? '~/dev/brain', 'ai-usage', 'manual.jsonl'));
  let manual = { rows: [], errors: [] };
  if (existsSync(manualPath)) manual = parseManual(readFileSync(manualPath, 'utf8'), { userId: uid, planSlugs: plans.map((p) => p.slug) });
  for (const e of manual.errors) console.warn(`[usage] manual ${manualPath} ${e}`);

  const rows = [...logRows, ...manual.rows];

  // Summary: per host and plan, tokens and share unattributed.
  const sum = {};
  for (const r of rows) {
    const k = `${r.plan_slug}@${r.host}`;
    sum[k] ??= { rows: 0, tokens: 0, unattributed: 0 };
    sum[k].rows += 1;
    sum[k].tokens += r.tokens_total;
    if (r.project === 'unattributed') sum[k].unattributed += r.tokens_total;
  }
  for (const [k, v] of Object.entries(sum)) {
    const pct = v.tokens ? ((100 * v.unattributed) / v.tokens).toFixed(1) : '0.0';
    console.log(`[usage] ${k}: ${v.rows} rows, ${v.tokens.toLocaleString('en-US')} tokens, ${pct}% unattributed`);
  }
  console.log(`[usage] ${rows.length} rows from ${collected.length} host file(s), ${manual.rows.length} manual reading(s)${a.dryRun ? ' (dry run, nothing written)' : ''}`);
  if (a.dryRun) return;

  const db = createClient(url, key, { db: { schema: 'mission' }, auth: { persistSession: false, autoRefreshToken: false } });
  const planRows = plans.map((p) => ({ user_id: uid, ...p, updated_at: new Date().toISOString() }));
  const { error: pe } = await db.from('ai_plans').upsert(planRows, { onConflict: 'user_id,slug' });
  if (pe) throw new Error(`ai_plans upsert: ${pe.message}`);
  for (const h of perHost) {
    const payload = h.rows.map(({ user_id: _u, source: _s, host: _h, ...r }) => r);
    const { data, error } = await db.rpc('ai_usage_replace_log_window', { p_user_id: uid, p_host: h.host, p_since: h.since, p_rows: payload });
    if (error) throw new Error(`replace window for ${h.host}: ${error.message}`);
    console.log(`[usage] ${h.host}: replaced log rows since ${h.since} with ${data}`);
  }
  if (manual.rows.length) {
    const stamped = manual.rows.map((r) => ({ ...r, captured_at: new Date().toISOString() }));
    const { error } = await db.from('ai_usage_snapshots').upsert(stamped, { onConflict: UNIQUE_COLS.join(',') });
    if (error) throw new Error(`manual upsert: ${error.message}`);
  }
  if (inboxFiles.length) {
    const done = join(inbox, 'done');
    mkdirSync(done, { recursive: true, mode: 0o700 });
    for (const p of inboxFiles) renameSync(p, join(done, `${Date.now()}-${p.split('/').pop()}`));
  }
  void superseded;
  console.log(`[usage] uploaded ${rows.length} rows`);
}

main().catch((e) => {
  console.error(`[usage] failed: ${e.message}`);
  process.exit(1);
});
