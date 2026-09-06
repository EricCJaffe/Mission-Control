/*
 * collect() tests. Run with:
 *
 *   node --test src/lib/brief/collect.test.ts
 *
 * `collect.ts` is the half of the brief that decides whether the numbers are
 * true. `render.ts` only prints them. So what is guarded here is arithmetic and
 * classification, in roughly the order a wrong answer would hurt:
 *
 * STALENESS first. A brief built on a sync that stopped three days ago is
 * indistinguishable from a good one unless it says so out loud, so the rules
 * that decide "stale" — including a source that has never run at all — get
 * their own block.
 *
 * Then the matrix hours and the amber warning, because the dashboard tile and
 * the brief once disagreed about the same week: one counted unclassified Admin
 * time in the Impact denominator and the other did not. The test below pins the
 * denominator to the four matrix domains so that cannot drift back.
 *
 * Then recurrence, prep, conflicts and open blocks, task sections, periods.
 *
 * NO DATABASE. `collect()` takes a Supabase client and issues six queries in
 * one `Promise.all`. `fakeSupabase` below is a chainable stub that records
 * every call and answers with fixture rows — which also lets a test assert on
 * the *query* where that is the actual behaviour under test (the closed-work
 * look-back window is a `gte` bound, not something collect filters in memory).
 *
 * TIME IS FROZEN. `Date.now` is pinned for the whole file, so every "30 days
 * untouched" and "36 hours since sync" assertion means the same thing in
 * January as it does in July.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

import type {
  CalendarEventRow,
  InboxItemRow,
  MatrixKey,
  ProjectRow,
  TaskRow,
} from './types';

/*
 * `collect.ts` imports `./types` with no extension and `@/lib/...` by alias.
 * The Next bundler resolves both; plain Node resolves neither. Rather than
 * bend application code to suit a test runner, teach Node's resolver the same
 * two tricks in-process — then this file runs under bare `node --test` with no
 * build step and no loader flag, exactly as `render.test.ts` does.
 *
 * @types/node is still on v20 here and does not declare `registerHooks`
 * (Node 22.15+), hence the cast; it exists on the Node 24 this repo runs.
 */
type ResolveHook = (
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => unknown,
) => unknown;

/** `src/`, from `src/lib/brief/collect.test.ts`. */
const SRC_URL = new URL('../../', import.meta.url);

(nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const rest = specifier.slice(2);
      return next(new URL(/\.[a-z]+$/i.test(rest) ? rest : `${rest}.ts`, SRC_URL).href, context);
    }
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { collect, dayLabel } = await import('./collect');
const { MATRIX_ORDER, IMPACT_WARN_SHARE, STALE_AFTER_HOURS, TASK_STALE_AFTER_DAYS } =
  await import('./types');

// ---------------------------------------------------------------------------
// Frozen time. Mon 7 Sep 2026, 10:00 in America/New_York (EDT, UTC-4).
// ---------------------------------------------------------------------------

const NOW_ISO = '2026-09-07T14:00:00Z';
const NOW_MS = Date.parse(NOW_ISO);
Date.now = () => NOW_MS;

const TODAY = '2026-09-07';
/** Mon–Sun, the shape a weekly brief always has. */
const WEEK_START = '2026-09-07';
const WEEK_END = '2026-09-13';

function hoursAgo(hours: number): string {
  return new Date(NOW_MS - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(NOW_MS - days * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// The fake client.
// ---------------------------------------------------------------------------

type SyncRunRow = {
  source: string;
  status: string | null;
  started_at: string | null;
  items_seen: number | null;
};

type QueryCall = { table: string; method: string; args: unknown[] };

type Dataset = {
  openTasks: TaskRow[];
  closedTasks: TaskRow[];
  projects: ProjectRow[];
  events: CalendarEventRow[];
  inbox: InboxItemRow[];
  runs: SyncRunRow[];
};

/** A valid, entirely empty world. Every test overrides only what it is about. */
function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    openTasks: [],
    closedTasks: [],
    projects: [],
    events: [],
    inbox: [],
    runs: [],
    ...overrides,
  };
}

/** Every builder method `collect` chains, in any order. */
const CHAIN = ['select', 'eq', 'neq', 'gte', 'is', 'or', 'order', 'limit'] as const;

/**
 * `tasks` is queried twice — once for open work and once for closed. The two
 * are told apart the same way the database tells them apart: `.eq('status',
 * 'done')` is the closed one, `.neq('status', 'done')` is not.
 */
function rowsFor(table: string, calls: QueryCall[], data: Dataset): unknown[] {
  switch (table) {
    case 'tasks': {
      const wantsDone = calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'done',
      );
      return wantsDone ? data.closedTasks : data.openTasks;
    }
    case 'projects':
      return data.projects;
    case 'calendar_events':
      return data.events;
    case 'inbox_items':
      return data.inbox;
    case 'sync_runs':
      return data.runs;
    default:
      throw new Error(`collect() queried an unexpected table: ${table}`);
  }
}

function fakeSupabase(data: Dataset) {
  const calls: QueryCall[] = [];

  const from = (table: string) => {
    const mine: QueryCall[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of CHAIN) {
      builder[method] = (...args: unknown[]) => {
        const call: QueryCall = { table, method, args };
        mine.push(call);
        calls.push(call);
        return builder;
      };
    }
    // Awaiting the builder is what runs the query, so `mine` is complete here.
    builder.then = (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: rowsFor(table, mine, data), error: null }).then(resolve, reject);
    return builder;
  };

  return { client: { from } as unknown as Parameters<typeof collect>[0], calls };
}

async function collectWeekly(overrides: Partial<Dataset> = {}) {
  const { client, calls } = fakeSupabase(dataset(overrides));
  const payload = await collect(client, 'user-1', 'weekly', WEEK_START, WEEK_END);
  return { payload, calls };
}

async function collectDaily(overrides: Partial<Dataset> = {}) {
  const { client, calls } = fakeSupabase(dataset(overrides));
  const payload = await collect(client, 'user-1', 'daily', TODAY, TODAY);
  return { payload, calls };
}

// ---------------------------------------------------------------------------
// Row fixtures. Minimal but valid; pass overrides for the field under test.
// ---------------------------------------------------------------------------

function runRow(overrides: Partial<SyncRunRow> = {}): SyncRunRow {
  return { source: 'projects', status: 'ok', started_at: hoursAgo(2), items_seen: 10, ...overrides };
}

function eventRow(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: 'evt-1',
    title: 'Standup',
    // 09:00–10:00 in America/New_York.
    start_at: '2026-09-07T13:00:00Z',
    end_at: '2026-09-07T14:00:00Z',
    domain: 'work',
    is_external: null,
    has_prep: null,
    location: null,
    web_link: null,
    attendees: null,
    recurrence_rule: null,
    recurrence_until: null,
    ...overrides,
  };
}

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't-1',
    title: 'A task',
    description: null,
    status: 'open',
    priority: 2,
    due_date: null,
    domain: 'work',
    category: null,
    why: null,
    project_id: null,
    source: null,
    source_url: null,
    assignee: null,
    external_status: null,
    edited_at: NOW_ISO,
    updated_at: NOW_ISO,
    created_at: NOW_ISO,
    ...overrides,
  };
}

function inboxRow(overrides: Partial<InboxItemRow> = {}): InboxItemRow {
  return {
    id: 'in-1',
    sender: 'Someone',
    sender_domain: 'example.com',
    subject: 'A subject',
    received_at: hoursAgo(5),
    snippet: null,
    needs_reply: true,
    replied_at: null,
    web_link: null,
    domain: null,
    ...overrides,
  };
}

/** Hours booked to one matrix bucket over the whole period. */
function hoursIn(
  payload: Awaited<ReturnType<typeof collectWeekly>>['payload'],
  key: MatrixKey,
): number {
  return payload.alignment.byMatrix.find((m) => m.key === key)?.hours ?? 0;
}

// ---------------------------------------------------------------------------
// 1. Staleness. The single most important correctness rule in the brief.
// ---------------------------------------------------------------------------

test('a source whose newest successful sync is older than the threshold is reported stale, by name', async () => {
  const { payload } = await collectWeekly({
    runs: [
      runRow({ source: 'projects', started_at: hoursAgo(2) }),
      runRow({ source: 'm365_mail', started_at: hoursAgo(STALE_AFTER_HOURS + 12) }),
      runRow({ source: 'm365_calendar', started_at: hoursAgo(1) }),
    ],
  });

  assert.deepEqual(
    payload.staleSources.map((s) => s.source),
    ['m365_mail'],
  );
  assert.equal(payload.staleSources[0].label, 'Outlook mail');
  assert.ok(
    (payload.staleSources[0].ageHours ?? 0) > STALE_AFTER_HOURS,
    'the age that justified the flag must be carried on the payload',
  );
});

test('a source that has never run at all is reported stale, not silently omitted', async () => {
  // The dangerous shape: no row means no evidence, and no evidence is not
  // evidence of freshness. Dropping the source from the list would leave the
  // brief looking complete while a whole feed was dark.
  const { payload } = await collectWeekly({
    runs: [
      runRow({ source: 'projects', started_at: hoursAgo(2) }),
      runRow({ source: 'm365_mail', started_at: hoursAgo(2) }),
    ],
  });

  assert.equal(payload.sources.length, 3, 'every configured source is listed, run or not');
  const calendar = payload.sources.find((s) => s.source === 'm365_calendar');
  assert.ok(calendar);
  assert.equal(calendar.lastRunAt, null);
  assert.equal(calendar.ageHours, null);
  assert.equal(calendar.stale, true);
  assert.deepEqual(
    payload.staleSources.map((s) => s.source),
    ['m365_calendar'],
  );
});

test('a source synced inside the window is not flagged', async () => {
  const { payload } = await collectWeekly({
    runs: [
      runRow({ source: 'projects', started_at: hoursAgo(STALE_AFTER_HOURS - 1) }),
      runRow({ source: 'm365_mail', started_at: hoursAgo(1) }),
      runRow({ source: 'm365_calendar', started_at: hoursAgo(1) }),
    ],
  });

  assert.deepEqual(payload.staleSources, []);
  assert.equal(payload.sources.every((s) => s.stale === false), true);
});

test('a source failing every two hours since its last good run is stale, however loud the failures', async () => {
  // Ordered newest-first, as the query returns them.
  const { payload } = await collectWeekly({
    runs: [
      runRow({ source: 'projects', status: 'error', started_at: hoursAgo(1), items_seen: null }),
      runRow({ source: 'projects', status: 'ok', started_at: hoursAgo(STALE_AFTER_HOURS + 10) }),
      runRow({ source: 'm365_mail', started_at: hoursAgo(1) }),
      runRow({ source: 'm365_calendar', started_at: hoursAgo(1) }),
    ],
  });

  const projects = payload.sources.find((s) => s.source === 'projects');
  assert.ok(projects);
  assert.equal(projects.stale, true, 'freshness is proved by a successful run, not by a recent one');
  assert.equal(projects.lastStatus, 'error', 'the loud failure is still reported');
  assert.equal(projects.lastRunAt, hoursAgo(STALE_AFTER_HOURS + 10));
});

// ---------------------------------------------------------------------------
// 2. Matrix hours, and the amber warning.
// ---------------------------------------------------------------------------

test('scheduled hours land in the matrix bucket of the event domain', async () => {
  const { payload } = await collectWeekly({
    events: [
      // 09:00–11:00 ET, two hours.
      eventRow({ id: 'e-spirit', domain: 'spirit', start_at: '2026-09-07T13:00:00Z', end_at: '2026-09-07T15:00:00Z' }),
      // `body` and `soul` both roll up into Health.
      eventRow({ id: 'e-body', domain: 'body', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T14:00:00Z' }),
      eventRow({ id: 'e-soul', domain: 'soul', start_at: '2026-09-09T13:00:00Z', end_at: '2026-09-09T14:00:00Z' }),
      eventRow({ id: 'e-family', domain: 'family', start_at: '2026-09-10T13:00:00Z', end_at: '2026-09-10T16:00:00Z' }),
      eventRow({ id: 'e-work', domain: 'work', start_at: '2026-09-11T13:00:00Z', end_at: '2026-09-11T17:00:00Z' }),
    ],
  });

  assert.equal(hoursIn(payload, 'god_first'), 2);
  assert.equal(hoursIn(payload, 'health'), 2);
  assert.equal(hoursIn(payload, 'family'), 3);
  assert.equal(hoursIn(payload, 'impact'), 4);
  assert.equal(hoursIn(payload, 'admin'), 0);
  assert.equal(payload.alignment.totalHours, 11);
  assert.equal(payload.alignment.winning, 'impact');
  assert.deepEqual(payload.alignment.absent, []);
});

test('an event with no domain lands in Admin, never in Impact', async () => {
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-none', domain: null, start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T15:00:00Z' }),
    ],
  });

  assert.equal(hoursIn(payload, 'admin'), 2);
  assert.equal(hoursIn(payload, 'impact'), 0);
  assert.deepEqual(
    payload.alignment.absent,
    ['god_first', 'health', 'family', 'impact'],
    'Admin is never called absent — it is the bucket for what has not been decided',
  );
});

test('impactCrowding measures Impact against the four matrix domains, excluding Admin', async () => {
  // 2h Impact, 1h unclassified. Against the matrix domains alone Impact is the
  // whole of the week (1.00 > 0.7) and the warning fires. Let Admin into the
  // denominator and it drops to 0.67, quietly suppressing the warning — which
  // is exactly the disagreement PriorityMatrix.tsx and the brief once had.
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-work', domain: 'work', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T15:00:00Z' }),
      eventRow({ id: 'e-none', domain: null, start_at: '2026-09-08T16:00:00Z', end_at: '2026-09-08T17:00:00Z' }),
    ],
  });

  assert.equal(hoursIn(payload, 'impact'), 2);
  assert.equal(hoursIn(payload, 'admin'), 1);
  assert.equal(payload.alignment.totalHours, 3);
  assert.ok(2 / 3 < IMPACT_WARN_SHARE, 'the Admin-inclusive share would be below the threshold');
  assert.equal(payload.alignment.impactCrowding, true);
});

test('Impact below the warn share raises no amber warning', async () => {
  // 2h Impact against 1h Family: 0.67 of the matrix domains, under the line.
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-work', domain: 'work', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T15:00:00Z' }),
      eventRow({ id: 'e-fam', domain: 'family', start_at: '2026-09-08T16:00:00Z', end_at: '2026-09-08T17:00:00Z' }),
    ],
  });

  assert.equal(payload.alignment.impactCrowding, false);
});

test('a week with nothing scheduled has no winner and no crowding', async () => {
  const { payload } = await collectWeekly();
  assert.equal(payload.alignment.totalHours, 0);
  assert.equal(payload.alignment.winning, null);
  assert.equal(payload.alignment.impactCrowding, false);
});

// ---------------------------------------------------------------------------
// 3. Recurrence. A standing commitment is not one meeting a quarter.
// ---------------------------------------------------------------------------

test('a Mon–Sat recurring event contributes six occurrences to a Mon–Sun week', async () => {
  // The row sits on 1 June, months before the week being reported — which is
  // the whole reason this was once counted as a single event, on the week it
  // was created, and never again.
  const { payload } = await collectWeekly({
    events: [
      eventRow({
        id: 'e-gym',
        title: 'Training',
        domain: 'body',
        start_at: '2026-06-01T11:00:00Z',
        end_at: '2026-06-01T12:00:00Z',
        recurrence_rule: 'Mon-Sat',
      }),
    ],
  });

  const occurrences = payload.days.flatMap((d) => d.events);
  assert.equal(occurrences.length, 6, 'Mon through Sat, and not the Sunday');
  assert.deepEqual(
    payload.days.filter((d) => d.events.length > 0).map((d) => d.date),
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'],
  );
  assert.equal(hoursIn(payload, 'health'), 6);
  assert.equal(
    new Set(occurrences.map((e) => e.id)).size,
    6,
    'each occurrence needs its own id — one repeated id breaks keys and prep matching',
  );
});

test('a weekly recurring event contributes exactly one occurrence to the week', async () => {
  const { payload } = await collectWeekly({
    events: [
      eventRow({
        id: 'e-call',
        title: 'Client call',
        domain: 'work',
        start_at: '2026-06-01T13:00:00Z',
        end_at: '2026-06-01T14:00:00Z',
        recurrence_rule: 'weekly',
      }),
    ],
  });

  const occurrences = payload.days.flatMap((d) => d.events);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].startAt?.slice(0, 10), '2026-09-07');
  assert.equal(hoursIn(payload, 'impact'), 1);
});

// ---------------------------------------------------------------------------
// 4. Prep warnings.
// ---------------------------------------------------------------------------

const PREP_START = '2026-09-08T14:00:00Z'; // Tue 10:00 ET, inside the week.

test('an external meeting with no prep is warned about; a prepped one and an internal one are not', async () => {
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-cold', title: 'Board review', is_external: true, has_prep: false, start_at: PREP_START, end_at: '2026-09-08T15:00:00Z' }),
      eventRow({ id: 'e-ready', title: 'Vendor call', is_external: true, has_prep: true, start_at: PREP_START, end_at: '2026-09-08T15:00:00Z' }),
      eventRow({ id: 'e-inside', title: 'Team sync', is_external: false, has_prep: false, start_at: PREP_START, end_at: '2026-09-08T15:00:00Z' }),
    ],
  });

  assert.deepEqual(
    payload.prepWarnings.map((w) => w.eventId),
    ['e-cold'],
  );
  assert.equal(payload.prepWarnings[0].day, '2026-09-08');
});

test('an external meeting whose has_prep is null is treated as unprepared', async () => {
  // `has_prep !== true`, deliberately: an unanswered column is not a yes.
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-unknown', is_external: true, has_prep: null, start_at: PREP_START, end_at: '2026-09-08T15:00:00Z' }),
    ],
  });

  assert.deepEqual(payload.prepWarnings.map((w) => w.eventId), ['e-unknown']);
});

test('a prep warning attaches mail from an attendee domain and the task that names the meeting', async () => {
  const { payload } = await collectWeekly({
    events: [
      eventRow({
        id: 'e-cold',
        title: 'Honey Lake engagement letter',
        is_external: true,
        has_prep: false,
        attendees: ['cfo@honeylake.example'],
        start_at: PREP_START,
        end_at: '2026-09-08T15:00:00Z',
      }),
    ],
    inbox: [
      // Nothing in the subject matches; the attendee domain alone carries it.
      inboxRow({ id: 'in-hit', sender: 'Their CFO', sender_domain: 'honeylake.example', subject: 'Papers' }),
      inboxRow({ id: 'in-miss', sender_domain: 'other.example', subject: 'Lunch plans' }),
    ],
    openTasks: [
      taskRow({ id: 't-hit', title: 'Draft the engagement letter' }),
      taskRow({ id: 't-miss', title: 'Order printer paper' }),
    ],
  });

  const warning = payload.prepWarnings[0];
  assert.deepEqual(warning.inbox.map((i) => i.id), ['in-hit']);
  assert.deepEqual(warning.tasks.map((t) => t.id), ['t-hit']);
  assert.deepEqual(warning.attendees, ['cfo@honeylake.example']);
});

test('a single shared word is not enough to call mail or a task related', async () => {
  // The matcher scores a title-word hit at 1 and needs 2. A wrong "this relates
  // to your meeting" is worse than a missing one.
  const { payload } = await collectWeekly({
    events: [
      eventRow({
        id: 'e-cold',
        title: 'Honey Lake engagement letter',
        is_external: true,
        has_prep: false,
        attendees: ['cfo@honeylake.example'],
        start_at: PREP_START,
        end_at: '2026-09-08T15:00:00Z',
      }),
    ],
    inbox: [inboxRow({ id: 'in-weak', sender_domain: 'other.example', subject: 'Letter from the bank' })],
    openTasks: [taskRow({ id: 't-weak', title: 'Renew the lake house insurance' })],
  });

  assert.deepEqual(payload.prepWarnings[0].inbox, []);
  assert.deepEqual(payload.prepWarnings[0].tasks, []);
});

// ---------------------------------------------------------------------------
// 5. Conflicts and open blocks.
// ---------------------------------------------------------------------------

function dayOfPayload(
  payload: Awaited<ReturnType<typeof collectWeekly>>['payload'],
  date: string,
) {
  const cell = payload.days.find((d) => d.date === date);
  assert.ok(cell, `expected a day cell for ${date}`);
  return cell;
}

test('two overlapping meetings on a day are both marked as conflicting', async () => {
  const { payload } = await collectWeekly({
    events: [
      // 09:00–10:00 and 09:30–10:30 ET.
      eventRow({ id: 'e-a', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T14:00:00Z' }),
      eventRow({ id: 'e-b', start_at: '2026-09-08T13:30:00Z', end_at: '2026-09-08T14:30:00Z' }),
      // A third, well clear of them, must stay unflagged.
      eventRow({ id: 'e-c', start_at: '2026-09-08T20:00:00Z', end_at: '2026-09-08T21:00:00Z' }),
    ],
  });

  const day = dayOfPayload(payload, '2026-09-08');
  assert.equal(day.conflicts, 2);
  assert.deepEqual(
    day.events.filter((e) => e.conflict).map((e) => e.id),
    ['e-a', 'e-b'],
  );
});

test('back-to-back meetings do not read as a conflict', async () => {
  const { payload } = await collectWeekly({
    events: [
      eventRow({ id: 'e-a', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T14:00:00Z' }),
      eventRow({ id: 'e-b', start_at: '2026-09-08T14:00:00Z', end_at: '2026-09-08T15:00:00Z' }),
    ],
  });

  assert.equal(dayOfPayload(payload, '2026-09-08').conflicts, 0);
});

test('a gap of two hours or more inside the working day becomes an open block', async () => {
  const { payload } = await collectWeekly({
    events: [
      // 08:00–09:00 and 12:00–13:00 ET, leaving a three-hour hole between them.
      eventRow({ id: 'e-a', start_at: '2026-09-08T12:00:00Z', end_at: '2026-09-08T13:00:00Z' }),
      eventRow({ id: 'e-b', start_at: '2026-09-08T16:00:00Z', end_at: '2026-09-08T17:00:00Z' }),
    ],
  });

  const blocks = dayOfPayload(payload, '2026-09-08').openBlocks;
  assert.deepEqual(blocks[0], { startLabel: '9:00 AM', endLabel: '12:00 PM', hours: 3 });
  // And the rest of the working day, 1:00 PM to 6:00 PM.
  assert.deepEqual(blocks[1], { startLabel: '1:00 PM', endLabel: '6:00 PM', hours: 5 });
});

test('a twenty-minute gap between meetings is not an open block', async () => {
  const { payload } = await collectWeekly({
    events: [
      // 08:00–12:00 and 12:20–18:00 ET: the whole working day, bar 20 minutes.
      eventRow({ id: 'e-a', start_at: '2026-09-08T12:00:00Z', end_at: '2026-09-08T16:00:00Z' }),
      eventRow({ id: 'e-b', start_at: '2026-09-08T16:20:00Z', end_at: '2026-09-08T22:00:00Z' }),
    ],
  });

  assert.deepEqual(dayOfPayload(payload, '2026-09-08').openBlocks, []);
});

test('a day with nothing on it is one open block spanning the working window', async () => {
  const { payload } = await collectWeekly();
  assert.deepEqual(dayOfPayload(payload, '2026-09-08').openBlocks, [
    { startLabel: '8:00 AM', endLabel: '6:00 PM', hours: 10 },
  ]);
});

// ---------------------------------------------------------------------------
// 6. Task sections.
// ---------------------------------------------------------------------------

test('overdue tasks come back grouped in matrix order, with empty groups dropped', async () => {
  const { payload } = await collectWeekly({
    openTasks: [
      // Deliberately supplied Impact-first, to prove the order is imposed.
      taskRow({ id: 't-work', domain: 'work', due_date: '2026-09-01' }),
      taskRow({ id: 't-family', domain: 'family', due_date: '2026-09-02' }),
      taskRow({ id: 't-spirit', domain: 'spirit', due_date: '2026-09-03' }),
    ],
  });

  assert.deepEqual(
    payload.tasks.overdue.map((g) => g.key),
    ['god_first', 'family', 'impact'],
  );
  assert.equal(payload.tasks.overdueCount, 3);
  assert.equal(payload.tasks.overdue.every((g) => g.tasks.length > 0), true);
  const order = payload.tasks.overdue.map((g) => MATRIX_ORDER.indexOf(g.key));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(payload.tasks.overdue[0].tasks[0].daysUntilDue, -4);
});

test('a task due inside the period is due-this-week and not overdue', async () => {
  const { payload } = await collectWeekly({
    openTasks: [
      taskRow({ id: 't-due', due_date: '2026-09-10' }),
      taskRow({ id: 't-later', due_date: '2026-09-20' }),
      taskRow({ id: 't-undated', due_date: null }),
    ],
  });

  assert.deepEqual(payload.tasks.dueThisPeriod.map((t) => t.id), ['t-due']);
  assert.equal(payload.tasks.dueThisPeriod[0].daysUntilDue, 3);
  assert.deepEqual(payload.tasks.overdue, []);
  assert.equal(payload.tasks.overdueCount, 0);
});

test('a task untouched for longer than the stale threshold is stale and carries a verdict', async () => {
  const { payload } = await collectWeekly({
    openTasks: [
      // Low priority, no date, cold for six weeks: nothing is lost by deleting it.
      taskRow({ id: 't-kill', priority: 3, due_date: null, edited_at: daysAgo(45), updated_at: daysAgo(45) }),
      // Called important and then abandoned: that is a scheduling problem.
      taskRow({ id: 't-schedule', priority: 1, due_date: null, edited_at: daysAgo(45), updated_at: daysAgo(45) }),
    ],
  });

  const byId = new Map(payload.tasks.stale.map((t) => [t.id, t]));
  assert.equal(byId.size, 2);
  assert.equal(byId.get('t-kill')?.verdict, 'kill');
  assert.equal(byId.get('t-schedule')?.verdict, 'schedule');
  assert.ok((byId.get('t-kill')?.ageDays ?? 0) >= TASK_STALE_AFTER_DAYS);
  assert.ok((byId.get('t-kill')?.reason ?? '').length > 0, 'a verdict without a reason is an opinion');
});

test('a task touched today is not stale, however old the row is', async () => {
  const { payload } = await collectWeekly({
    openTasks: [
      taskRow({ id: 't-fresh', priority: 3, due_date: null, created_at: daysAgo(400), updated_at: daysAgo(400), edited_at: NOW_ISO }),
    ],
  });

  assert.deepEqual(payload.tasks.stale, []);
  assert.equal(payload.tasks.dueThisPeriod.length, 0);
});

test('an overdue task is left out of the stale list — overdue is the louder problem', async () => {
  const { payload } = await collectWeekly({
    openTasks: [
      taskRow({ id: 't-old-and-late', due_date: '2026-08-01', edited_at: daysAgo(45), updated_at: daysAgo(45) }),
    ],
  });

  assert.equal(payload.tasks.overdueCount, 1);
  assert.deepEqual(payload.tasks.stale, []);
});

test('a task inherits its project domain when it has none of its own', async () => {
  const { payload } = await collectWeekly({
    projects: [{ id: 'p-1', title: 'Honey Lake', slug: 'honeylake', domain: 'work', client: 'FSA' }],
    openTasks: [taskRow({ id: 't-inherit', domain: null, project_id: 'p-1', due_date: '2026-09-01' })],
  });

  const task = payload.tasks.overdue[0].tasks[0];
  assert.equal(payload.tasks.overdue[0].key, 'impact', 'not Admin — the project already said what this is');
  assert.equal(task.project, 'Honey Lake');
  assert.equal(task.client, 'FSA');
});

test('a weekly brief asks for closed work from the seven days before the period, and no further', async () => {
  // The window is a `gte` bound on the query, not an in-memory filter, so this
  // is the only place it can be checked.
  const { calls } = await collectWeekly({
    closedTasks: [taskRow({ id: 't-done', status: 'done' })],
  });

  const bound = calls.find((c) => c.table === 'tasks' && c.method === 'gte' && c.args[0] === 'updated_at');
  assert.ok(bound, 'closed work must be bounded, or the brief reports the whole year');
  // Local midnight on 31 Aug expressed as an instant: EDT is UTC-4.
  assert.equal(bound.args[1], '2026-08-31T04:00:00.000Z');
});

test('a daily brief asks for closed work from the day before, not the week', async () => {
  const { calls, payload } = await collectDaily({
    closedTasks: [taskRow({ id: 't-done', status: 'done', domain: 'work' })],
  });

  const bound = calls.find((c) => c.table === 'tasks' && c.method === 'gte' && c.args[0] === 'updated_at');
  assert.ok(bound);
  assert.equal(bound.args[1], '2026-09-06T04:00:00.000Z');
  assert.deepEqual(payload.tasks.closed.map((t) => t.id), ['t-done']);
});

// ---------------------------------------------------------------------------
// 7. Periods.
// ---------------------------------------------------------------------------

test('a weekly brief covers seven days, labels the span and carries no tomorrow', async () => {
  const { payload } = await collectWeekly();

  assert.equal(payload.kind, 'weekly');
  assert.equal(payload.periodStart, WEEK_START);
  assert.equal(payload.periodEnd, WEEK_END);
  assert.deepEqual(
    payload.days.map((d) => d.date),
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'],
  );
  assert.equal(payload.periodLabel, `${dayLabel(WEEK_START)} – ${dayLabel(WEEK_END)}`);
  assert.equal(payload.tomorrow, null, 'a week already contains tomorrow');
  assert.deepEqual(payload.days.filter((d) => d.isToday).map((d) => d.date), [TODAY]);
});

test('a daily brief covers one day and carries tomorrow, so prep can still happen tonight', async () => {
  const { payload } = await collectDaily({
    events: [
      eventRow({ id: 'e-tomorrow', start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T14:00:00Z' }),
    ],
  });

  assert.equal(payload.periodStart, TODAY);
  assert.equal(payload.periodEnd, TODAY);
  assert.deepEqual(payload.days.map((d) => d.date), [TODAY]);
  assert.equal(payload.periodLabel, dayLabel(TODAY));
  assert.equal(payload.tomorrow?.date, '2026-09-08');
  assert.deepEqual(payload.tomorrow?.events.map((e) => e.id), ['e-tomorrow']);
  // Tomorrow's meeting must not be counted in today's hours.
  assert.equal(payload.alignment.totalHours, 0);
});

test('a daily brief warns about tomorrow’s unprepared meeting while there is an evening to prepare in', async () => {
  const { payload } = await collectDaily({
    events: [
      eventRow({ id: 'e-tomorrow', is_external: true, has_prep: false, start_at: '2026-09-08T13:00:00Z', end_at: '2026-09-08T14:00:00Z' }),
    ],
  });

  assert.deepEqual(payload.prepWarnings.map((w) => w.eventId), ['e-tomorrow']);
  assert.ok((payload.prepWarnings[0].hoursAway ?? 0) > 0);
});

// ---------------------------------------------------------------------------
// 8. Known bug, left failing deliberately. See the report accompanying this file.
// ---------------------------------------------------------------------------

test('an evening event stored as next-day UTC stays on its own evening', async () => {
  /*
   * 8:00–9:30 PM on Tue 8 Sep in America/New_York is stored as 2026-09-09T00:00Z.
   *
   * `collect` runs every row through `expandInRange`, which computes the base
   * DATE in the app timezone (correctly, 2026-09-08) but then rebuilds the
   * instant as `${date}T${clock}` reusing the stored UTC CLOCK — producing
   * 2026-09-08T00:00Z, which is 8:00 PM on Monday the 7th.
   *
   * So every evening commitment after 8pm ET lands on the wrong day, and one at
   * the start of the period falls out of the period entirely. That is not
   * cosmetic: the alignment hours, the conflict check and the leave-by times
   * are all built on this. Family and Health hours are the ones most often
   * scheduled in the evening, so they are the ones most often lost.
   *
   * The defect is in `src/lib/calendar/recurrence.ts` (`expandInRange`), which
   * `collect.ts` trusts. Left failing rather than fixed.
   */
  const { payload } = await collectWeekly({
    events: [
      eventRow({
        id: 'e-evening',
        title: 'Family dinner',
        domain: 'family',
        start_at: '2026-09-09T00:00:00Z',
        end_at: '2026-09-09T01:30:00Z',
      }),
    ],
  });

  assert.deepEqual(
    payload.days.filter((d) => d.events.length > 0).map((d) => d.date),
    ['2026-09-08'],
    'the dinner is on Tuesday evening, not Monday',
  );
  assert.equal(hoursIn(payload, 'family'), 1.5);
});
