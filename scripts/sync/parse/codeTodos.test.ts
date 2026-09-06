/*
 * Code-marker harvesting.
 *
 * fetchCodeTodos shells out to ripgrep against a real directory, so these
 * tests build small trees in a temp dir and run it for real rather than
 * mocking the search. The parsing that matters — which lines are markers,
 * which are prose, what the title becomes — is only meaningful against
 * ripgrep's actual output format, and a mock would be asserting my
 * assumptions about that format rather than the format.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCodeTodos, codeTodoRef, MAX_PER_PROJECT } from '../lib/codeTodos.ts';
import type { Repo } from '../lib/repos.ts';

/** Build a throwaway repo from a map of path → contents. */
function repoWith(files: Record<string, string>): { repo: Repo; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'mc-todos-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return {
    repo: { slug: 'fixture', path: dir, branch: 'main', githubRepo: 'owner/fixture' },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('finds the four marker words behind a comment leader', () => {
  const { repo, cleanup } = repoWith({
    'a.ts': '// TODO: wire the thing up\n',
    'b.py': '# FIXME: this double-counts\n',
    'c.css': '/* HACK: shim for Safari */\n',
    'd.sql': '-- XXX: drops rows\n',
  });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.deepEqual(
    found.map((t) => t.kind).sort(),
    ['FIXME', 'HACK', 'TODO', 'XXX'],
  );
});

test('FIXME outranks TODO, because one says broken and the other says unfinished', () => {
  const { repo, cleanup } = repoWith({ 'a.ts': '// TODO: later\n// FIXME: wrong\n' });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found.find((t) => t.kind === 'TODO')?.priority, 3);
  assert.equal(found.find((t) => t.kind === 'FIXME')?.priority, 2);
});

test('the word alone is not a marker without a comment leader', () => {
  // Otherwise every string literal and every identifier containing "todo"
  // becomes a task — `const todoCount = ...` is not work.
  const { repo, cleanup } = repoWith({
    'a.ts': 'const label = "TODO list";\nconst todoCount = items.length;\nfunction TODOListView() {}\n',
  });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.deepEqual(found, []);
});

test('documentation is not scanned', () => {
  // trellisv2's legacy-CLAUDE.md turned a sentence *about* a FIXME into a
  // task. Markdown is where these repos keep real tasks and the checkbox
  // parser already reads it properly.
  const { repo, cleanup } = repoWith({
    'notes.md': '// FIXME: this is prose describing a marker\n',
    'README.md': '# TODO: not a task either\n',
    'real.ts': '// TODO: this one counts\n',
  });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'real.ts');
});

test('generated and vendored trees are skipped', () => {
  // Importing a dependency's TODOs as your own is worse than importing none.
  const { repo, cleanup } = repoWith({
    'node_modules/dep/index.js': '// TODO: upstream problem\n',
    'dist/bundle.js': '// TODO: generated\n',
    '.next/x.js': '// TODO: build output\n',
    'src/mine.ts': '// TODO: actually mine\n',
  });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'src/mine.ts');
});

test('captures the text and the line, and trims a closing comment', () => {
  const { repo, cleanup } = repoWith({ 'a.ts': 'const x = 1;\n/* TODO: close the block */\n' });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found[0].line, 2);
  assert.equal(found[0].text, 'close the block');
});

test('one file contributes at most twenty markers', () => {
  // ripgrep runs with --max-count 20, so a single pathological file cannot
  // fill the whole project budget on its own. Worth pinning: it means the
  // fifty-per-project cap is only ever reached across three files or more.
  const many = Array.from({ length: 80 }, (_, i) => `// TODO: item ${i}`).join('\n');
  const { repo, cleanup } = repoWith({ 'a.ts': many });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found.length, 20);
});

test('caps at fifty per project across files', () => {
  // Past fifty the count is the finding; importing them one by one helps
  // nobody and buries the list that matters.
  const files: Record<string, string> = {};
  for (let f = 0; f < 6; f += 1) {
    files[`f${f}.ts`] = Array.from({ length: 15 }, (_, i) => `// TODO: file ${f} item ${i}`).join('\n');
  }
  const { repo, cleanup } = repoWith(files);
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.equal(found.length, MAX_PER_PROJECT);
});

test('a marker keeps its identity when the file shifts around it', () => {
  // Keying on the line number would close and recreate every marker on any
  // commit that inserts a line above them.
  const before = codeTodoRef({ file: 'a.ts', line: 12, kind: 'TODO', text: 'wire it up', priority: 3 });
  const after = codeTodoRef({ file: 'a.ts', line: 340, kind: 'TODO', text: 'wire it up', priority: 3 });
  assert.equal(before, after);

  // Different text is a different marker.
  const other = codeTodoRef({ file: 'a.ts', line: 12, kind: 'TODO', text: 'something else', priority: 3 });
  assert.notEqual(before, other);

  // So is the same text in a different file.
  const elsewhere = codeTodoRef({ file: 'b.ts', line: 12, kind: 'TODO', text: 'wire it up', priority: 3 });
  assert.notEqual(before, elsewhere);
});

test('a directory with no markers yields nothing rather than throwing', () => {
  // ripgrep exits non-zero when it matches nothing, which is the common case
  // and must not read as a failure.
  const { repo, cleanup } = repoWith({ 'a.ts': 'export const x = 1;\n' });
  const found = fetchCodeTodos(repo);
  cleanup();
  assert.deepEqual(found, []);
});
