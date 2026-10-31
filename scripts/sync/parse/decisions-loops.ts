/*
 * The needs-Eric loops on /decisions.
 *
 * Source of truth: the brain's open/triage-open.tsv (7 tab fields:
 * first_seen, touched, source, client, who-owes, ref, what-is-still-needed).
 * A row is Eric's when who-owes contains "eric", the same test as
 * jobs/lib/loops-report.py `needs_eric`. Each becomes a `loop` row keyed
 * loop:<sha256(ref or note)[:40]>, the key jobs/lib/loops-ask.py uses, so a
 * loop answered on the form or here is the same loop.
 *
 * Answers apply exactly as loops-ask `apply` does, to the TSV in a scratch
 * clone of the brain:
 *   Close it          the row leaves triage-open.tsv (recorded in decisions.tsv)
 *   Keep open         touched = today
 *   Snooze 7 days     touched = today + 7
 *   Hand back to us   who-owes = "us", touched = today
 *   a comment         appended to the row's note as "Eric MM-DD: <text>"
 *
 * Eric, 2026-10-31: "There should never be 55 decisions waiting and that much
 * stalled that's insane." Pure functions; the box script does the I/O.
 */

import { createHash } from 'node:crypto';
import { scrub } from '../../../src/lib/activity/scrub.ts';
import { isHealth } from '../../../src/lib/activity/health.ts';
import type { DecisionInput, Option, Urgency } from './decisions-inbox.ts';

export const LOOP_OPTIONS: Option[] = [
  { id: 'o1', label: 'Close it', detail: 'Done or no longer needed; it leaves the loops list' },
  { id: 'o2', label: 'Keep open', detail: 'Still needed; stops reading as stale' },
  { id: 'o3', label: 'Snooze 7 days', detail: 'Hide it for a week' },
  { id: 'o4', label: 'Hand back to us', detail: 'The bots own it; off your list' },
];

export const LOOP_GROUPS = ['Drafts to send', 'Eden', 'HL scope', 'HL vendor/hardware', 'Records', 'Misc'] as const;
export type LoopGroup = (typeof LOOP_GROUPS)[number];

export type LoopRow = {
  /** Line index in the file, for applying an answer. */
  line: number;
  first_seen: string;
  touched: string;
  source: string;
  client: string;
  owes: string;
  ref: string;
  note: string;
  key: string;
};

const DONE_RE = /\b(DONE|FIXED|RESOLVED|SHIPPED|CLOSED|LIVE)\b/;

/** loops-ask.py `key()`: sha256 of the ref (or the note when there is none), 40 hex. */
export function loopKey(ref: string, note: string): string {
  return `loop:${createHash('sha256').update(ref || note).digest('hex').slice(0, 40)}`;
}

export function parseLoopsTsv(text: string): LoopRow[] {
  const out: LoopRow[] = [];
  text.split('\n').forEach((l, line) => {
    if (l.startsWith('#') || !l.trim()) return;
    const f = [...l.replace(/\r$/, '').split('\t'), '', '', '', '', '', '', ''];
    out.push({ line, first_seen: f[0], touched: f[1], source: f[2], client: f[3], owes: f[4], ref: f[5], note: f[6], key: loopKey(f[5], f[6]) });
  });
  return out;
}

export const isEricLoop = (r: LoopRow) => /eric/i.test(r.owes);

/** A ref a person can read: not a Graph id, message id or bare hash. */
function readable(ref: string): boolean {
  if (!ref || ref.length > 90) return false;
  return !/AAMk|<[^>]*@|[A-Za-z0-9_=-]{30,}|^[0-9a-f-]{8,}$/i.test(ref);
}

/** The card title: the ref when it reads like a title, else the note's first clause. */
export function loopTitle(r: LoopRow): string {
  const src = readable(r.ref) ? r.ref : r.note.split(/(?<=[.;:!?])\s|\s[-—]\s/)[0];
  return scrub(src.replace(/^(NEW|UPDATE)\b[^:]*:\s*/i, ''), 120) || 'Open loop';
}

export function loopGroup(r: LoopRow): LoopGroup {
  const text = `${r.ref} ${r.note}`;
  const client = r.client.toLowerCase();
  if (/\bdraft/i.test(text) && /\bsend|\bsent\b|\bforward|\breply/i.test(text)) return 'Drafts to send';
  if (client === 'eden' || /\b(eden|vdl|valuedrivenlife)\b/i.test(text)) return 'Eden';
  if (client === 'honey-lake' || /honey ?lake/i.test(text)) {
    return /\b(ritten|alleva|vendor|hardware|device|printer|kitchen|pos|campus store|vm|server|laptop|api agreement)\b/i.test(text)
      ? 'HL vendor/hardware'
      : 'HL scope';
  }
  if (/\b(receipts?|records?|recordings?|transcripts?|invoices?|tax|statements?)\b/i.test(text)) return 'Records';
  return 'Misc';
}

/** Recommended option: Close when the note already says it is done, Hand back when "us" shares it, else Keep. */
export function loopDefault(r: LoopRow): string {
  if (DONE_RE.test(r.note)) return 'o1';
  if (/\bus\b/i.test(r.owes)) return 'o4';
  return 'o2';
}

function daysSince(iso: string, now: Date): number | null {
  const t = Date.parse(iso.slice(0, 10));
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / 86_400_000);
}

/** The first owner named: "Trevor (...) then Eric" is waiting on Trevor now. */
export function primaryOwner(owes: string): string {
  return owes.split(/\bthen\b/i)[0].trim();
}

const OURS = /^$|^-$|\b(us|we|harness|engineering|session|bots?|coding|cos|chief of staff|claude|codex|grokbot|dispatch)\b/i;

/** No movement for this long and it is ours: Stalled. */
export const LOOP_STALL_DAYS = 3;

/**
 * Where an open loop goes on the board, or null when it is not shown:
 *   decision  Eric owes it now
 *   stalled   ours, untouched 3+ days
 *   waiting   an outside person owes it
 *   null      ours and moving (touched in the last 3 days), or snoozed ahead
 */
export function loopSection(r: LoopRow, now: Date): 'decision' | 'stalled' | 'waiting' | null {
  const today = now.toISOString().slice(0, 10);
  if (r.touched.slice(0, 10) > today) return null;
  const owner = primaryOwner(r.owes);
  if (/eric/i.test(owner)) return 'decision';
  if (OURS.test(owner)) {
    const idle = daysSince(r.touched || r.first_seen, now);
    return idle !== null && idle >= LOOP_STALL_DAYS ? 'stalled' : null;
  }
  return 'waiting';
}

function isoDay(d: string): string | null {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(0, 10)}T12:00:00Z` : null;
}

/**
 * Every open loop as a board row (Decisions needed, Stalled or Waiting on
 * others). A row whose text trips the health test is left out entirely (no
 * PHI on the page or in a note).
 */
export function loopsToRows(rows: LoopRow[], now: Date): DecisionInput[] {
  const out: DecisionInput[] = [];
  for (const r of rows) {
    const section = loopSection(r, now);
    if (!section) continue;
    if ([r.ref, r.note, r.client, r.owes].some((t) => isHealth(t))) continue;
    const age = daysSince(r.first_seen, now);
    const urgency: Urgency = age !== null && age >= 21 ? 'red' : age !== null && age >= 7 ? 'yellow' : 'green';
    out.push({
      source_note: r.key,
      kind: 'loop',
      for_agent: scrub(r.owes, 60) || null,
      title: loopTitle(r),
      context: scrub(r.note, 400) || null,
      options: LOOP_OPTIONS,
      default_option: loopDefault(r),
      urgency,
      deadline: null,
      status: 'open',
      pr_ref: null,
      next_step: null,
      dedupe_key: r.key,
      closed_reason: null,
      group_name: loopGroup(r),
      section,
      added_at: isoDay(r.first_seen),
      completed_at: null,
    });
  }
  return out;
}

/**
 * Loops closed in the last `days` days (open/triage-closed.tsv: closed,
 * first_seen, source, client, who-owed, ref, what-closed-it, last-note), for
 * the Completed section. Keyed like the open loop (sha of the ref), so a card
 * that was open becomes its completed card.
 */
export function closedLoopsToRows(text: string, now: Date, days = 7): DecisionInput[] {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const out: DecisionInput[] = [];
  for (const l of text.split('\n')) {
    if (l.startsWith('#') || !l.trim()) continue;
    const f = [...l.replace(/\r$/, '').split('\t'), '', '', '', '', '', '', '', ''];
    const [closed, first, source, client, owed, ref, how, last] = f;
    if (!/^\d{4}-\d{2}-\d{2}/.test(closed) || closed.slice(0, 10) < since) continue;
    if ([ref, how, last, client, owed].some((t) => isHealth(t))) continue;
    const row: LoopRow = { line: -1, first_seen: first, touched: closed, source, client, owes: owed, ref, note: last || how, key: loopKey(ref, last || how) };
    out.push({
      source_note: row.key,
      kind: 'loop',
      for_agent: scrub(owed, 60) || null,
      title: loopTitle(row),
      context: scrub(how, 400) || null,
      options: LOOP_OPTIONS,
      default_option: null,
      urgency: 'green',
      deadline: null,
      status: 'withdrawn',
      pr_ref: null,
      next_step: null,
      dedupe_key: row.key,
      closed_reason: 'loop closed',
      group_name: loopGroup(row),
      section: null,
      added_at: isoDay(first),
      completed_at: isoDay(closed),
    });
  }
  return out;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Apply one answer (and/or comment) to the TSV text, as loops-ask `apply`
 * does. Returns the new text and whether the row was closed (removed), or
 * null when the loop is no longer in the file (closed elsewhere).
 */
export function applyLoopAnswer(
  text: string,
  key: string,
  answer: { option?: string | null; comment?: string | null },
  today: string,
): { text: string; closed: boolean; row: LoopRow } | null {
  const row = parseLoopsTsv(text).find((r) => r.key === key);
  if (!row) return null;
  const lines = text.split('\n');
  const f = [row.first_seen, row.touched, row.source, row.client, row.owes, row.ref, row.note];
  const comment = (answer.comment ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  if (comment) f[6] = `${f[6]} Eric ${today.slice(5)}: ${comment}`;
  const opt = answer.option;
  if (opt === 'o2' || (!opt && comment)) f[1] = today;
  else if (opt === 'o3') f[1] = addDays(today, 7);
  else if (opt === 'o4') {
    f[4] = 'us';
    f[1] = today;
  }
  if (opt === 'o1') {
    lines.splice(row.line, 1);
    return { text: lines.join('\n'), closed: true, row };
  }
  lines[row.line] = f.join('\t');
  return { text: lines.join('\n'), closed: false, row };
}

/**
 * A comment that states a preference or rule ("always", "never", "I prefer",
 * "from now on", "don't ever", "stop ...") is worth learning from: it goes to
 * rules/learned-from-decisions.md for Chief of Staff to promote.
 */
export function isLesson(text: string): boolean {
  return /\b(always|never|from now on|going forward|in (the )?future|i (prefer|want|like|don'?t want|hate)|please (always|stop|don'?t)|don'?t (ever|send|ask)|stop (asking|sending|doing)|make sure|should(n'?t)? (always|never|be)|rule)\b/i.test(text);
}

export function lessonLine(day: string, itemTitle: string, text: string, notePath: string): string {
  const one = (s: string) => s.replace(/\s+/g, ' ').trim();
  return `- ${day} · on "${one(itemTitle).slice(0, 100)}": "${one(text).slice(0, 400)}" (\`${notePath}\`) · status: to promote`;
}

export const LESSONS_HEADER = `# Learned from Eric's decisions and comments

Appended by Mission Control /decisions (scripts/sync/decisions-inbox.ts)
whenever a comment Eric leaves on an item states a preference or a rule.
Bots read this before jobs. Chief of Staff promotes each line into
rules/RULES.md (or rejects it) and changes its status.

`;
