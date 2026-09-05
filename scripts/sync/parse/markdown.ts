/*
 * The checkbox parser.
 *
 * Written against a survey of the eight task files actually in ~/dev rather
 * than against the Markdown spec, because these files do not agree with each
 * other and several of the disagreements are load-bearing.
 *
 * ONE TOLERANT PARSER, NOT FIVE DIALECTS. The repos use different
 * conventions — trellisv2 puts the assignee in `[@eric]` at the end of the
 * line, honeylakeos puts it as an `@eric:` prefix, EDEN leads with a
 * backticked id — but the conventions are additive rather than contradictory.
 * A prefix rule costs nothing in a file that never uses prefixes. Applying the
 * union everywhere means a repo that changes its style, or a repo nobody told
 * us about, still parses. `linksy` appeared in ~/dev midway through building
 * this and cost nothing precisely because of that.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: prose. TKOS records every task as a bold
 * heading and a paragraph, with no checkbox anywhere in 133 lines, and
 * docs/BACKLOG.md does something similar. Treating bold lines as tasks would
 * invent hundreds of them in the files that use bold for emphasis. Those repos
 * report zero, loudly, rather than being silently mis-parsed.
 */

import { createHash } from 'node:crypto';

export type TaskStatus = 'todo' | 'done';

export type ParsedTask = {
  /** Short line, assignee tokens and checkbox removed. */
  title: string;
  /** Continuation lines, joined. Empty string when the task was one line. */
  body: string;
  status: TaskStatus;
  /** `[~]` — trellisv2's third state. Still `todo`, but worth showing. */
  inProgress: boolean;
  /** Lower-cased handles without the `@`, from the whole block. */
  assignees: string[];
  /** An explicit id where the file has one, e.g. EDEN's `FND-01`. */
  externalId: string | null;
  /** 1 urgent, 2 normal, 3 low. */
  priority: number;
  /** Heading trail above the task, outermost first. */
  section: string[];
  /** 1-based line of the checkbox itself. */
  line: number;
};

const TASK_RE = /^( *)- \[([ x~])\] ?(.*)$/;
const HEADING_RE = /^(#{1,6}) +(.*?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/*
 * A heading whose words say the work below it is finished. honeylakeos files
 * its work under "### Built 2026-09-04" and "### Shipped today" and leaves the
 * boxes unticked, so the checkbox alone would report hundreds of open tasks
 * that closed weeks ago.
 */
const DONE_SECTION_RE =
  /✅|\b(done|fixed|shipped|closed|resolved|completed|complete)\b/i;

/*
 * Section words that raise or lower priority.
 *
 * trellisv2 runs a four-rung ladder — 🔴 Urgent / 🟠 High / 🟡 Normal / 🔵 Low —
 * into a schema with three priorities, so 🟠 High lands on 2 beside Normal
 * rather than on 1. It matters: folding High into urgent put 171 of trellisv2's
 * items into a list meant to hold what is actually on fire, and a list where
 * everything is urgent ranks nothing.
 */
const URGENT_SECTION_RE = /🔴|⚠️|\b(urgent|critical|blocker|blocked|p0|p1|pre-flight)\b/i;
const LOW_SECTION_RE = /🔵|\b(low|later|deferred|backlog|someday|nice to have|whenever)\b/i;
const URGENT_LINE_RE = /🔴|⚠️|\*\(P[01]\b|\b(URGENT|CRITICAL|blocker|hard deadline|launch blocker)\b/;

/* `[@eric]`, `` `[@eric]` ``, `[@eric/@rd]`, `[@josh] [@eric]`. */
const BRACKET_HANDLES_RE = /`?\[(@[\w-]+(?:\/@[\w-]+)*)\]`?/g;
/* honeylakeos: `- [ ] @eric: …`, `- [ ] ⚠️ @katie — …`, `- [ ] @eric/@katie: …` */
const PREFIX_HANDLES_RE = /^(?:[^\w\s]+\s*)?(@[\w-]+(?:\/@[\w-]+)*)\s*[:—-]/;
/* honeylakeos group header: a line that is only `**@david**` or `**@david — why**`. */
const GROUP_HEADER_RE = /^\*\*(@[\w-]+)[^*]*\*\*\s*$/;

/*
 * Tokens that look like handles but are not people. `@handle` and
 * `@unassigned` are the placeholders inside EDEN's and trellisv2's own
 * documentation of the format; `@alleva` is a vendor system that occupies the
 * same slot in three honeylakeos lines.
 */
const NOT_PEOPLE = new Set(['handle', 'unassigned', 'alleva']);

/** EDEN's ids: backticked PREFIX-NN with an optional letter, e.g. `GOAL-01a`. */
const EDEN_ID_RE = /^`([A-Z]{2,6}-\d{1,3}[a-z]?)`\s*/;
/** trellisv2's ad-hoc ids, which live inside the bold run: **TV2-90** … */
const LOOSE_ID_RE = /^([A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+)+)\b[:\s—-]*/;

function stripHandles(text: string): string {
  return text.replace(BRACKET_HANDLES_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

function handlesIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(BRACKET_HANDLES_RE)) {
    for (const h of m[1].split('/')) found.push(h.replace(/^@/, '').toLowerCase());
  }
  const prefix = text.match(PREFIX_HANDLES_RE);
  if (prefix) {
    for (const h of prefix[1].split('/')) found.push(h.replace(/^@/, '').toLowerCase());
  }
  return found.filter((h) => !NOT_PEOPLE.has(h));
}

/*
 * The visible title.
 *
 * Assignees come off first, because trellisv2 sometimes closes the bold run
 * *after* the bracket — `**AUTH-SESSION-24H: … 24 hours [@eric]**` — and
 * taking the bold run first would carry the handle into the title.
 */
function extractTitle(rest: string): { title: string; externalId: string | null } {
  let text = stripHandles(rest);

  // honeylakeos leads with `@katie: ` or `⚠️ @katie — `.
  text = text.replace(PREFIX_HANDLES_RE, '').trim();

  let externalId: string | null = null;
  const eden = text.match(EDEN_ID_RE);
  if (eden) {
    externalId = eden[1];
    text = text.slice(eden[0].length);
  }

  // ~~struck~~ titles keep their words; the strikethrough is read as status.
  text = text.replace(/^~~(.*?)~~/, '$1').trim();

  const bold = text.match(/^\*\*(.+?)\*\*/);
  if (bold) {
    let inner = bold[1].replace(/^~~(.*?)~~$/, '$1').trim();
    if (!externalId) {
      const loose = inner.match(LOOSE_ID_RE);
      if (loose) {
        externalId = loose[1];
        inner = inner.slice(loose[0].length).trim();
      }
    }
    if (inner) return { title: inner, externalId };
  }

  // Otherwise the first sentence-ish run, so a one-line task with a long body
  // after an em dash still gets a readable title.
  const split = text.split(/\s+—\s+|(?<=\.)\s+/)[0] ?? text;
  return { title: (split || text).trim(), externalId };
}

function priorityFor(section: string[], line: string): number {
  const heading = section.join(' › ');
  if (URGENT_LINE_RE.test(line) || URGENT_SECTION_RE.test(heading)) return 1;
  if (LOW_SECTION_RE.test(heading)) return 3;
  return 2;
}

/**
 * A stable identity for a task inside its file.
 *
 * Keyed on the explicit id where the file has one, otherwise on the heading
 * trail plus the title. Never on the line number: these files get items
 * inserted above existing ones constantly, and a line-based key would close
 * and recreate half the list on every edit.
 */
export function sourceRef(relPath: string, task: ParsedTask): string {
  const basis = task.externalId
    ? `id:${task.externalId}`
    : `t:${task.section.join('>')}|${task.title}`;
  return `${relPath}#${createHash('sha1').update(basis).digest('hex').slice(0, 16)}`;
}

export function parseTaskMarkdown(source: string): ParsedTask[] {
  const lines = source.split('\n');
  const tasks: ParsedTask[] = [];
  const section: string[] = [];
  let fence: string | null = null;
  let groupHandle: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    // Fences first, always. EDEN documents its own format inside a fenced
    // block, and those three example lines are the only fenced checkboxes in
    // the whole corpus — they would arrive as three phantom tasks.
    const fenceMatch = raw.match(FENCE_RE);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (raw.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const heading = raw.match(HEADING_RE);
    if (heading) {
      const depth = heading[1].length;
      section.length = Math.max(0, depth - 1);
      section[depth - 1] = heading[2];
      groupHandle = null; // group headers do not survive a new heading
      continue;
    }

    const group = raw.match(GROUP_HEADER_RE);
    if (group) {
      groupHandle = group[1].replace(/^@/, '').toLowerCase();
      continue;
    }

    const task = raw.match(TASK_RE);
    if (!task) continue;

    const indent = task[1].length;
    const state = task[2];
    const rest = task[3];

    // Gather the block: blank lines and anything indented past the checkbox.
    // An indented `- ` with no box is body text, not a subtask — trellisv2
    // alone has ~900 of those and treating them as tasks doubles the count.
    const bodyLines: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const next = lines[j];
      if (next.trim() === '') {
        // A blank line only continues the block if something indented follows.
        const after = lines[j + 1];
        if (after && after.match(/^ +\S/) && !after.match(TASK_RE)) continue;
        break;
      }
      const nextIndent = next.match(/^ */)?.[0].length ?? 0;
      if (nextIndent <= indent) break;
      if (next.match(TASK_RE)) break; // a nested checkbox is its own task
      bodyLines.push(next.trim());
    }

    const block = `${rest}\n${bodyLines.join('\n')}`;
    const { title, externalId } = extractTitle(rest);
    if (!title) continue;

    // Strikethrough on an open box means dropped or already done — trellisv2
    // uses it for both, and either way it is not open work.
    const struck = /^~~/.test(stripHandles(rest).replace(PREFIX_HANDLES_RE, '').trim());
    const sectionSaysDone = section.some((s) => DONE_SECTION_RE.test(s));

    const assignees = [...new Set([...handlesIn(block), ...(groupHandle ? [groupHandle] : [])])];

    tasks.push({
      title,
      body: bodyLines.join('\n'),
      status: state === 'x' || struck || sectionSaysDone ? 'done' : 'todo',
      inProgress: state === '~',
      assignees,
      externalId,
      priority: priorityFor(section, block),
      section: section.filter(Boolean),
      line: i + 1,
    });

    i = j - 1;
  }

  return tasks;
}

/** Whether a task belongs to Eric, across all three assignee conventions. */
export function isEric(task: ParsedTask): boolean {
  return task.assignees.includes('eric');
}
