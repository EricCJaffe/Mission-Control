/*
 * A one-off bridge: Graph data captured elsewhere, written into the tables the
 * unattended sync will later fill by itself.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/import-graph-json.ts events.json
 *
 * WHY THIS EXISTS. The Microsoft 365 connector is authenticated against Eric's
 * account inside a Claude Code session, but a systemd timer and a Vercel cron
 * have no access to it — that is what the app registration in
 * docs/m365-setup.md is for. Until it exists, this lets a session hand real
 * calendar and mail across so the brief can be checked against the actual week
 * rather than against fixtures.
 *
 * It writes through exactly the same shapes scripts/sync/m365.ts uses, so what
 * it produces is what the timer will produce. When the credentials land, this
 * file stops being useful and should be deleted rather than kept as a second
 * way of doing the same thing.
 */

import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env.ts';
import { createSyncClient } from './lib/db.ts';

// Matches INTERNAL_DOMAINS in lib/needsReply.ts, and for the same reason:
// ema.org is a client, so a meeting with them is an external meeting and
// should be asked whether it has prep.
const INTERNAL = ['foundationstoneadvisors.com'];

type RawEvent = {
  id: string;
  subject: string;
  start: string; // ISO, already UTC
  end: string;
  location?: string | null;
  webLink?: string | null;
  attendees?: string[] | null;
  organizer?: string | null;
  isAllDay?: boolean;
};

type RawMail = {
  id: string;
  conversationId?: string | null;
  from: string;
  subject: string;
  received: string;
  snippet?: string | null;
  webLink?: string | null;
  needsReply: boolean;
};

type Payload = { events?: RawEvent[]; mail?: RawMail[] };

function domainOf(address: string): string {
  return address.split('@')[1]?.toLowerCase() ?? '';
}

function isExternal(attendees: string[]): boolean {
  return attendees.some((a) => a && !INTERNAL.includes(domainOf(a)));
}

/*
 * A meeting counts as prepared when something prep-shaped sits in the 24 hours
 * before it. "Block" is included because that is what Eric actually calls the
 * time he sets aside — a rule that only recognised the word "prep" would
 * report every one of his meetings as unprepared.
 */
const PREP_RE = /\b(prep|block|review|focus|agenda|standup|check ?in|checkin)\b/i;

function hasPrepBefore(event: RawEvent, all: RawEvent[]): boolean {
  const start = new Date(event.start).getTime();
  return all.some((other) => {
    if (other.id === event.id) return false;
    if (!PREP_RE.test(other.subject)) return false;
    const otherStart = new Date(other.start).getTime();
    return otherStart < start && start - otherStart <= 24 * 3600 * 1000;
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: import-graph-json.ts <payload.json>');
  const payload: Payload = JSON.parse(readFileSync(file, 'utf8'));

  const env = loadEnv();
  const db = createSyncClient(env);
  const now = new Date().toISOString();

  let eventsWritten = 0;
  let mailWritten = 0;

  for (const ev of payload.events ?? []) {
    const attendees = (ev.attendees ?? []).filter(Boolean);
    const row = {
      user_id: env.userId,
      title: ev.subject || '(no subject)',
      start_at: ev.start,
      end_at: ev.end,
      event_type: 'Meeting',
      // This is the work mailbox, so `work` is the right default rather than a
      // guess. A family lunch that lands in this calendar is reclassified in
      // the UI, and the matrix reports unclassified time separately so a wrong
      // default cannot hide inside Impact.
      domain: 'work',
      external_id: ev.id,
      attendees,
      is_external: isExternal(attendees),
      has_prep: hasPrepBefore(ev, payload.events ?? []),
      location: ev.location ?? null,
      web_link: ev.webLink ?? null,
      synced_at: now,
    };

    // Read-then-write, because the unique index on external_id is PARTIAL and
    // PostgREST cannot infer ON CONFLICT from one.
    const { data: existing } = await db
      .from('calendar_events')
      .select('id')
      .eq('user_id', env.userId)
      .eq('external_id', ev.id)
      .maybeSingle();

    const { error } = existing
      ? await db.from('calendar_events').update(row).eq('id', existing.id)
      : await db.from('calendar_events').insert(row);
    if (error) throw new Error(`calendar_events: ${error.message}`);
    eventsWritten += 1;
  }

  for (const m of payload.mail ?? []) {
    const row = {
      user_id: env.userId,
      message_id: m.id,
      thread_id: m.conversationId ?? null,
      sender: m.from,
      sender_domain: domainOf(m.from),
      subject: m.subject,
      received_at: m.received,
      snippet: (m.snippet ?? '').slice(0, 500) || null,
      needs_reply: m.needsReply,
      domain: 'work',
      web_link: m.webLink ?? null,
      synced_at: now,
    };

    const { data: existing } = await db
      .from('inbox_items')
      .select('id')
      .eq('user_id', env.userId)
      .eq('message_id', m.id)
      .maybeSingle();

    const { error } = existing
      ? await db.from('inbox_items').update(row).eq('id', existing.id)
      : await db.from('inbox_items').insert(row);
    if (error) throw new Error(`inbox_items: ${error.message}`);
    mailWritten += 1;
  }

  // A sync_runs row, so /sync and the brief's staleness check see this the
  // same way they will see the real thing.
  for (const [source, count] of [
    ['m365_calendar', eventsWritten],
    ['m365_mail', mailWritten],
  ] as Array<[string, number]>) {
    if (count === 0) continue;
    await db.from('sync_runs').insert({
      user_id: env.userId,
      source,
      status: 'ok',
      started_at: now,
      finished_at: new Date().toISOString(),
      items_seen: count,
      items_updated: count,
      log: { via: 'import-graph-json', note: 'captured through the M365 connector in a Claude Code session' },
    });
  }

  console.log(`imported ${eventsWritten} events, ${mailWritten} messages`);
}

main().catch((err) => {
  console.error(`[import-graph-json] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
