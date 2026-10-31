import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLoopAnswer,
  isLesson,
  lessonLine,
  loopGroup,
  loopKey,
  loopsToRows,
  loopTitle,
  parseLoopsTsv,
} from './decisions-loops.ts';

// Synthetic rows only (public repo).
const HEAD = '# One row per open triage loop.\n# first_seen\tdate\tsource\tclient\twho-owes\tref\twhat-is-still-needed\n';
const row = (...f: string[]) => f.join('\t');
const TSV =
  HEAD +
  [
    row('2026-10-01', '2026-10-01', 'email', 'acme', 'Eric', 'Send drafted pilot reply', 'Draft is ready; send it to the client.'),
    row('2026-10-25', '2026-10-25', 'email', 'eden', 'Eric', 'VDL-12 ownership', 'Transfer account ownership.'),
    row('2026-10-29', '2026-10-29', 'task', 'honey-lake', 'Eric then us', 'Kitchen printer setup', 'Vendor needs a decision.'),
    row('2026-10-29', '2026-10-29', 'task', 'honey-lake', 'Eric', 'Project framework review', 'Review the slides. DONE per Eric.'),
    row('2026-10-29', '2026-10-29', 'email', 'fleet', 'us', 'Not Eric', 'Bots own this.'),
    row('2026-10-29', '2026-10-29', 'email', 'fleet', 'Eric', 'AAMkADA0OGI1OWM1LWZmMjUtNGRiOC1iMmY1LWQ2OTg3', 'August receipts form sent: 23 items. Needs his buckets.'),
    row('2026-10-29', '2026-10-29', 'email', 'fleet', 'Eric', 'Follow up after the MRI', 'Health detail must never reach the page.'),
    row('2026-10-20', '2026-11-05', 'email', 'fleet', 'Eric', 'Snoozed item', 'Not due yet.'),
  ].join('\n') +
  '\n';
const NOW = new Date('2026-10-31T12:00:00Z');

test('key matches loops-ask.py: sha256(ref or note)[:40]', () => {
  // python3 -c "import hashlib;print(hashlib.sha256(b'abc').hexdigest()[:40])"
  assert.equal(loopKey('abc', 'n'), 'loop:ba7816bf8f01cfea414140de5dae2223b00361a3');
  assert.equal(loopKey('', 'abc'), 'loop:ba7816bf8f01cfea414140de5dae2223b00361a3');
});

test('only rows owed by Eric, no health, nothing snoozed into the future', () => {
  const rows = loopsToRows(parseLoopsTsv(TSV), NOW);
  assert.deepEqual(
    rows.map((r) => r.title),
    ['Send drafted pilot reply', 'VDL-12 ownership', 'Kitchen printer setup', 'Project framework review', 'August receipts form sent'],
  );
  assert.ok(rows.every((r) => r.kind === 'loop' && r.source_note.startsWith('loop:') && r.dedupe_key === r.source_note));
});

test('groups, defaults and urgency', () => {
  const rows = loopsToRows(parseLoopsTsv(TSV), NOW);
  assert.deepEqual(rows.map((r) => r.group_name), ['Drafts to send', 'Eden', 'HL vendor/hardware', 'HL scope', 'Records']);
  assert.deepEqual(rows.map((r) => r.default_option), ['o2', 'o2', 'o4', 'o1', 'o2']);
  assert.deepEqual(rows.map((r) => r.urgency), ['red', 'green', 'green', 'green', 'green']);
});

test('a Graph id never becomes the title', () => {
  const r = parseLoopsTsv(TSV)[5];
  assert.equal(loopTitle(r), 'August receipts form sent');
  assert.equal(loopGroup(r), 'Records');
});

test('Close removes the row; Keep, Snooze and Hand back edit it like loops-ask', () => {
  const key = parseLoopsTsv(TSV)[0].key;
  const closed = applyLoopAnswer(TSV, key, { option: 'o1' }, '2026-10-31')!;
  assert.equal(closed.closed, true);
  assert.equal(parseLoopsTsv(closed.text).some((r) => r.key === key), false);
  assert.equal(parseLoopsTsv(closed.text).length, 7);

  const kept = parseLoopsTsv(applyLoopAnswer(TSV, key, { option: 'o2' }, '2026-10-31')!.text)[0];
  assert.equal(kept.touched, '2026-10-31');
  const snoozed = parseLoopsTsv(applyLoopAnswer(TSV, key, { option: 'o3' }, '2026-10-31')!.text)[0];
  assert.equal(snoozed.touched, '2026-11-07');
  const back = parseLoopsTsv(applyLoopAnswer(TSV, key, { option: 'o4', comment: 'yours\tnow' }, '2026-10-31')!.text)[0];
  assert.equal(back.owes, 'us');
  assert.match(back.note, /Eric 10-31: yours now$/);
});

test('a loop already gone from the file returns null (closed elsewhere)', () => {
  assert.equal(applyLoopAnswer(TSV, 'loop:nope', { option: 'o1' }, '2026-10-31'), null);
});

test('lessons: preferences and rules, not plain questions', () => {
  assert.equal(isLesson('Always send me the draft before it goes to a client'), true);
  assert.equal(isLesson("Don't ask me about receipts under $50 again"), true);
  assert.equal(isLesson('I prefer a call to an email for this one'), true);
  assert.equal(isLesson('What does option 2 cost?'), false);
  assert.match(lessonLine('2026-10-31', 'Pick', 'Always do X', 'channel/x.md'), /^- 2026-10-31 · on "Pick": "Always do X" \(`channel\/x\.md`\) · status: to promote$/);
});
