import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionsTsvRow, renderDecisionNote, type DecisionRow } from './decision-note.ts';
import { textLeaks } from '../../../src/lib/activity/scrub.ts';

// SYNTHETIC values only: the repo is public.
const d = (over: Partial<DecisionRow> = {}): DecisionRow => ({
  id: '5eed0029-0003-4000-8000-000000000002',
  item_key: 'channel:to:abc:waiting',
  item_source: 'channel',
  item_title: 'Merge PR 12 for the demo?',
  item_bot: 'SJCOS session',
  choice: 'approve',
  reply: null,
  until_date: null,
  created_at: '2026-10-28T00:30:00Z',
  ...over,
});

test('an answer to a session ask goes back through from-grokbot to that session, with re:', () => {
  const n = renderDecisionNote(d(), { path: 'to-grokbot/2026-10-27-sjcos-merge-12.md', from: 'sjcos', project: 'sjcos' });
  assert.ok(n);
  assert.match(n.path, /^channel\/from-grokbot\/2026-10-27-eric-activity-approve-5eed0029\.md$/);
  assert.match(n.text, /^for: sjcos$/m);
  assert.match(n.text, /^from: eric$/m);
  assert.match(n.text, /^re: channel\/to-grokbot\/2026-10-27-sjcos-merge-12\.md$/m);
  assert.match(n.text, /his own choice, not a relay/);
});

test('an answer to a grokbot ask goes to to-grokbot, for that bot', () => {
  const n = renderDecisionNote(d({ choice: 'no' }), { path: 'from-grokbot/2026-10-27-x.md', from: 'coding', project: 'brain' });
  assert.ok(n);
  assert.match(n.path, /^channel\/to-grokbot\//);
  assert.match(n.text, /^for: coding$/m);
});

test('a loop answer goes to Chief of Staff; an unroutable channel item or a task gives no note', () => {
  const n = renderDecisionNote(d({ item_source: 'loops', item_key: 'loops:x' }), null);
  assert.ok(n);
  assert.match(n.text, /^for: cos$/m);
  assert.equal(renderDecisionNote(d(), null), null);
  assert.equal(renderDecisionNote(d({ item_source: 'task', choice: 'done' }), null), null);
});

test('not now carries its date; drop says it stays dropped (R-163)', () => {
  const a = { path: 'to-grokbot/x.md', from: 'eden', project: 'eden' };
  assert.match(renderDecisionNote(d({ choice: 'not_now', until_date: '2026-10-31' }), a)!.text, /^until: 2026-10-31$/m);
  assert.match(renderDecisionNote(d({ choice: 'drop' }), a)!.text, /Dropped stays dropped \(R-163\)/);
});

test('the reply is quoted, and nothing in the note leaks (synthetic address, phone, id, link)', () => {
  const n = renderDecisionNote(
    d({
      choice: 'reply',
      reply: 'Ship it after jane.doe.test@gmail.com signs, call 904-555-0142, ref bc-4f9a2 https://example.com',
      item_title: 'Ask for jane.doe.test@gmail.com',
      item_bot: 'Coding',
    }),
    { path: 'to-grokbot/x.md', from: 'coding', project: 'mission-control' },
  );
  assert.ok(n);
  assert.match(n.text, /^> Ship it after signs/m);
  const body = n.text.split('\n').filter((l) => !l.startsWith('re: ')).join('\n');
  assert.deepEqual(textLeaks(body), []);
});

test('a bad from/project slug falls back to a safe one', () => {
  const n = renderDecisionNote(d(), { path: 'to-grokbot/x.md', from: 'Evil\nfor: everyone', project: null });
  assert.ok(n);
  assert.match(n.text, /^for: coding$/m);
  assert.doesNotMatch(n.text, /everyone/);
});

test('the decisions.tsv row has six tab-separated fields and no tabs or newlines inside one', () => {
  const row = decisionsTsvRow(d({ choice: 'drop', item_title: 'Old\tthing\nhere' }), 'channel/to-grokbot/x.md');
  const f = row.split('\t');
  assert.equal(f.length, 6);
  assert.equal(f[1], 'activity:5eed0029');
  assert.equal(f[3], 'Drop');
  assert.doesNotMatch(row, /\n/);
});
