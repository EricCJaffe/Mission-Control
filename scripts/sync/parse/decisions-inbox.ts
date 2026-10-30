/*
 * Decisions inbox: brain notes -> mission.decisions rows, and an answered row
 * -> the `kind: answer` note that carries Eric's choice back.
 *
 * Pure functions, so the rules are tested without a brain or a database. The
 * box script (scripts/sync/decisions-inbox.ts) does the reading and writing.
 *
 * Two sources:
 *   decision  any channel note with `kind: decision`. Options come from
 *             `options:` in the frontmatter or the `**Options**` list
 *             (numbered or bulleted); the default from `default:` or the
 *             `**Recommendation:**` line ("option 2", or an option's label).
 *   stalled   a from-grokbot job note still queued/running/blocked after
 *             STALL_HOURS, or one marked `waiting: eric`. Its options are
 *             fixed: Restart, Keep waiting, Drop.
 *
 * Every text that reaches a row is scrubbed (src/lib/activity/scrub.ts), and
 * Honey Lake notes are never read past their frontmatter.
 */

import { scrub, textLeaks } from '../../../src/lib/activity/scrub.ts';
import { botName, isHoneyLake, parseFrontmatter, parseH1, parseWhen, type Frontmatter } from './activity.ts';

/**
 * Health is never ingested, Eric's or anyone's (Codex review, PR #81: the
 * scrubber removes identifiers, not health information). A note that names
 * a health topic in its path, routing fields, title or opening paragraph is
 * skipped whole, the same as Honey Lake. Over-matching costs one card he can
 * still answer in the brain; under-matching puts health data in a table.
 */
const HEALTH_RE =
  /\b(?:health|medical|medic(?:ine|ation)s?|meds|phi|hipaa|patients?|clinic(?:al)?|diagnos[ie]s|symptoms?|cardiolog\w*|doctor|physician|therap(?:y|ist)|prescriptions?|labs? results?|blood ?(?:work|pressure)|surgery|hospital|genetic\w*|mental[ -]health|crisis|suicid\w*|counsel(?:ing|or))\b/i;

export function isHealth(...values: Array<string | null | undefined>): boolean {
  return values.some((v) => typeof v === 'string' && HEALTH_RE.test(v.replace(/[-_]/g, ' ')));
}

export const STALL_HOURS = 48;
export const STALE_DAYS = 7;
export const CONTEXT_MAX = 600;
const OPTION_MAX = 8;

export type Urgency = 'red' | 'yellow' | 'green';
export type Status = 'open' | 'answered' | 'stale' | 'withdrawn';
export type Option = { id: string; label: string; detail?: string };

export type DecisionInput = {
  source_note: string;
  kind: 'decision' | 'stalled';
  for_agent: string | null;
  title: string;
  context: string | null;
  options: Option[];
  default_option: string | null;
  urgency: Urgency;
  deadline: string | null;
  /** open | stale | withdrawn. Ingest never writes 'answered'. */
  status: Exclude<Status, 'answered'>;
};

const CLOSED = new Set(['done', 'closed', 'dropped', 'withdrawn', 'answered', 'superseded', 'cancelled']);
const TRUE = new Set(['true', 'yes', '1']);
const JOB_LIVE = new Set(['queued', 'running', 'blocked', 'waiting', 'in-progress', 'in_progress']);

function stripMd(s: string): string {
  return s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
}

const ITEM = /^[ \t]*(?:\d+[.)]|[-*]|\*\*[A-H][.):]|[A-H][.)])[ \t]+/;
const OPTIONS_HEAD = /^(?:#{1,4}\s.*\boptions?\b|\*\*options?:?\*\*|options?:|.*\b(?:two|three|four) (?:options|shapes|ways|choices)\b)/i;
const RECOMMENDED = /\(recommended\)|\brecommended\b:?/i;

/**
 * The options a note offers, split into a short label and a detail. Notes are
 * written by many bots, so this reads the shapes they actually use: an
 * `options:` frontmatter list, or a numbered / bulleted / lettered (A., **B.**)
 * list under an "Options" heading or label. Returns the options and the index
 * of one marked "(recommended)", if any.
 */
export function parseOptionList(body: string, fm: Frontmatter): Option[] {
  return optionsWithMark(body, fm).options;
}

function optionsWithMark(body: string, fm: Frontmatter): { options: Option[]; marked: string | null } {
  let raw: string[] = [];
  if (fm.options) {
    raw = fm.options.replace(/^\[|\]$/g, '').split(/[,|]/).map((o) => o.trim()).filter(Boolean);
  } else {
    const lines = body.split(/\r?\n/);
    const at = lines.findIndex((l) => OPTIONS_HEAD.test(l.trim()));
    if (at >= 0) {
      for (const l of lines.slice(at + 1)) {
        const t = l.trim();
        if (!t) continue;
        if (ITEM.test(l)) raw.push(l.replace(ITEM, ''));
        else if (/^#|^\*\*recommend|^recommend/i.test(t)) break;
        else if (raw.length) {
          // A wrapped line of the item above, or prose after the list.
          if (/^\s/.test(l)) continue;
          break;
        }
      }
    }
  }
  const options: Option[] = [];
  let marked: string | null = null;
  for (const line of raw.slice(0, OPTION_MAX)) {
    const isRec = RECOMMENDED.test(line);
    const clean = stripMd(line.replace(/\(recommended\)\s*/i, '')).replace(/^\*\*|\*\*$/g, '');
    const i = clean.search(/[:;—]\s|\s-\s|\.\s/);
    const cut = i > 0 && i <= 60;
    const label = scrub(cut ? clean.slice(0, i) : clean, 60);
    if (!label) continue;
    const detail = cut ? scrub(clean.slice(i + 1).replace(/^[-\s]+/, ''), 200) : '';
    const id = `o${options.length + 1}`;
    if (isRec && !marked) marked = id;
    options.push(detail ? { id, label, detail } : { id, label });
  }
  return { options, marked };
}

/** The Recommendation line's text, scrubbed, or null. */
export function parseRecommendation(body: string, fm: Frontmatter): string | null {
  const src = fm.recommendation ?? body.match(/^\s*(?:[-*]\s+)?\*{0,2}Recommend(?:ation|ed)?:?\*{0,2}:?\*{0,2}\s*(.+)$/im)?.[1] ?? '';
  const s = scrub(stripMd(src), 200);
  return s || null;
}

/** The recommended option id, from `default:` or the Recommendation line. */
export function parseDefault(body: string, fm: Frontmatter, options: Option[]): string | null {
  const src = fm.default ?? parseRecommendation(body, fm) ?? '';
  if (!src || options.length === 0) return null;
  const n = src.match(/\boption\s*(\d+|[A-H])\b/i) ?? src.match(/^\s*(\d+)\b/);
  if (n) {
    const k = /\d/.test(n[1]) ? Number(n[1]) - 1 : n[1].toUpperCase().charCodeAt(0) - 65;
    const o = options[k];
    if (o) return o.id;
  }
  const lower = src.toLowerCase();
  const hit = options.find((o) => o.label.length >= 3 && lower.includes(o.label.toLowerCase()));
  return hit?.id ?? null;
}

/**
 * Every decision gets something to tap. With no list, a note that recommends
 * something offers "Go with the recommendation" / "No"; one that does not
 * offers Yes / No. The free-text field covers everything else.
 */
export function optionsFor(body: string, fm: Frontmatter): { options: Option[]; default_option: string | null } {
  const { options, marked } = optionsWithMark(body, fm);
  if (options.length >= 2) return { options, default_option: marked ?? parseDefault(body, fm, options) };
  const rec = parseRecommendation(body, fm);
  if (rec) {
    return {
      options: [
        { id: 'o1', label: 'Go with the recommendation', detail: rec },
        { id: 'o2', label: 'No' },
      ],
      default_option: 'o1',
    };
  }
  return { options: [{ id: 'o1', label: 'Yes' }, { id: 'o2', label: 'No' }], default_option: null };
}

/** The first paragraph of prose after the H1: what Eric reads before tapping. */
export function parseContext(body: string): string | null {
  const lines = body.replace(/^#\s+.*$/m, '').split(/\r?\n/);
  const para: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t) {
      if (para.length) break;
      continue;
    }
    if (/^\*\*(Options|Recommend)/i.test(t) || /^#/.test(t)) break;
    para.push(stripMd(t.replace(/^[-*]\s+/, '')));
  }
  const s = scrub(para.join(' '), CONTEXT_MAX);
  return s || null;
}

function ageHours(fm: Frontmatter, path: string, now: Date): number | null {
  const at = parseWhen(fm.started) ?? parseWhen(fm.created) ?? parseWhen(path.split('/').pop()?.slice(0, 10));
  return at ? (now.getTime() - Date.parse(at)) / 3_600_000 : null;
}

function urgencyOf(fm: Frontmatter, deadline: string | null, now: Date): Urgency {
  const u = (fm.urgency ?? '').toLowerCase();
  if (TRUE.has((fm.urgent ?? '').toLowerCase()) || /^(urgent|critical)$/i.test(fm.priority ?? '') || /^(red|critical)$/i.test(fm.severity ?? '') || u === 'red') return 'red';
  if (deadline && Date.parse(deadline) <= now.getTime()) return 'red';
  if (u === 'green') return 'green';
  return 'yellow';
}

/**
 * A `kind: decision` note as a row, or null when it is not one, or is Honey
 * Lake, or would leak. `path` is brain-relative (channel/to-grokbot/x.md).
 */
export function parseDecisionNote(path: string, text: string, now: Date): DecisionInput | null {
  const { fm, end } = parseFrontmatter(text);
  if ((fm.kind ?? '').toLowerCase() !== 'decision') return null;
  if (isHoneyLake(path, fm.project, fm.for, fm.client, fm.from)) return null;
  const body = text.slice(end);
  if (sensitive(path, fm, body)) return null;
  const st = (fm.status ?? '').toLowerCase();
  const title = scrub(stripMd(parseH1(body) ?? fm.subject ?? fm.title ?? ''), 160);
  if (!title) return null;
  const { options, default_option } = optionsFor(body, fm);
  const deadline = parseWhen(fm.deadline) ?? parseWhen(fm.due);
  let status: DecisionInput['status'] = CLOSED.has(st) ? 'withdrawn' : 'open';
  const age = ageHours(fm, path, now);
  if (status === 'open' && ((deadline && Date.parse(deadline) <= now.getTime()) || (age !== null && age > STALE_DAYS * 24))) status = 'stale';
  const row: DecisionInput = {
    source_note: path,
    kind: 'decision',
    for_agent: scrub(fm.from ?? fm.for ?? '', 60) || null,
    title,
    context: parseContext(body),
    options,
    default_option,
    urgency: urgencyOf(fm, deadline, now),
    deadline,
    status,
  };
  return leaks(row) ? null : row;
}

export const STALLED_OPTIONS: Option[] = [
  { id: 'o1', label: 'Restart', detail: 'Run the job again from where it stopped' },
  { id: 'o2', label: 'Keep waiting', detail: 'Leave it queued; ask again later' },
  { id: 'o3', label: 'Drop', detail: 'Close it; it stays dropped (R-163)' },
];

/**
 * A from-grokbot job stuck on Eric or stuck too long, as a row; null when the
 * job is moving, closed, Honey Lake, or would leak. A job that was stalled and
 * then finished comes back as `withdrawn` so its open row closes.
 */
export function parseStalledJob(path: string, text: string, now: Date): DecisionInput | null {
  if (!path.startsWith('channel/from-grokbot/')) return null;
  const { fm, end } = parseFrontmatter(text);
  if ((fm.kind ?? '').toLowerCase() === 'decision') return null;
  if (isHoneyLake(path, fm.project, fm.for, fm.client, fm.from)) return null;
  const st = (fm.status ?? '').toLowerCase();
  const waitingEric = (fm.waiting ?? '').toLowerCase() === 'eric';
  const age = ageHours(fm, path, now);
  const live = JOB_LIVE.has(st);
  const stalled = live && (waitingEric || (age !== null && age > STALL_HOURS));
  if (!stalled && !CLOSED.has(st)) return null;
  const body = text.slice(end);
  if (sensitive(path, fm, body)) return null;
  const title = scrub(stripMd(parseH1(body) ?? path.split('/').pop()!.replace(/\.md$/, '')), 160);
  if (!title) return null;
  const days = age === null ? null : Math.floor(age / 24);
  const why = waitingEric ? 'Waiting on you.' : `${st || 'queued'} for ${days ?? '?'} day(s) with no progress.`;
  const row: DecisionInput = {
    source_note: path,
    kind: 'stalled',
    for_agent: scrub(botName(fm.for ?? fm.runner ?? null), 60) || null,
    title,
    context: scrub(why, CONTEXT_MAX),
    options: STALLED_OPTIONS,
    default_option: waitingEric ? null : 'o1',
    urgency: waitingEric || (age !== null && age > STALL_HOURS * 2) ? 'red' : 'yellow',
    deadline: null,
    status: stalled ? 'open' : 'withdrawn',
  };
  return leaks(row) ? null : row;
}

/** Health in the path, routing fields, title or opening, or a note marked sensitive. */
function sensitive(path: string, fm: Frontmatter, body: string): boolean {
  if (TRUE.has((fm.phi ?? '').toLowerCase()) || TRUE.has((fm.sensitive ?? '').toLowerCase())) return true;
  return isHealth(path, fm.project, fm.for, fm.client, fm.from, fm.topic, fm.subject, parseH1(body), parseContext(body));
}

function leaks(row: DecisionInput): boolean {
  const texts = [row.title, row.context ?? '', row.for_agent ?? '', ...row.options.flatMap((o) => [o.label, o.detail ?? ''])];
  return texts.some((t) => textLeaks(t).length > 0);
}

export type AnsweredRow = {
  id: string;
  source_note: string;
  kind: 'decision' | 'stalled';
  for_agent: string | null;
  title: string;
  options: Option[];
  answer: string;
  answer_text: string | null;
  answered_at: string;
};

export function etDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'decision';
}

/**
 * The `kind: answer` note for one answered row, brain-relative, or null if any
 * line would fail the leak test. Eric's words are quoted verbatim (already
 * scrubbed by the endpoint), so they count as his for a hard-gate item.
 */
export function renderAnswerNote(row: AnsweredRow): { path: string; text: string } | null {
  const opt = row.options.find((o) => o.id === row.answer);
  const choice = row.answer === 'other' ? 'Other (his words below)' : opt?.label;
  if (!choice) return null;
  const day = etDay(row.answered_at);
  const path = `channel/to-grokbot/${day}-answer-${slug(row.title)}-${row.id.slice(0, 8)}.md`;
  const fm = [
    '---',
    'status: open',
    'for: cos',
    'kind: answer',
    'from: eric (Mission Control /decisions)',
    `re: ${row.source_note}`,
    `decision: ${row.id}`,
    `answer: ${choice}`,
    `answered: ${row.answered_at}`,
    '---',
  ];
  const lines = [
    `# Eric answered: ${row.title}`,
    '',
    `**His choice:** ${choice}${opt?.detail ? ` (${opt.detail})` : ''}`,
  ];
  if (row.answer_text) lines.push('', '**His words, verbatim:**', '', `> ${row.answer_text.replace(/\n/g, '\n> ')}`);
  lines.push(
    '',
    row.kind === 'stalled'
      ? `The job in \`${row.source_note}\` was stalled; act on his choice (${row.for_agent ?? 'its owner'}).`
      : `Route this to whoever asked in \`${row.source_note}\` and close that note.`,
    '',
    `Answered on Mission Control /decisions, ${day}. Decision ${row.id.slice(0, 8)}.`,
  );
  const text = `${fm.join('\n')}\n\n${lines.join('\n')}\n`;
  // The path and note id are the only non-prose tokens; test the prose.
  const prose = [row.title, choice, opt?.detail ?? '', row.answer_text ?? '', row.for_agent ?? ''];
  if (prose.some((t) => textLeaks(t).length > 0)) return null;
  return { path, text };
}
