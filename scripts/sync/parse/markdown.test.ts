/*
 * Parser tests, each one taken from a real line in ~/dev rather than invented.
 * Run with `npm run test:sync`.
 *
 * The traps are the point. Every case below is something that was actually
 * found in the corpus and would silently corrupt the task list: three phantom
 * tasks from EDEN's own documentation, ~900 body bullets in trellisv2 that
 * look like subtasks, hundreds of honeylakeos items filed under "Shipped" with
 * the box left unticked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskMarkdown, isEric, sourceRef } from './markdown.ts';

test('reads the three checkbox states', () => {
  const tasks = parseTaskMarkdown(
    ['- [ ] Open one', '- [x] Closed one', '- [~] In flight'].join('\n'),
  );
  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((t) => t.status),
    ['todo', 'done', 'todo'],
  );
  assert.equal(tasks[2].inProgress, true);
});

test('ignores checkboxes inside a fenced block', () => {
  // EDEN/docs/TASKS.md:13-17 documents its own format in a fence. Those are
  // the only fenced checkboxes in the corpus and they must not become tasks.
  const md = [
    '## Conventions',
    '```',
    '- [ ] Task description here [@handle]',
    '- [x] Completed task keeps its assignee [@handle]',
    '```',
    '- [ ] A real one',
  ].join('\n');
  const tasks = parseTaskMarkdown(md);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'A real one');
});

test('handles an indented fence inside a task body', () => {
  const md = [
    '- [ ] Run the migration',
    '  ```sql',
    '  - [ ] not a task, it is SQL in a fence',
    '  ```',
    '- [ ] Second task',
  ].join('\n');
  assert.equal(parseTaskMarkdown(md).length, 2);
});

test('an indented plain bullet is body, not a subtask', () => {
  // trellisv2 has ~900 of these. Counting them doubles the task list.
  const md = [
    '- [ ] **Parent task.**',
    '  - Create the pg_cron job',
    '  - Add the index',
    '- [ ] Next task',
  ].join('\n');
  const tasks = parseTaskMarkdown(md);
  assert.equal(tasks.length, 2);
  assert.match(tasks[0].body, /pg_cron/);
});

test('an indented checkbox is its own task', () => {
  const md = ['- [ ] Parent', '  - [x] Child', '- [ ] Sibling'].join('\n');
  assert.equal(parseTaskMarkdown(md).length, 3);
});

test('strikethrough on an open box counts as done', () => {
  // trellisv2:1196 — `- [ ] ~~**GOLIVE-RUNBOOK**~~ — Pre-stage every …`
  const tasks = parseTaskMarkdown('- [ ] ~~**GOLIVE-RUNBOOK**~~ — Pre-stage every step');
  assert.equal(tasks[0].status, 'done');
});

test('a section that says the work shipped closes its unticked boxes', () => {
  // honeylakeos files finished work under "### Shipped today" and leaves the
  // boxes unticked; 324 of its items are done.
  const md = ['## Session close-out', '### Shipped today — the importer', '- [ ] Wrote the importer'].join('\n');
  assert.equal(parseTaskMarkdown(md)[0].status, 'done');
});

test('finds assignees in every convention in use', () => {
  const cases: Array<[string, string[]]> = [
    ['- [ ] Bracketed [@eric]', ['eric']],
    ['- [ ] Backticked `[@rd]`', ['rd']],
    ['- [ ] Shared [@eric/@rd]', ['eric', 'rd']],
    ['- [ ] Two brackets [@josh] [@eric]', ['josh', 'eric']],
    ['- [ ] @eric: honeylakeos prefix style', ['eric']],
    ['- [ ] ⚠️ @katie — em dash instead of a colon', ['katie']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(parseTaskMarkdown(line)[0].assignees.sort(), [...expected].sort(), line);
  }
});

test('finds an assignee that only appears on a continuation line', () => {
  // 91 trellisv2 tasks name their owner at the end of a multi-line body.
  const md = ['- [ ] **Decision needed per row.**', '      Nothing could set them. [@eric]'].join('\n');
  assert.deepEqual(parseTaskMarkdown(md)[0].assignees, ['eric']);
});

test('inherits a honeylakeos group header', () => {
  const md = ['### Assignments', '**@david**', '- [ ] Resolve the blockers'].join('\n');
  assert.deepEqual(parseTaskMarkdown(md)[0].assignees, ['david']);
  // ...but not across a new heading.
  const md2 = ['**@david**', '### Other work', '- [ ] Unowned'].join('\n');
  assert.deepEqual(parseTaskMarkdown(md2)[0].assignees, []);
});

test('ignores documentation placeholders and vendor systems', () => {
  assert.deepEqual(parseTaskMarkdown('- [ ] Example [@handle]')[0].assignees, []);
  assert.deepEqual(parseTaskMarkdown('- [ ] Nobody [@unassigned]')[0].assignees, []);
  assert.deepEqual(parseTaskMarkdown('- [ ] @alleva: vendor system')[0].assignees, []);
});

test('does not mistake cristina for eric', () => {
  assert.equal(isEric(parseTaskMarkdown('- [ ] Ask [@cristina]')[0]), false);
  assert.equal(isEric(parseTaskMarkdown('- [ ] Ask [@eric/@christina]')[0]), true);
});

test('keeps the assignee out of the title when bold closes after it', () => {
  // trellisv2:1390 — the closing ** sits after the bracket.
  const t = parseTaskMarkdown('- [ ] **AUTH-SESSION-24H: set the session time-box to 24 hours [@eric]**')[0];
  assert.doesNotMatch(t.title, /@eric/);
  assert.deepEqual(t.assignees, ['eric']);
  assert.equal(t.externalId, 'AUTH-SESSION-24H');
});

test('lifts an EDEN id out of the title', () => {
  const t = parseTaskMarkdown('- [ ] `CORE-01` Supabase Auth: sign in with Apple [@eric]')[0];
  assert.equal(t.externalId, 'CORE-01');
  assert.equal(t.title, 'Supabase Auth: sign in with Apple');
});

test('ranks by section emoji and by line', () => {
  const urgent = parseTaskMarkdown(['### 🔴 Urgent — something is wrong', '- [ ] Fix it'].join('\n'));
  assert.equal(urgent[0].priority, 1);
  const low = parseTaskMarkdown(['### 🔵 Low — whenever you are ready', '- [ ] Tidy up'].join('\n'));
  assert.equal(low[0].priority, 3);
  const normal = parseTaskMarkdown(['### Normal', '- [ ] Something'].join('\n'));
  assert.equal(normal[0].priority, 2);
  const inline = parseTaskMarkdown('- [ ] 🔴 **The import undid the anonymisation.**');
  assert.equal(inline[0].priority, 1);
});

test('records the heading trail', () => {
  const md = ['# Tasks', '## Open items', '### 🔴 Urgent', '- [ ] Do the thing'].join('\n');
  assert.deepEqual(parseTaskMarkdown(md)[0].section, ['Tasks', 'Open items', '🔴 Urgent']);
});

test('source_ref survives reordering but not retitling', () => {
  const a = parseTaskMarkdown(['## S', '- [ ] First', '- [ ] Second'].join('\n'));
  const b = parseTaskMarkdown(['## S', '- [ ] Second', '- [ ] First'].join('\n'));
  assert.equal(sourceRef('docs/TASKS.md', a[0]), sourceRef('docs/TASKS.md', b[1]));

  // An explicit id keeps identity even when the words change.
  const before = parseTaskMarkdown('- [ ] `FND-01` Form the entity')[0];
  const after = parseTaskMarkdown('- [ ] `FND-01` Form the entity (LegalZoom)')[0];
  assert.equal(sourceRef('docs/TASKS.md', before), sourceRef('docs/TASKS.md', after));
});

test('a file with no checkboxes yields nothing rather than guessing', () => {
  // TKOS/docs/TASKS.md is 133 lines of bold headings and prose.
  const md = ['## Blocked on the client', '**Updated technician roster**', 'The tracker is seeded with sample data.'].join('\n');
  assert.deepEqual(parseTaskMarkdown(md), []);
});
