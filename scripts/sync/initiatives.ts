/*
 * The coding-initiatives harvester.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/initiatives.ts --dry-run
 *
 * Reads the brain's `docs/initiatives.yml` (Coding maintains it) and every
 * `channel/from-grokbot/*.md` note carrying `initiative: <id>`, and mirrors
 * them onto /projects: one mission.projects row per initiative
 * (kind = 'initiative', slug `initiative-<id>`, rag, plan %, blockers), its
 * phases and notes as tasks (source = 'initiative').
 *
 * Eric, 2026-10-21 7:51 AM ET: a daily shortlist of the major coding
 * initiatives against plan, on the projects module. projects.ts only reads
 * each repo's TASKS.md, so none of this reached Mission Control before.
 *
 * NO MODEL. Parsing and counting only; see parse/initiatives.ts.
 *
 * ONE-WAY, like brain.ts: never writes to the brain repo. A phase is changed
 * in the file, and the next run notices. Tasks follow the same edited_at
 * contract as every other harvested task (lib/reconcile.ts).
 *
 * A MISSING FILE IS NOT A FAILURE. Until Coding writes initiatives.yml this
 * exits 0 saying so, because it runs after projects.ts in the same oneshot
 * unit and must not turn the whole sync red. A file that is there and does
 * not parse IS a failure: exit 1, nothing written.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './lib/env.ts';
import { createSyncClient, type SyncClient } from './lib/db.ts';
import { reconcile } from './lib/reconcile.ts';
import {
  parseInitiatives,
  parseNoteRef,
  planPct,
  projectSlug,
  tasksFor,
  type Initiative,
  type NoteRef,
} from './parse/initiatives.ts';

const FILE = 'docs/initiatives.yml';
const NOTES = 'channel/from-grokbot';

function parseArgs(argv: string[]) {
  const args = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file-if-exists=.env.local scripts/sync/initiatives.ts [--dry-run]\n' +
          `  --dry-run   read, print the diff against the database, write nothing\n\n` +
          `Reads $BRAIN_ROOT/${FILE} and $BRAIN_ROOT/${NOTES}/*.md. Never writes to them.\n`,
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readNotes(brainRoot: string): NoteRef[] {
  const dir = join(brainRoot, NOTES);
  if (!existsSync(dir)) return [];
  const out: NoteRef[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const ref = parseNoteRef(f, readFileSync(join(dir, f), 'utf8'));
      if (ref) out.push(ref);
    } catch {
      /* unreadable note: not ours to judge */
    }
  }
  return out;
}

function projectFields(init: Initiative) {
  const pct = planPct(init);
  return {
    title: init.name,
    kind: 'initiative',
    rag: init.rag,
    plan_pct: pct,
    owner_session: init.owner,
    plan_doc: init.plan,
    blockers: init.blockers,
    last_activity_at: init.lastActivityDate,
    next_step: init.next,
    status: pct === 100 ? 'completed' : 'active',
    description:
      `Coding initiative, mirrored from brain ${FILE}` +
      (init.plan ? ` · plan: ${init.plan}` : '') +
      (init.lastActivity ? ` · last activity: ${init.lastActivity}` : ''),
  };
}

const SHOWN = ['title', 'rag', 'plan_pct', 'owner_session', 'status', 'blockers', 'next_step'] as const;

function diffLine(before: Record<string, unknown> | null, after: Record<string, unknown>): string {
  if (!before) return 'new project';
  const changes = SHOWN.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).map(
    (k) => `${k}: ${JSON.stringify(before[k] ?? null)} -> ${JSON.stringify(after[k] ?? null)}`,
  );
  return changes.length ? changes.join('; ') : 'no project change';
}

async function upsertProject(db: SyncClient, userId: string, init: Initiative, dryRun: boolean) {
  const slug = projectSlug(init.id);
  const fields = projectFields(init);
  const { data: prior, error } = await db
    .from('projects')
    .select('id, title, rag, plan_pct, owner_session, status, blockers, next_step, domain')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Could not read project ${slug}: ${error.message}`);

  console.log(`  ${slug.padEnd(40)} ${diffLine(prior, fields)}`);
  if (dryRun) return prior ? { id: prior.id as string, domain: (prior.domain as string | null) ?? 'work' } : null;

  const now = new Date().toISOString();
  if (prior) {
    const { error: upErr } = await db
      .from('projects')
      .update({ ...fields, last_synced_at: now })
      .eq('id', prior.id);
    if (upErr) throw new Error(`Could not update project ${slug}: ${upErr.message}`);
    return { id: prior.id as string, domain: (prior.domain as string | null) ?? 'work' };
  }
  const { data, error: insErr } = await db
    .from('projects')
    .insert({ user_id: userId, slug, domain: 'work', sync_enabled: true, last_synced_at: now, ...fields })
    .select('id, domain')
    .single();
  if (insErr || !data) throw new Error(`Could not create project ${slug}: ${insErr?.message}`);
  return { id: data.id as string, domain: (data.domain as string | null) ?? 'work' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const path = join(env.brainRoot, FILE);

  if (!existsSync(path)) {
    console.log(`[sync:initiatives] ${path} does not exist yet; nothing to mirror.`);
    return;
  }

  const { initiatives, problems } = parseInitiatives(readFileSync(path, 'utf8'));
  for (const p of problems) console.warn(`[sync:initiatives] ${FILE}: ${p}`);
  const notes = readNotes(env.brainRoot);
  const known = new Set(initiatives.map((i) => i.id));
  for (const n of notes.filter((x) => !known.has(x.initiative))) {
    console.warn(`[sync:initiatives] ${NOTES}/${n.file} names initiative "${n.initiative}", which is not in ${FILE}`);
  }

  console.log(
    `\n${args.dryRun ? 'DRY RUN — nothing will be written' : 'SYNCING'}  ${initiatives.length} initiatives, ` +
      `${notes.length} linked notes\n`,
  );

  const db = createSyncClient(env);
  const started = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let closed = 0;
  let failed = 0;
  const log: Record<string, unknown>[] = [];

  for (const init of initiatives) {
    const tasks = tasksFor(init, notes);
    // One bad initiative must not stop the rest, or the run row below.
    let project: Awaited<ReturnType<typeof upsertProject>>;
    try {
      project = await upsertProject(db, env.userId, init, args.dryRun);
    } catch (err) {
      console.error(`[sync:initiatives] ${err instanceof Error ? err.message : String(err)}; skipped`);
      failed += 1;
      log.push({ id: init.id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (args.dryRun) {
      console.log(`    ${tasks.length} tasks (${tasks.filter((t) => t.status === 'done').length} done), plan ${planPct(init) ?? '-'}%`);
      continue;
    }
    if (!project) continue;
    const r = await reconcile(db, env.userId, project.id, project.domain, tasks, 'initiative', 'initiatives');
    created += r.created;
    updated += r.updated;
    closed += r.closed;
    failed += r.failed;
    log.push({ id: init.id, rag: init.rag, plan_pct: planPct(init), ...r });
  }

  console.log(
    `\ncreated ${created}   updated ${updated}   closed ${closed}   failed ${failed}` +
      (args.dryRun ? '   (dry run — no writes)' : ''),
  );

  if (!args.dryRun) {
    const { error: runError } = await db.from('sync_runs').insert({
      user_id: env.userId,
      source: 'initiatives',
      status: failed > 0 ? 'error' : 'ok',
      started_at: started,
      finished_at: new Date().toISOString(),
      items_seen: initiatives.length,
      items_created: created,
      items_updated: updated,
      items_closed: closed,
      dry_run: false,
      log: { initiatives: log, problems, failed },
    });
    // /sync reads this row; one that did not land makes the mirror look stale.
    if (runError) console.error(`[sync:initiatives] could not record the run: ${runError.message}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n[sync:initiatives] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
