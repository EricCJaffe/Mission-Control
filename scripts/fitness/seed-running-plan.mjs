#!/usr/bin/env node
/**
 * One-time seed of the running plan function for one user, run by a session
 * on the box AFTER the PR and migration 20261101160000 are live, through the
 * approved `kind: db-write` path. It reads the content at apply time from
 * untracked files (mode 600) and never prints it: only counts and row ids.
 *
 *   node --env-file-if-exists=.env.local scripts/fitness/seed-running-plan.mjs \
 *     --user-id <auth uid> [--dir ~/.local/share/mc-plan-seed] [--apply | --rollback]
 *
 * Without --apply or --rollback it is a dry run: it parses everything, checks
 * the counts, and writes nothing.
 *
 * Files read from --dir:
 *   *-running-plan-*-v3.json              plan body (validated as a RunningPlan)
 *   *-running-plan-*-v3.md                plan as written (body_md)
 *   *-plan-source-of-truth.md             (b) session 1 table, (c) coaching recs
 *   apple-health-access.md                the Apple Health access reference
 *
 * Idempotent: the plan is matched on title + version, the session on its
 * dedupe key, recommendations on (plan, ordinal), the doc on its slug.
 * --rollback deletes exactly those rows (recommendations go with the plan).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { validateRunningPlan } from '../../src/lib/fitness/running-plan.ts';
import { parseDoc, parseRecommendations, parseSessions } from '../../src/lib/fitness/running-seed.ts';

const VERSION = 'v3';
const SESSION_KEY = 'seed:2026-11-01-session-1';
const DOC_SLUG = 'apple-health-access';
const EXPECTED = { plans: 1, sessions: 1, recommendations: 6, docs: 1 };

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--rollback') ? 'rollback' : 'dry-run';
const userId = arg('--user-id');
const dir = (arg('--dir') ?? path.join(os.homedir(), '.local/share/mc-plan-seed')).replace(/^~/, os.homedir());

function fail(msg) {
  console.error(`seed-running-plan: ${msg}`);
  process.exit(1);
}
if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) fail('--user-id <auth user uuid> is required');

function find(re) {
  const hit = fs.readdirSync(dir).find((f) => re.test(f));
  if (!hit) fail(`no file matching ${re} in ${dir}`);
  return path.join(dir, hit);
}

const planJson = JSON.parse(fs.readFileSync(find(/running-plan.*-v3\.json$/), 'utf8'));
const planMd = fs.readFileSync(find(/running-plan.*-v3\.md$/), 'utf8');
const truthMd = fs.readFileSync(find(/plan-source-of-truth\.md$/), 'utf8');
const accessMd = fs.readFileSync(find(/^apple-health-access\.md$/), 'utf8');

const checked = validateRunningPlan(planJson);
if (!checked.ok) fail(`plan JSON is invalid: ${checked.errors.join('; ')}`);
const plan = checked.plan;
const sessions = parseSessions(truthMd);
const recs = parseRecommendations(truthMd);
const doc = parseDoc(accessMd);

const counts = { plans: 1, sessions: sessions.length, recommendations: recs.length, docs: doc.body ? 1 : 0 };
console.log(`mode: ${mode}`);
console.log(`parsed: ${JSON.stringify(counts)} (expected ${JSON.stringify(EXPECTED)})`);
for (const k of Object.keys(EXPECTED)) {
  if (counts[k] !== EXPECTED[k]) fail(`count mismatch for ${k}: ${counts[k]} != ${EXPECTED[k]}; nothing written`);
}
if (mode === 'dry-run') {
  console.log('dry run: nothing written. Re-run with --apply.');
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)');
const db = createClient(url, key, { db: { schema: 'mission' }, auth: { persistSession: false } });

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

const existingPlan = await must(
  db.from('running_plans').select('id, status').eq('user_id', userId).eq('title', plan.name).eq('version', VERSION).maybeSingle(),
  'read plan',
);

if (mode === 'rollback') {
  await must(db.from('running_sessions').delete().eq('user_id', userId).eq('dedupe_key', SESSION_KEY), 'delete session');
  await must(db.from('health_access_docs').delete().eq('user_id', userId).eq('slug', DOC_SLUG), 'delete doc');
  if (existingPlan) await must(db.from('running_plans').delete().eq('id', existingPlan.id).eq('user_id', userId), 'delete plan');
  console.log(`rolled back: plan ${existingPlan?.id ?? '(none)'}, session ${SESSION_KEY}, doc ${DOC_SLUG}`);
  process.exit(0);
}

let planId = existingPlan?.id;
if (!planId) {
  await must(
    db.from('running_plans').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'active'),
    'archive previous plan',
  );
  const row = await must(
    db.from('running_plans').insert({
      user_id: userId, title: plan.name, goal: plan.race.goal ?? null, version: VERSION,
      body: plan, body_md: planMd, status: 'active',
    }).select('id').single(),
    'insert plan',
  );
  planId = row.id;
}

const [session] = sessions;
const sessionRow = await must(
  db.from('running_sessions').upsert(
    { ...session, user_id: userId, plan_id: planId, source: 'manual', dedupe_key: SESSION_KEY },
    { onConflict: 'user_id,dedupe_key' },
  ).select('id').single(),
  'upsert session',
);

await must(
  db.from('coaching_recommendations').upsert(
    recs.map((r) => ({ ...r, user_id: userId, plan_id: planId, status: 'pending_review', reviewer: 'Dr. Chandler' })),
    { onConflict: 'plan_id,ordinal' },
  ),
  'upsert recommendations',
);

const docRow = await must(
  db.from('health_access_docs').upsert(
    { user_id: userId, slug: DOC_SLUG, title: doc.title, body: doc.body, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,slug' },
  ).select('id').single(),
  'upsert doc',
);

console.log(`applied: plan ${planId}, session ${sessionRow.id}, doc ${docRow.id}, ${recs.length} recommendations`);
