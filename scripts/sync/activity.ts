/*
 * The bot activity harvester, for /activity.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/activity.ts --dry-run
 *   node scripts/sync/activity.ts --dry-run --json      (print the rows; no DB)
 *
 * Reads ~/dev/brain (channel note frontmatter, the open-loops ledger, the
 * allowlisted runs/*.jsonl) and files scrubbed rows in
 * mission.bot_activity_items, one run row in mission.bot_activity_runs.
 * Runs every 5 minutes from mission-control-activity.timer on ubuntu-dev.
 *
 * WHY A HARVESTER. Vercel cannot see ~/dev, the brain repo is private, and
 * much of runs/ is untracked. A box-side harvester keeps secrets and raw text
 * on the box: the scrub (parse/activity.ts) happens before anything leaves it.
 *
 * ONE-WAY, ALWAYS. Never writes to the brain. Each run replaces the 7-day
 * window: rows are upserted on (user_id, source_key) and any row not produced
 * this run is deleted, so a note that closes or ages out leaves the page on
 * the next run.
 */

import { loadEnv, expandHome } from './lib/env.ts';
import { createSyncClient, type SyncClient } from './lib/db.ts';
import { assertBrainRepo } from './lib/brain.ts';
import { harvest } from './lib/activity.ts';
import { WINDOW_DAYS, type ActivityItem } from './parse/activity.ts';

type Args = { dryRun: boolean; json: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, json: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file-if-exists=.env.local scripts/sync/activity.ts [--dry-run] [--json]\n' +
          '  --dry-run   read and report, write nothing\n' +
          '  --json      print the scrubbed rows as JSON and exit; needs no database\n\n' +
          'Reads $BRAIN_ROOT (default ~/dev/brain). Never writes to it.\n',
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function toRow(i: ActivityItem) {
  return {
    source: i.source,
    source_key: i.sourceKey,
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

/*
 * Upsert on (user_id, source_key), then delete whatever this run did not
 * produce. The same contract as brain.ts's reconcile: a row here renders a
 * file, so a row the file no longer implies is removed rather than closed.
 */
async function reconcile(db: SyncClient, userId: string, items: ActivityItem[], now: string) {
  const rows = items.map((i) => ({ ...toRow(i), user_id: userId, last_seen_at: now, synced_at: now, updated_at: now }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('bot_activity_items')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,source_key' });
    if (error) throw new Error(`Upsert into bot_activity_items failed: ${error.message}`);
  }
  const { data: stale, error } = await db
    .from('bot_activity_items')
    .select('id')
    .eq('user_id', userId)
    .lt('last_seen_at', now);
  if (error) throw new Error(`Could not read bot_activity_items: ${error.message}`);
  const ids = (stale ?? []).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: delError } = await db.from('bot_activity_items').delete().in('id', ids.slice(i, i + 200));
    if (delError) throw new Error(`Delete from bot_activity_items failed: ${delError.message}`);
  }
  return { written: rows.length, removed: ids.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const started = now.toISOString();

  if (args.json) {
    // No database and no keys: the rows exactly as they would be written.
    const brainRoot = expandHome(process.env.BRAIN_ROOT ?? `${process.env.DEV_ROOT ?? '~/dev'}/brain`);
    assertBrainRepo(brainRoot);
    const { items } = harvest(brainRoot, now);
    console.log(JSON.stringify(items.map(toRow), null, 2));
    return;
  }

  const env = loadEnv();
  assertBrainRepo(env.brainRoot);
  const db = createSyncClient(env);
  console.log(`\n${args.dryRun ? 'DRY RUN — nothing will be written' : 'SYNCING'}  ${env.brainRoot}\n`);

  let result;
  try {
    result = harvest(env.brainRoot, now);
  } catch (err) {
    if (!args.dryRun) {
      await db.from('bot_activity_runs').insert({
        user_id: env.userId,
        status: 'error',
        started_at: started,
        finished_at: new Date().toISOString(),
        log: { error: err instanceof Error ? err.message.slice(0, 200) : 'harvest failed' },
      });
    }
    throw err;
  }

  const counts = result.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.kind] = (acc[i.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `read      ${result.read.notes} notes, ${result.read.loopsWaiting} loops on Eric, ` +
      `${result.read.loopsClosed} closed, ${result.read.logs} job logs`,
  );
  console.log(
    `rows      ${result.items.length}  (${counts.waiting ?? 0} waiting, ${counts.in_progress ?? 0} in progress, ` +
      `${counts.finished ?? 0} finished, ${counts.event ?? 0} events)`,
  );
  const blockedTotal = Object.values(result.blocked).reduce((a, b) => a + b, 0);
  if (blockedTotal) console.log(`blocked   ${blockedTotal} row(s) failed the leak gate: ${JSON.stringify(result.blocked)}`);

  if (args.dryRun) {
    console.log('\n(dry run — no writes)');
    return;
  }

  const written = await reconcile(db, env.userId, result.items, started);
  console.log(`written   ${written.written}${written.removed ? `   ${written.removed} gone` : ''}`);

  const { error } = await db.from('bot_activity_runs').insert({
    user_id: env.userId,
    status: 'ok',
    started_at: started,
    finished_at: new Date().toISOString(),
    items_seen: result.items.length,
    items_written: written.written,
    items_removed: written.removed,
    log: { window_days: WINDOW_DAYS, by_kind: counts, read: result.read, blocked: result.blocked },
  });
  if (error) throw new Error(`Could not record the run: ${error.message}`);

  // Runs are a heartbeat, not history: keep two days.
  await db
    .from('bot_activity_runs')
    .delete()
    .eq('user_id', env.userId)
    .lt('started_at', new Date(now.getTime() - 2 * 864e5).toISOString());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\n[sync:activity] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
