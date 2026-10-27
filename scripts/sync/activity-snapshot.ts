/*
 * One-shot: the bot activity snapshot for /activity (v1).
 *
 *   node scripts/sync/activity-snapshot.ts            writes data/activity-snapshot.json
 *   node scripts/sync/activity-snapshot.ts --stdout   prints it instead
 *
 * Reads ~/dev/brain ($BRAIN_ROOT) with the same readers and the same scrub as
 * the v2 harvester (lib/activity.ts, parse/activity.ts): bot display names
 * only, no ids, addresses or phone numbers, Honey Lake reduced to a status,
 * dropped topics left out, every row through the leak gate.
 *
 * THE OUTPUT IS REAL DATA AND THE REPO IS PUBLIC. data/activity-snapshot.json
 * is gitignored and must never be committed or put under public/. The page
 * reads it server-side behind auth and falls back to the committed synthetic
 * sample (src/lib/activity/sample-snapshot.ts) when it is absent.
 *
 * Needs no database and no keys. Never writes to the brain.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandHome } from './lib/env.ts';
import { assertBrainRepo } from './lib/brain.ts';
import { harvest } from './lib/activity.ts';
import { hashText, type ActivityItem } from './parse/activity.ts';

export function snapshotRow(i: ActivityItem) {
  return {
    id: hashText(i.sourceKey),
    bot: i.bot,
    kind: i.kind,
    title: i.title,
    tag: i.tag,
    project: i.project,
    started_at: i.startedAt,
    ended_at: i.endedAt,
    due_at: i.dueAt,
    pr_url: i.prUrl,
    occurred_at: i.occurredAt,
  };
}

function main() {
  const toStdout = process.argv.includes('--stdout');
  const brainRoot = expandHome(process.env.BRAIN_ROOT ?? `${process.env.DEV_ROOT ?? '~/dev'}/brain`);
  assertBrainRepo(brainRoot);
  const now = new Date();
  const { items, blocked } = harvest(brainRoot, now);
  const snapshot = {
    generated_at: now.toISOString(),
    sample: false,
    items: items.map(snapshotRow),
  };
  const json = JSON.stringify(snapshot);
  if (toStdout) {
    console.log(json);
    return;
  }
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'activity-snapshot.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  const blockedTotal = Object.values(blocked).reduce((a, b) => a + b, 0);
  console.log(`wrote ${items.length} rows to data/activity-snapshot.json${blockedTotal ? ` (${blockedTotal} blocked by the leak gate)` : ''}`);
}

main();
