/*
 * The brain harvester.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/brain.ts --dry-run
 *
 * Reads `~/dev/brain` — the chief-of-staff repo — and reconciles three things
 * into the `mission` schema: the scheduled-job registry, the client brains, and
 * the briefs those jobs have produced.
 *
 * WHY A SYNC RATHER THAN READING THE FILES FROM THE APP. Mission Control runs
 * on Vercel, which cannot see `~/dev` at all. The same constraint that forces a
 * job needing a repo to be a dev-server timer forces this to be one: the
 * harvester runs where the files are, the app reads only the database.
 *
 * ONE-WAY, ALWAYS. This never writes to the brain repo. That repo is git-first
 * by design and has its own session committing to it on a timer; a write from
 * here would land in another working tree. Changing what this page shows means
 * changing the file, and the next run notices — the same contract projects.ts
 * holds against every other repo.
 *
 * ONE THING IT WILL NOT DO. `clients/_ownership.md` is Eric's own corrections
 * to what the mailbox implied, and it overrides everything. This sync reads it
 * first and lets it win; where a profile disagrees, the disagreement is
 * reported and the file is believed. See parse/clientBrain.ts.
 */

import { loadEnv } from './lib/env.ts';
import { createSyncClient, type SyncClient } from './lib/db.ts';
import {
  assertBrainRepo,
  readClientFolders,
  readOutputs,
  readOwnership,
  readRegistry,
  type BrainOutput,
} from './lib/brain.ts';
import { outputKeyFor, parseRegistry, type RegistryJob } from './parse/registry.ts';
import {
  ownershipFor,
  ownershipKey,
  parseDisplayName,
  parseLastContact,
  parseOwnership,
  parseStatus,
  type ClientBrain,
} from './parse/clientBrain.ts';

type Args = { dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file-if-exists=.env.local scripts/sync/brain.ts [--dry-run]\n' +
          '  --dry-run   read and report, write nothing\n\n' +
          'Reads $BRAIN_ROOT (default ~/dev/brain). Never writes to it.\n',
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

/*
 * Reconcile one table against what was read.
 *
 * Rows are upserted on their natural key and anything not seen this run is
 * DELETED rather than closed — the opposite of what projects.ts does with
 * tasks, and deliberately so. A task that vanishes from a file may still be
 * work someone is doing, so it is closed with a reason. A job that vanishes
 * from REGISTRY.md is not a job any more; keeping a tombstone would put a
 * retired cron on an inventory whose only purpose is to say what runs.
 */
async function reconcile<T extends Record<string, unknown>>(
  db: SyncClient,
  table: string,
  keyColumn: string,
  userId: string,
  rows: T[],
  dryRun: boolean,
): Promise<{ written: number; removed: number }> {
  const now = new Date().toISOString();
  const stamped = rows.map((r) => ({ ...r, user_id: userId, last_seen_at: now, synced_at: now }));

  if (dryRun) {
    const { data: existing } = await db.from(table).select(keyColumn).eq('user_id', userId);
    const keys = new Set(stamped.map((r) => String(r[keyColumn])));
    // supabase-js parses the column list at the type level, and `keyColumn` is
    // a variable here, so it can only resolve to an error type. The shape is
    // known and checked at the one place it is read.
    const rows = (existing ?? []) as unknown as Array<Record<string, unknown>>;
    const removed = rows.filter((e) => !keys.has(String(e[keyColumn]))).length;
    return { written: stamped.length, removed };
  }

  if (stamped.length) {
    const { error } = await db
      .from(table)
      .upsert(stamped, { onConflict: `user_id,${keyColumn}` });
    if (error) throw new Error(`Upsert into ${table} failed: ${error.message}`);
  }

  const { data: stale, error: staleError } = await db
    .from(table)
    .select(`id, ${keyColumn}`)
    .eq('user_id', userId)
    .lt('last_seen_at', now);
  if (staleError) throw new Error(`Could not read ${table}: ${staleError.message}`);

  const ids = ((stale ?? []) as unknown as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    const { error } = await db.from(table).delete().in('id', ids);
    if (error) throw new Error(`Delete from ${table} failed: ${error.message}`);
  }

  return { written: stamped.length, removed: ids.length };
}

/*
 * Join the registry to what is actually on disk.
 *
 * A job's row says what should run; `jobs/out/` says what did. The join is on
 * the output key, which is the prompt filename where the registry names one —
 * see outputKeyFor, and note that the timer `job-honey-lake-friday` and the
 * file `honey-lake-friday-2026-09-07.md` only meet through it.
 *
 * Outputs with no registry job are NOT dropped. A brief being produced by
 * something nobody wrote down is precisely the invisibility this page exists to
 * end, so they are counted and reported.
 */
function joinOutputs(jobs: RegistryJob[], outputs: BrainOutput[]) {
  const known = new Set(jobs.map((j) => outputKeyFor(j)));
  const unregistered = [...new Set(outputs.filter((o) => !known.has(o.jobName)).map((o) => o.jobName))];
  return { unregistered };
}

/*
 * Build one row per client folder, plus one per ownership account with no
 * folder at all.
 *
 * The second half matters as much as the first: `_ownership.md` names JW Supply
 * and Main Source Supply, and neither has a brain. An account Eric has told the
 * system about but which nothing has gathered context on is a gap, and a list
 * that quietly showed only folders would never say so.
 */
function buildClients(
  folders: ReturnType<typeof readClientFolders>,
  ownershipSource: string,
): { clients: ClientBrain[]; conflicts: string[] } {
  const entries = parseOwnership(ownershipSource);
  const conflicts: string[] = [];
  const claimed = new Set<string>();

  const clients: ClientBrain[] = folders.map((folder) => {
    const owned = ownershipFor(entries, folder.slug);
    if (owned) claimed.add(owned.account);

    const status = parseStatus(folder.profile);

    /*
     * The guard. `_ownership.md` is the account's state; profile.md is what a
     * job read out of the mailbox. Where the file governs an account, a status
     * that reads as lapsed cannot be shown — the sweep called Blue Sky Day the
     * best re-engagement prospect on exactly that evidence, and it was wrong:
     * the account is active, its correspondence simply lives with Tyler.
     */
    const looksDormant = status !== null && /dormant|lapsed|stale|inactive|at.risk|cold/i.test(status);

    if (owned && looksDormant) {
      conflicts.push(
        `${folder.slug}: profile.md says "${status}" but _ownership.md governs this account ` +
          `(owner ${owned.owner ?? 'unstated'}). Showing ownership, not the inferred status.`,
      );
    }

    return {
      slug: folder.slug,
      name: parseDisplayName(folder.headingSource) ?? owned?.account ?? folder.slug,
      status: owned && looksDormant ? null : status,
      owner: owned?.owner ?? null,
      ericRole: owned?.ericRole ?? null,
      ownershipGoverned: owned !== null,
      lastContactOn: parseLastContact(folder.profile),
      files: folder.files,
      hasProposed: folder.hasProposed,
      hasFolder: true,
    };
  });

  for (const entry of entries) {
    if (claimed.has(entry.account)) continue;
    // Guard against a second row for a folder that matched ambiguously.
    if (folders.some((f) => ownershipKey(entry.account) === f.slug)) continue;
    clients.push({
      slug: ownershipKey(entry.account),
      name: entry.account,
      status: null,
      owner: entry.owner,
      ericRole: entry.ericRole,
      ownershipGoverned: true,
      lastContactOn: null,
      files: [],
      hasProposed: false,
      hasFolder: false,
    });
  }

  return { clients, conflicts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  assertBrainRepo(env.brainRoot);
  const db = createSyncClient(env);

  const started = new Date().toISOString();
  console.log(
    `\n${args.dryRun ? 'DRY RUN — nothing will be written' : 'SYNCING'}  ${env.brainRoot}\n`,
  );

  const jobs = parseRegistry(readRegistry(env.brainRoot));
  const outputs = readOutputs(env.brainRoot);
  const folders = readClientFolders(env.brainRoot);
  const { clients, conflicts } = buildClients(folders, readOwnership(env.brainRoot));
  const { unregistered } = joinOutputs(jobs, outputs);

  const byMechanism = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.mechanism] = (acc[j.mechanism] ?? 0) + 1;
    return acc;
  }, {});

  const jobResult = await reconcile(
    db,
    'brain_jobs',
    'source_ref',
    env.userId,
    jobs.map((j) => ({
      source_ref: j.sourceRef,
      name: j.name,
      mechanism: j.mechanism,
      host: j.host,
      project: j.project,
      schedule: j.schedule,
      cadence: j.cadence,
      what: j.what,
      prompt_path: j.promptPath,
      output_key: outputKeyFor(j),
      state: j.state,
      position: j.position,
    })),
    args.dryRun,
  );

  const clientResult = await reconcile(
    db,
    'brain_clients',
    'slug',
    env.userId,
    clients.map((c) => ({
      slug: c.slug,
      name: c.name,
      status: c.status,
      owner: c.owner,
      eric_role: c.ericRole,
      ownership_governed: c.ownershipGoverned,
      last_contact_on: c.lastContactOn,
      has_proposed: c.hasProposed,
      proposed_at: folders.find((f) => f.slug === c.slug)?.proposedAt ?? null,
      files: c.files,
      has_folder: c.hasFolder,
      last_commit_at: folders.find((f) => f.slug === c.slug)?.lastCommitAt ?? null,
    })),
    args.dryRun,
  );

  const outputResult = await reconcile(
    db,
    'brain_outputs',
    'path',
    env.userId,
    outputs.map((o) => ({
      path: o.path,
      job_name: o.jobName,
      produced_on: o.producedOn,
      body: o.body,
      format: o.format,
      bytes: o.bytes,
      committed_at: o.committedAt,
    })),
    args.dryRun,
  );

  console.log(
    `jobs      ${String(jobResult.written).padStart(4)} filed` +
      `   (${Object.entries(byMechanism).map(([m, n]) => `${n} ${m}`).join(', ') || 'none'})` +
      `${jobResult.removed ? `   ${jobResult.removed} gone` : ''}`,
  );
  console.log(
    `clients   ${String(clientResult.written).padStart(4)} filed` +
      `   (${clients.filter((c) => !c.hasFolder).length} named in _ownership.md with no brain,` +
      ` ${clients.filter((c) => c.hasProposed).length} awaiting Eric)` +
      `${clientResult.removed ? `   ${clientResult.removed} gone` : ''}`,
  );
  console.log(
    `outputs   ${String(outputResult.written).padStart(4)} filed` +
      `${outputResult.removed ? `   ${outputResult.removed} gone` : ''}`,
  );

  if (unregistered.length) {
    console.log(
      `\n  ${unregistered.length} job(s) have produced output but are not in jobs/REGISTRY.md:\n` +
        unregistered.map((n) => `    ${n}`).join('\n') +
        '\n  Add a row there in the same commit that creates a job.',
    );
  }
  for (const conflict of conflicts) console.log(`\n  ownership conflict — ${conflict}`);

  if (args.dryRun) {
    console.log('\n(dry run — no writes)');
    return;
  }

  await db.from('sync_runs').insert({
    user_id: env.userId,
    source: 'brain',
    status: 'ok',
    started_at: started,
    finished_at: new Date().toISOString(),
    items_seen: jobs.length + clients.length + outputs.length,
    items_created: jobResult.written + clientResult.written + outputResult.written,
    items_updated: 0,
    items_closed: jobResult.removed + clientResult.removed + outputResult.removed,
    dry_run: false,
    log: {
      brain_root: env.brainRoot,
      jobs_by_mechanism: byMechanism,
      unregistered_jobs: unregistered,
      ownership_conflicts: conflicts,
      clients_without_brain: clients.filter((c) => !c.hasFolder).map((c) => c.name),
    },
  });
}

main().catch((err) => {
  console.error(`\n[sync:brain] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
