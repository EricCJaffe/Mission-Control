import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionsFor, parseDecisionNote, parseStalledJob, renderAnswerNote, STALLED_OPTIONS } from './decisions-inbox.ts';
import { textLeaks } from '../../../src/lib/activity/scrub.ts';

const NOW = new Date('2026-10-30T20:00:00Z');
const fm = (lines: string[]) => `---\n${lines.join('\n')}\n---\n`;

test('a numbered Options list with a (recommended) mark', () => {
  const text = `${fm(['status: taken', 'for: cos', 'kind: decision', 'from: ship-repair'])}
# Ship gate: drop typecheck or keep it?

The gate has never passed on main since the 21st.

Options:
1. (recommended) Remove typecheck from the gate; file a cleanup task.
2. Keep the gate; it stays held every window.
`;
  const row = parseDecisionNote('channel/to-grokbot/2026-10-29-decision-gate.md', text, NOW)!;
  assert.equal(row.kind, 'decision');
  assert.equal(row.status, 'open');
  assert.equal(row.title, 'Ship gate: drop typecheck or keep it?');
  assert.equal(row.context, 'The gate has never passed on main since the 21st.');
  assert.deepEqual(row.options.map((o) => o.label), ['Remove typecheck from the gate', 'Keep the gate']);
  assert.equal(row.default_option, 'o1');
  assert.equal(row.for_agent, 'ship-repair');
});

test('**Options** with lettered items and a Recommendation naming option 2', () => {
  const body = `# Pick one\n\n**Options**\n\n**A. Grant Edit.** One line.\n\n**B. Give the ledger a writer.** Safer.\n\n**Recommendation:** option B.\n`;
  const { options, default_option } = optionsFor(body, {});
  assert.deepEqual(options.map((o) => o.label), ['Grant Edit', 'Give the ledger a writer']);
  assert.equal(default_option, 'o2');
});

test('no list: a recommendation becomes "Go with the recommendation" / No; none becomes Yes / No', () => {
  const a = optionsFor('Prose.\n\n**Recommendation:** close it.\n', {});
  assert.deepEqual(a.options.map((o) => o.label), ['Go with the recommendation', 'No']);
  assert.equal(a.options[0].detail, 'close it.');
  assert.equal(a.default_option, 'o1');
  const b = optionsFor('Prose only.\n', {});
  assert.deepEqual(b.options.map((o) => o.label), ['Yes', 'No']);
  assert.equal(b.default_option, null);
});

test('urgency, deadline and stale', () => {
  const base = ['kind: decision', 'status: open'];
  const red = parseDecisionNote('channel/to-grokbot/2026-10-30-decision-a.md', `${fm([...base, 'urgent: true'])}# A\n`, NOW)!;
  assert.equal(red.urgency, 'red');
  const late = parseDecisionNote('channel/to-grokbot/2026-10-30-decision-b.md', `${fm([...base, 'deadline: 2026-10-29'])}# B\n`, NOW)!;
  assert.equal(late.urgency, 'red');
  assert.equal(late.status, 'stale');
  const old = parseDecisionNote('channel/to-grokbot/2026-10-01-decision-c.md', `${fm(base)}# C\n`, NOW)!;
  assert.equal(old.status, 'stale');
  assert.equal(old.urgency, 'yellow');
  const done = parseDecisionNote('channel/to-grokbot/2026-10-30-decision-d.md', `${fm(['kind: decision', 'status: done'])}# D\n`, NOW)!;
  assert.equal(done.status, 'withdrawn');
});

test('not a decision, Honey Lake, or untitled: no row', () => {
  assert.equal(parseDecisionNote('channel/to-grokbot/x.md', `${fm(['kind: fyi'])}# X\n`, NOW), null);
  assert.equal(parseDecisionNote('channel/to-grokbot/x.md', `${fm(['kind: decision', 'project: honeylakeos'])}# X\n`, NOW), null);
  assert.equal(parseDecisionNote('channel/to-grokbot/2026-10-30-honey-lake-x.md', `${fm(['kind: decision'])}# X\n`, NOW), null);
  assert.equal(parseDecisionNote('channel/to-grokbot/x.md', `${fm(['kind: decision'])}no heading\n`, NOW), null);
});

test('every text is scrubbed: no address, phone or link reaches a row', () => {
  const text = `${fm(['kind: decision', 'status: open'])}# Reply to jane.doe.test@gmail.com?\n\nShe called from 904-555-0142, see https://example.test/x.\n\nOptions:\n1. Call jane.doe.test@gmail.com back\n2. Wait\n`;
  const row = parseDecisionNote('channel/to-grokbot/2026-10-30-decision-e.md', text, NOW)!;
  for (const t of [row.title, row.context ?? '', ...row.options.flatMap((o) => [o.label, o.detail ?? ''])]) {
    assert.deepEqual(textLeaks(t), [], t);
  }
});

test('stalled jobs: waiting on Eric, or live past 48 hours; closed ones withdraw', () => {
  const p = 'channel/from-grokbot/2026-10-27-fsaos-thing.md';
  const waiting = parseStalledJob(p, `${fm(['status: running', 'for: fsaos', 'waiting: eric', 'started: 2026-10-30T10:00-04:00'])}# Thing\n`, NOW)!;
  assert.equal(waiting.kind, 'stalled');
  assert.equal(waiting.urgency, 'red');
  assert.equal(waiting.default_option, null);
  assert.deepEqual(waiting.options, STALLED_OPTIONS);
  const old = parseStalledJob(p, `${fm(['status: queued', 'for: fsaos'])}# Thing\n`, NOW)!;
  assert.equal(old.status, 'open');
  assert.equal(old.default_option, 'o1');
  assert.equal(parseStalledJob(p, `${fm(['status: queued', 'started: 2026-10-30T12:00-04:00'])}# Fresh\n`, NOW)!.status, 'withdrawn');
  assert.equal(parseStalledJob(p, `${fm(['status: fyi'])}# Note\n`, NOW), null);
  assert.equal(parseStalledJob(p, `${fm(['status: done'])}# Thing\n`, NOW)!.status, 'withdrawn');
  assert.equal(parseStalledJob('channel/to-grokbot/2026-10-01-x.md', `${fm(['status: queued'])}# X\n`, NOW), null);
});

test('answer note: for cos, kind answer, re the source, his words verbatim, leak-free', () => {
  const row = {
    id: '0b6f8e1c-1111-4222-8333-944455556666',
    source_note: 'channel/to-grokbot/2026-10-29-decision-gate.md',
    kind: 'decision' as const,
    for_agent: 'ship-repair',
    title: 'Ship gate: drop typecheck or keep it?',
    options: [{ id: 'o1', label: 'Remove typecheck' }, { id: 'o2', label: 'Keep the gate' }],
    answer: 'o2',
    answer_text: 'Keep it until the cleanup lands.',
    answered_at: '2026-10-30T19:30:00Z',
  };
  const note = renderAnswerNote(row)!;
  assert.match(note.path, /^channel\/to-grokbot\/2026-10-30-answer-ship-gate-drop-typecheck-or-keep-it-0b6f8e1c\.md$/);
  assert.match(note.text, /^---\nstatus: open\nfor: cos\nkind: answer\n/);
  assert.match(note.text, /\nre: channel\/to-grokbot\/2026-10-29-decision-gate\.md\n/);
  assert.match(note.text, /\*\*His choice:\*\* Keep the gate/);
  assert.match(note.text, /> Keep it until the cleanup lands\./);
  assert.equal(renderAnswerNote({ ...row, answer: 'o9' }), null);
  assert.equal(renderAnswerNote({ ...row, answer_text: 'mail jane.doe.test@gmail.com' }), null);
  assert.equal(renderAnswerNote({ ...row, answer_text: 'after my MRI' }), null);
  const other = renderAnswerNote({ ...row, answer: 'other', answer_text: 'Ask me Monday.' })!;
  assert.match(other.text, /answer: Other/);
});

test('health is never ingested: path, routing, title, opening, or a phi/sensitive flag', () => {
  const p = 'channel/to-grokbot/2026-10-30-decision-x.md';
  const f = (extra: string[], body: string) => parseDecisionNote(p, `${fm(['kind: decision', 'status: open', ...extra])}${body}`, NOW);
  assert.equal(f([], '# Move the cardiology appointment?\n'), null);
  assert.equal(f([], '# Pick a date\n\nThe lab results came back and need a call.\n'), null);
  assert.equal(f(['project: health'], '# Pick a date\n'), null);
  assert.equal(f(['phi: true'], '# Pick a date\n'), null);
  assert.equal(f(['sensitive: yes'], '# Pick a date\n'), null);
  assert.equal(parseDecisionNote('channel/to-grokbot/2026-10-30-decision-mental-health-y.md', `${fm(['kind: decision'])}# Y\n`, NOW), null);
  assert.equal(parseStalledJob('channel/from-grokbot/2026-10-01-meds-sync.md', `${fm(['status: queued'])}# Sync\n`, NOW), null);
  for (const t of ['MRI follow-up', 'Heart monitor results', 'Book the EKG', 'Refill the Rx', 'Dentist on Friday?', 'Knee injury: rest or run?']) {
    assert.equal(f([], `# ${t}\n`), null, t);
  }
  assert.equal(f([], '# Pick one\n\nOptions:\n1. Move the colonoscopy\n2. Keep it\n'), null);
  assert.ok(f([], '# Ship gate: keep typecheck?\n'));
});

// ---- 2026-10-31: one place to act ------------------------------------------
import {
  answerRef,
  parseNextStep,
  parsePrRef,
  renderQuestionNote,
  settleRows,
  writeBackAnswer,
  type DecisionInput as DI,
} from './decisions-inbox.ts';

const base = (over: Partial<DI>): DI => ({
  source_note: 'channel/to-grokbot/2026-10-30-a.md',
  kind: 'decision',
  for_agent: 'coding',
  title: 'Pick a color',
  context: null,
  options: [{ id: 'o1', label: 'Blue' }, { id: 'o2', label: 'Green' }],
  default_option: 'o1',
  urgency: 'yellow',
  deadline: null,
  status: 'open',
  pr_ref: null,
  next_step: null,
  dedupe_key: 'channel/to-grokbot/2026-10-30-a.md',
  closed_reason: null,
  ...over,
});

test('PR ref from a pr: URL, a short ref, or the first PR URL in the body', () => {
  assert.equal(parsePrRef({ pr: 'https://github.com/Acme/app/pull/83' }, ''), 'Acme/app#83');
  assert.equal(parsePrRef({ pr: 'Acme/app#9' }, ''), 'Acme/app#9');
  assert.equal(parsePrRef({}, 'see https://github.com/Acme/app/pull/12 for it'), 'Acme/app#12');
  assert.equal(parsePrRef({ pr: 'n/a' }, 'https://github.com/Acme/app/pull/12'), null);
  assert.equal(parsePrRef({}, 'no link'), null);
});

test('next step from next:, a Left: line, or the finish line', () => {
  assert.equal(parseNextStep({ next: 'Merge at 11' }, ''), 'Merge at 11');
  assert.equal(parseNextStep({}, '## Handoff\n- Left: rebase and push\n'), 'rebase and push');
  assert.equal(parseNextStep({ finish: 'PR green' }, ''), 'Done when: PR green');
  assert.equal(parseNextStep({}, ''), null);
});

test('answerRef reads re: from answer and reply notes only', () => {
  assert.equal(answerRef('---\nkind: answer\nre: channel/to-grokbot/x.md\n---\n'), 'channel/to-grokbot/x.md');
  assert.equal(answerRef('---\nkind: reply\nre: `channel/from-grokbot/y.md`\n---\n'), 'channel/from-grokbot/y.md');
  assert.equal(answerRef('---\nkind: handoff\nre: channel/to-grokbot/x.md\n---\n'), null);
  assert.equal(answerRef('---\nkind: answer\nre: https://example.test\n---\n'), null);
});

test('settleRows closes items answered elsewhere and merged or closed PRs', () => {
  const a = base({});
  const b = base({ source_note: 'channel/to-grokbot/2026-10-30-b.md', dedupe_key: 'pr:Acme/app#1', pr_ref: 'Acme/app#1' });
  const c = base({ source_note: 'channel/to-grokbot/2026-10-30-c.md', dedupe_key: 'pr:Acme/app#2', pr_ref: 'Acme/app#2' });
  const out = settleRows([a, b, c], new Set([a.source_note]), new Map([['Acme/app#1', 'MERGED'], ['Acme/app#2', 'OPEN']]));
  assert.deepEqual(out.map((r) => [r.status, r.closed_reason]), [
    ['withdrawn', 'answered elsewhere'],
    ['withdrawn', 'PR merged'],
    ['open', null],
  ]);
});

test('settleRows keeps one row per PR: the newest note', () => {
  const older = base({ source_note: 'channel/to-grokbot/2026-10-29-x.md', dedupe_key: 'pr:Acme/app#5', pr_ref: 'Acme/app#5' });
  const newer = base({ source_note: 'channel/to-grokbot/2026-10-31-x.md', dedupe_key: 'pr:Acme/app#5', pr_ref: 'Acme/app#5' });
  const out = settleRows([older, newer], new Set());
  assert.equal(out[0].status, 'withdrawn');
  assert.equal(out[0].closed_reason, `duplicate of ${newer.source_note}`);
  assert.equal(out[1].status, 'open');
});

test('an unknown PR state keeps the row open (fails open)', () => {
  const r = base({ pr_ref: 'Acme/app#3', dedupe_key: 'pr:Acme/app#3' });
  assert.equal(settleRows([r], new Set())[0].status, 'open');
});

const answered = {
  id: '11111111-2222-3333-4444-555555555555',
  source_note: 'channel/to-grokbot/2026-10-30-a.md',
  kind: 'decision' as const,
  for_agent: 'coding',
  title: 'Pick a color',
  options: [{ id: 'o1', label: 'Blue' }],
  answer: 'o1',
  answer_text: null,
  answered_at: '2026-10-31T13:00:00Z',
};

test('writeBackAnswer sets status: answered on a decision note and appends the line', () => {
  const out = writeBackAnswer('---\nstatus: open\nkind: decision\n---\n# Pick a color\n', answered, 'channel/to-grokbot/ans.md');
  assert.match(out, /^---\nstatus: answered\nkind: decision\n---\n/);
  assert.match(out, /- Answered by Eric on Mission Control \/decisions, 2026-10-31: Blue\. Answer note: `channel\/to-grokbot\/ans\.md`\.\n$/);
});

test('writeBackAnswer leaves a stalled job status to its owner', () => {
  const out = writeBackAnswer('---\nstatus: queued\n---\n# Job\n', { ...answered, kind: 'stalled' }, 'p.md');
  assert.match(out, /^---\nstatus: queued\n/);
  assert.match(out, /Answered by Eric/);
});

test('question note goes to cos, re: the source; health is held back', () => {
  const q = { id: 'aaaaaaaa-bbbb', question: 'What does it cost?', created_at: '2026-10-31T13:00:00Z', decision_id: 'd1', source_note: 'channel/to-grokbot/x.md', title: 'Pick a color' };
  const note = renderQuestionNote(q)!;
  assert.match(note.path, /^channel\/to-grokbot\/2026-10-31-question-pick-a-color-aaaaaaaa\.md$/);
  assert.match(note.text, /\nfor: cos\nkind: question\n/);
  assert.match(note.text, /\nre: channel\/to-grokbot\/x\.md\n/);
  assert.equal(renderQuestionNote({ ...q, question: 'Is this before my MRI?' }), null);
});

test('dedupe compares dates in the file name, not the folder, and prefers a decision', () => {
  const to = base({ source_note: 'channel/to-grokbot/2026-10-29-x.md', dedupe_key: 'pr:Acme/app#7', pr_ref: 'Acme/app#7' });
  const from = base({ source_note: 'channel/from-grokbot/2026-10-31-x.md', dedupe_key: 'pr:Acme/app#7', pr_ref: 'Acme/app#7' });
  assert.deepEqual(settleRows([to, from], new Set()).map((r) => r.status), ['withdrawn', 'open']);
  const stalledNewer = { ...from, kind: 'stalled' as const };
  assert.deepEqual(settleRows([to, stalledNewer], new Set()).map((r) => r.status), ['open', 'withdrawn']);
});
