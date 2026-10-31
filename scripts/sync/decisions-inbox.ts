/*
 * Decisions inbox, box side: ingest brain decisions into mission.decisions,
 * then deliver Eric's answers back to the brain.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/decisions-inbox.ts [--dry-run]
 *
 * Runs after the 5-minute /activity harvest (ExecStartPost on
 * mission-control-activity.service), so a new `kind: decision` note is on
 * /decisions within five minutes and an answer is back in the brain within
 * five more.
 *
 * INGEST (scripts/sync/parse/decisions-inbox.ts has the rules)
 *   - every channel note with `kind: decision`, and every from-grokbot job
 *     stalled past STALL_HOURS or marked `waiting: eric`, is upserted on
 *     (user_id, source_note);
 *   - a row Eric already answered is never touched again;
 *   - a note closed elsewhere (or deleted) withdraws its open row, and so
 *     does an answer given elsewhere (a `kind: answer` note `re:` it, from
 *     a chat card or an email reply) or a merged/closed PR it names;
 *   - one row per item: notes naming the same PR collapse to the newest.
 *
 * DELIVER
 *   - each answered, undelivered row becomes a `kind: answer` note in
 *     channel/to-grokbot/ (`re:` the source note) and a line in
 *     open/decisions.tsv, written through a scratch clone
 *     (jobs/lib/brain-scratch-clone.sh: commit, pull --rebase --no-autostash,
 *     push; a refused push parks the commit on brain-conflict/*). It never
 *     stashes, resets or cleans ~/dev/brain;
 *   - then rings Chief of Staff's doorbell (erics-inbox+job-cos@, subject
 *     "grokbot-job [wake:ask-eric] <slug>", body the path only: the same
 *     mailbox and shape as grok-doorbell.sh). A failed ring is logged and not
 *     retried: the note is the record and doorbell-reconcile is the backstop;
 *   - writes the answer back into the source note (a line, and status:
 *     answered on a `kind: decision` note);
 *   - and stamps delivered_at. A failed push leaves the row undelivered with
 *     delivery_error, for the next run.
 *   - "Ask a question" rows (mission.decision_questions) go the same way, as
 *     `kind: question` notes for Chief of Staff.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv } from './lib/env.ts';
import { createSyncClient } from './lib/db.ts';
import { assertBrainRepo } from './lib/brain.ts';
import { scrub } from '../../src/lib/activity/scrub.ts';
import {
  etDay,
  answerRef,
  parseDecisionNote,
  parseStalledJob,
  renderAnswerNote,
  renderQuestionNote,
  settleRows,
  writeBackAnswer,
  type AnsweredRow,
  type DecisionInput,
  type QuestionRow,
} from './parse/decisions-inbox.ts';

const dryRun = process.argv.includes('--dry-run');
const SCAN_DAYS = 60;
const COS_DOORBELL = 'erics-inbox+job-cos@mail.grokbot.com';

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Every recent channel note, parsed into a row where it is one, plus the notes answered elsewhere. */
function scanBrain(brainRoot: string, now: Date): { rows: DecisionInput[]; answered: Set<string> } {
  const since = now.getTime() - SCAN_DAYS * 86_400_000;
  const out: DecisionInput[] = [];
  const answered = new Set<string>();
  for (const dir of ['to-grokbot', 'from-grokbot']) {
    const abs = join(brainRoot, 'channel', dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!file.endsWith('.md')) continue;
      const full = join(abs, file);
      const st = statSync(full);
      if (!st.isFile() || st.mtimeMs < since || st.size > 256_000) continue;
      const path = `channel/${dir}/${file}`;
      const text = readFileSync(full, 'utf8');
      const re = answerRef(text);
      if (re) answered.add(re);
      const row = parseDecisionNote(path, text, now) ?? parseStalledJob(path, text, now);
      if (row) out.push(row);
    }
  }
  return { rows: out, answered };
}

/**
 * GitHub state (OPEN / MERGED / CLOSED) of each PR an open row names. Fails
 * open: no gh, no network or a timeout leaves the PR unknown and its row open.
 */
function prStates(refs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const ref of refs.slice(0, 40)) {
    const [repo, n] = ref.split('#');
    try {
      const st = execFileSync('gh', ['pr', 'view', n, '-R', repo, '--json', 'state', '-q', '.state'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
      }).trim();
      if (st) out.set(ref, st);
    } catch {
      /* unknown: keep the row */
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  assertBrainRepo(env.brainRoot);
  const db = createSyncClient(env);
  const now = new Date();
  const stamp = now.toISOString();

  // ---- ingest -------------------------------------------------------------
  const scanned = scanBrain(env.brainRoot, now);
  const openRefs = [...new Set(scanned.rows.filter((r) => r.status !== 'withdrawn' && r.pr_ref).map((r) => r.pr_ref!))];
  const found = settleRows(scanned.rows, scanned.answered, prStates(openRefs));
  const { data: existing, error: exErr } = await db
    .from('decisions')
    .select('id,source_note,status')
    .eq('user_id', env.userId);
  // A dry run before the migration is applied still shows what would land.
  if (exErr && !dryRun) throw new Error(`read decisions: ${exErr.message}`);
  if (exErr) console.log(`decisions: (dry run) table not readable: ${exErr.message}`);
  const have = new Map((existing ?? []).map((r) => [r.source_note as string, r as { id: string; status: string }]));

  const upserts: Array<Record<string, unknown>> = [];
  const withdraw: Array<{ id: string; reason: string | null }> = [];
  const seen = new Set<string>();
  for (const row of found) {
    seen.add(row.source_note);
    const prev = have.get(row.source_note);
    if (prev?.status === 'answered') continue;
    if (row.status === 'withdrawn') {
      if (prev && prev.status !== 'withdrawn') withdraw.push({ id: prev.id, reason: row.closed_reason });
      continue;
    }
    upserts.push({ ...row, user_id: env.userId, last_seen_at: stamp, updated_at: stamp });
  }
  // An open row whose note was deleted is withdrawn. One merely older than
  // the scan window keeps its last state: still answerable.
  for (const [note, r] of have) {
    if (!seen.has(note) && (r.status === 'open' || r.status === 'stale') && !existsSync(join(env.brainRoot, note))) withdraw.push({ id: r.id, reason: 'note deleted' });
  }
  console.log(`decisions: ${found.filter((r) => r.status !== 'withdrawn').length} live in the brain, ${upserts.length} open, ${withdraw.length} to withdraw`);
  if (dryRun) {
    for (const r of upserts as unknown as DecisionInput[]) {
      console.log(`  ${r.urgency.padEnd(6)} ${r.status.padEnd(5)} ${r.kind.padEnd(8)} opts=${r.options.length} def=${r.default_option ?? '-'}  ${r.title.slice(0, 70)}`);
    }
    if (exErr) return;
  }
  if (!dryRun) {
    // New rows insert (a duplicate from a racing run is ignored); existing
    // rows update only while still open or stale, so an answer Eric gave
    // between the read above and this write is never reopened.
    const fresh = upserts.filter((u) => !have.has(u.source_note as string));
    for (let i = 0; i < fresh.length; i += 200) {
      const { error } = await db.from('decisions').upsert(fresh.slice(i, i + 200), { onConflict: 'user_id,source_note', ignoreDuplicates: true });
      if (error) throw new Error(`insert decisions: ${error.message}`);
    }
    for (const u of upserts.filter((x) => have.has(x.source_note as string))) {
      const { error } = await db
        .from('decisions')
        .update(u)
        .eq('user_id', env.userId)
        .eq('source_note', u.source_note as string)
        .in('status', ['open', 'stale', 'withdrawn']);
      if (error) console.error(`decisions: could not refresh ${u.source_note}: ${error.message}`);
    }
    const byReason = new Map<string | null, string[]>();
    for (const w of withdraw) byReason.set(w.reason, [...(byReason.get(w.reason) ?? []), w.id]);
    for (const [reason, ids] of byReason) {
      const { error } = await db
        .from('decisions')
        .update({ status: 'withdrawn', closed_reason: reason, updated_at: stamp })
        .in('id', ids)
        .in('status', ['open', 'stale']);
      if (error) throw new Error(`withdraw decisions: ${error.message}`);
    }
  }

  // ---- deliver ------------------------------------------------------------
  const { data, error } = await db
    .from('decisions')
    .select('id,source_note,kind,for_agent,title,options,answer,answer_text,answered_at')
    .eq('user_id', env.userId)
    .eq('status', 'answered')
    .is('delivered_at', null)
    // A row parked on a brain-conflict branch or held by the leak test
    // carries a delivery_ref and waits for a person; re-trying would only
    // park a second copy or fail the same way.
    .is('delivery_ref', null)
    .order('answered_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`read answers: ${error.message}`);
  const rows = (data ?? []) as AnsweredRow[];

  // Questions are new with 20261031: before that migration the table is
  // missing, which is "nothing to ask", not a failure.
  const { data: qData, error: qErr } = await db
    .from('decision_questions')
    .select('id,question,created_at,decision_id,decisions(source_note,title)')
    .eq('user_id', env.userId)
    .is('delivered_at', null)
    .is('delivery_ref', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (qErr) console.error(`decisions: questions not readable: ${qErr.message}`);
  const questions: QuestionRow[] = ((qData ?? []) as unknown as Array<Record<string, unknown>>).flatMap((q) => {
    const d = (Array.isArray(q.decisions) ? q.decisions[0] : q.decisions) as { source_note: string; title: string } | null;
    return d ? [{ id: q.id as string, question: q.question as string, created_at: q.created_at as string, decision_id: q.decision_id as string, ...d }] : [];
  });

  if (rows.length === 0 && questions.length === 0) {
    console.log('decisions: nothing to deliver');
    return;
  }

  type Table = 'decisions' | 'decision_questions';
  const mark = async (table: Table, id: string, patch: Record<string, unknown>) => {
    const { error: e } = await db.from(table).update(patch).eq('id', id).is('delivered_at', null);
    if (e) console.error(`decisions: could not mark ${table} ${id.slice(0, 8)}: ${e.message}`);
  };

  type Item = { table: Table; id: string; note: { path: string; text: string } | null; answer?: AnsweredRow };
  const planned: Item[] = [
    ...rows.map((row) => ({ table: 'decisions' as const, id: row.id, note: renderAnswerNote(row), answer: row })),
    ...questions.map((q) => ({ table: 'decision_questions' as const, id: q.id, note: renderQuestionNote(q) })),
  ];
  for (const p of planned) console.log(`decisions: deliver ${p.answer ? p.answer.answer.padEnd(5) : 'ask  '} ${p.note?.path ?? 'leak test failed'}`);
  if (dryRun) return;
  for (const p of planned.filter((x) => !x.note)) {
    await mark(p.table, p.id, { delivery_ref: 'held:leak-test', delivery_error: 'held: failed the leak or health test; needs a look' });
  }
  const notes = planned.filter((x) => x.note);
  if (notes.length === 0) return;

  const name = `brain-mc-decisions-${Date.now()}`;
  const clone = execFileSync('bash', [join(env.brainRoot, 'jobs', 'lib', 'brain-scratch-clone.sh'), name], { encoding: 'utf8' }).trim();
  const pushed: Array<{ table: Table; id: string; path: string }> = [];
  try {
    const touched: string[] = [];
    const touch = (path: string) => {
      if (!touched.includes(path)) touched.push(path);
    };
    for (const p of notes) {
      const note = p.note!;
      const abs = join(clone, note.path);
      mkdirSync(dirname(abs), { recursive: true });
      if (existsSync(abs)) {
        // Pushed by an earlier run that then failed to mark the row. Ring
        // again: a second doorbell is cheaper than none.
        await mark(p.table, p.id, { delivered_at: stamp, delivery_ref: note.path, delivery_error: null });
        ring(note.path);
        continue;
      }
      writeFileSync(abs, note.text);
      touch(note.path);
      pushed.push({ table: p.table, id: p.id, path: note.path });
      const row = p.answer;
      if (!row) continue;

      // Write the answer back into the note that asked, so it reads as settled
      // wherever it is opened. A deleted source has nothing to write to.
      const src = join(clone, row.source_note);
      if (existsSync(src)) {
        writeFileSync(src, writeBackAnswer(readFileSync(src, 'utf8'), row, note.path));
        touch(row.source_note);
      }

      const opt = row.options.find((o) => o.id === row.answer);
      const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();
      appendFileSync(
        join(clone, 'open', 'decisions.tsv'),
        `${[
          etDay(row.answered_at),
          `decisions:${row.id.replace(/-/g, '').slice(0, 8)}`,
          clean(scrub(row.title, 120)),
          clean(row.answer === 'other' ? scrub(row.answer_text ?? 'Other', 200) : opt?.label ?? row.answer),
          clean(`Answered by Eric on Mission Control /decisions; note ${note.path}.${opt?.label === 'Drop' ? ' Stays dropped (R-163).' : ''}`),
          row.source_note,
        ].join('\t')}\n`,
      );
      touch('open/decisions.tsv');
    }
    if (pushed.length) {
      git(clone, ['add', '--', ...touched]);
      git(clone, ['commit', '-q', '-m', `decisions: deliver ${pushed.length} answer(s)/question(s) from Eric on /decisions`, '--', ...touched]);
      let ref = 'main';
      // Twice: a push that lost a race with another writer usually lands on
      // the second pull. Only a real conflict is parked.
      const sync = () => {
        git(clone, ['-c', 'rebase.autoStash=false', 'pull', '-q', '--rebase', '--no-autostash']);
        git(clone, ['push', '-q']);
      };
      const abort = () => {
        try {
          git(clone, ['rebase', '--abort']);
        } catch {
          /* not rebasing */
        }
      };
      try {
        try {
          sync();
        } catch {
          abort();
          sync();
        }
      } catch {
        abort();
        ref = `brain-conflict/${name}`;
        git(clone, ['push', '-q', 'origin', `HEAD:refs/heads/${ref}`]);
      }
      for (const p of pushed) {
        if (ref === 'main') {
          await mark(p.table, p.id, { delivered_at: stamp, delivery_ref: p.path, delivery_error: null });
          ring(p.path);
        } else {
          // Not delivered: nothing reads a conflict branch. The page shows
          // this as held, and brain-conflict/* is swept by Chief of Staff.
          await mark(p.table, p.id, { delivery_ref: `${ref}:${p.path}`, delivery_error: `held on ${ref}: the brain push was refused; needs a merge` });
        }
      }
      console.log(`decisions: ${pushed.length} note(s) pushed to ${ref}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'deliver failed';
    for (const p of notes) await mark(p.table, p.id, { delivery_error: msg });
    throw err;
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}

/** Chief of Staff's doorbell: path-only body, the grok-doorbell.sh shape. */
function ring(path: string) {
  if (process.env.DECISIONS_DOORBELL === 'off') return;
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  const dir = mkdtempSync(join(tmpdir(), 'mc-doorbell-'));
  const body = join(dir, 'body.txt');
  try {
    writeFileSync(body, `${path}\n`);
    execFileSync(
      process.env.FSA_MAIL_BIN || 'fsa-mail',
      ['send', '--intent', 'eric-said', '--claim-ok', 'doorbell, a file path only', '--format', 'plain', '--to', COS_DOORBELL, '--subject', `grokbot-job [wake:ask-eric] ${slug}`, '--html-file', body],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30_000 },
    );
    console.log(`decisions: rang ${COS_DOORBELL} for ${path}`);
  } catch (err) {
    console.error(`decisions: doorbell FAILED for ${path} (doorbell-reconcile is the backstop): ${err instanceof Error ? err.message.slice(0, 160) : err}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`decisions: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
