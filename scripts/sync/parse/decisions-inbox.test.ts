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
