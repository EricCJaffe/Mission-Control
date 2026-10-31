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
    ['Send drafted pilot reply', 'VDL-12 ownership', 'Kitchen printer setup', 'Project framework review', 'August receipts form sent: 23 items.'],
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
  assert.equal(loopTitle(r), 'August receipts form sent: 23 items.');
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

// ---- board v2: sections, added date, completed ---------------------------
import { closedLoopsToRows, loopSection, primaryOwner } from './decisions-loops.ts';

const L = (owes: string, touched: string, first = '2026-10-20') =>
  parseLoopsTsv(HEAD + row(first, touched, 'email', 'acme', owes, `Item for ${owes}`, 'Synthetic.') + '\n')[0];

test('sections: Eric owes it, ours idle 3+ days, outside person, ours moving', () => {
  assert.equal(loopSection(L('Eric', '2026-10-30'), NOW), 'decision');
  assert.equal(loopSection(L('Trevor (shared mailbox?) then Eric', '2026-10-30'), NOW), 'waiting');
  assert.equal(loopSection(L('us (harness)', '2026-10-27'), NOW), 'stalled');
  assert.equal(loopSection(L('honeylakeos engineering', '2026-10-30'), NOW), null);
  assert.equal(loopSection(L('Katie (confirm live)', '2026-10-30'), NOW), 'waiting');
  assert.equal(loopSection(L('', '2026-10-01'), NOW), 'stalled');
  assert.equal(loopSection(L('Eric', '2026-11-04'), NOW), null);
  assert.equal(primaryOwner('Ritten then Eric'), 'Ritten');
});

test('every board row carries its added date', () => {
  const r = loopsToRows([L('Josh', '2026-10-30', '2026-10-27')], NOW)[0];
  assert.equal(r.section, 'waiting');
  assert.equal(r.added_at, '2026-10-27T12:00:00Z');
});

test('completed: closed in the last 7 days, keyed like the open loop, no health', () => {
  const closed = [
    '# closed\tfirst_seen\tsource\tclient\twho-owed\tref\twhat-closed-it\tlast-note',
    ['2026-10-30', '2026-10-20', 'email', 'acme', 'Eric', 'Send drafted pilot reply', 'Sent by Eric', 'n'].join('\t'),
    ['2026-10-10', '2026-10-01', 'email', 'acme', 'us', 'Old one', 'done', 'n'].join('\t'),
    ['2026-10-29', '2026-10-20', 'email', 'acme', 'us', 'After the MRI', 'done', 'n'].join('\t'),
  ].join('\n');
  const rows = closedLoopsToRows(closed, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_note, parseLoopsTsv(TSV)[0].key);
  assert.equal(rows[0].status, 'withdrawn');
  assert.equal(rows[0].completed_at, '2026-10-30T12:00:00Z');
  assert.equal(rows[0].added_at, '2026-10-20T12:00:00Z');
});

test('titles: no stamp fragments ("35 UTC"), no bare ids, short leads fall back', () => {
  const t = (ref: string, note: string) => loopTitle({ ...parseLoopsTsv(TSV)[0], ref, note });
  assert.equal(t('', 'NEW 2026-09-30 ~20:35 UTC: Eric sent the maintenance login. It bounced.'), 'Eric sent the maintenance login.');
  assert.equal(t('', 'UPDATE 2026-10-02 16:28 ET: Devan replied and attached the file.'), 'Devan replied and attached the file.');
  assert.equal(t('AAPkWhEgAAA=', 'Revoke the old storage key pair. Then confirm.'), 'Revoke the old storage key pair.');
  assert.equal(t('', 'Jen: UR board did not update overnight, wants one system.'), 'Jen: UR board did not update overnight, wants one system.');
  assert.equal(t('', 'Ok. Then the long explanation follows here.'), 'Ok. Then the long explanation follows here.');
});
