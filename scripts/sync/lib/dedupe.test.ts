import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dedupeByRef, isUniqueViolation } from './dedupe.ts';
import { isLinkedWorktree } from './repos.ts';

test('keeps the first item per sourceRef and reports the rest', () => {
  const items = [
    { sourceRef: 'docs/TASKS.md#a', title: 'Two-step sign-in' },
    { sourceRef: 'docs/TASKS.md#b', title: 'Other' },
    { sourceRef: 'docs/TASKS.md#a', title: 'Two-step sign-in (copy)' },
  ];
  const { unique, dropped } = dedupeByRef(items);
  assert.deepEqual(unique.map((i) => i.title), ['Two-step sign-in', 'Other']);
  assert.deepEqual(dropped.map((i) => i.title), ['Two-step sign-in (copy)']);
});

test('an empty batch stays empty', () => {
  assert.deepEqual(dedupeByRef([]), { unique: [], dropped: [] });
});

test('recognises a unique violation by code or message', () => {
  assert.equal(isUniqueViolation({ code: '23505' }), true);
  assert.equal(isUniqueViolation({ message: 'duplicate key value violates unique constraint "tasks_source_ref_idx"' }), true);
  assert.equal(isUniqueViolation({ code: '42P01', message: 'no table' }), false);
  assert.equal(isUniqueViolation(null), false);
});

test('a linked worktree (.git file) is detected; a real checkout is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-wt-'));
  try {
    mkdirSync(join(dir, 'main', '.git'), { recursive: true });
    mkdirSync(join(dir, 'wt'));
    writeFileSync(join(dir, 'wt', '.git'), 'gitdir: ../main/.git/worktrees/wt\n');
    assert.equal(isLinkedWorktree(join(dir, 'main', '.git')), false);
    assert.equal(isLinkedWorktree(join(dir, 'wt', '.git')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
