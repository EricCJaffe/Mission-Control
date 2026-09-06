/*
 * `TODO` and `FIXME` markers in source.
 *
 * OFF BY DEFAULT, AND THAT IS THE POINT. A code marker is a note to whoever
 * next opens that file, not a commitment to do something this week. Mixing
 * hundreds of them into the same list as "Cloudflare is unresolved and public
 * forms are unprotected" devalues both. `--code-todos` turns them on when you
 * actually want to sweep them.
 *
 * Capped at 50 per project, deliberately low. If a repo has more than fifty,
 * the count is the finding and importing them one by one helps nobody.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Repo } from './repos.ts';

export type CodeTodo = {
  /** Repo-relative path. */
  file: string;
  line: number;
  /** The marker word, upper-cased: TODO, FIXME, HACK, XXX. */
  kind: string;
  text: string;
  priority: number;
};

export const MAX_PER_PROJECT = 50;

/*
 * Directories that hold code nobody wrote by hand. Vendored and generated
 * trees are full of upstream markers, and importing another project's TODOs
 * as your own is worse than importing none.
 */
const SKIP_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  'vendor',
  '.venv',
  'target',
  'supabase/migrations-old-project',
];

/** FIXME reads as broken; TODO reads as unfinished. Only the first is urgent-ish. */
const URGENT_KINDS = /^(FIXME|XXX|HACK)$/;

export function fetchCodeTodos(repo: Repo): CodeTodo[] {
  let raw: string;
  try {
    raw = execFileSync(
      'rg',
      [
        '--no-heading',
        '--line-number',
        '--max-count',
        '20',
        '--max-filesize',
        '1M',
        ...SKIP_DIRS.flatMap((d) => ['--glob', `!${d}/**`]),
        // Prose is not code. Markdown is where these repos write their tasks,
        // and it is already read properly by the checkbox parser — scanning it
        // here turns a sentence *about* a FIXME into a task. Seen in the wild:
        // trellisv2's legacy-CLAUDE.md yielded a FIXME from a sentence about
        // one, which is not a task anybody can do.
        ...['md', 'mdx', 'markdown', 'txt', 'rst'].flatMap((e) => ['--glob', `!*.${e}`]),
        // Comment-leader first, so a string literal containing the word "todo"
        // in prose does not become a task.
        '--regexp',
        String.raw`(?://|#|/\*|<!--|--)\s*(TODO|FIXME|HACK|XXX)\b[:\s]`,
        '--',
        '.',
      ],
      { cwd: repo.path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 },
    );
  } catch {
    // rg exits non-zero when it matches nothing, which is the common case.
    return [];
  }

  const out: CodeTodo[] = [];
  for (const row of raw.split('\n')) {
    if (!row.trim()) continue;
    const m = row.match(/^(.+?):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, lineNo, content] = m;

    const marker = content.match(/(TODO|FIXME|HACK|XXX)\b[:\s]\s*(.*)$/);
    if (!marker) continue;
    const kind = marker[1];
    const text = marker[2].replace(/\*\/\s*$/, '').replace(/-->\s*$/, '').trim();
    if (!text) continue;

    out.push({
      file: file.replace(/^\.\//, ''),
      line: Number(lineNo),
      kind,
      text: text.slice(0, 300),
      priority: URGENT_KINDS.test(kind) ? 2 : 3,
    });
    if (out.length >= MAX_PER_PROJECT) break;
  }
  return out;
}

/**
 * Identity for a code marker.
 *
 * File plus the text of the marker, never the line number — a marker moves
 * every time something is inserted above it, and keying on the line would
 * close and recreate the whole set on every commit.
 */
export function codeTodoRef(todo: CodeTodo): string {
  return `${todo.file}#${createHash('sha1').update(`${todo.kind}|${todo.text}`).digest('hex').slice(0, 16)}`;
}
