/*
 * Deliver Eric's /activity decisions to the bots that asked (v3).
 *
 *   node --env-file-if-exists=.env.local scripts/sync/activity-deliver.ts [--dry-run]
 *
 * Runs right after the 5-minute harvest (ExecStartPost on
 * mission-control-activity.service). For every undelivered row in
 * mission.bot_activity_decisions:
 *   - a bot answer becomes a channel note back to the asker, `re:` its note
 *     (scripts/sync/parse/decision-note.ts), so the next harvest sees the item
 *     answered and it leaves Waiting;
 *   - a drop also appends a row to open/decisions.tsv and a line to the
 *     asking note, the same day (R-163: dropped stays dropped);
 *   - a task decision needs no note (the app already changed the task).
 * Then it stamps delivered_at / delivery_ref.
 *
 * THE BRAIN IS WRITTEN ONLY THROUGH A SCRATCH CLONE (jobs/lib/
 * brain-scratch-clone.sh): commit, `pull --rebase --no-autostash`, push; on a
 * refused push the commit goes to a brain-conflict/* branch instead. It never
 * stashes, resets or cleans ~/dev/brain, which other sessions share. A row is
 * marked delivered only after its note is pushed; a failure leaves it
 * undelivered for the next run and records delivery_error.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/env.ts';
import { createSyncClient } from './lib/db.ts';
import { assertBrainRepo } from './lib/brain.ts';
import { readChannelNotes } from './lib/activity.ts';
import { hashText, WINDOW_DAYS } from './parse/activity.ts';
import { decisionsTsvRow, etDate, renderDecisionNote, type Asker, type DecisionRow } from './parse/decision-note.ts';

const dryRun = process.argv.includes('--dry-run');

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** source_key of a channel item -> the note that asked. Same key the harvester writes. */
function askers(brainRoot: string): Map<string, Asker> {
  const out = new Map<string, Asker>();
  for (const n of readChannelNotes(brainRoot, WINDOW_DAYS)) {
    const key = `channel:${n.path.startsWith('from-') ? 'from' : 'to'}:${hashText(n.path)}:waiting`;
    out.set(key, { path: n.path, from: n.fm.from ?? null, project: n.fm.project ?? null });
  }
  return out;
}

async function main() {
  const env = loadEnv();
  assertBrainRepo(env.brainRoot);
  const db = createSyncClient(env);

  const { data, error } = await db
    .from('bot_activity_decisions')
    .select('id,item_key,item_source,item_title,item_bot,choice,reply,until_date,created_at')
    .eq('user_id', env.userId)
    .is('delivered_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`read decisions: ${error.message}`);
  const rows = (data ?? []) as DecisionRow[];
  if (rows.length === 0) {
    console.log('deliver: nothing to deliver');
    return;
  }

  const route = askers(env.brainRoot);
  type Planned = { row: DecisionRow; note: { path: string; text: string } | null; asker: Asker | null; skip?: string };
  const planned: Planned[] = rows.map((row) => {
    if (row.item_source === 'task') return { row, note: null, asker: null };
    const asker = row.item_source === 'channel' ? route.get(row.item_key) ?? null : null;
    const note = renderDecisionNote(row, asker);
    if (!note) return { row, note: null, asker, skip: asker || row.item_source === 'loops' ? 'leak test' : 'asking note not found' };
    return { row, note, asker };
  });

  for (const p of planned) {
    console.log(`deliver: ${p.row.choice.padEnd(8)} ${p.row.item_source.padEnd(7)} ${p.note?.path ?? p.skip ?? 'task (no note)'}`);
  }
  if (dryRun) return;

  const now = new Date().toISOString();
  const mark = async (id: string, patch: Record<string, unknown>) => {
    const { error: e } = await db.from('bot_activity_decisions').update(patch).eq('id', id).is('delivered_at', null);
    if (e) console.error(`deliver: could not mark ${id.slice(0, 8)}: ${e.message}`);
  };

  // Tasks and unroutable rows settle without touching the brain.
  for (const p of planned.filter((x) => !x.note)) {
    if (p.row.item_source === 'task') await mark(p.row.id, { delivered_at: now, delivery_ref: 'mission-control task' });
    else await mark(p.row.id, { delivery_error: p.skip ?? 'not delivered' });
  }

  const notes = planned.filter((x) => x.note);
  if (notes.length === 0) return;

  const name = `brain-mc-activity-deliver-${Date.now()}`;
  const clone = execFileSync('bash', [join(env.brainRoot, 'jobs', 'lib', 'brain-scratch-clone.sh'), name], { encoding: 'utf8' }).trim();
  try {
    const touched: string[] = [];
    for (const p of notes) {
      const note = p.note!;
      const abs = join(clone, note.path);
      mkdirSync(dirname(abs), { recursive: true });
      if (existsSync(abs)) {
        // An earlier run pushed this note and then failed to mark the row:
        // it is delivered, so say so instead of leaving it "sending" forever.
        await mark(p.row.id, { delivered_at: now, delivery_ref: note.path, delivery_error: null });
        p.note = null;
        continue;
      }
      writeFileSync(abs, note.text);
      touched.push(note.path);
      if (p.row.choice === 'drop') {
        appendFileSync(join(clone, 'open', 'decisions.tsv'), `${decisionsTsvRow(p.row, p.asker ? `channel/${p.asker.path}` : null)}\n`);
        if (!touched.includes('open/decisions.tsv')) touched.push('open/decisions.tsv');
        if (p.asker) {
          const asking = join(clone, 'channel', p.asker.path);
          if (existsSync(asking) && !readFileSync(asking, 'utf8').includes(`decision ${p.row.id.slice(0, 8)}`)) {
            appendFileSync(asking, `\n\n**Dropped by Eric, ${etDate(p.row.created_at)}, on Mission Control /activity (decision ${p.row.id.slice(0, 8)}). Stays dropped (R-163).**\n`);
            touched.push(`channel/${p.asker.path}`);
          }
        }
      }
    }
    if (touched.length) {
      git(clone, ['add', '--', ...touched]);
      git(clone, ['commit', '-q', '-m', `activity: deliver ${notes.length} decision(s) from Eric on /activity`, '--', ...touched]);
      let ref = 'main';
      try {
        git(clone, ['-c', 'rebase.autoStash=false', 'pull', '-q', '--rebase', '--no-autostash']);
        git(clone, ['push', '-q']);
      } catch {
        // Never force. Park the commit on its own branch for a person to merge.
        try {
          git(clone, ['rebase', '--abort']);
        } catch {
          /* not rebasing */
        }
        ref = `brain-conflict/${name}`;
        git(clone, ['push', '-q', 'origin', `HEAD:refs/heads/${ref}`]);
      }
      for (const p of notes.filter((x) => x.note)) await mark(p.row.id, { delivered_at: now, delivery_ref: ref === 'main' ? p.note!.path : `${ref}:${p.note!.path}`, delivery_error: null });
      console.log(`deliver: ${notes.filter((x) => x.note).length} note(s) pushed to ${ref}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'deliver failed';
    for (const p of notes.filter((x) => x.note)) await mark(p.row.id, { delivery_error: msg });
    throw err;
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`deliver: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
