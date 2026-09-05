/*
 * The project harvester.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/projects.ts --dry-run
 *
 * Reads every task list under ~/dev and reconciles it into mission.tasks.
 * One-way, always: a project's file is the truth about what exists, and
 * Mission Control never writes back. Closing happens in the project, and the
 * next run notices. That is deliberate — it keeps change compartmentalised in
 * each repo, and it means this CLI needs no write access to anything but its
 * own database.
 *
 * WHAT IT INGESTS BY DEFAULT. The corpus holds ~1,270 open items across ten
 * repos. Mirroring all of them into a personal task list produces something
 * nobody reads, so the default is `--mine`: items with your handle on them,
 * plus unassigned urgent items, plus everything from repos that have no
 * assignee convention at all. `--all` takes the lot. Either way the per-repo
 * totals are written to sync_runs.log, so the rollups are honest even when the
 * tasks themselves were not imported.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './lib/env.ts';
import { createSyncClient, type SyncClient } from './lib/db.ts';
import { discoverRepos, taskFilesIn, blobUrl, type Repo } from './lib/repos.ts';
import { guessDomain, PROJECT_SEEDS } from './lib/domains.ts';
import { parseTaskMarkdown, sourceRef, isEric, type ParsedTask } from './parse/markdown.ts';

const SOURCE = 'todo_md';

type Args = {
  dryRun: boolean;
  all: boolean;
  only: string | null;
  /** Ingest tasks at this priority or more urgent. 1 = urgent only. */
  maxPriority: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, all: false, only: null, maxPriority: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--all') args.all = true;
    else if (a === '--project') args.only = argv[++i] ?? null;
    else if (a.startsWith('--project=')) args.only = a.slice('--project='.length);
    else if (a === '--max-priority') args.maxPriority = Number(argv[++i]);
    else if (a.startsWith('--max-priority=')) args.maxPriority = Number(a.slice('--max-priority='.length));
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file-if-exists=.env.local scripts/sync/projects.ts [options]\n' +
          '  --dry-run             read and report, write nothing\n' +
          '  --all                 ingest every open task, not only yours\n' +
          '  --max-priority <1-3>  ingest this urgency or higher (default 1)\n' +
          '  --project <slug>      one project only\n',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

/*
 * Whether an item is worth putting in front of you.
 *
 * A repo with no assignee convention (mission-control, financeos, the
 * intranet-migration list) has no way to say an item is yours, and its tasks
 * are all yours by default — so they all come in. In a repo that does name
 * people, silence means somebody else, and only urgent unowned work surfaces.
 */
function isMine(task: ParsedTask, repoNamesPeople: boolean): boolean {
  if (isEric(task)) return true;
  if (!repoNamesPeople) return true;
  return task.assignees.length === 0 && task.priority === 1;
}

type Harvested = {
  task: ParsedTask;
  sourceRef: string;
  sourceUrl: string | null;
  relPath: string;
};

function harvestRepo(repo: Repo, maxPriority: number): { all: ParsedTask[]; mine: Harvested[]; namesPeople: boolean } {
  const all: ParsedTask[] = [];
  const found: Harvested[] = [];

  for (const relPath of taskFilesIn(repo)) {
    let source: string;
    try {
      source = readFileSync(join(repo.path, relPath), 'utf8');
    } catch {
      continue;
    }
    for (const task of parseTaskMarkdown(source)) {
      all.push(task);
      found.push({
        task,
        sourceRef: sourceRef(relPath, task),
        sourceUrl: blobUrl(repo, relPath, task.line),
        relPath,
      });
    }
  }

  const namesPeople = all.some((t) => t.assignees.length > 0);
  const mine = found.filter(
    (h) => h.task.status === 'todo' && h.task.priority <= maxPriority && isMine(h.task, namesPeople),
  );
  return { all, mine, namesPeople };
}

async function ensureProject(db: SyncClient, userId: string, repo: Repo, dryRun: boolean) {
  const { data: existing } = await db
    .from('projects')
    .select('id, domain, sync_enabled')
    .eq('user_id', userId)
    .eq('slug', repo.slug)
    .maybeSingle();

  if (existing) return existing;
  if (dryRun) return null;

  const seed = PROJECT_SEEDS[repo.slug];
  const { data, error } = await db
    .from('projects')
    .insert({
      user_id: userId,
      title: repo.slug,
      slug: repo.slug,
      repo_path: repo.path,
      domain: guessDomain(repo.slug),
      client: seed?.client ?? null,
      sync_enabled: seed?.sync ?? true,
      status: 'active',
      description: `Synced from ${repo.path}`,
    })
    .select('id, domain, sync_enabled')
    .single();

  if (error) throw new Error(`Could not register project ${repo.slug}: ${error.message}`);
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const db = createSyncClient(env);

  const started = new Date().toISOString();
  const repos = discoverRepos(env.devRoot).filter((r) => !args.only || r.slug === args.only);
  if (args.only && repos.length === 0) throw new Error(`No repo named ${args.only} under ${env.devRoot}`);

  let seen = 0;
  let created = 0;
  let updated = 0;
  let closed = 0;
  const log: Record<string, unknown>[] = [];

  console.log(
    `\n${args.dryRun ? 'DRY RUN — nothing will be written' : 'SYNCING'}  ` +
      `${repos.length} repos under ${env.devRoot}` +
      `${args.all ? '  (everyone)' : '  (yours only)'}  P${args.maxPriority} and above\n`,
  );
  console.log(
    'project'.padEnd(18) + 'open'.padStart(6) + 'mine'.padStart(6) + 'new'.padStart(6) +
      'upd'.padStart(6) + 'closed'.padStart(8) + '  files',
  );

  for (const repo of repos) {
    const { all, mine, namesPeople } = harvestRepo(repo, args.maxPriority);
    const project = await ensureProject(db, env.userId, repo, args.dryRun);

    if (project && project.sync_enabled === false) {
      console.log(`${repo.slug.padEnd(18)}${'—'.padStart(6)}  sync disabled`);
      continue;
    }

    const wanted = args.all
      ? // Everything still open, whoever it belongs to.
        harvestAllOpen(repo, args.maxPriority)
      : mine;

    seen += wanted.length;

    let repoCreated = 0;
    let repoUpdated = 0;
    let repoClosed = 0;

    if (!args.dryRun && project) {
      const result = await reconcile(db, env.userId, project.id, project.domain, wanted);
      repoCreated = result.created;
      repoUpdated = result.updated;
      repoClosed = result.closed;
      created += repoCreated;
      updated += repoUpdated;
      closed += repoClosed;
    }

    const openTotal = all.filter((t) => t.status === 'todo').length;
    log.push({
      project: repo.slug,
      parsed: all.length,
      open: openTotal,
      mine: mine.length,
      names_people: namesPeople,
      created: repoCreated,
      updated: repoUpdated,
      closed: repoClosed,
      files: taskFilesIn(repo),
    });

    console.log(
      repo.slug.padEnd(18) +
        String(openTotal).padStart(6) +
        String(mine.length).padStart(6) +
        String(repoCreated).padStart(6) +
        String(repoUpdated).padStart(6) +
        String(repoClosed).padStart(8) +
        '  ' +
        (taskFilesIn(repo).join(', ') || '(no task file)'),
    );

    if (!args.dryRun && project) {
      await db
        .from('projects')
        .update({ last_synced_at: new Date().toISOString(), repo_path: repo.path })
        .eq('id', project.id);
    }
  }

  console.log(
    `\nseen ${seen}   created ${created}   updated ${updated}   closed ${closed}` +
      (args.dryRun ? '   (dry run — no writes)' : ''),
  );

  if (!args.dryRun) {
    await db.from('sync_runs').insert({
      user_id: env.userId,
      source: 'projects',
      status: 'ok',
      started_at: started,
      finished_at: new Date().toISOString(),
      items_seen: seen,
      items_created: created,
      items_updated: updated,
      items_closed: closed,
      dry_run: false,
      log: { repos: log },
    });
  }
}

function harvestAllOpen(repo: Repo, maxPriority: number): Harvested[] {
  const out: Harvested[] = [];
  for (const relPath of taskFilesIn(repo)) {
    let source: string;
    try {
      source = readFileSync(join(repo.path, relPath), 'utf8');
    } catch {
      continue;
    }
    for (const task of parseTaskMarkdown(source)) {
      if (task.status !== 'todo' || task.priority > maxPriority) continue;
      out.push({ task, sourceRef: sourceRef(relPath, task), sourceUrl: blobUrl(repo, relPath, task.line), relPath });
    }
  }
  return out;
}

/*
 * Reconcile one project's harvest against what is already stored.
 *
 * The rule that makes a two-hourly sync safe to leave running: once a task has
 * an `edited_at`, Mission Control owns its status, priority, due date and
 * domain, and the source may only refresh the title and body. Overwriting a
 * decision made in the UI would teach you to stop making decisions in the UI.
 */
async function reconcile(
  db: SyncClient,
  userId: string,
  projectId: string,
  projectDomain: string | null,
  harvested: Harvested[],
) {
  const now = new Date().toISOString();

  const { data: existing, error } = await db
    .from('tasks')
    .select('id, source_ref, status, edited_at, title, description')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('source', SOURCE);
  if (error) throw new Error(`Could not read existing tasks: ${error.message}`);

  const byRef = new Map((existing ?? []).map((t) => [t.source_ref, t]));
  const seenRefs = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const h of harvested) {
    seenRefs.add(h.sourceRef);
    const prior = byRef.get(h.sourceRef);
    const why = h.task.section.length ? `From ${h.relPath} › ${h.task.section.join(' › ')}` : `From ${h.relPath}`;

    if (!prior) {
      const { error: insertError } = await db.from('tasks').insert({
        user_id: userId,
        project_id: projectId,
        title: h.task.title.slice(0, 500),
        description: h.task.body || null,
        status: h.task.status,
        priority: h.task.priority,
        domain: projectDomain,
        category: null,
        why,
        source: SOURCE,
        source_ref: h.sourceRef,
        source_url: h.sourceUrl,
        external_status: 'open',
        assignee: h.task.assignees.join(', ') || null,
        last_seen_at: now,
        synced_at: now,
      });
      if (insertError) throw new Error(`Insert failed for "${h.task.title}": ${insertError.message}`);
      created += 1;
      continue;
    }

    const patch: Record<string, unknown> = {
      last_seen_at: now,
      synced_at: now,
      external_status: 'open',
      source_url: h.sourceUrl,
    };
    // Untouched here? Then the source is still authoritative for everything.
    if (!prior.edited_at) {
      patch.title = h.task.title.slice(0, 500);
      patch.description = h.task.body || null;
      patch.status = h.task.status;
      patch.priority = h.task.priority;
    }
    const { error: updateError } = await db.from('tasks').update(patch).eq('id', prior.id);
    if (updateError) throw new Error(`Update failed for "${h.task.title}": ${updateError.message}`);
    updated += 1;
  }

  // Anything stored but no longer in the file. Never deleted — closed, with
  // the reason recorded, so a task that vanishes because someone reworded a
  // heading leaves a trace rather than evaporating.
  let closed = 0;
  for (const [ref, prior] of byRef) {
    if (seenRefs.has(ref)) continue;
    const patch: Record<string, unknown> = { external_status: 'gone', synced_at: now };
    if (prior.status === 'todo') {
      patch.status = 'done';
      patch.why = 'closed by sync — no longer in source';
    }
    const { error: closeError } = await db.from('tasks').update(patch).eq('id', prior.id);
    if (closeError) throw new Error(`Close failed: ${closeError.message}`);
    closed += 1;
  }

  return { created, updated, closed };
}

main().catch((err) => {
  console.error(`\n[sync:projects] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
