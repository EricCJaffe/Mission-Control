/*
 * Reading the brain for /activity. Disk and git only; the rules are in
 * parse/activity.ts.
 *
 * READ-ONLY, WITHOUT EXCEPTION, as lib/brain.ts: this reads files, runs
 * `git log` and runs `jobs/lib/loops-report.py --json` (its report mode, which
 * writes nothing). The brain has its own sessions committing to it all day.
 *
 * HONEY LAKE NOTES ARE OPENED AS FAR AS THEIR FRONTMATTER AND NO FURTHER.
 * Every note is read a block at a time; the frontmatter decides whether the
 * rest is read at all, so a Honey Lake note's body never enters this process.
 */

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  channelItems,
  etDay,
  leaksIn,
  loopItems,
  runItems,
  WINDOW_DAYS,
  type ActivityItem,
  isHoneyLake,
  isDropped,
  parseFrontmatter,
  parseH1,
  parseOptions,
  parseWhen,
  pickRunFields,
  RUN_LOGS,
  scrub,
  type ChannelNote,
  type ClosedLoop,
  type LoopRow,
  type RunLine,
} from '../parse/activity.ts';

const HEAD_BYTES = 4096;
const BODY_BYTES = 64 * 1024;
const TAIL_BYTES = 4 * 1024 * 1024;

/** Up to `max` bytes from `start`, as UTF-8. */
function readSlice(path: string, start: number, max: number): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(max);
    const n = readSync(fd, buf, 0, max, start);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * When each note was first committed, from one `git log` over the window
 * (plus a day of slack). A note not committed yet falls back to its mtime.
 */
function addedTimes(root: string, days: number): Map<string, string> {
  const out = new Map<string, string>();
  let log = '';
  try {
    log = execFileSync(
      'git',
      [
        '-C', root, 'log', `--since=${days + 1}.days`, '--diff-filter=A', '--name-only',
        '--format=@%cI', '--', 'channel/from-grokbot', 'channel/to-grokbot',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    return out;
  }
  let at = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) at = line.slice(1);
    else if (line.startsWith('channel/') && at) {
      // `git log` is newest first, and a file re-added after a delete should
      // keep its first arrival, so the oldest (last seen) wins.
      out.set(line.slice('channel/'.length), new Date(at).toISOString());
    }
  }
  return out;
}

/*
 * When a note arrived, if git does not say. The filename's date is the truth;
 * the mtime is only trusted when it falls on that same day, because a
 * checkout, rebase or status edit touches the mtime of notes weeks old.
 */
function arrivalFallback(file: string, mtime: Date): string {
  const day = file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!day) return mtime.toISOString();
  if (etDay(mtime) === day) return mtime.toISOString();
  return parseWhen(day, 12) ?? mtime.toISOString();
}

/**
 * Every channel note's frontmatter, plus the H1 and the Options labels for
 * notes that are not Honey Lake and not a dropped topic.
 */
export function readChannelNotes(root: string, days: number): ChannelNote[] {
  const added = addedTimes(root, days);
  const notes: ChannelNote[] = [];
  for (const dir of ['from-grokbot', 'to-grokbot']) {
    const abs = join(root, 'channel', dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!file.endsWith('.md')) continue;
      const path = `${dir}/${file}`;
      const full = join(abs, file);
      const st = statSync(full);
      if (!st.isFile()) continue;

      const head = readSlice(full, 0, HEAD_BYTES);
      const { fm, end } = parseFrontmatter(head);
      // A frontmatter block longer than the first read would be cut; the
      // note is then treated as having none rather than half of one.
      const hl = isHoneyLake(fm.project, fm.for, fm.client, fm.from, file);
      let h1: string | null = null;
      let options: string[] = [];
      if (end > 0 && !hl && !isDropped(file, fm.project, fm.client)) {
        const body = readSlice(full, end, BODY_BYTES);
        h1 = parseH1(body);
        options = parseOptions(body, fm);
      }
      notes.push({
        path,
        fm,
        h1,
        options,
        addedAt: added.get(path) ?? arrivalFallback(file, st.mtime),
        modifiedAt: st.mtime.toISOString(),
      });
    }
  }
  // Notes older than the window matter only while they still ask something;
  // the rules in channelItems decide which.
  return notes;
}

/** The ledger's needs-Eric rows and the loops closed in the window. */
export function readLoops(root: string, days: number): { needsEric: LoopRow[]; closed: ClosedLoop[] } {
  const script = join(root, 'jobs', 'lib', 'loops-report.py');
  if (!existsSync(script)) return { needsEric: [], closed: [] };
  const out = execFileSync(
    'python3',
    [script, '--json', '--since', String(days * 24), '--only', 'needs_eric,closed'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const data = JSON.parse(out) as { needs_eric?: LoopRow[]; closed?: ClosedLoop[] };
  // `ref` is a message id. Drop it here so nothing downstream can use it.
  const needsEric = (data.needs_eric ?? []).map(({ first_seen, touched, source, client, owes, note, needs_eric }) => ({
    first_seen, touched, source, client, owes, note, needs_eric,
  }));
  return { needsEric, closed: data.closed ?? [] };
}

/**
 * The tail of every allowlisted runs/*.jsonl, cut to the five permitted fields
 * as each line is parsed. Large logs (green-keeper is ~37,000 lines) are read
 * from the end only.
 */
export function readRunLogs(root: string): Array<{ job: string; lines: RunLine[] }> {
  const dir = join(root, 'runs');
  if (!existsSync(dir)) return [];
  const logs: Array<{ job: string; lines: RunLine[] }> = [];
  for (const job of Object.keys(RUN_LOGS)) {
    const path = join(dir, `${job}.jsonl`);
    if (!existsSync(path)) continue;
    const size = statSync(path).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const text = readSlice(path, start, Math.min(size, TAIL_BYTES));
    const raw = text.split('\n');
    if (start > 0) raw.shift(); // the first line is probably partial
    const lines: RunLine[] = [];
    for (const l of raw) {
      if (!l.trim()) continue;
      try {
        const line = pickRunFields(JSON.parse(l) as Record<string, unknown>);
        // The window itself is applied in runItems, by ET day.
        if (line.at) lines.push(line);
      } catch {
        // A torn or hand-edited line is skipped, never fatal.
      }
    }
    logs.push({ job, lines });
  }
  return logs;
}

/**
 * A note's title for a dispatch line: its H1 (scrubbed), unless the note is
 * Honey Lake or a dropped topic. Reads the same way readChannelNotes does.
 */
export function noteTitleLookup(notes: ChannelNote[]) {
  const byPath = new Map(notes.map((n) => [`channel/${n.path}`, n]));
  return (notePath: string) => {
    const n = byPath.get(notePath);
    if (!n) return { title: null, honeyLake: isHoneyLake(notePath), dropped: isDropped(notePath) };
    const hl = isHoneyLake(n.fm.project, n.fm.for, n.fm.client, n.fm.from, n.path);
    return {
      title: hl ? null : scrub(n.h1 ?? n.path.replace(/^.*\/\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').replace(/-/g, ' ')),
      honeyLake: hl,
      dropped: isDropped(n.path, hl ? null : n.h1, n.fm.project, n.fm.client),
    };
  };
}

/** Everything the page shows, built from the brain, scrubbed and gated. */
export function harvest(brainRoot: string, now: Date) {
  const notes = readChannelNotes(brainRoot, WINDOW_DAYS);
  const { needsEric, closed } = readLoops(brainRoot, WINDOW_DAYS);
  const logs = readRunLogs(brainRoot);

  const all: ActivityItem[] = [
    ...channelItems(notes, now),
    ...loopItems(needsEric, closed, now),
    ...runItems(logs, noteTitleLookup(notes), now),
  ];

  // The last gate. A row the scrub missed is dropped and counted, never
  // written: the count is in the run log, the text is not.
  const items: ActivityItem[] = [];
  const blocked: Record<string, number> = {};
  for (const item of all) {
    const leaks = leaksIn(item);
    if (leaks.length) {
      for (const l of leaks) blocked[l] = (blocked[l] ?? 0) + 1;
      continue;
    }
    items.push(item);
  }

  const byKey = new Map(items.map((i) => [i.sourceKey, i]));
  return {
    items: [...byKey.values()],
    duplicates: items.length - byKey.size,
    blocked,
    read: { notes: notes.length, loopsWaiting: needsEric.length, loopsClosed: closed.length, logs: logs.length },
  };
}

