/*
 * Finding the projects, and finding the task files inside them.
 *
 * Discovery is by directory listing rather than by a hardcoded list, and that
 * has already paid for itself: `linksy` appeared under ~/dev while this file
 * was being written, with a 286 KB task list, and needed no code change to be
 * picked up.
 *
 * Everything here is read-only against the other repos. It runs `git config`
 * and `git rev-parse`, which do not touch the working tree, and reads files.
 * Nothing in this CLI may ever write outside Mission Control's own database —
 * a sync that edited another project's TASKS.md would be editing a repo whose
 * session did not ask for it, possibly mid-commit.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Repo = {
  slug: string;
  path: string;
  branch: string | null;
  /** `owner/name` when the remote is GitHub, for building blob links. */
  githubRepo: string | null;
};

/*
 * Where task lists actually live, in the order they should be read.
 *
 * The survey found nothing in CLAUDE.md or .claude/ anywhere in ~/dev — not
 * one checkbox in eleven repos — so neither is scanned. Reading them would be
 * pure cost, and CLAUDE.md is large.
 */
const TASK_FILES = [
  'docs/TASKS.md',
  'docs/TODO.md',
  'docs/BACKLOG.md',
  'TASKS.md',
  'TODO.md',
];

/*
 * Task files anywhere under docs/, at any depth.
 *
 * This used to walk one level and match two exact filenames, which missed
 * `docs/planning/2026/TODO-q4.md` — a real shape, since these repos date and
 * suffix their planning files. Any depth now, and any name that starts TASKS
 * or TODO.
 *
 * Depth is capped and node_modules skipped because `docs/` occasionally
 * contains a vendored site build, and walking one of those costs seconds per
 * repo for nothing.
 */
const NESTED_NAME_RE = /^(TASKS|TODO)[\w.-]*\.md$/i;
const MAX_DEPTH = 4;

function nestedTaskFiles(repoPath: string): string[] {
  const out: string[] = [];

  const walk = (relDir: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(join(repoPath, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(rel, depth + 1);
      } else if (NESTED_NAME_RE.test(entry.name)) {
        out.push(rel);
      }
    }
  };

  if (existsSync(join(repoPath, 'docs'))) walk('docs', 1);
  // `docs/TASKS.md` and `docs/TODO.md` are already in TASK_FILES; drop the
  // duplicates rather than harvesting the same file twice under two names.
  return out.filter((rel) => !TASK_FILES.includes(rel));
}

function git(repoPath: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

function githubRepoFrom(remote: string | null): string | null {
  if (!remote) return null;
  const m = remote.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

export function discoverRepos(devRoot: string): Repo[] {
  if (!existsSync(devRoot)) throw new Error(`DEV_ROOT does not exist: ${devRoot}`);

  const repos: Repo[] = [];
  for (const entry of readdirSync(devRoot, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(devRoot, entry.name);
    if (!existsSync(join(path, '.git'))) continue;
    repos.push({
      slug: entry.name,
      path,
      branch: git(path, ['rev-parse', '--abbrev-ref', 'HEAD']),
      githubRepo: githubRepoFrom(git(path, ['config', '--get', 'remote.origin.url'])),
    });
  }
  return repos;
}

export function taskFilesIn(repo: Repo): string[] {
  const found = TASK_FILES.filter((rel) => {
    const full = join(repo.path, rel);
    return existsSync(full) && statSync(full).isFile();
  });
  return [...found, ...nestedTaskFiles(repo.path)];
}

/** A link that opens the task where it lives, when the repo is on GitHub. */
export function blobUrl(repo: Repo, relPath: string, line: number): string | null {
  if (!repo.githubRepo) return null;
  return `https://github.com/${repo.githubRepo}/blob/${repo.branch ?? 'main'}/${relPath}#L${line}`;
}
