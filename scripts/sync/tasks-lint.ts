/*
 * The task-format linter.
 *
 *   npm run tasks:lint -- docs/TASKS.md            report
 *   npm run tasks:lint -- docs/TASKS.md --fix      assign missing ids
 *
 * Ships with Mission Control but is meant to be run inside each project, on
 * that project's own file, by that project's own session. See
 * docs/TASK-FORMAT.md.
 *
 * WHAT --fix WILL DO: add a missing `T-xxxx` id. That is all.
 *
 * WHAT IT WILL NOT DO, ON PURPOSE: re-tick a box under a "### Shipped" heading,
 * move an assignee off a continuation line, convert prose to checkboxes, or
 * rewrite a heading. Every one of those is a judgement about somebody else's
 * work — several of these repos have four or five contributors — and a tool
 * that silently restates what another person meant is worse than a tool that
 * reports and waits. Those come out as findings for a human.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const TASK_RE = /^( *)- \[([ x~])\]\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
/*
 * A task already has an id if it carries ANY backticked identifier at the head
 * — `T-a3f9` from this standard, or `CORE-01` from EDEN's older scheme.
 *
 * Matching only `T-` would give an EDEN task a second id, and the parser reads
 * the first one, so `CORE-01` would drop into the title and the reference
 * people actually use in conversation would stop resolving. An existing stable
 * id is an identity; the standard's point is that every task HAS one, not that
 * they all look alike.
 */
const ID_RE = /^`(T-[0-9a-f]{4}|[A-Z]{2,6}-\d{1,3}[a-z]?)`\s*/;
/** The shape newly assigned ids take. */
const NEW_ID_RE = /^T-[0-9a-f]{4}$/;

/*
 * Headings that declare work FINISHED, which only the checkbox may do.
 *
 * Deliberately only the completion words. "Open Product Tasks" and "Blocked on
 * Eric" name a topic and do no harm — an unticked box beneath either is
 * consistent with it. The damage is done by "### Shipped today" and "### Built
 * 2026-09-04" sitting above boxes that are still `[ ]`, because then the
 * heading and the checkbox disagree and a reader has to guess which one to
 * believe. Flagging the harmless ones too just trains people to ignore the
 * linter.
 */
const STATUS_HEADING_RE =
  /^(?:✅|🔴|🟠|🟡|🔵)?\s*(done|fixed|shipped|closed|resolved|completed|complete|built)\b/i;

export type Finding = {
  line: number;
  rule: string;
  detail: string;
  /** Whether --fix can deal with it, or a person must. */
  fixable: boolean;
};

export type LintResult = {
  tasks: number;
  withId: number;
  findings: Finding[];
  /** The file with ids added. Identical to the input when nothing was added. */
  fixed: string;
};

/** Four hex characters is 65,536 — ample per file, and short enough to read. */
function newId(taken: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = `T-${randomBytes(2).toString('hex')}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  throw new Error('Could not find a free id — is this file enormous?');
}

export function lintTasks(source: string): LintResult {
  const lines = source.split('\n');
  const out = [...lines];
  const findings: Finding[] = [];

  // Collect ids first, so a duplicate is reported against the second one and
  // a newly assigned id cannot collide with one further down the file.
  const seen = new Map<string, number>();
  const taken = new Set<string>();
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const f = lines[i].match(FENCE_RE);
    if (f) {
      fence = fence === null ? f[1] : lines[i].trimStart().startsWith(fence) ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    const t = lines[i].match(TASK_RE);
    if (!t) continue;
    const id = t[3].match(ID_RE)?.[1];
    if (!id) continue;
    // EDEN documents an FND-25 collision it chose to live with; reporting it
    // here would be noise about a decision already made elsewhere.
    if (!NEW_ID_RE.test(id)) {
      taken.add(id);
      continue;
    }
    if (seen.has(id)) {
      findings.push({
        line: i + 1,
        rule: 'duplicate-id',
        detail: `\`${id}\` is already used on line ${seen.get(id)}. An id must identify one task.`,
        fixable: false,
      });
    }
    seen.set(id, i + 1);
    taken.add(id);
  }

  let tasks = 0;
  let withId = 0;
  fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    const f = raw.match(FENCE_RE);
    if (f) {
      fence = fence === null ? f[1] : raw.trimStart().startsWith(fence) ? null : fence;
      continue;
    }
    if (fence !== null) continue;

    const heading = raw.match(HEADING_RE);
    if (heading && STATUS_HEADING_RE.test(heading[2])) {
      findings.push({
        line: i + 1,
        rule: 'status-heading',
        detail:
          `"${heading[2]}" states a status. Only the checkbox may do that — ` +
          'tick the boxes beneath it and make the heading a topic.',
        fixable: false,
      });
    }

    const t = raw.match(TASK_RE);
    if (!t) {
      // A checkbox-looking line that the task regex missed, e.g. `* [ ]`.
      if (/^\s*[*+]\s*\[[ xX~]\]/.test(raw)) {
        findings.push({
          line: i + 1,
          rule: 'bullet-char',
          detail: 'Use `-` for a task bullet, not `*` or `+`.',
          fixable: false,
        });
      }
      continue;
    }

    tasks += 1;
    const indent = t[1];
    const state = t[2];
    const rest = t[3];

    if (indent.length % 2 !== 0) {
      findings.push({
        line: i + 1,
        rule: 'indent',
        detail: `Indented ${indent.length} spaces; use a multiple of two.`,
        fixable: false,
      });
    }

    const idMatch = rest.match(ID_RE);
    if (idMatch) {
      withId += 1;
    } else {
      const id = newId(taken);
      out[i] = `${indent}- [${state}] \`${id}\` ${rest}`.replace(/\s+$/, '');
      findings.push({
        line: i + 1,
        rule: 'missing-id',
        detail: `No id. --fix assigns \`${id}\`.`,
        fixable: true,
      });
    }

    const body = idMatch ? rest.slice(idMatch[0].length) : rest;

    if (/~~.+~~/.test(body)) {
      findings.push({
        line: i + 1,
        rule: 'strikethrough',
        detail:
          'Strikethrough is being used to mean done or dropped. Tick the box, ' +
          'or delete the task and say why in the body.',
        fixable: false,
      });
    }

    if (/^\s*(?:[^\w\s]+\s*)?@[\w-]+\s*[:—]/.test(body)) {
      findings.push({
        line: i + 1,
        rule: 'assignee-prefix',
        detail: 'The assignee belongs at the end of the line as [@handle], not as a prefix.',
        fixable: false,
      });
    }

    if (/\bP[0-3]\b/.test(body) && !/\(P[123]\)\s*$/.test(body)) {
      findings.push({
        line: i + 1,
        rule: 'priority-position',
        detail: 'Priority goes at the very end of the line as (P1), (P2) or (P3).',
        fixable: false,
      });
    }
  }

  return { tasks, withId, findings, fixed: out.join('\n') };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const files = args.filter((a) => !a.startsWith('--'));

  if (files.length === 0) {
    console.log(
      'Usage: npm run tasks:lint -- <file.md> [more.md] [--fix]\n\n' +
        '  --fix   assign an id to every task that lacks one\n\n' +
        'See docs/TASK-FORMAT.md. --fix only ever adds ids; everything else it\n' +
        'finds is reported for a person to decide.',
    );
    process.exit(0);
  }

  let totalFindings = 0;
  let totalBlocking = 0;

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      console.error(`  cannot read ${file}`);
      process.exitCode = 1;
      continue;
    }

    const result = lintTasks(source);
    const needsPerson = result.findings.filter((f) => !f.fixable);
    totalFindings += result.findings.length;
    totalBlocking += needsPerson.length;

    console.log(`\n${file} — ${result.tasks} tasks, ${result.withId} already have an id`);

    if (result.findings.length === 0) {
      console.log('  clean');
      continue;
    }

    const byRule = new Map<string, Finding[]>();
    for (const f of result.findings) {
      byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    }
    for (const [rule, list] of byRule) {
      console.log(`  ${rule} (${list.length})`);
      for (const f of list.slice(0, 5)) console.log(`    line ${f.line}: ${f.detail}`);
      if (list.length > 5) console.log(`    …and ${list.length - 5} more`);
    }

    if (fix) {
      if (result.fixed !== source) {
        writeFileSync(file, result.fixed);
        const added = result.findings.filter((f) => f.rule === 'missing-id').length;
        console.log(`  wrote ${added} ids`);
      } else {
        console.log('  nothing for --fix to add');
      }
    }
  }

  if (!fix && totalFindings > 0) {
    console.log('\nRun again with --fix to assign the missing ids.');
  }
  if (totalBlocking > 0) {
    console.log(
      `${totalBlocking} finding(s) need a person — they change what somebody meant, ` +
        'so the linter will not touch them.',
    );
  }
}

// Only run the CLI when invoked directly, so the tests can import lintTasks.
if (process.argv[1]?.endsWith('tasks-lint.ts')) main();
