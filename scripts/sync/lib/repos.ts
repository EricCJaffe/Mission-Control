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

/** Sub-directory task files, e.g. honeylakeos/docs/intranet-migration/TASKS.md. */
function nestedTaskFiles(repoPath: string): string[] {
  const docs = join(repoPath, 'docs');
  if (!existsSync(docs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(docs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of ['TASKS.md', 'TODO.md']) {
      const rel = `docs/${entry.name}/${name}`;
      if (existsSync(join(repoPath, rel))) out.push(rel);
    }
  }
  return out;
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
