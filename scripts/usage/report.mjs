#!/usr/bin/env node
/*
 * AI usage meter, P3: one line per plan for the morning brief, and a run-out
 * alert note for Chief of Staff.
 *
 *   node scripts/usage/report.mjs            # print the lines
 *   node scripts/usage/report.mjs --write    # also write the brain files below
 *
 * --write:
 *   $BRAIN_ROOT/open/ai-usage.txt  one line per plan, rewritten every run;
 *     the daily brief reads it ("read the file, do not run the tool").
 *   $BRAIN_ROOT/open/ai-usage.json  the same per plan, machine-readable, for
 *     dispatch-autostart's meter-driven routing (dev-harness). Dispatch treats
 *     a file older than 24h, or missing, as "no meter": today's behavior.
 *   A "routing:" line in ai-usage.txt summarizes the last 24h of
 *     $BRAIN_ROOT/runs/dispatch-routing.jsonl (written by dispatch-autostart).
 *   $BRAIN_ROOT/channel/to-grokbot/<YYYY-MM-DD>-ai-usage-alert-<plan>.md
 *     when a plan is projected to run out before its reset. The file name is
 *     the dedupe: at most one per plan per ET day. for: cos, kind: fyi.
 *   Only those paths are committed (pathspec commit), then brain-sync push.
 *
 * Reads mission.ai_plans / mission.ai_usage_snapshots with the service role
 * (same env as upload.mjs). Writes nothing to the database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { planStatus } from './forecast.mjs';
import { usageJson, routingLine, routeScoreLine } from './routing.mjs';
import { etDay } from './collect-logs.mjs';

const write = process.argv.includes('--write');
const brain = (process.env.BRAIN_ROOT ?? '~/dev/brain').replace(/^~(?=\/)/, homedir());
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.MC_USER_ID;
if (!url || !key || !uid) { console.error('[usage-report] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MC_USER_ID required'); process.exit(1); }
if (!url.includes('uivawtdmxqutqelwibra')) { console.error('[usage-report] SUPABASE_URL is not the shared project uivawtdmxqutqelwibra; refusing.'); process.exit(1); }

const db = createClient(url, key, { db: { schema: 'mission' }, auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date();
const since = new Date(now.getTime() - 35 * 86400000).toISOString().slice(0, 10);
const { data: plans, error: pe } = await db.from('ai_plans').select('*').eq('user_id', uid).eq('active', true).order('slug');
if (pe) { console.error(`[usage-report] ai_plans: ${pe.message}`); process.exit(1); }
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('ai_usage_snapshots')
    .select('plan_slug,source,day,tokens_total,primary_used_pct,primary_window_minutes,primary_resets_at,secondary_used_pct,secondary_window_minutes,secondary_resets_at,meter_at,last_at,captured_at')
    .eq('user_id', uid).gte('day', since).order('id').range(from, from + 999);
  if (error) { console.error(`[usage-report] snapshots: ${error.message}`); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}

const today = etDay(now.toISOString());
const statuses = plans.map((p) => planStatus(p, rows.filter((r) => r.plan_slug === p.slug), now));
const lines = statuses.map((s) => s.line);
for (const l of lines) console.log(l);
if (!write) process.exit(0);

const written = [];
mkdirSync(join(brain, 'open'), { recursive: true });
let routingLog = '';
try { routingLog = readFileSync(join(brain, 'runs', 'dispatch-routing.jsonl'), 'utf8'); } catch { routingLog = ''; }
const route = routingLine(routingLog, now);
const scoreLine = routeScoreLine(routingLog, now);
const txt = join('open', 'ai-usage.txt');
writeFileSync(join(brain, txt), `# AI usage meter, ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET. One line per plan. Page: https://missioncontrol.bibleos.app/ai-usage\n${lines.join('\n')}\n${route ? `${route}\n` : ''}${scoreLine ? `${scoreLine}\n` : ''}`);
written.push(txt);
const js = join('open', 'ai-usage.json');
let capacity = null;
try { capacity = JSON.parse(readFileSync(new URL('../../config/ai-usage-capacity.json', import.meta.url), 'utf8')); } catch (e) { console.warn(`[usage-report] capacity config unreadable (${e.message}); writing the routing file without weights`); }
// Atomic: dispatch-autostart may read this at any moment; a half-written file
// would drop it into the meter-off fallback.
// Never publish a fresh file without Claude main in it: dispatch would treat
// it as "meter on" with no data instead of falling back (the old file ages
// out after 24h and dispatch goes back to today's behavior).
if (statuses.some((x) => x.slug === 'claude-max')) {
  const tmp = join(brain, `${js}.${process.pid}.${Date.now()}.tmp`);   // unique: overlapping runs never share a temp file
  try {
    writeFileSync(tmp, JSON.stringify(usageJson(statuses, now, { plans, capacity }), null, 1) + '\n');
    renameSync(tmp, join(brain, js));
    written.push(js);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    console.warn(`[usage-report] routing file not written: ${e.message}`);
  }
} else {
  console.warn('[usage-report] no claude-max status; routing file left as is (dispatch falls back once it is 24h old)');
}

// Dedupe: the note's file name AND a local state file, so an alert that
// Chief of Staff already moved or archived is not re-raised the same day.
const stateDir = join(homedir(), '.local', 'state', 'ai-usage');
const stateFile = join(stateDir, 'alerted.json');
let alerted = {};
try { alerted = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { alerted = {}; }
for (const s of statuses.filter((x) => x.runsOutBeforeReset)) {
  const slug = String(s.slug).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  const rel = join('channel', 'to-grokbot', `${today}-ai-usage-alert-${slug}.md`);
  if (alerted[`${today}:${slug}`] || existsSync(join(brain, rel))) continue;
  alerted[`${today}:${slug}`] = new Date().toISOString();
  writeFileSync(join(brain, rel), `---\nstatus: open\nfor: cos\nfrom: mission-control-ai-usage\nkind: fyi\nproject: mission-control\n---\n# ${s.name} is projected to run out before it resets\n\n${s.line}\n\nPage: https://missioncontrol.bibleos.app/ai-usage (suggestions panel lists what to pause or move). One alert per plan per day; this file is the dedupe.\n`);
  written.push(rel);
}

mkdirSync(stateDir, { recursive: true });
for (const k of Object.keys(alerted)) if (k.slice(0, 10) < etDay(new Date(Date.now() - 14 * 86400000).toISOString())) delete alerted[k];
writeFileSync(stateFile, JSON.stringify(alerted));

try {
  execFileSync('git', ['-C', brain, 'add', '--', ...written], { stdio: 'ignore' });
  const staged = execFileSync('git', ['-C', brain, 'diff', '--cached', '--name-only', '--', ...written], { encoding: 'utf8' }).trim();
  // Runs every 30 min (Eric 2:13 PM ET 10/18); the files above are always
  // fresh on disk, but the brain commit + push happens at most every 2 h
  // unless this run wrote a run-out alert note.
  const alerting = written.some((w) => w.includes('ai-usage-alert'));
  const stampFile = join(stateDir, 'last-commit');
  let lastCommit = 0;
  try { lastCommit = Number(readFileSync(stampFile, 'utf8')) || 0; } catch { lastCommit = 0; }
  const due = alerting || now.getTime() - lastCommit >= 2 * 3600000 || process.env.AI_USAGE_COMMIT === '1';
  if (staged && !due) execFileSync('git', ['-C', brain, 'reset', '-q', '--', ...written], { stdio: 'ignore' });
  if (staged && due) {
    writeFileSync(stampFile, String(now.getTime()));
    execFileSync('git', ['-C', brain, 'commit', '-q', '-m', `ai-usage: brief lines${alerting ? ' + run-out alert' : ''} (${today})`, '--', ...written], { stdio: 'ignore' });
    try { execFileSync(join(homedir(), '.local', 'bin', 'brain-sync'), ['push'], { stdio: 'ignore', timeout: 120000 }); } catch { console.warn('[usage-report] brain-sync push failed; the commit is local and the next sync carries it'); }
  }
  console.log(`[usage-report] wrote ${written.join(', ')}`);
} catch (e) {
  console.warn(`[usage-report] brain commit skipped: ${e.message}`);
}
