/*
 * Renderer tests. Run with:
 *
 *   node --test src/lib/brief/render.test.ts
 *
 * Two things this file is guarding.
 *
 * ESCAPING. Subjects, sender names, meeting titles, attendee addresses and web
 * links all arrive from Microsoft Graph. They are attacker-supplied text landing
 * in an HTML document that Eric opens on a phone. Every one of those values is
 * checked here twice — once arriving as DATA, and once arriving inside the
 * NARRATIVE, because a model handed the payload will happily quote an email
 * subject back at you and the prose path escapes through different code.
 *
 * THE NO-NARRATIVE PATH. `renderBrief(payload, null)` is what ships when the
 * Anthropic key is missing or the call times out. A brief with no prose is far
 * better than no brief, so it gets its own test and must never regress.
 *
 * Fixtures are built by the small `*Fixture` helpers below rather than written
 * out longhand: a test should show only the field it is actually about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

import type {
  Alignment,
  BriefNarrative,
  BriefPayload,
  BriefTask,
  DayCell,
  DayEvent,
  MatrixHours,
  MatrixKey,
  PrepWarning,
  SourceHealth,
  StaleTask,
  TaskSections,
  Thread,
} from './types';

/*
 * `render.ts` imports `./types` with no file extension, which the Next bundler
 * resolves and plain Node does not. Rather than edit application code to suit a
 * test runner, teach Node's resolver the same trick in-process — then the suite
 * runs under bare `node --test` with no build step and no loader flag.
 *
 * @types/node is still on v20 here and does not declare `registerHooks` (Node
 * 22.15+), hence the cast; it exists at runtime on the Node 24 this repo uses.
 */
type ResolveHook = (
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => unknown,
) => unknown;
(nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { renderBrief } = await import('./render');
const { MATRIX, STALE_AFTER_HOURS } = await import('./types');

// ---------------------------------------------------------------------------
// The hostile values, in one place so every test uses the same ones.
// ---------------------------------------------------------------------------

/** The classic. If this ever renders as a tag the brief is an XSS vector. */
const HOSTILE_SUBJECT = '<script>alert(1)</script>';
/** A display name carrying all three of the characters that break markup. */
const HOSTILE_SENDER = 'Ann "Danger" <a&b>';
/** A scheme that is not http(s) or mailto, and must never reach an href. */
const HOSTILE_URL = 'javascript:alert(1)';

// ---------------------------------------------------------------------------
// Fixtures. Minimal but valid; pass overrides for the field under test.
// ---------------------------------------------------------------------------

function matrixRowsFixture(hours: Partial<Record<MatrixKey, number>> = {}): MatrixHours[] {
  const filled: Record<MatrixKey, number> = {
    god_first: 3,
    health: 2,
    family: 3,
    impact: 12,
    admin: 0,
    ...hours,
  };
  const total = MATRIX.reduce((sum, m) => sum + filled[m.key], 0);
  return MATRIX.map((m) => ({
    key: m.key,
    label: m.label,
    hours: filled[m.key],
    share: total === 0 ? 0 : filled[m.key] / total,
    meetings: filled[m.key] > 0 ? 1 : 0,
  }));
}

function alignmentFixture(overrides: Partial<Alignment> = {}): Alignment {
  const byMatrix = overrides.byMatrix ?? matrixRowsFixture();
  return {
    totalHours: byMatrix.reduce((sum, m) => sum + m.hours, 0),
    byMatrix,
    winning: 'impact',
    absent: byMatrix.filter((m) => m.key !== 'admin' && m.hours === 0).map((m) => m.key),
    impactCrowding: false,
    ...overrides,
  };
}

function eventFixture(overrides: Partial<DayEvent> = {}): DayEvent {
  return {
    id: 'evt-1',
    title: 'Standup',
    startAt: '2026-09-07T13:00:00Z',
    endAt: '2026-09-07T13:30:00Z',
    timeLabel: '9:00 AM',
    matrix: 'impact',
    isExternal: false,
    hasPrep: true,
    location: null,
    webLink: null,
    leaveBy: null,
    conflict: false,
    ...overrides,
  };
}

function dayFixture(overrides: Partial<DayCell> = {}): DayCell {
  return {
    date: '2026-09-07',
    label: 'Mon 7 Sep',
    isToday: true,
    events: [eventFixture()],
    conflicts: 0,
    openBlocks: [{ startLabel: '2:00 PM', endLabel: '4:00 PM', hours: 2 }],
    hours: 0.5,
    ...overrides,
  };
}

function threadFixture(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thr-1',
    sender: 'Joey Alleva',
    senderDomain: 'example.com',
    subject: 'Quarterly numbers',
    snippet: null,
    receivedAt: '2026-09-05T12:00:00Z',
    ageHours: 12,
    ageLabel: '12h',
    webLink: 'https://outlook.office.com/mail/id/1',
    matrix: 'impact',
    urgency: 10,
    ...overrides,
  };
}

function taskFixture(overrides: Partial<BriefTask> = {}): BriefTask {
  return {
    id: 'task-1',
    title: 'Send the engagement letter',
    matrix: 'impact',
    dueDate: '2026-09-01',
    daysUntilDue: -4,
    priority: 1,
    project: 'Honey Lake',
    client: 'Foundation Stone',
    sourceUrl: 'https://tasks.example.com/1',
    why: null,
    ageDays: 6,
    ...overrides,
  };
}

function staleTaskFixture(overrides: Partial<StaleTask> = {}): StaleTask {
  return {
    ...taskFixture({ id: 'task-stale', title: 'Rewrite the onboarding deck' }),
    verdict: 'kill',
    reason: 'Untouched for 40 days with no due date.',
    ...overrides,
  };
}

function tasksFixture(overrides: Partial<TaskSections> = {}): TaskSections {
  return {
    overdue: [],
    overdueCount: 0,
    dueThisPeriod: [],
    stale: [],
    closed: [],
    ...overrides,
  };
}

function prepWarningFixture(overrides: Partial<PrepWarning> = {}): PrepWarning {
  return {
    eventId: 'evt-9',
    title: 'Board review',
    startAt: '2026-09-08T14:00:00Z',
    day: '2026-09-08',
    whenLabel: 'Tue 8 Sep, 10:00 AM',
    location: 'Zoom',
    webLink: 'https://outlook.office.com/calendar/9',
    attendees: ['someone@example.com'],
    matrix: 'impact',
    hoursAway: 30,
    inbox: [],
    tasks: [],
    ...overrides,
  };
}

function sourceFixture(overrides: Partial<SourceHealth> = {}): SourceHealth {
  return {
    source: 'm365_calendar',
    label: 'Outlook calendar',
    lastRunAt: '2026-09-05T00:00:00Z',
    lastStatus: 'ok',
    itemsSeen: 42,
    ageHours: 3,
    stale: false,
    ...overrides,
  };
}

function payloadFixture(overrides: Partial<BriefPayload> = {}): BriefPayload {
  return {
    kind: 'weekly',
    periodStart: '2026-09-07',
    periodEnd: '2026-09-13',
    periodLabel: '7–13 September 2026',
    generatedAt: '2026-09-06 06:00',
    timezone: 'America/New_York',
    sources: [sourceFixture()],
    staleSources: [],
    alignment: alignmentFixture(),
    prepWarnings: [],
    days: [dayFixture()],
    tomorrow: null,
    threads: [],
    tasks: tasksFixture(),
    ...overrides,
  };
}

/** A payload with every section populated — used where "all branches" matters. */
function richPayloadFixture(overrides: Partial<BriefPayload> = {}): BriefPayload {
  return payloadFixture({
    staleSources: [sourceFixture({ stale: true, ageHours: 41 })],
    alignment: alignmentFixture({ impactCrowding: true, byMatrix: matrixRowsFixture({ health: 0 }) }),
    prepWarnings: [
      prepWarningFixture({
        hoursAway: 4,
        inbox: [
          { id: 'in-1', sender: 'Cristina', subject: 'Agenda', receivedAt: null, webLink: 'https://example.com/a' },
        ],
        tasks: [{ id: 't-9', title: 'Print the packet', dueDate: '2026-09-08', sourceUrl: null }],
      }),
    ],
    days: [
      dayFixture({
        events: [
          eventFixture({ conflict: true, isExternal: true, hasPrep: false, leaveBy: '8:30 AM', location: 'Tampa' }),
        ],
      }),
    ],
    tomorrow: dayFixture({ date: '2026-09-08', label: 'Tue 8 Sep', isToday: false }),
    threads: [threadFixture(), threadFixture({ id: 'thr-2', ageHours: 60, ageLabel: '3d' })],
    tasks: tasksFixture({
      overdue: [{ key: 'impact', label: 'Impact', tasks: [taskFixture()] }],
      overdueCount: 1,
      dueThisPeriod: [taskFixture({ id: 'task-2', daysUntilDue: 1 })],
      stale: [staleTaskFixture()],
      closed: [taskFixture({ id: 'task-3', title: 'Filed the return' })],
    }),
    ...overrides,
  });
}

const FULL_NARRATIVE: BriefNarrative = {
  alignmentSummary: 'Impact holds most of the week.',
  prepCommentary: 'One meeting is cold.',
  weekCommentary: 'Tuesday is the only clear morning.',
  threadsCommentary: 'Two people are waiting.',
  tasksCommentary: 'The overdue list is short.',
  outcomes: [{ outcome: 'Ship the letter', when: 'Monday 7:00 AM', why: 'It has been late four days.' }],
  nextSteps: [{ step: 'Block Tuesday morning', when: 'tonight' }],
  challenge: 'Protect the first hour.',
  scriptureReference: 'Matthew 6:33',
  scriptureApplication: 'Seek first the kingdom.',
};

/** The label cell of each alignment row. `width="110"` is unique to that cell. */
function alignmentLabels(html: string): string[] {
  return [...html.matchAll(/width="110">([^<]*)</g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// 1–3. Escaping, values arriving as DATA.
// ---------------------------------------------------------------------------

test('a script tag in an email subject renders as text, never as a tag', () => {
  const html = renderBrief(
    payloadFixture({ threads: [threadFixture({ subject: HOSTILE_SUBJECT })] }),
    null,
  );
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('a sender display name carrying a quote, an angle bracket and an ampersand cannot break out', () => {
  // The name lands inside a <strong> and, via the prep card, next to an href —
  // so an unescaped double quote would escape the attribute, not just the text.
  const html = renderBrief(
    payloadFixture({
      threads: [threadFixture({ sender: HOSTILE_SENDER })],
      prepWarnings: [prepWarningFixture({ attendees: [HOSTILE_SENDER] })],
    }),
    null,
  );
  assert.match(html, /Ann &quot;Danger&quot; &lt;a&amp;b&gt;/);
  assert.ok(!html.includes(HOSTILE_SENDER), 'the raw display name must not appear anywhere');
});

test('a javascript: URL on a task is dropped rather than emitted as an href', () => {
  const html = renderBrief(
    payloadFixture({
      tasks: tasksFixture({
        overdue: [{ key: 'impact', label: 'Impact', tasks: [taskFixture({ sourceUrl: HOSTILE_URL })] }],
        overdueCount: 1,
      }),
    }),
    null,
  );
  assert.doesNotMatch(html, /javascript:/i);
  // Dropping the link must not drop the task — the row still has to be readable.
  assert.match(html, /Send the engagement letter/);
});

// ---------------------------------------------------------------------------
// 4. The same three values, arriving through the NARRATIVE.
// ---------------------------------------------------------------------------

test('a script tag echoed back by the model in its prose renders as text', () => {
  // The model is handed the payload, so it can quote a subject verbatim. Prose
  // escapes on a different code path from the tables; both have to hold.
  const html = renderBrief(payloadFixture(), {
    threadsCommentary: `The thread titled ${HOSTILE_SUBJECT} is still open.`,
  });
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('a hostile sender name echoed by the model in every prose slot stays escaped', () => {
  const html = renderBrief(payloadFixture(), {
    alignmentSummary: HOSTILE_SENDER,
    challenge: HOSTILE_SENDER,
    scriptureApplication: HOSTILE_SENDER,
    outcomes: [{ outcome: HOSTILE_SENDER, when: HOSTILE_SENDER, why: HOSTILE_SENDER }],
    nextSteps: [{ step: HOSTILE_SENDER, when: HOSTILE_SENDER }],
  });
  assert.ok(!html.includes(HOSTILE_SENDER), 'the raw display name must not appear anywhere');
  assert.match(html, /Ann &quot;Danger&quot; &lt;a&amp;b&gt;/);
});

test('a whole anchor tag with a javascript: href written by the model is inert', () => {
  // Worst case: the model does not merely quote a URL, it writes the markup.
  const html = renderBrief(payloadFixture(), {
    challenge: `<a href="${HOSTILE_URL}">click</a>`,
  });
  assert.doesNotMatch(html, /<a[^>]*javascript:/i);
  assert.match(html, /&lt;a href=&quot;javascript:alert\(1\)&quot;&gt;click&lt;\/a&gt;/);
});

// ---------------------------------------------------------------------------
// 5–6. Staleness. The brief must never quietly present old data as current.
// ---------------------------------------------------------------------------

test('a source past the staleness threshold raises the banner and is named in it', () => {
  const html = renderBrief(
    payloadFixture({
      staleSources: [
        sourceFixture({ label: 'Outlook calendar', ageHours: STALE_AFTER_HOURS + 5, stale: true }),
      ],
    }),
    null,
  );
  assert.match(html, /This brief is built on stale data/);
  assert.match(html, /Outlook calendar/);
  assert.match(html, /last synced 41 hours ago/);
});

test('nothing stale means no banner at all', () => {
  const html = renderBrief(payloadFixture({ staleSources: [] }), null);
  assert.doesNotMatch(html, /built on stale data/);
});

// ---------------------------------------------------------------------------
// 7. The no-key path.
// ---------------------------------------------------------------------------

test('renderBrief(payload, null) renders every section and says the prose is missing', () => {
  // This is the ANTHROPIC_API_KEY-absent case. It must never regress into empty
  // sections, a thrown error, or silence about why the commentary is gone.
  const html = renderBrief(richPayloadFixture(), null);

  assert.match(html, /Numbers only/);
  for (const heading of [
    'Alignment Check',
    'Prep Warnings',
    'Week at a Glance',
    'Threads Waiting on You',
    'Tasks',
    'Top 3 Outcomes',
    'Next Steps',
  ]) {
    assert.match(html, new RegExp(heading), `weekly brief is missing the ${heading} section`);
  }
  // The two model-only sections say so rather than rendering blank.
  assert.match(html, /were not written/);

  const daily = renderBrief(richPayloadFixture({ kind: 'daily' }), null);
  for (const heading of ['Today', 'Prep for Tomorrow', 'Inbox Needing You', 'Today&#39;s 3', 'Next Action']) {
    assert.match(daily, new RegExp(heading), `daily brief is missing the ${heading} section`);
  }
});

// ---------------------------------------------------------------------------
// 8. Matrix order.
// ---------------------------------------------------------------------------

test('the alignment table lists each matrix bucket once, Admin dropped when it is empty', () => {
  const html = renderBrief(payloadFixture(), null);
  assert.deepEqual(alignmentLabels(html), ['God First', 'Health', 'Family', 'Impact']);
});

test('alignment rows render God First → Health → Family → Impact whatever order the payload arrives in', () => {
  // The matrix order is the whole point of the brief (types.ts, rule 1), but
  // render.ts iterates `alignment.byMatrix` as handed to it and never consults
  // MATRIX_ORDER. Latent today only because collect.ts happens to build the
  // array with MATRIX.map; any other producer silently reorders Eric's
  // priorities and puts client work at the top.
  const shuffled = [...matrixRowsFixture()].reverse();
  const html = renderBrief(payloadFixture({ alignment: alignmentFixture({ byMatrix: shuffled }) }), null);
  assert.deepEqual(alignmentLabels(html), ['God First', 'Health', 'Family', 'Impact']);
});

// ---------------------------------------------------------------------------
// 9. Zero hours.
// ---------------------------------------------------------------------------

test('a matrix bucket with no scheduled time says so rather than showing 0h or vanishing', () => {
  // "0h · 0%" reads as a measurement of a real thing. It is not — much of God
  // First, Health and Family never reaches a calendar — so the row has to say
  // nothing was scheduled, and it must still be there to be read.
  const html = renderBrief(
    payloadFixture({ alignment: alignmentFixture({ byMatrix: matrixRowsFixture({ health: 0 }) }) }),
    null,
  );
  assert.ok(alignmentLabels(html).includes('Health'), 'the empty bucket must still have a row');
  assert.match(html, /nothing scheduled/);
  assert.doesNotMatch(html, /0h · 0%/);
  // ...and the absent bucket is called out by name, not just left as a blank bar.
  assert.match(html, /Nothing on the calendar/);
  assert.match(html, /Health have?\b|Health has/);
});

// ---------------------------------------------------------------------------
// 10. Email-client constraints, asserted on the output itself.
// ---------------------------------------------------------------------------

test('the html stays inside what Outlook and Gmail will actually render', () => {
  // Gmail keeps a <style> block, Outlook mobile drops it; Word's engine has
  // neither flexbox nor grid; external images are blocked by default. A brief
  // that needs any of them is a brief that arrives unreadable.
  for (const html of [
    renderBrief(richPayloadFixture(), FULL_NARRATIVE),
    renderBrief(richPayloadFixture({ kind: 'daily' }), FULL_NARRATIVE),
    renderBrief(richPayloadFixture(), null),
  ]) {
    assert.doesNotMatch(html, /<style[\s>]/i);
    assert.doesNotMatch(html, /display\s*:\s*flex/i);
    assert.doesNotMatch(html, /display\s*:\s*grid/i);
    assert.doesNotMatch(html, /<img[^>]+src\s*=\s*["']?http/i);
  }
});
