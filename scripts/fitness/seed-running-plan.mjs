#!/usr/bin/env node
/**
 * One-time seed of the running plan function for one user, run by a session
 * on the box AFTER the PR and migration 20261102154130 are live, through the
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
 * Insert-only and idempotent: a row that already exists (plan by title +
 * version, session by dedupe key, recommendation by plan + ordinal, doc by
 * slug) is left exactly as it is, never overwritten.
 *
 * Rollback deletes only what this script created. Apply writes a receipt of
 * the created row ids next to the seed files (`.seed-receipt.json`, mode 600,
 * outside git); --rollback deletes exactly those ids, and keeps the plan if
 * anything not in the receipt (a later session or recommendation) points at it.
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

const receiptPath = path.join(dir, '.seed-receipt.json');

if (mode === 'rollback') {
  if (!fs.existsSync(receiptPath)) fail(`no receipt at ${receiptPath}: nothing this script created is known, so nothing is deleted`);
  const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (r.user_id !== userId) fail('receipt is for a different user; nothing deleted');
  const del = (table, ids) =>
    ids.length ? must(db.from(table).delete().eq('user_id', userId).in('id', ids).select('id'), `delete ${table}`) : [];
  const gone = {
    sessions: (await del('running_sessions', r.session_ids ?? [])).length,
    recommendations: (await del('coaching_recommendations', r.recommendation_ids ?? [])).length,
    docs: (await del('health_access_docs', r.doc_ids ?? [])).length,
    plans: 0,
  };
  if (r.plan_id) {
    const [sc, cc] = await Promise.all([
      db.from('running_sessions').select('id', { count: 'exact', head: true }).eq('plan_id', r.plan_id),
      db.from('coaching_recommendations').select('id', { count: 'exact', head: true }).eq('plan_id', r.plan_id),
    ]);
    // Fail closed: a count we could not read is never taken as zero.
    if (sc.error || cc.error || sc.count == null || cc.count == null) {
      fail(`could not count rows still using plan ${r.plan_id}; plan kept, receipt kept for a retry`);
    }
    const s = sc.count;
    const c = cc.count;
    if (s + c > 0) {
      console.log(`kept plan ${r.plan_id}: ${s} session(s) and ${c} recommendation(s) added after seeding still use it`);
    } else {
      gone.plans = (await del('running_plans', [r.plan_id])).length;
    }
  }
  fs.renameSync(receiptPath, `${receiptPath}.rolled-back-${Date.now()}`);
  console.log(`rolled back: ${JSON.stringify(gone)}`);
  process.exit(0);
}

// The receipt is written after every insert, so a run that dies halfway still
// records what it created and --rollback can remove it.
const prior = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
if (prior && prior.user_id !== userId) fail('a receipt for a different user is already here; nothing written');
const created = {
  user_id: userId,
  plan_id: prior?.plan_id ?? null,
  session_ids: prior?.session_ids ?? [],
  recommendation_ids: prior?.recommendation_ids ?? [],
  doc_ids: prior?.doc_ids ?? [],
  applied_at: new Date().toISOString(),
};
const saveReceipt = () => fs.writeFileSync(receiptPath, JSON.stringify(created, null, 2), { mode: 0o600 });
const addIds = (k, rows) => { created[k] = [...new Set([...created[k], ...rows.map((r) => r.id)])]; saveReceipt(); };

const existingPlan = await must(
  db.from('running_plans').select('id').eq('user_id', userId).eq('title', plan.name).eq('version', VERSION).maybeSingle(),
  'read plan',
);
let planId = existingPlan?.id;
if (!planId) {
  const active = await must(db.from('running_plans').select('id').eq('user_id', userId).eq('status', 'active'), 'read active plan');
  if (active.length) fail('another running plan is active; archive it in the app first. Nothing written');
  const row = await must(
    db.from('running_plans').insert({
      user_id: userId, title: plan.name, goal: plan.race.goal ?? null, version: VERSION,
      body: plan, body_md: planMd, status: 'active',
    }).select('id').single(),
    'insert plan',
  );
  planId = row.id;
  created.plan_id = planId;
  saveReceipt();
}

const [session] = sessions;
const sessionRows = await must(
  db.from('running_sessions').upsert(
    { ...session, user_id: userId, plan_id: planId, source: 'manual', dedupe_key: SESSION_KEY },
    { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
  ).select('id'),
  'insert session',
);
addIds('session_ids', sessionRows);

const recRows = await must(
  db.from('coaching_recommendations').upsert(
    recs.map((r) => ({ ...r, user_id: userId, plan_id: planId, status: 'pending_review' })),
    { onConflict: 'plan_id,ordinal', ignoreDuplicates: true },
  ).select('id'),
  'insert recommendations',
);
addIds('recommendation_ids', recRows);

const docRows = await must(
  db.from('health_access_docs').upsert(
    { user_id: userId, slug: DOC_SLUG, title: doc.title, body: doc.body },
    { onConflict: 'user_id,slug', ignoreDuplicates: true },
  ).select('id'),
  'insert doc',
);
addIds('doc_ids', docRows);

console.log(
  `applied: plan ${planId}${existingPlan ? ' (already there, untouched)' : ' (created)'}, ` +
  `created ${sessionRows.length} session, ${recRows.length} recommendations, ${docRows.length} doc; receipt ${receiptPath}`,
);
