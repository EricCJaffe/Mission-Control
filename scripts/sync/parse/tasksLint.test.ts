/*
 * The task-format linter, and the round trip that matters most:
 * adding ids to a file must not change what the parser reads out of it.
 *
 * That is not hypothetical. Running --fix over a copy of honeylakeos's real
 * file is what caught the ordering bug in extractTitle — 506 tasks in and 506
 * out, but one title had grown an `@eric/@katie:` because inserting an id
 * moved the prefix assignee off the start of the line where its pattern is
 * anchored. Across that file it would have silently lost prefix assignees and
 * polluted the titles of every task using that convention.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTasks } from '../tasks-lint.ts';
import { parseTaskMarkdown, isEric } from './markdown.ts';

test('assigns an id to every task that lacks one', () => {
  const md = ['- [ ] First', '- [x] Second', '- [~] Third'].join('\n');
  const { fixed, tasks, withId } = lintTasks(md);
  assert.equal(tasks, 3);
  assert.equal(withId, 0);
  assert.equal(fixed.match(/`T-[0-9a-f]{4}`/g)?.length, 3);
});

test('leaves an existing id alone', () => {
  const md = '- [ ] `T-abcd` Already has one';
  const { fixed, withId } = lintTasks(md);
  assert.equal(withId, 1);
  assert.equal(fixed, md);
});

test('ids are unique within a file', () => {
  const md = Array.from({ length: 200 }, (_, i) => `- [ ] task ${i}`).join('\n');
  const ids = lintTasks(md).fixed.match(/`T-[0-9a-f]{4}`/g) ?? [];
  assert.equal(ids.length, 200);
  assert.equal(new Set(ids).size, 200);
});

test('a new id cannot collide with one further down the file', () => {
  // Ids are collected before any are handed out, so the second line cannot be
  // given the id the third already holds.
  const md = ['- [ ] no id yet', '- [ ] `T-0001` has one'].join('\n');
  const ids = lintTasks(md).fixed.match(/`T-[0-9a-f]{4}`/g) ?? [];
  assert.equal(new Set(ids).size, 2);
});

test('flags a heading that says the work is finished', () => {
  const md = ['### Shipped today — the importer', '- [ ] wrote the importer'].join('\n');
  const findings = lintTasks(md).findings.filter((f) => f.rule === 'status-heading');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].fixable, false);
});

test('does not flag a heading that merely names a topic', () => {
  // "Open Product Tasks" and "Blocked on Eric" do no harm — an unticked box
  // beneath either is consistent. Flagging them trains people to ignore this.
  for (const heading of ['## Open Product Tasks', '### Blocked on Eric', '## Forms platform']) {
    const findings = lintTasks(`${heading}\n- [ ] something`).findings;
    assert.deepEqual(findings.filter((f) => f.rule === 'status-heading'), [], heading);
  }
});

test('reports the things it refuses to change', () => {
  const md = [
    '- [x] ~~struck through~~ done',
    '- [ ] @katie: prefix assignee',
    '* [ ] wrong bullet char',
  ].join('\n');
  const rules = new Set(lintTasks(md).findings.map((f) => f.rule));
  assert.ok(rules.has('strikethrough'));
  assert.ok(rules.has('assignee-prefix'));
  assert.ok(rules.has('bullet-char'));
  // None of these are things a tool should decide on somebody else's behalf.
  const judgement = lintTasks(md).findings.filter((f) =>
    ['strikethrough', 'assignee-prefix', 'bullet-char'].includes(f.rule),
  );
  assert.ok(judgement.every((f) => f.fixable === false));
});

test('ignores checkboxes inside a fenced block', () => {
  const md = ['```', '- [ ] documentation example', '```', '- [ ] real one'].join('\n');
  assert.equal(lintTasks(md).tasks, 1);
});

test('THE ROUND TRIP: adding ids changes nothing the parser reads', () => {
  const md = [
    '# Tasks',
    '## Forms',
    '### 🔴 Urgent — something is wrong',
    '- [ ] **Bold title with a bracket assignee** [@eric]',
    '      A continuation line. [@rd]',
    '- [ ] @eric/@katie: prefix-style assignees on a honeylakeos line',
    '- [x] `CORE-01` an EDEN id that already exists [@josh]',
    '- [~] in progress, trellis style [@cristina]',
    '### Normal',
    '- [ ] plain one, nobody assigned',
  ].join('\n');

  const before = parseTaskMarkdown(md);
  const after = parseTaskMarkdown(lintTasks(md).fixed);

  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i += 1) {
    assert.equal(after[i].title, before[i].title, `title ${i}`);
    assert.equal(after[i].status, before[i].status, `status ${i}`);
    assert.equal(after[i].priority, before[i].priority, `priority ${i}`);
    assert.deepEqual(after[i].assignees, before[i].assignees, `assignees ${i}`);
  }
  assert.equal(before.filter(isEric).length, after.filter(isEric).length);
});

test('an existing scheme keeps its id; a new one gets the standard shape', () => {
  const md = ['- [x] `CORE-01` EDEN keeps its own', '- [ ] this one gets a T- id'].join('\n');
  const parsed = parseTaskMarkdown(lintTasks(md).fixed);
  assert.equal(parsed[0].externalId, 'CORE-01');
  assert.match(parsed[1].externalId ?? '', /^T-[0-9a-f]{4}$/);
});
