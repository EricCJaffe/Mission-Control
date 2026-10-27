import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  botName,
  channelItems,
  collapseHoneyLake,
  loopKey,
  textLeaks,
  etDay,
  isDropped,
  leaksIn,
  loopItems,
  parseFrontmatter,
  parseOptions,
  parseWhen,
  pickRunFields,
  prUrl,
  runItems,
  scrub,
  tagFor,
  type ChannelNote,
} from './activity.ts';

const NOW = new Date('2026-10-27T22:00:00Z'); // Tue 6:00 PM ET
const TODAY = '2026-10-27';

function note(path: string, fm: Record<string, string>, extra: Partial<ChannelNote> = {}): ChannelNote {
  return {
    path,
    fm,
    h1: null,
    options: [],
    addedAt: '2026-10-27T14:00:00.000Z',
    modifiedAt: '2026-10-27T15:00:00.000Z',
    ...extra,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

test('every date shape the brain writes parses, in ET', () => {
  assert.equal(parseWhen('2026-10-27 6:33 PM ET (by hand on fourlot)'), '2026-10-27T22:33:00.000Z');
  assert.equal(parseWhen('2026-10-27 12:00 PM ET'), '2026-10-27T16:00:00.000Z');
  assert.equal(parseWhen('2026-10-27T18:15:16-04:00'), '2026-10-27T22:15:16.000Z');
  assert.equal(parseWhen('2026-10-27T18:15:16-0400'), '2026-10-27T22:15:16.000Z');
  assert.equal(parseWhen('2026-10-27T16:10:50Z'), '2026-10-27T16:10:50.000Z');
  assert.equal(parseWhen('2026-10-27T12-34-01'), '2026-10-27T16:34:01.000Z');
  assert.equal(parseWhen('2026-10-19T19:02:06.50496'), '2026-10-19T23:02:06.000Z');
  // After the November change ET is UTC-5.
  assert.equal(parseWhen('2026-11-05 9:00 AM ET'), '2026-11-05T14:00:00.000Z');
  assert.equal(parseWhen('2026-10-27'), '2026-10-27T13:00:00.000Z');
  assert.equal(parseWhen(''), null);
  assert.equal(parseWhen('soon'), null);
  assert.equal(etDay('2026-10-28T02:30:00Z'), '2026-10-27');
});

// ─── Frontmatter, H1, options ───────────────────────────────────────────────

test('frontmatter: first value wins, trailing comments dropped', () => {
  const { fm, end } = parseFrontmatter('---\nstatus: open # was queued\nfor: cos\nstatus: done\n---\n# Title\n');
  assert.equal(fm.status, 'open');
  assert.equal(fm.for, 'cos');
  assert.ok(end > 0);
  assert.deepEqual(parseFrontmatter('# no frontmatter').fm, {});
});

test('grok-ask options are read for the tag only', () => {
  const body = '# Q\n\n**Options**\n\n- Yes\n- No  ← recommended\n\nmore';
  assert.deepEqual(parseOptions(body, {}), ['Yes', 'No']);
  assert.deepEqual(parseOptions('', { options: '[yes, no]' }), ['yes', 'no']);
});

// ─── Names ──────────────────────────────────────────────────────────────────

test('bots show display names, never ids', () => {
  assert.equal(botName('cos'), 'Chief of Staff');
  assert.equal(botName('chief-of-staff'), 'Chief of Staff');
  assert.equal(botName('grokbot'), 'Chief of Staff');
  assert.equal(botName('Coding (Grok Bot)'), 'Coding');
  assert.equal(botName('inbox'), 'Inbox');
  assert.equal(botName('growth'), 'Growth');
  assert.equal(botName('jarvis'), 'Jarvis');
  assert.equal(botName('muse'), 'Muse');
  assert.equal(botName('fourlot'), 'Fourlot (Team)');
  assert.equal(botName('mission-control'), 'Mission Control session');
  assert.equal(botName('sjcos'), 'SJCOS session');
  assert.equal(botName('businessos-lane2'), 'BusinessOS session');
  assert.equal(botName('honeylakeos'), 'Honey Lake session');
  assert.equal(botName('dispatch-autostart'), 'Dispatch');
  assert.equal(botName('service-desk'), 'Service desk');
  assert.equal(botName('ticket-stale'), 'Ticket stale');
  assert.equal(botName('ci-sweep'), 'CI sweep');
  assert.equal(botName('agent-7f3a9c'), 'Bot');
  assert.equal(botName(''), 'Bot');
  assert.equal(botName(undefined), 'Bot');
});

// ─── The scrub ──────────────────────────────────────────────────────────────

test('scrub removes every id, address and link', () => {
  const dirty =
    'Ticket bc-4f9a2 for jane.doe@example.com (call 904-483-6881) ' +
    'id 5eed0029-0003-4000-8000-000000000002 sha 07fc67c0a1b2 short 07fc67c ' +
    'pid 41233 herdr pane %12 agent_01AbCdEf <CAF+abc@mail.gmail.com> ' +
    'see https://vercel.com/x and https://github.com/o/r/pull/5 from jgoldenberg@gmail';
  const clean = scrub(dirty, 500);
  for (const bad of ['bc-', '@', '904', '5eed0029', '07fc67c0a1b2', '41233', '%12', 'agent_', 'https', 'gmail']) {
    assert.ok(!clean.includes(bad), `"${bad}" survived: ${clean}`);
  }
  assert.ok(clean.includes('07fc67c'), 'a 7-character sha is allowed');
});

test('scrub caps at 120 characters', () => {
  const s = scrub('word '.repeat(60));
  assert.ok(s.length <= 120);
  assert.ok(s.endsWith('…'));
});

test('only a github.com pull request URL is kept as a link', () => {
  assert.equal(prUrl('https://github.com/EricCJaffe/sjcos/pull/51'), 'https://github.com/EricCJaffe/sjcos/pull/51');
  assert.equal(prUrl('#51'), null);
  assert.equal(prUrl('https://evil.example/github.com/x/y/pull/1'), null);
});

// ─── Dropped topics ─────────────────────────────────────────────────────────

test('dropped topics are filtered by slug or title', () => {
  assert.ok(isDropped('2026-10-20-trellis-backups-rd-plan'));
  assert.ok(isDropped('Trellis RD backup restore'));
  assert.ok(isDropped('2026-10-22-muse-mailbox-token-rotate'));
  assert.ok(isDropped('Trellis option D'));
  assert.ok(isDropped('2026-10-20-businessos-option-d-embed-coding'));
  assert.ok(isDropped('Impact Works demo prep'));
  assert.ok(isDropped('Honey Lake Monday boards migration'));
  assert.ok(!isDropped('Mission Control: bot activity page'));
  assert.ok(!isDropped('Muse mailbox: bots post asks'));
});

// ─── Tags ───────────────────────────────────────────────────────────────────

test('tags, in the job note order', () => {
  const base = { dueAt: null, today: TODAY, text: '' };
  assert.equal(tagFor({ ...base, dueAt: '2026-10-27T16:00:00Z', text: 'approve the merge' }), 'due_today');
  assert.equal(tagFor({ ...base, dueAt: '2026-10-28T16:00:00Z', text: 'x' }), 'action');
  assert.equal(tagFor({ ...base, options: ['Yes', 'No'], text: 'merge it?' }), 'yes_no');
  assert.equal(tagFor({ ...base, options: ['Apply it', 'Leave it'], kind: 'question', text: 'x' }), 'reply');
  assert.equal(tagFor({ ...base, text: 'OK to merge #45 and deploy?' }), 'approve');
  assert.equal(tagFor({ ...base, text: 'go-live on Friday' }), 'approve');
  assert.equal(tagFor({ ...base, text: 'Pokee contract e-signature' }), 'sign');
  assert.equal(tagFor({ ...base, text: 'Sign the SOW' }), 'sign');
  assert.equal(tagFor({ ...base, text: 'waits on Josh sign-off', result: 'needs-eric' }), 'reply');
  assert.equal(tagFor({ ...base, kind: 'decision', text: 'which ladder' }), 'reply');
  assert.equal(tagFor({ ...base, text: 'send the receipts form' }), 'action');
});

// ─── Channel notes ──────────────────────────────────────────────────────────

test('a running job is In progress; a done one is Finished with its PR', () => {
  const items = channelItems(
    [
      note('from-grokbot/2026-10-27-a.md', { status: 'running', for: 'mission-control', from: 'cos', kind: 'handoff', started: '2026-10-27 6:33 PM ET' }, { h1: 'Build /activity' }),
      note('from-grokbot/2026-10-26-b.md', { status: 'done', for: 'sjcos', from: 'coding', kind: 'handoff' }, { h1: 'Workflow 2 manual', addedAt: '2026-10-26T14:00:00.000Z' }),
      note('to-grokbot/2026-10-27-b-done.md', { for: 'coding', result: 'done', re: 'channel/from-grokbot/2026-10-26-b.md', pr: 'https://github.com/EricCJaffe/sjcos/pull/51', from: 'fourlot' }, { h1: 'Done' }),
    ],
    NOW,
  );
  const work = items.find((i) => i.kind === 'in_progress');
  assert.equal(work?.bot, 'Mission Control session');
  assert.equal(work?.title, 'Build /activity');
  assert.equal(work?.startedAt, '2026-10-27T22:33:00.000Z');
  const done = items.find((i) => i.kind === 'finished');
  assert.equal(done?.bot, 'SJCOS session');
  assert.equal(done?.prUrl, 'https://github.com/EricCJaffe/sjcos/pull/51');
  assert.equal(done?.endedAt, '2026-10-27T14:00:00.000Z');
  assert.equal(items.filter((i) => i.kind === 'event').length, 3);
  assert.ok(items.some((i) => i.kind === 'event' && i.title === 'Handed to Mission Control session: Build /activity'));
});

test('a question waits on Eric until a re: answer exists', () => {
  const q = note('to-grokbot/2026-10-25-q.md', { status: 'open', kind: 'question', result: 'needs-eric', from: 'sjcos', due: '2026-10-27' }, { h1: 'Merge #45?', options: ['Yes', 'No'] });
  const waiting = channelItems([q], NOW).filter((i) => i.kind === 'waiting');
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].bot, 'SJCOS session');
  assert.equal(waiting[0].tag, 'due_today');

  const answered = channelItems([q, note('from-grokbot/2026-10-27-q-answer.md', { re: 'channel/to-grokbot/2026-10-25-q.md', status: 'done' })], NOW);
  assert.equal(answered.filter((i) => i.kind === 'waiting').length, 0);

  const closed = channelItems([{ ...q, fm: { ...q.fm, status: 'done' } }], NOW);
  assert.equal(closed.filter((i) => i.kind === 'waiting').length, 0);
});

test('waiting: eric and needs: eric count, old notes still wait', () => {
  const items = channelItems(
    [note('from-grokbot/2026-09-01-old.md', { status: 'held', waiting: 'eric', for: 'eden' }, { h1: 'Old ask', addedAt: '2026-09-01T14:00:00.000Z' })],
    NOW,
  );
  assert.deepEqual(items.map((i) => i.kind), ['waiting']);
});

test('Honey Lake shows a status and nothing else', () => {
  const items = channelItems(
    [
      note('from-grokbot/2026-10-27-honeylakeos-patient-intake.md', { status: 'running', for: 'honeylakeos', kind: 'handoff' }, { h1: 'Patient Jane intake form' }),
      note('to-grokbot/2026-10-27-hl-q.md', { status: 'open', project: 'honeylakeos', result: 'needs-eric' }, { h1: 'Patient Jane chart' }),
    ],
    NOW,
  );
  assert.ok(items.length > 0);
  for (const i of items) {
    assert.doesNotMatch(i.title, /Jane|Patient|intake|chart/i);
    assert.match(i.title, /^Honey Lake/);
  }
  assert.ok(items.some((i) => i.title === 'Honey Lake session: running'));
  assert.ok(items.some((i) => i.title === 'Honey Lake: item waiting'));
});

test('dropped topics produce no rows at all', () => {
  const items = channelItems(
    [note('from-grokbot/2026-10-27-trellis-backups-rd.md', { status: 'running', for: 'trellisv2' }, { h1: 'Trellis backups and RD' })],
    NOW,
  );
  assert.equal(items.length, 0);
});

// ─── Loops ──────────────────────────────────────────────────────────────────

test('loops: client and a short what; never ref; closed ones on the timeline', () => {
  const items = loopItems(
    [
      { first_seen: '2026-10-20', source: 'email', client: 'eden', note: '"Re: Weekly" from josh@eden.example (904) 555-0100', needs_eric: 'True' },
      { first_seen: '2026-10-21', source: 'ticket', client: 'honeylakeos', note: 'Patient Jane bed 4', needs_eric: 'True' },
    ],
    [{ closed: '2026-10-26', client: 'sjcos', owed: 'harness', how: 'fsa-verify PASS' }, { closed: '2026-09-01', client: 'x', how: 'old' }],
    NOW,
  );
  const waiting = items.filter((i) => i.kind === 'waiting');
  assert.equal(waiting.length, 2);
  assert.equal(waiting[0].bot, 'Inbox');
  assert.match(waiting[0].title, /^Eden: /);
  assert.doesNotMatch(waiting[0].title, /@|555/);
  assert.equal(waiting[1].title, 'Honey Lake: item waiting');
  const events = items.filter((i) => i.kind === 'event');
  assert.equal(events.length, 1);
  assert.match(events[0].title, /SJCOS/);
});

// ─── Run logs ───────────────────────────────────────────────────────────────

test('run lines keep five fields and drop the rest', () => {
  const line = pickRunFields({
    at: '2026-10-27T15:37:02-04:00',
    action: 'prompt',
    label: 'EDEN',
    note: 'channel/from-grokbot/2026-10-27-eden-pr-41-answer.md',
    ok: 'True',
    detail: 'secret detail jane@example.com',
    reason: 'free text',
    subject: 'Re: patient',
  });
  assert.deepEqual(Object.keys(line).sort(), ['action', 'at', 'label', 'note', 'ok']);
  assert.equal(line.ok, true);
  assert.equal(pickRunFields({ at: '2026-10-27', note: '/etc/passwd' }).note, null);
  assert.equal(pickRunFields({ at: '2026-10-27', action: 'free text with spaces' }).action, null);
});

test('dispatch lines become titled events; other logs a line per day', () => {
  const lookup = (p: string) =>
    p.includes('honeylake')
      ? { title: null, honeyLake: true, dropped: false }
      : { title: 'Eden PR #41 answer', honeyLake: false, dropped: false };
  const items = runItems(
    [
      {
        job: 'dispatch-autostart',
        lines: [
          pickRunFields({ at: '2026-10-27T15:37:02-04:00', action: 'prompt', label: 'EDEN', note: 'channel/from-grokbot/2026-10-27-eden.md', ok: 'True' }),
          pickRunFields({ at: '2026-10-27T15:38:02-04:00', action: 'prompt', label: 'honeylakeos', note: 'channel/from-grokbot/2026-10-27-honeylakeos-x.md' }),
          pickRunFields({ at: '2026-10-27T15:39:02-04:00', action: 'reset', label: 'EDEN', note: 'channel/from-grokbot/2026-10-27-eden.md' }),
        ],
      },
      {
        job: 'green-keeper',
        lines: [
          pickRunFields({ at: '2026-10-27T10:00:00-04:00', event: 'pass' }),
          pickRunFields({ at: '2026-10-27T11:00:00-04:00', event: 'error' }),
          pickRunFields({ at: '2026-10-10T11:00:00-04:00', event: 'pass' }),
        ],
      },
      { job: 'alert-sends', lines: [pickRunFields({ at: '2026-10-27T10:00:00-04:00', ok: true })] },
    ],
    lookup,
    NOW,
  );
  const titles = items.map((i) => `${i.bot}: ${i.title}`).sort();
  assert.deepEqual(titles, [
    'Dispatch: Started Eden PR #41 answer (Eden session)',
    'Dispatch: Started Honey Lake session',
    'Green keeper: Ran 2 times, 1 failed',
  ]);
});

test('the leak gate flags what the scrub must never let through', () => {
  const base = { source: 'channel' as const, sourceKey: 'k', bot: 'Coding', kind: 'event' as const, tag: null, project: null, startedAt: null, endedAt: null, dueAt: null, prUrl: null, occurredAt: NOW.toISOString() };
  assert.deepEqual(leaksIn({ ...base, title: 'fine' }), []);
  assert.deepEqual(leaksIn({ ...base, title: 'x 5eed0029-0003-4000-8000-000000000002' }), ['uuid']);
  assert.deepEqual(leaksIn({ ...base, title: 'mail a@b.co' }), ['email']);
  assert.deepEqual(leaksIn({ ...base, title: 'bc-12ab' }), ['bc-id']);
});

// ─── The whole harvester, --json, over a fixture brain ──────────────────────

test('snapshot over a fixture brain: no UUID, email, bc- id, phone or URL in the output', () => {
  const root = mkdtempSync(join(tmpdir(), 'mc-activity-fixture-'));
  try {
    const w = (rel: string, body: string) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body);
    };
    const today = etDay(new Date());
    w('jobs/REGISTRY.md', '# Registry\n');
    w(
      `channel/from-grokbot/${today}-sjcos-fix-bc-4f9a2.md`,
      '---\nstatus: running\nfor: sjcos\nfrom: coding\nkind: handoff\n---\n# Fix bc-4f9a2 for jane@example.com, id 5eed0029-0003-4000-8000-000000000002, call 904-483-6881, https://vercel.com/x\n\nBody with secrets jane@example.com\n',
    );
    w(
      `channel/to-grokbot/${today}-ask.md`,
      '---\nstatus: open\nfrom: businessos\nkind: question\nresult: needs-eric\n---\n# Approve merge of PR 370 (agent_01AbCdEfGh, pid 4242)\n\n**Options**\n\n- Yes\n- No\n',
    );
    w(
      `channel/from-grokbot/${today}-honeylakeos-patient.md`,
      '---\nstatus: running\nfor: honeylakeos\n---\n# Patient Jane Roe intake\n',
    );
    w(
      'jobs/lib/loops-report.py',
      'import json\nprint(json.dumps({"needs_eric":[{"first_seen":"2026-10-20","source":"email","client":"eden",' +
        '"note":"Re: x from josh@eden.example","ref":"<CAF123@mail.gmail.com>","needs_eric":"True"}],"closed":[]}))\n',
    );
    w(
      'runs/dispatch-autostart.jsonl',
      JSON.stringify({ at: new Date().toISOString(), action: 'prompt', label: 'sjcos', note: `channel/from-grokbot/${today}-sjcos-fix-bc-4f9a2.md`, detail: 'jane@example.com 5eed0029-0003-4000-8000-000000000002' }) + '\n',
    );
    w('runs/alert-sends.jsonl', JSON.stringify({ at: new Date().toISOString(), to: 'jane@example.com', subject: 'secret' }) + '\n');

    const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'activity-snapshot.ts');
    const out = execFileSync(process.execPath, [script, '--stdout'], {
      encoding: 'utf8',
      env: { ...process.env, BRAIN_ROOT: root },
    });
    const rows = (JSON.parse(out) as { items: Array<Record<string, unknown>> }).items;
    assert.ok(rows.length >= 4, `expected rows, got ${rows.length}`);
    const text = out.replace(/"pr_url": "https:\/\/github\.com\/[^"]+"/g, '');
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'UUID leaked');
    assert.doesNotMatch(text, /@/, 'email leaked');
    assert.doesNotMatch(text, /\bbc-/i, 'bc- id leaked');
    assert.doesNotMatch(text, /904-483|https?:/, 'phone or URL leaked');
    assert.doesNotMatch(text, /agent_|4242|Jane|Roe|secret/i, 'id, PHI or body leaked');
    assert.ok(rows.some((r) => r.kind === 'waiting' && r.tag === 'yes_no'));
    assert.ok(rows.some((r) => r.title === 'Honey Lake session: running'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── Waiting on Eric: only what is still open and unanswered (Eric, 6:57 PM) ─

const ask = (path: string, fm: Record<string, string> = {}) =>
  note(path, { status: 'open', kind: 'question', result: 'needs-eric', from: 'sjcos', ...fm }, { h1: 'Merge #45?' });
const waitingOf = (notes: ChannelNote[]) => channelItems(notes, NOW).filter((i) => i.kind === 'waiting');

test('waiting: done, acked, superseded and cancelled notes are not waiting', () => {
  for (const status of ['done', 'acked', 'superseded', 'cancelled', 'canceled', 'closed']) {
    assert.equal(waitingOf([ask('to-grokbot/2026-10-25-q.md', { status })]).length, 0, status);
  }
  assert.equal(waitingOf([ask('to-grokbot/2026-10-25-q.md')]).length, 1);
});

test('waiting: a -done, -reply or -answer note beside it answers it, re: or not', () => {
  for (const suffix of ['done', 'reply', 'answer']) {
    const items = waitingOf([
      ask('to-grokbot/2026-10-25-q.md'),
      note(`from-grokbot/2026-10-25-q-${suffix}.md`, { status: 'done' }),
    ]);
    assert.equal(items.length, 0, suffix);
  }
});

test('waiting: a kind: answer note re: it means Eric already answered', () => {
  const items = waitingOf([
    ask('to-grokbot/2026-10-25-q.md'),
    note('from-grokbot/2026-10-26-eric-said-yes.md', { kind: 'answer', re: 'channel/to-grokbot/2026-10-25-q.md' }),
  ]);
  assert.equal(items.length, 0);
});

test('waiting: loops already in open/triage-closed.tsv are dropped', () => {
  const row = { first_seen: '2026-10-20', source: 'email', client: 'eden', note: 'Reply to the weekly', needs_eric: 'True' };
  const key = loopKey('2026-10-20', 'email', 'eden', '<ref@x>');
  assert.equal(loopItems([{ ...row, key }], [], NOW, new Set([key])).length, 0);
  assert.equal(loopItems([{ ...row, key }], [], NOW, new Set()).length, 1);
  // The key is whitespace- and case-blind, and never the ref itself.
  assert.equal(loopKey(' 2026-10-20', 'Email', 'EDEN ', '<ref@x>'), key);
  assert.ok(!key.includes('ref'));
});

test('waiting: dropped topics never wait, from notes or loops', () => {
  assert.equal(waitingOf([ask('to-grokbot/2026-10-25-trellis-option-d.md')]).length, 0);
  assert.equal(
    loopItems([{ first_seen: '2026-10-20', source: 'ops', client: 'muse', note: 'Rotate the Muse mailbox token', needs_eric: 'True' }], [], NOW).length,
    0,
  );
  assert.equal(
    loopItems([{ first_seen: '2026-10-20', source: 'ops', client: 'impact-works', note: 'Impact Works demo slides', needs_eric: 'True' }], [], NOW).length,
    0,
  );
});

test('waiting: an email subject is shown only if it passes the leak test', () => {
  const [clean, leaky, url] = loopItems(
    [
      { first_seen: '2026-10-20', source: 'email', client: 'eden', note: 'Weekly briefing questions', needs_eric: 'True' },
      { first_seen: '2026-10-21', source: 'email', client: 'eden', note: '"Re: Weekly" from jgoldenberg@gmail', needs_eric: 'True' },
      { first_seen: '2026-10-22', source: 'ticket', client: 'sjcos', note: 'See https://vercel.com/x for the log', needs_eric: 'True' },
    ],
    [],
    NOW,
  );
  assert.equal(clean.title, 'Eden: Weekly briefing questions');
  assert.equal(leaky.title, 'Eden: an email waits on your reply');
  assert.equal(url.title, 'SJCOS: an item waits on you');
  assert.deepEqual(textLeaks('call 904-483-6881'), ['phone']);
});

test('waiting: every generic Honey Lake row collapses into one line with a count', () => {
  const items = [
    ...loopItems(
      [
        { first_seen: '2026-10-01', source: 'ticket', client: 'honeylakeos', note: 'a', needs_eric: 'True' },
        { first_seen: '2026-10-05', source: 'email', client: 'honey-lake', note: 'b', needs_eric: 'True' },
      ],
      [],
      NOW,
    ),
    ...waitingOf([note('to-grokbot/2026-10-26-hl.md', { status: 'open', project: 'honeylakeos', result: 'needs-eric' })]),
    ...waitingOf([ask('to-grokbot/2026-10-25-q.md')]),
  ];
  const out = collapseHoneyLake(items);
  const hl = out.filter((i) => i.bot === 'Honey Lake session');
  assert.equal(hl.length, 1);
  assert.equal(hl[0].title, 'Honey Lake: 3 items waiting');
  assert.equal(hl[0].occurredAt, parseWhen('2026-10-01'));
  assert.equal(out.length, 2);
  assert.deepEqual(collapseHoneyLake([]), []);
});
