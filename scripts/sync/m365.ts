/*
 * The Microsoft 365 harvester.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/m365.ts --dry-run
 *
 * Pulls Outlook calendar and Inbox for MS_MAILBOX into mission.calendar_events
 * and mission.inbox_items. One-way, like the project harvester: nothing here
 * writes to Graph, and the app registration has never been consented for
 * Mail.Send, so it could not if it wanted to.
 *
 * WHAT IT DELIBERATELY DOES NOT STORE. Not bodies — a snippet, capped, enough
 * to recognise a thread. The migration says why in as many words: this
 * database also holds family health records, and a second copy of a work
 * mailbox does not belong beside them. Not attachments, not recipients beyond
 * what the reply heuristic needs, and not one message older than the fortnight
 * the "who is waiting on me" question actually spans.
 *
 * Setup — the app registration, and the Exchange access policy that keeps a
 * tenant-wide Mail.Read from meaning the whole company — is docs/m365-setup.md.
 */

import { loadEnv } from './lib/env.ts';
import { createSyncClient, type SyncClient } from './lib/db.ts';
import { loadGraphEnv, graphGet, mailboxPath, type GraphEnv } from './lib/graph.ts';
import {
  needsReply,
  ownerRepliesByConversation,
  domainOf,
  isInternalDomain,
  type MailMessage,
} from './lib/needsReply.ts';

/*
 * The calendar window. Backwards because a brief has to say what happened as
 * well as what is coming; forwards three weeks because that is about as far
 * ahead as a diary is honest.
 */
const CALENDAR_DAYS_BACK = 7;
const CALENDAR_DAYS_AHEAD = 21;

/** The Inbox window. Anything older is not "waiting on me", it is history. */
const MAIL_DAYS_BACK = 14;

/** Enough to recognise the thread. See the file header for why it is not more. */
const SNIPPET_CHARS = 280;

/*
 * Everything from this mailbox is work. The domain CHECK constraint allows
 * five values, and a work Outlook account cannot honestly claim any of the
 * other four — anything that turns out to be family or spirit gets reassigned
 * in the UI, and the sync leaves that reassignment alone afterwards.
 */
const MAILBOX_DOMAIN = 'work';

/** calendar_events.event_type is NOT NULL and free text; the app already uses title case. */
const EVENT_TYPE = 'Meeting';

/*
 * What counts as preparation for a later meeting. Titles, not categories,
 * because nobody categorises a block they typed in at 8pm.
 */
const PREP_TITLE_RE = /\b(prep|prepping|prepare|block|blocked|review|focus)\b/i;
const PREP_WINDOW_MS = 24 * 60 * 60 * 1000;

type Args = {
  dryRun: boolean;
  calendarOnly: boolean;
  mailOnly: boolean;
  /** Turn flagged mail into tasks. Off unless asked — see the note at main(). */
  tasksFromEmail: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, calendarOnly: false, mailOnly: false, tasksFromEmail: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--calendar-only') args.calendarOnly = true;
    else if (a === '--mail-only') args.mailOnly = true;
    else if (a === '--tasks-from-email') args.tasksFromEmail = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file-if-exists=.env.local scripts/sync/m365.ts [options]\n' +
          '  --dry-run             read and report, write nothing\n' +
          '  --calendar-only       skip the mail pass\n' +
          '  --mail-only           skip the calendar pass\n' +
          '  --tasks-from-email    open a task for each message awaiting a reply (off by default)\n',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (args.calendarOnly && args.mailOnly) {
    throw new Error('--calendar-only and --mail-only ask for opposite things.');
  }
  return args;
}

/* ------------------------------------------------------------------------- */
/* Shapes Graph actually returns. Only the fields this sync selects.          */
/* ------------------------------------------------------------------------- */

type GraphSlot = { dateTime?: string | null; timeZone?: string | null } | null;

type GraphEvent = {
  id: string;
  subject?: string | null;
  start?: GraphSlot;
  end?: GraphSlot;
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string | null } | null;
  organizer?: { emailAddress?: { address?: string | null } | null } | null;
  attendees?: { emailAddress?: { address?: string | null } | null }[] | null;
  webLink?: string | null;
};

type GraphMessage = {
  id: string;
  '@odata.type'?: string;
  conversationId?: string | null;
  subject?: string | null;
  from?: { emailAddress?: { address?: string | null } | null } | null;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
  webLink?: string | null;
  internetMessageHeaders?: { name: string; value: string }[] | null;
};

type GraphSentMessage = { conversationId?: string | null; sentDateTime?: string | null };

/* ------------------------------------------------------------------------- */

/*
 * Graph renders event times as a naive string plus a separate timeZone field,
 * and this sync deliberately does not send `Prefer: outlook.timezone`. That
 * header changes only the rendering, not the meaning of the request — so
 * asking for Eastern would hand back `2026-09-05T14:00:00` with no offset on
 * it, and every safe-looking way to parse that is four or five hours wrong
 * twice a year. Left alone, Graph answers in UTC and says so, which is the
 * one case where appending a `Z` is not a guess.
 */
function graphInstant(slot: GraphSlot): string | null {
  const raw = slot?.dateTime;
  if (!raw) return null;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const zone = (slot?.timeZone ?? 'UTC').toUpperCase();
  if (!hasOffset && zone !== 'UTC') return null;
  const at = Date.parse(hasOffset ? raw : `${raw}Z`);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function addressesOf(event: GraphEvent): string[] {
  const out: string[] = [];
  const organizer = event.organizer?.emailAddress?.address;
  if (organizer) out.push(organizer.toLowerCase());
  for (const attendee of event.attendees ?? []) {
    const address = attendee.emailAddress?.address;
    if (address) out.push(address.toLowerCase());
  }
  return [...new Set(out)];
}

/*
 * PostgREST caps a URL, and `.in()` puts every value in it. Twelve months of
 * this table would blow that on one call, so reads of "the rows matching what
 * I just fetched" go in chunks.
 */
function chunked<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type RunResult = {
  seen: number;
  created: number;
  updated: number;
  log: Record<string, unknown>;
};

/* ------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* ------------------------------------------------------------------------- */

type PreparedEvent = {
  externalId: string;
  title: string;
  startAt: string;
  endAt: string;
  attendees: string[];
  isExternal: boolean;
  hasPrep: boolean;
  location: string | null;
  webLink: string | null;
  isAllDay: boolean;
};

/*
 * Whether anything that looks like preparation sits in the day before.
 *
 * Only the 24 hours *before* the meeting count, and only blocks that start no
 * later than it does. A "review" two days earlier was preparation for
 * something else, and one an hour afterwards is the debrief.
 */
function hasPrepFor(target: PreparedEvent, all: PreparedEvent[]): boolean {
  const start = Date.parse(target.startAt);
  if (PREP_TITLE_RE.test(target.title)) return false;
  return all.some((other) => {
    if (other.externalId === target.externalId) return false;
    if (!PREP_TITLE_RE.test(other.title)) return false;
    const otherStart = Date.parse(other.startAt);
    return otherStart <= start && start - otherStart <= PREP_WINDOW_MS;
  });
}

/*
 * Double-bookings.
 *
 * There is no column for this and inventing one would be inventing a fact —
 * an overlap is a property of a pair of rows, not of either row, and it stops
 * being true the moment one of them moves. It goes in the run log instead,
 * where the brief can read it and where it ages out with the run that found it.
 *
 * All-day events are excluded. They overlap everything by construction, and a
 * calendar with two of them would otherwise report a wall of false conflicts.
 */
function findOverlaps(events: PreparedEvent[]): Record<string, unknown>[] {
  const timed = events
    .filter((e) => !e.isAllDay)
    .slice()
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const conflicts: Record<string, unknown>[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (Date.parse(timed[j].startAt) >= Date.parse(timed[i].endAt)) break;
      conflicts.push({
        starts_at: timed[j].startAt,
        first: timed[i].title,
        second: timed[j].title,
        first_ends: timed[i].endAt,
      });
    }
  }
  return conflicts;
}

async function syncCalendar(
  db: SyncClient,
  userId: string,
  graph: GraphEnv,
  dryRun: boolean,
): Promise<RunResult> {
  const now = Date.now();
  const startDateTime = new Date(now - CALENDAR_DAYS_BACK * 86_400_000).toISOString();
  const endDateTime = new Date(now + CALENDAR_DAYS_AHEAD * 86_400_000).toISOString();

  // calendarView, not /events: it expands a recurring series into the
  // occurrences a diary actually contains, and it *requires* both bounds —
  // omitting one is a 400, not a default range.
  const raw = await graphGet<GraphEvent>(graph, mailboxPath(graph, '/calendarView'), {
    startDateTime,
    endDateTime,
    $select: 'id,subject,start,end,isAllDay,isCancelled,location,organizer,attendees,webLink',
    $orderby: 'start/dateTime',
    $top: '100',
  });

  const unreadable: string[] = [];
  let cancelled = 0;
  const prepared: PreparedEvent[] = [];

  for (const event of raw) {
    if (event.isCancelled) {
      cancelled += 1;
      continue;
    }
    const startAt = graphInstant(event.start ?? null);
    const endAt = graphInstant(event.end ?? null);
    if (!startAt || !endAt) {
      unreadable.push(event.id);
      continue;
    }
    const attendees = addressesOf(event);
    prepared.push({
      externalId: event.id,
      title: (event.subject ?? '').trim() || '(no subject)',
      startAt,
      endAt,
      attendees,
      isExternal: attendees.some((a) => !isInternalDomain(domainOf(a))),
      hasPrep: false,
      location: event.location?.displayName?.trim() || null,
      webLink: event.webLink ?? null,
      isAllDay: event.isAllDay === true,
    });
  }

  for (const event of prepared) event.hasPrep = hasPrepFor(event, prepared);
  const conflicts = findOverlaps(prepared);

  const result: RunResult = {
    seen: prepared.length,
    created: 0,
    updated: 0,
    log: {
      window: { from: startDateTime, to: endDateTime },
      fetched: raw.length,
      cancelled_skipped: cancelled,
      unreadable_times: unreadable,
      external: prepared.filter((e) => e.isExternal).length,
      with_prep: prepared.filter((e) => e.hasPrep).length,
      conflicts,
    },
  };
  if (dryRun) return result;

  const existing = new Map<string, string>();
  for (const chunk of chunked(prepared.map((e) => e.externalId))) {
    const { data, error } = await db
      .from('calendar_events')
      .select('id, external_id')
      .eq('user_id', userId)
      .in('external_id', chunk);
    if (error) throw new Error(`Could not read existing calendar events: ${error.message}`);
    for (const row of data ?? []) if (row.external_id) existing.set(row.external_id, row.id);
  }

  const syncedAt = new Date().toISOString();
  for (const event of prepared) {
    // Facts the source owns. `domain`, `notes` and `event_type` are absent on
    // purpose: those are the fields somebody reclassifies by hand, and a sync
    // that reasserted its own guess every half hour would undo that silently.
    const facts = {
      title: event.title.slice(0, 500),
      start_at: event.startAt,
      end_at: event.endAt,
      attendees: event.attendees,
      is_external: event.isExternal,
      has_prep: event.hasPrep,
      location: event.location,
      web_link: event.webLink,
      synced_at: syncedAt,
    };

    const priorId = existing.get(event.externalId);
    if (priorId) {
      const { error } = await db.from('calendar_events').update(facts).eq('id', priorId);
      if (error) throw new Error(`Update failed for event "${event.title}": ${error.message}`);
      result.updated += 1;
      continue;
    }

    const { error } = await db.from('calendar_events').insert({
      user_id: userId,
      external_id: event.externalId,
      event_type: EVENT_TYPE,
      domain: MAILBOX_DOMAIN,
      ...facts,
    });
    if (error) throw new Error(`Insert failed for event "${event.title}": ${error.message}`);
    result.created += 1;
  }

  return result;
}

/* ------------------------------------------------------------------------- */
/* Mail                                                                       */
/* ------------------------------------------------------------------------- */

type PreparedMessage = {
  messageId: string;
  threadId: string | null;
  sender: string | null;
  senderDomain: string | null;
  subject: string;
  receivedAt: string;
  snippet: string | null;
  needsReply: boolean;
  webLink: string | null;
};

async function syncMail(
  db: SyncClient,
  userId: string,
  graph: GraphEnv,
  dryRun: boolean,
  tasksFromEmail: boolean,
): Promise<RunResult> {
  const since = new Date(Date.now() - MAIL_DAYS_BACK * 86_400_000).toISOString();

  const inbox = await graphGet<GraphMessage>(graph, mailboxPath(graph, '/mailFolders/inbox/messages'), {
    $filter: `receivedDateTime ge ${since}`,
    $select: 'id,conversationId,subject,from,receivedDateTime,bodyPreview,webLink,internetMessageHeaders',
    $orderby: 'receivedDateTime desc',
    $top: '50',
  });

  /*
   * Sent Items over the same window, for one question only: has he already
   * written back into this thread? Without it every message in a five-mail
   * exchange reads as an outstanding obligation, and a list that says five
   * things are owed when one reply settled them all is a list nobody trusts.
   */
  const sent = await graphGet<GraphSentMessage>(graph, mailboxPath(graph, '/mailFolders/sentitems/messages'), {
    $filter: `sentDateTime ge ${since}`,
    $select: 'conversationId,sentDateTime',
    $orderby: 'sentDateTime desc',
    $top: '100',
  });

  const ownerLastSentAt = ownerRepliesByConversation(
    sent.map((m) => ({ conversationId: m.conversationId ?? null, sentAt: m.sentDateTime ?? null })),
  );

  const prepared: PreparedMessage[] = [];
  let undated = 0;

  for (const message of inbox) {
    const receivedAt = message.receivedDateTime ?? null;
    if (!receivedAt) {
      // Nothing downstream can order or age a message without one.
      undated += 1;
      continue;
    }
    const sender = message.from?.emailAddress?.address?.toLowerCase() ?? null;
    const shaped: MailMessage = {
      id: message.id,
      conversationId: message.conversationId ?? null,
      from: sender,
      receivedAt,
      subject: message.subject ?? null,
      odataType: message['@odata.type'] ?? null,
      headers: message.internetMessageHeaders ?? null,
    };

    prepared.push({
      messageId: message.id,
      threadId: message.conversationId ?? null,
      sender,
      senderDomain: domainOf(sender),
      subject: (message.subject ?? '').trim() || '(no subject)',
      receivedAt,
      // A snippet, never the body. See the file header, and the migration
      // comment on mission.inbox_items, which says the same thing.
      snippet: (message.bodyPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS) || null,
      needsReply: needsReply(shaped, { mailbox: graph.mailbox, ownerLastSentAt }),
      webLink: message.webLink ?? null,
    });
  }

  const flagged = prepared.filter((m) => m.needsReply);
  const result: RunResult = {
    seen: prepared.length,
    created: 0,
    updated: 0,
    log: {
      window_from: since,
      fetched: inbox.length,
      sent_items_scanned: sent.length,
      undated_skipped: undated,
      needs_reply: flagged.length,
      tasks_from_email: tasksFromEmail,
    },
  };
  if (dryRun) return result;

  type PriorRow = { id: string; message_id: string; replied_at: string | null; linked_task_id: string | null };
  const existing = new Map<string, PriorRow>();
  for (const chunk of chunked(prepared.map((m) => m.messageId))) {
    const { data, error } = await db
      .from('inbox_items')
      .select('id, message_id, replied_at, linked_task_id')
      .eq('user_id', userId)
      .in('message_id', chunk);
    if (error) throw new Error(`Could not read existing inbox items: ${error.message}`);
    for (const row of (data ?? []) as PriorRow[]) existing.set(row.message_id, row);
  }

  const syncedAt = new Date().toISOString();
  const toLink: { rowId: string; subject: string; sender: string | null; webLink: string | null }[] = [];

  for (const message of prepared) {
    const prior = existing.get(message.messageId);

    // Once it has been answered here, it is answered. Recomputing needs_reply
    // over the top of `replied_at` would put a settled thread back on the list
    // on the next run, every run, until it fell out of the fortnight.
    const stillWaiting = prior?.replied_at ? false : message.needsReply;

    const facts = {
      thread_id: message.threadId,
      sender: message.sender,
      sender_domain: message.senderDomain,
      subject: message.subject.slice(0, 500),
      received_at: message.receivedAt,
      snippet: message.snippet,
      needs_reply: stillWaiting,
      web_link: message.webLink,
      synced_at: syncedAt,
    };

    if (prior) {
      const { error } = await db.from('inbox_items').update(facts).eq('id', prior.id);
      if (error) throw new Error(`Update failed for message "${message.subject}": ${error.message}`);
      result.updated += 1;
      if (tasksFromEmail && stillWaiting && !prior.linked_task_id) {
        toLink.push({ rowId: prior.id, subject: message.subject, sender: message.sender, webLink: message.webLink });
      }
      continue;
    }

    const { data, error } = await db
      .from('inbox_items')
      .insert({ user_id: userId, message_id: message.messageId, domain: MAILBOX_DOMAIN, ...facts })
      .select('id')
      .single();
    if (error) throw new Error(`Insert failed for message "${message.subject}": ${error.message}`);
    result.created += 1;
    if (tasksFromEmail && stillWaiting && data) {
      toLink.push({ rowId: data.id, subject: message.subject, sender: message.sender, webLink: message.webLink });
    }
  }

  if (tasksFromEmail && toLink.length) {
    result.log.tasks_created = await createTasksForMail(db, userId, toLink);
  }

  return result;
}

/*
 * Turn flagged mail into tasks — only when asked.
 *
 * Off by default because the failure is asymmetric and permanent-feeling: a
 * heuristic that is 90% right across a fortnight of Inbox still opens dozens
 * of tasks nobody wanted, and a task list you have to clean up is one you stop
 * opening. The flag exists so the heuristic can be trusted first, on the
 * inbox_items list, where being wrong costs a glance.
 *
 * Priority 2, never 1: an unanswered email is not on fire by virtue of being
 * unanswered, and urgency is a judgement made here, not in the mailbox.
 */
async function createTasksForMail(
  db: SyncClient,
  userId: string,
  items: { rowId: string; subject: string; sender: string | null; webLink: string | null }[],
): Promise<number> {
  const now = new Date().toISOString();
  let created = 0;

  for (const item of items) {
    const { data, error } = await db
      .from('tasks')
      .insert({
        user_id: userId,
        title: `Reply: ${item.subject}`.slice(0, 500),
        description: null,
        status: 'todo',
        priority: 2,
        domain: 'work',
        why: item.sender ? `${item.sender} is waiting on a reply` : 'Waiting on a reply',
        source: 'email',
        // The Graph message id is already the stable identity; there is no
        // heading trail to hash, and unlike a markdown line it never moves.
        source_ref: item.rowId,
        source_url: item.webLink,
        external_status: 'open',
        last_seen_at: now,
        synced_at: now,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Could not create a task for "${item.subject}": ${error.message}`);

    const { error: linkError } = await db
      .from('inbox_items')
      .update({ linked_task_id: data.id })
      .eq('id', item.rowId);
    if (linkError) throw new Error(`Could not link the task back to its message: ${linkError.message}`);
    created += 1;
  }

  return created;
}

/* ------------------------------------------------------------------------- */

async function recordRun(
  db: SyncClient,
  userId: string,
  source: string,
  startedAt: string,
  result: RunResult | null,
  error: string | null,
) {
  const { error: insertError } = await db.from('sync_runs').insert({
    user_id: userId,
    source,
    status: error ? 'error' : 'ok',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    items_seen: result?.seen ?? 0,
    items_created: result?.created ?? 0,
    items_updated: result?.updated ?? 0,
    items_closed: 0,
    dry_run: false,
    error,
    log: result?.log ?? null,
  });
  // A failed run that cannot even record its failure must not also hide the
  // original error, which is the one worth reading.
  if (insertError) console.error(`[sync:m365] could not write the ${source} run row: ${insertError.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Graph first. The Supabase side has been configured for months; the MS_*
  // variables are the ones that are missing on a fresh box, and failing on
  // them first is the difference between one clear sentence and a detour
  // through the wrong half of the setup.
  const graph = loadGraphEnv();
  const env = loadEnv();
  const db = createSyncClient(env);

  console.log(
    `\n${args.dryRun ? 'DRY RUN — nothing will be written' : 'SYNCING'}  ` +
      `${graph.mailbox}  ` +
      `calendar −${CALENDAR_DAYS_BACK}/+${CALENDAR_DAYS_AHEAD}d, mail ${MAIL_DAYS_BACK}d` +
      `${args.tasksFromEmail ? '  (tasks from email ON)' : ''}\n`,
  );
  console.log('source'.padEnd(18) + 'seen'.padStart(6) + 'new'.padStart(6) + 'upd'.padStart(6) + '  notes');

  let failed = false;

  /*
   * Each source stands alone. Graph throttling one of them, or an access
   * policy that covers the mailbox but not its calendar, must not cost the
   * other — and it must leave a sync_runs row saying so, because the whole
   * point of that table is that a dead sync looks exactly like a quiet week.
   */
  const passes: { source: string; run: () => Promise<RunResult>; note: (r: RunResult) => string }[] = [];

  if (!args.mailOnly) {
    passes.push({
      source: 'm365_calendar',
      run: () => syncCalendar(db, env.userId, graph, args.dryRun),
      note: (r) => {
        const conflicts = Array.isArray(r.log.conflicts) ? r.log.conflicts.length : 0;
        return `${r.log.external} external, ${r.log.with_prep} prepped, ${conflicts} overlapping`;
      },
    });
  }
  if (!args.calendarOnly) {
    passes.push({
      source: 'm365_mail',
      run: () => syncMail(db, env.userId, graph, args.dryRun, args.tasksFromEmail),
      note: (r) => `${r.log.needs_reply} awaiting a reply` +
        (r.log.tasks_created ? `, ${r.log.tasks_created} tasks opened` : ''),
    });
  }

  for (const pass of passes) {
    const startedAt = new Date().toISOString();
    try {
      const result = await pass.run();
      console.log(
        pass.source.padEnd(18) +
          String(result.seen).padStart(6) +
          String(result.created).padStart(6) +
          String(result.updated).padStart(6) +
          '  ' +
          pass.note(result),
      );
      if (!args.dryRun) await recordRun(db, env.userId, pass.source, startedAt, result, null);
    } catch (err) {
      failed = true;
      const message = err instanceof Error ? err.message : String(err);
      console.log(pass.source.padEnd(18) + '     —     —     —  ' + message);
      if (!args.dryRun) await recordRun(db, env.userId, pass.source, startedAt, null, message);
    }
  }

  console.log(args.dryRun ? '\n(dry run — no writes, and no sync_runs row)' : '');
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n[sync:m365] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
