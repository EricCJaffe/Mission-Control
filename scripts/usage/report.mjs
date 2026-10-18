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
 *   $BRAIN_ROOT/channel/to-grokbot/<YYYY-MM-DD>-ai-usage-alert-<plan>.md
 *     when a plan is projected to run out before its reset. The file name is
 *     the dedupe: at most one per plan per ET day. for: cos, kind: fyi.
 *   Only those paths are committed (pathspec commit), then brain-sync push.
 *
 * Reads mission.ai_plans / mission.ai_usage_snapshots with the service role
 * (same env as upload.mjs). Writes nothing to the database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { planStatus } from './forecast.mjs';
import { etDay } from './collect-logs.mjs';

const write = process.argv.includes('--write');
const brain = (process.env.BRAIN_ROOT ?? '~/dev/brain').replace(/^~(?=\/)/, homedir());
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.MC_USER_ID;
if (!url || !key || !uid) { console.error('[usage-report] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MC_USER_ID required'); process.exit(1); }

const db = createClient(url, key, { db: { schema: 'mission' }, auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date();
const since = new Date(now.getTime() - 35 * 86400000).toISOString().slice(0, 10);
const { data: plans, error: pe } = await db.from('ai_plans').select('*').eq('user_id', uid).eq('active', true).order('slug');
if (pe) { console.error(`[usage-report] ai_plans: ${pe.message}`); process.exit(1); }
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('ai_usage_snapshots')
    .select('plan_slug,source,day,tokens_total,primary_used_pct,primary_window_minutes,primary_resets_at,secondary_used_pct,secondary_window_minutes,secondary_resets_at,last_at,captured_at')
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
const txt = join('open', 'ai-usage.txt');
writeFileSync(join(brain, txt), `# AI usage meter, ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET. One line per plan. Page: https://missioncontrol.bibleos.app/ai-usage\n${lines.join('\n')}\n`);
written.push(txt);

for (const s of statuses.filter((x) => x.runsOutBeforeReset)) {
  const rel = join('channel', 'to-grokbot', `${today}-ai-usage-alert-${s.slug}.md`);
  if (existsSync(join(brain, rel))) continue;
  writeFileSync(join(brain, rel), `---\nstatus: open\nfor: cos\nfrom: mission-control-ai-usage\nkind: fyi\nproject: mission-control\n---\n# ${s.name} is projected to run out before it resets\n\n${s.line}\n\nPage: https://missioncontrol.bibleos.app/ai-usage (suggestions panel lists what to pause or move). One alert per plan per day; this file is the dedupe.\n`);
  written.push(rel);
}

try {
  execFileSync('git', ['-C', brain, 'add', '--', ...written], { stdio: 'ignore' });
  const staged = execFileSync('git', ['-C', brain, 'diff', '--cached', '--name-only', '--', ...written], { encoding: 'utf8' }).trim();
  if (staged) {
    execFileSync('git', ['-C', brain, 'commit', '-q', '-m', `ai-usage: brief lines${written.length > 1 ? ' + run-out alert' : ''} (${today})`, '--', ...written], { stdio: 'ignore' });
    try { execFileSync(join(homedir(), '.local', 'bin', 'brain-sync'), ['push'], { stdio: 'ignore', timeout: 120000 }); } catch { console.warn('[usage-report] brain-sync push failed; the commit is local and the next sync carries it'); }
  }
  console.log(`[usage-report] wrote ${written.join(', ')}`);
} catch (e) {
  console.warn(`[usage-report] brain commit skipped: ${e.message}`);
}
