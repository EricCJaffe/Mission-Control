/*
 * Finding the task files in a repo.
 *
 * Real directories in a temp dir rather than a mocked filesystem: what is
 * being tested is which paths come back from a tree, and a mock would only
 * assert my assumptions about readdir.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskFilesIn, type Repo } from '../lib/repos.ts';

function repoWith(paths: string[]): { repo: Repo; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'mc-repos-'));
  for (const rel of paths) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '- [ ] a task\n');
  }
  return {
    repo: { slug: 'fixture', path: dir, branch: 'main', githubRepo: null },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('finds the files at the top of docs/', () => {
  const { repo, cleanup } = repoWith(['docs/TASKS.md', 'docs/TODO.md', 'docs/BACKLOG.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found.sort(), ['docs/BACKLOG.md', 'docs/TASKS.md', 'docs/TODO.md']);
});

test('finds one nested a level down', () => {
  // honeylakeos really does keep docs/intranet-migration/TASKS.md.
  const { repo, cleanup } = repoWith(['docs/TASKS.md', 'docs/intranet-migration/TASKS.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.ok(found.includes('docs/intranet-migration/TASKS.md'));
});

test('finds one several levels down, with a suffixed name', () => {
  // The old rule walked one level and matched two exact filenames, so this
  // shape was invisible.
  const { repo, cleanup } = repoWith(['docs/planning/2026/TODO-q4.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, ['docs/planning/2026/TODO-q4.md']);
});

test('does not report the same file twice', () => {
  // docs/TASKS.md is both a known top-level name and something the walk finds.
  const { repo, cleanup } = repoWith(['docs/TASKS.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, ['docs/TASKS.md']);
});

test('ignores files that only look like task lists', () => {
  const { repo, cleanup } = repoWith([
    'docs/ARCHITECTURE.md',
    'docs/TODO-notes.txt',
    'docs/my-TASKS-are-here.md',
  ]);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, []);
});

test('skips node_modules and dot directories under docs/', () => {
  // A vendored site build inside docs/ costs seconds per repo and contributes
  // somebody else's tasks.
  const { repo, cleanup } = repoWith([
    'docs/node_modules/pkg/TASKS.md',
    'docs/.cache/TODO.md',
    'docs/TASKS.md',
  ]);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, ['docs/TASKS.md']);
});

test('a repo with no docs directory yields nothing rather than throwing', () => {
  const { repo, cleanup } = repoWith(['README.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, []);
});

test('finds TASKS.md at the repo root too', () => {
  const { repo, cleanup } = repoWith(['TASKS.md']);
  const found = taskFilesIn(repo);
  cleanup();
  assert.deepEqual(found, ['TASKS.md']);
});
