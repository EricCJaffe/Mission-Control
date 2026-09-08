/*
 * Finding the brain repo, and reading it.
 *
 * `~/dev/brain` is the chief-of-staff repo: `jobs/REGISTRY.md`, the per-client
 * folders under `clients/`, and the briefs those jobs commit to `jobs/out/`.
 *
 * READ-ONLY, WITHOUT EXCEPTION. Everything here reads files and runs `git log`,
 * which does not touch the working tree. This is the same one-way contract
 * `lib/repos.ts` already holds against every other repo, and it matters more
 * here than anywhere: the brain repo has its own Claude session committing to
 * it on a timer, so a write from this process would land in someone else's
 * working tree, possibly mid-commit. Git is canonical; this app renders it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type BrainOutput = {
  /** Path relative to the repo root, e.g. `jobs/out/daily-brief-2026-09-07.md`. */
  path: string;
  /** The job that wrote it, taken off the filename. */
  jobName: string;
  producedOn: string;
  body: string;
  format: 'markdown' | 'html';
  bytes: number;
  committedAt: string | null;
};

export type ClientFolder = {
  slug: string;
  /** Markdown files present, sorted: what kind of brain this is. */
  files: string[];
  hasProposed: boolean;
  proposedAt: string | null;
  lastCommitAt: string | null;
  /** `profile.md`'s text, or '' — the only body this sync reads. */
  profile: string;
  /** The first heading found in any file, for a display name. */
  headingSource: string;
};

export function brainRootFrom(devRoot: string, override?: string): string {
  return override && override.length > 0 ? override : join(devRoot, 'brain');
}

export function assertBrainRepo(root: string): void {
  if (!existsSync(root)) {
    throw new Error(
      `The brain repo is not at ${root}. Set BRAIN_ROOT if it lives somewhere else.`,
    );
  }
  if (!existsSync(join(root, 'jobs', 'REGISTRY.md'))) {
    throw new Error(
      `${root} has no jobs/REGISTRY.md, so it is not the brain repo. Refusing to guess.`,
    );
  }
}

/** ISO timestamp of the newest commit touching a path, or null if untracked. */
export function lastCommitAt(root: string, relPath: string): string | null {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function readRegistry(root: string): string {
  return readFileSync(join(root, 'jobs', 'REGISTRY.md'), 'utf8');
}

export function readOwnership(root: string): string {
  const path = join(root, 'clients', '_ownership.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/*
 * `<job-name>-<YYYY-MM-DD>.md`, which is the shape `run-job.sh` writes.
 *
 * The date is anchored to the end rather than searched for, because job names
 * contain digits and dashes of their own and a loose match would split
 * `client-brain-2026-plan-2026-09-07` in the wrong place.
 */
const OUTPUT_NAME_RE = /^(.+)-(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Whether a brief is HTML or markdown.
 *
 * Both are in `jobs/out/` — the Friday client brief is an email and opens with
 * `<p>`, the client-brain reports are prose. Recorded at sync time so the page
 * does not have to sniff it again and reach a different answer.
 */
function detectFormat(body: string): 'markdown' | 'html' {
  return body.trimStart().startsWith('<') ? 'html' : 'markdown';
}

export function readOutputs(root: string): BrainOutput[] {
  const dir = join(root, 'jobs', 'out');
  if (!existsSync(dir)) return [];

  const outputs: BrainOutput[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(OUTPUT_NAME_RE);
    if (!m) continue;

    const relPath = `jobs/out/${entry.name}`;
    let body: string;
    try {
      body = readFileSync(join(dir, entry.name), 'utf8');
    } catch {
      continue;
    }

    outputs.push({
      path: relPath,
      jobName: m[1],
      producedOn: m[2],
      body,
      format: detectFormat(body),
      bytes: Buffer.byteLength(body, 'utf8'),
      committedAt: lastCommitAt(root, relPath),
    });
  }

  return outputs.sort((a, b) => b.producedOn.localeCompare(a.producedOn) || a.path.localeCompare(b.path));
}

/*
 * The client folders.
 *
 * Underscore-prefixed entries are the cross-client files — `_ownership.md`,
 * `_leadgen.md`, `_followups.md`, `_REFRESH.md` — not clients, and they are
 * read separately or not at all.
 */
export function readClientFolders(root: string): ClientFolder[] {
  const dir = join(root, 'clients');
  if (!existsSync(dir)) return [];

  const folders: ClientFolder[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const slug = entry.name;
    const files = readdirSync(join(dir, slug))
      .filter((f) => f.endsWith('.md'))
      .sort();

    const proposedPath = join(dir, slug, '_proposed.md');
    const hasProposed = existsSync(proposedPath);

    // Only profile.md's body is read. See parse/clientBrain.ts for why the
    // others are indexed and not opened.
    let profile = '';
    try {
      profile = readFileSync(join(dir, slug, 'profile.md'), 'utf8');
    } catch {
      profile = '';
    }

    // A display name has to come from somewhere when there is no profile.md;
    // the first file's heading is the least-inventive option available.
    let headingSource = profile;
    if (!headingSource && files.length) {
      try {
        headingSource = readFileSync(join(dir, slug, files[0]), 'utf8').slice(0, 2000);
      } catch {
        headingSource = '';
      }
    }

    folders.push({
      slug,
      files: files.filter((f) => f !== '_proposed.md'),
      hasProposed,
      proposedAt: hasProposed ? statSync(proposedPath).mtime.toISOString() : null,
      lastCommitAt: lastCommitAt(root, `clients/${slug}`),
      profile,
      headingSource,
    });
  }

  return folders;
}
