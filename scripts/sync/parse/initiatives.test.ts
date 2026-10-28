import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInitiatives, parseYaml, parseNoteRef, planPct, tasksFor, projectSlug } from './initiatives.ts';

const SAMPLE = `
# Coding maintains this file.
initiatives:
  - id: brief-reroute
    name: "Mail to Eric via grokbot"   # quoted, with a comment
    plan: docs/plans/brief-reroute.md
    owner: mission-control
    rag: amber
    last_activity: 2026-10-21
    blockers: [CRON_SECRET mismatch, puller not built]
    phases:
      - name: Store + outbox
        status: done
      - id: puller
        name: Brain-side puller
        status: doing
      - name: Retire Graph send
  - id: os-brain
    name: OS Brain
    rag: red
    blockers: one blocker as a string
    phases:
    - Phase one as a bare string
`;

test('parses the documented shape', () => {
  const { initiatives, problems } = parseInitiatives(SAMPLE);
  assert.deepEqual(problems, []);
  assert.equal(initiatives.length, 2);
  const a = initiatives[0]!;
  assert.equal(a.name, 'Mail to Eric via grokbot');
  assert.equal(a.rag, 'yellow', 'amber is read as yellow');
  assert.deepEqual(a.blockers, ['CRON_SECRET mismatch', 'puller not built']);
  assert.deepEqual(
    a.phases.map((p) => [p.id, p.status]),
    [['store-outbox', 'done'], ['puller', 'doing'], ['retire-graph-send', 'todo']],
  );
  const b = initiatives[1]!;
  assert.deepEqual(b.blockers, ['one blocker as a string']);
  assert.equal(b.phases[0]!.name, 'Phase one as a bare string');
});

test('plan % counts done phases, null with no phases', () => {
  const { initiatives } = parseInitiatives(SAMPLE);
  assert.equal(planPct(initiatives[0]!), 33);
  assert.equal(planPct({ phases: [], counted: null }), null);
  assert.equal(planPct({ phases: [], counted: { total: 14, done: 14 } }), 100);
});

test('a bad value is reported, not guessed', () => {
  const { initiatives, problems } = parseInitiatives(
    'initiatives:\n  - id: x\n    rag: purple\n    phases:\n      - name: a\n        status: exploded\n  - id: x\n',
  );
  assert.equal(initiatives.length, 1);
  assert.equal(initiatives[0]!.rag, null);
  assert.equal(problems.length, 3);
});

test('malformed YAML fails with a line number', () => {
  assert.throws(() => parseYaml('initiatives:\n  - id: a\n     name: b\n'), /line 3/);
  assert.throws(() => parseYaml('a:\n\tb: c\n'), /tabs/);
  assert.throws(() => parseInitiatives('foo: bar\n'), /initiatives/);
});

test('a hash inside quotes is not a comment', () => {
  assert.deepEqual(parseYaml('a: "x # y"\n'), { a: 'x # y' });
});

test('notes join by initiative: and become tasks after the phases', () => {
  const note = parseNoteRef(
    '2026-10-21-puller-coding.md',
    '---\nstatus: queued\nfor: brain\ninitiative: brief-reroute\n---\n# Build the outbox puller\n\nbody',
  );
  assert.deepEqual(note, {
    file: '2026-10-21-puller-coding.md',
    initiative: 'brief-reroute',
    status: 'queued',
    title: 'Build the outbox puller',
  });
  assert.equal(parseNoteRef('x.md', '---\nstatus: open\n---\n# no initiative'), null);

  const { initiatives } = parseInitiatives(SAMPLE);
  const tasks = tasksFor(initiatives[0]!, [note!, { ...note!, initiative: 'other' }]);
  assert.equal(tasks.length, 4);
  assert.equal(tasks[0]!.status, 'done');
  assert.equal(tasks[1]!.sourceRef, 'initiative:brief-reroute#phase:puller');
  assert.equal(tasks[3]!.sourceRef, 'initiative:brief-reroute#note:2026-10-21-puller-coding.md');
  assert.equal(new Set(tasks.map((t) => t.sourceRef)).size, tasks.length);
});

test('a red initiative puts its open phases at P1', () => {
  const { initiatives } = parseInitiatives(SAMPLE);
  assert.equal(tasksFor(initiatives[1]!, [])[0]!.priority, 1);
  assert.equal(projectSlug('OS Brain'), 'initiative-os-brain');
});

// The shape Coding actually wrote on 2026-10-21: counts instead of a list,
// an inline {phase: status} map with PR numbers in it, free-text dates.
const REAL = `# Coding initiatives vs plan. Updated 2026-10-21 8:10 AM ET.
- id: fsaos-brain
  plan: channel/from-grokbot/2026-10-18-fsaos-brain-replan.md
  phases_total: 14
  phases_done: 14
  rag: green
  owner: fsaos
  last_activity: 2026-10-19 (#193 mail sync on)
  next: none; model jobs + OpenAI key OFF pending Eric
- id: voice-management
  phases: {P1: done #303, v2-A: done #304, P2-reverbos: held, P3: not started}
  rag: yellow
  blockers: no template tag after v2.6.0; P3/P4b need Eric
- id: trellis-option-d
  rag: yellow
  next: OS mount on staging + demo 12:30 PM ET 2026-10-21
`;

test('reads the real file shape', () => {
  const { initiatives, problems } = parseInitiatives(REAL);
  assert.deepEqual(problems, []);
  const [brain, voice, trellis] = initiatives;
  assert.equal(planPct(brain!), 100);
  assert.equal(brain!.lastActivityDate, '2026-10-19');
  assert.equal(brain!.lastActivity, '2026-10-19 (#193 mail sync on)', '#193 is text, not a comment');
  assert.equal(brain!.next, 'none; model jobs + OpenAI key OFF pending Eric');
  assert.deepEqual(
    voice!.phases.map((p) => [p.id, p.status, p.note]),
    [
      ['P1', 'done', 'done #303'],
      ['v2-A', 'done', 'done #304'],
      ['P2-reverbos', 'blocked', 'held'],
      ['P3', 'todo', 'not started'],
    ],
  );
  assert.equal(planPct(voice!), 50);
  assert.deepEqual(voice!.blockers, ['no template tag after v2.6.0; P3/P4b need Eric']);
  assert.equal(planPct(trellis!), null);
  assert.equal(tasksFor(trellis!, []).length, 0);
});
