/**
 * Gather everything a brief needs, in one pass, and derive every number it
 * will print.
 *
 * Nothing here talks to a model and nothing here writes. The caller supplies
 * the user id — auth is the route's job, not this module's — and gets back a
 * `BriefPayload` that is already the whole truth of the brief. `render.ts`
 * prints it; `prompt.ts` shows it to Claude and asks for prose about it.
 *
 * The one rule that outranks the rest: if a sync has gone quiet, the brief has
 * to say so. Stale data rendered confidently is worse than no brief, because
 * it is indistinguishable from a good one — see `docs/runbook.md` and the
 * comment at the top of `/sync`.
 */

import { APP_TIMEZONE, addDays, dayOf, daysBetween, today as todayInAppTz } from '@/lib/day';
import type { MissionClient } from '@/lib/supabase/schema';
import {
  IMPACT_WARN_SHARE,
  MATRIX,
  MATRIX_LABEL,
  MATRIX_ORDER,
  STALE_AFTER_HOURS,
  TASK_STALE_AFTER_DAYS,
  matrixKeyFor,
  type Alignment,
  type BriefKind,
  type BriefPayload,
  type BriefTask,
  type CalendarEventRow,
  type DayCell,
  type DayEvent,
  type InboxItemRow,
  type MatrixHours,
  type MatrixKey,
  type OpenBlock,
  type PrepWarning,
  type ProjectRow,
  type SourceHealth,
  type StaleTask,
  type StaleVerdict,
  type TaskGroup,
  type TaskRow,
  type TaskSections,
  type Thread,
} from './types';

/** The sync sources the brief depends on, and what to call them out loud. */
const SOURCES: Array<{ source: string; label: string }> = [
  { source: 'projects', label: 'Project task lists (~/dev)' },
  { source: 'm365_mail', label: 'Outlook mail' },
  { source: 'm365_calendar', label: 'Outlook calendar' },
];

/** The window inside which an open stretch counts as usable working time. */
const WORK_START_MIN = 8 * 60;
const WORK_END_MIN = 18 * 60;

/** An open block is only worth naming at two hours or more. */
const OPEN_BLOCK_MIN_HOURS = 2;

/** How long before an in-person meeting to leave. */
const LEAVE_BY_MINUTES = 30;

/** How far back to read mail. The inbox table only holds a fortnight anyway. */
const INBOX_LOOKBACK_DAYS = 14;

// ---------------------------------------------------------------------------
// Time, stated explicitly. The server runs in UTC; see src/lib/day.ts.
// ---------------------------------------------------------------------------

function startOfDayUtc(dateIso: string): string {
  // A local midnight expressed as an instant. Built by asking the formatter
  // what the offset is on that date, so DST is handled rather than assumed.
  const guess = new Date(`${dateIso}T12:00:00Z`);
  const offsetMin = tzOffsetMinutes(guess);
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) - offsetMin * 60_000).toISOString();
}

function endOfDayUtc(dateIso: string): string {
  return startOfDayUtc(addDays(dateIso, 1));
}

/** Minutes that APP_TIMEZONE is ahead of UTC at a given instant. */
function tzOffsetMinutes(at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Minutes since local midnight, in the app timezone. */
function localMinutes(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hhmm = d.toLocaleTimeString('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesLabel(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  const h24 = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const mins = localMinutes(iso);
  return mins === null ? '' : minutesLabel(mins);
}

/** "Mon 8 Sep" from a 'YYYY-MM-DD'. */
export function dayLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y) return dateIso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "Tue 9 Sep, 2:00 PM" — the form used wherever a meeting is named. */
function whenLabel(iso: string | null): string {
  if (!iso) return 'time unknown';
  const day = dayOf(iso);
  const time = timeLabel(iso);
  return time ? `${dayLabel(day)}, ${time}` : dayLabel(day);
}

function hoursBetweenIso(startAt: string | null, endAt: string | null): number {
  if (!startAt) return 0;
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / 3_600_000;
}

function hoursSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / 3_600_000;
}

function ageLabelFor(hours: number | null): string {
  if (hours === null) return 'unknown';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Matching mail and tasks to a meeting. Deliberately conservative: a wrong
// "this relates to your meeting" is worse than a missing one.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'about', 'after', 'again', 'call', 'chat', 'from', 'have', 'meet', 'meeting',
  'next', 'note', 'notes', 'other', 'over', 'please', 'review', 'sync', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'time',
  'update', 'weekly', 'with', 'your', 'zoom', 'teams', 'monthly', 'quick',
]);

function tokens(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  const out = new Set<string>();
  for (const raw of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 3 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

function overlaps(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/** Domains of an event's external attendees, lowercased. */
function attendeeDomains(attendees: string[] | null): Set<string> {
  const out = new Set<string>();
  for (const a of attendees ?? []) {
    const at = a.lastIndexOf('@');
    if (at > -1) out.add(a.slice(at + 1).trim().toLowerCase());
  }
  return out;
}

/**
 * Is this somewhere you have to physically be?
 *
 * Nothing in the schema says so, so it is inferred: a location that is not a
 * link and not the name of a conferencing product. A false positive costs one
 * unnecessary leave-by line; a false negative costs a late arrival.
 */
function isInPerson(location: string | null): boolean {
  if (!location) return false;
  const l = location.trim().toLowerCase();
  if (!l) return false;
  if (/^https?:\/\//.test(l)) return false;
  return !/(teams|zoom|meet\.google|webex|skype|phone|call in|dial|online|virtual)/.test(l);
}

// ---------------------------------------------------------------------------
// Collect.
// ---------------------------------------------------------------------------

export async function collect(
  supabase: MissionClient,
  userId: string,
  kind: BriefKind,
  periodStart: string,
  periodEnd: string,
): Promise<BriefPayload> {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const todayIso = todayInAppTz(new Date(now));

  // Calendar always reaches one day past the period. A daily brief has to be
  // able to warn about tomorrow's unprepared meeting while there is still an
  // evening left to prepare in.
  const calendarFrom = startOfDayUtc(periodStart);
  const calendarTo = endOfDayUtc(addDays(periodEnd, 1));
  const inboxFrom = startOfDayUtc(addDays(todayIso, -INBOX_LOOKBACK_DAYS));
  // Closed work is reported for the window immediately before the period.
  const closedFrom = startOfDayUtc(addDays(periodStart, kind === 'weekly' ? -7 : -1));

  const [
    tasksResult,
    closedResult,
    projectsResult,
    eventsResult,
    inboxResult,
    runsResult,
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id,title,description,status,priority,due_date,domain,category,why,project_id,source,source_url,assignee,external_status,edited_at,updated_at,created_at',
      )
      .eq('user_id', userId)
      .neq('status', 'done')
      .limit(2000),
    supabase
      .from('tasks')
      .select(
        'id,title,description,status,priority,due_date,domain,category,why,project_id,source,source_url,assignee,external_status,edited_at,updated_at,created_at',
      )
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('updated_at', closedFrom)
      .order('updated_at', { ascending: false })
      .limit(300),
    supabase.from('projects').select('id,title,slug,domain,client').eq('user_id', userId).limit(500),
    supabase
      .from('calendar_events')
      .select('id,title,start_at,end_at,domain,is_external,has_prep,location,web_link,attendees')
      .eq('user_id', userId)
      .gte('start_at', calendarFrom)
      .lt('start_at', calendarTo)
      .order('start_at', { ascending: true })
      .limit(500),
    supabase
      .from('inbox_items')
      .select('id,sender,sender_domain,subject,received_at,snippet,needs_reply,replied_at,web_link,domain')
      .eq('user_id', userId)
      .eq('needs_reply', true)
      .is('replied_at', null)
      .gte('received_at', inboxFrom)
      .order('received_at', { ascending: false })
      .limit(200),
    supabase
      .from('sync_runs')
      .select('source,status,started_at,items_seen')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(120),
  ]);

  const openTasks = (tasksResult.data ?? []) as TaskRow[];
  const closedTasks = (closedResult.data ?? []) as TaskRow[];
  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const events = (eventsResult.data ?? []) as CalendarEventRow[];
  const inbox = (inboxResult.data ?? []) as InboxItemRow[];
  const runs = (runsResult.data ?? []) as Array<{
    source: string;
    status: string | null;
    started_at: string | null;
    items_seen: number | null;
  }>;

  const projectById = new Map<string, ProjectRow>();
  for (const p of projects) projectById.set(p.id, p);

  // -- Staleness ------------------------------------------------------------
  const sources: SourceHealth[] = SOURCES.map(({ source, label }) => {
    // Only a run that finished cleanly proves the data is current. A source
    // whose most recent successful run is old is stale even if it has been
    // failing loudly every two hours since.
    const newest = runs.find((r) => r.source === source && r.status === 'ok');
    const anyRun = runs.find((r) => r.source === source);
    const ageHours = hoursSince(newest?.started_at ?? null, now);
    return {
      source,
      label,
      lastRunAt: newest?.started_at ?? null,
      lastStatus: anyRun?.status ?? null,
      itemsSeen: newest?.items_seen ?? null,
      ageHours,
      stale: ageHours === null || ageHours > STALE_AFTER_HOURS,
    };
  });
  const staleSources = sources.filter((s) => s.stale);

  // -- The days -------------------------------------------------------------
  const eventsByDay = new Map<string, CalendarEventRow[]>();
  for (const e of events) {
    if (!e.start_at) continue;
    const day = dayOf(e.start_at);
    const list = eventsByDay.get(day);
    if (list) list.push(e);
    else eventsByDay.set(day, [e]);
  }

  const periodDays: string[] = [];
  for (let d = periodStart; daysBetween(d, periodEnd) >= 0; d = addDays(d, 1)) {
    periodDays.push(d);
    if (periodDays.length > 31) break; // paranoia; a period is a day or a week
  }

  const days = periodDays.map((date) => buildDay(date, eventsByDay.get(date) ?? [], todayIso));
  const tomorrowIso = addDays(todayIso, 1);
  const tomorrow =
    kind === 'daily'
      ? buildDay(tomorrowIso, eventsByDay.get(tomorrowIso) ?? [], todayIso)
      : null;

  // -- Alignment ------------------------------------------------------------
  const alignment = buildAlignment(days);

  // -- Prep warnings --------------------------------------------------------
  // Weekly looks across the whole week; daily looks at today and tomorrow,
  // because that is the horizon on which prep can still happen.
  const prepScope =
    kind === 'weekly' ? days : [...days, ...(tomorrow ? [tomorrow] : [])];
  const prepDayKeys = new Set(prepScope.map((d) => d.date));
  const prepWarnings = events
    .filter((e) => e.is_external === true && e.has_prep !== true)
    .filter((e) => e.start_at !== null && prepDayKeys.has(dayOf(e.start_at)))
    .map((e) => buildPrepWarning(e, inbox, openTasks, projectById, now))
    .sort((a, b) => {
      const at = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });

  // -- Threads --------------------------------------------------------------
  const threads: Thread[] = inbox
    .map((item) => {
      const ageHours = hoursSince(item.received_at, now);
      const matrix = matrixKeyFor(item.domain);
      return {
        id: item.id,
        sender: item.sender ?? item.sender_domain ?? 'Unknown sender',
        senderDomain: item.sender_domain,
        subject: item.subject ?? '(no subject)',
        snippet: item.snippet,
        receivedAt: item.received_at,
        ageHours,
        ageLabel: ageLabelFor(ageHours),
        webLink: item.web_link,
        matrix,
        urgency: threadUrgency(ageHours, matrix),
      };
    })
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 12);

  // -- Tasks ----------------------------------------------------------------
  const tasks = buildTaskSections(
    openTasks,
    closedTasks,
    projectById,
    todayIso,
    periodStart,
    periodEnd,
  );

  const periodLabel =
    kind === 'daily'
      ? dayLabel(periodStart)
      : `${dayLabel(periodStart)} – ${dayLabel(periodEnd)}`;

  return {
    kind,
    periodStart,
    periodEnd,
    periodLabel,
    generatedAt,
    timezone: APP_TIMEZONE,
    sources,
    staleSources,
    alignment,
    prepWarnings,
    days,
    tomorrow,
    threads,
    tasks,
  };
}

// ---------------------------------------------------------------------------
// Day assembly: conflicts, open blocks, leave-by times.
// ---------------------------------------------------------------------------

function buildDay(date: string, rows: CalendarEventRow[], todayIso: string): DayCell {
  const sorted = [...rows].sort((a, b) => {
    const at = a.start_at ? new Date(a.start_at).getTime() : 0;
    const bt = b.start_at ? new Date(b.start_at).getTime() : 0;
    return at - bt;
  });

  const spans = sorted.map((e) => {
    const start = e.start_at ? localMinutes(e.start_at) : null;
    const durationMin = Math.round(hoursBetweenIso(e.start_at, e.end_at) * 60);
    const end = start === null ? null : start + (durationMin > 0 ? durationMin : 30);
    return { start, end };
  });

  const conflictFlags = spans.map((s, i) =>
    spans.some((o, j) => {
      if (i === j) return false;
      if (s.start === null || s.end === null || o.start === null || o.end === null) return false;
      return s.start < o.end && o.start < s.end;
    }),
  );

  const events: DayEvent[] = sorted.map((e, i) => {
    const startMin = spans[i].start;
    const inPerson = isInPerson(e.location);
    return {
      id: e.id,
      title: e.title ?? '(untitled)',
      startAt: e.start_at,
      endAt: e.end_at,
      timeLabel:
        startMin === null
          ? 'all day'
          : e.end_at
            ? `${minutesLabel(startMin)}–${timeLabel(e.end_at)}`
            : minutesLabel(startMin),
      matrix: matrixKeyFor(e.domain),
      isExternal: e.is_external === true,
      hasPrep: e.has_prep === true,
      location: e.location,
      webLink: e.web_link,
      leaveBy:
        inPerson && startMin !== null ? minutesLabel(startMin - LEAVE_BY_MINUTES) : null,
      conflict: conflictFlags[i],
    };
  });

  return {
    date,
    label: dayLabel(date),
    isToday: date === todayIso,
    events,
    conflicts: conflictFlags.filter(Boolean).length,
    openBlocks: openBlocksFor(spans),
    hours: sorted.reduce((sum, e) => sum + hoursBetweenIso(e.start_at, e.end_at), 0),
  };
}

/** Stretches of 2h+ inside 08:00–18:00 with nothing scheduled in them. */
function openBlocksFor(spans: Array<{ start: number | null; end: number | null }>): OpenBlock[] {
  const busy = spans
    .filter((s): s is { start: number; end: number } => s.start !== null && s.end !== null)
    .map((s) => ({ start: Math.max(s.start, WORK_START_MIN), end: Math.min(s.end, WORK_END_MIN) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  // Merge, so back-to-back meetings do not read as a gap between them.
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of busy) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  const blocks: OpenBlock[] = [];
  let cursor = WORK_START_MIN;
  for (const s of merged) {
    if (s.start - cursor >= OPEN_BLOCK_MIN_HOURS * 60) {
      blocks.push({
        startLabel: minutesLabel(cursor),
        endLabel: minutesLabel(s.start),
        hours: Math.round(((s.start - cursor) / 60) * 10) / 10,
      });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (WORK_END_MIN - cursor >= OPEN_BLOCK_MIN_HOURS * 60) {
    blocks.push({
      startLabel: minutesLabel(cursor),
      endLabel: minutesLabel(WORK_END_MIN),
      hours: Math.round(((WORK_END_MIN - cursor) / 60) * 10) / 10,
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Alignment: where the scheduled hours actually went.
// ---------------------------------------------------------------------------

function buildAlignment(days: DayCell[]): Alignment {
  const hours = new Map<MatrixKey, number>();
  const meetings = new Map<MatrixKey, number>();
  for (const key of MATRIX_ORDER) {
    hours.set(key, 0);
    meetings.set(key, 0);
  }

  for (const day of days) {
    for (const e of day.events) {
      const h = hoursBetweenIso(e.startAt, e.endAt);
      hours.set(e.matrix, (hours.get(e.matrix) ?? 0) + h);
      meetings.set(e.matrix, (meetings.get(e.matrix) ?? 0) + 1);
    }
  }

  const totalHours = [...hours.values()].reduce((a, b) => a + b, 0);
  const byMatrix: MatrixHours[] = MATRIX.map((m) => {
    const h = hours.get(m.key) ?? 0;
    return {
      key: m.key,
      label: MATRIX_LABEL[m.key],
      hours: Math.round(h * 10) / 10,
      share: totalHours > 0 ? h / totalHours : 0,
      meetings: meetings.get(m.key) ?? 0,
    };
  });

  // Scheduled time is not the whole of a life — an hour of prayer rarely has a
  // calendar entry. So `absent` is worded as "nothing scheduled", not "nothing
  // happened", and the model is told the same in prompt.ts.
  const ranked = [...byMatrix].sort((a, b) => b.hours - a.hours);
  const winning = totalHours > 0 && ranked[0].hours > 0 ? ranked[0].key : null;
  const impact = byMatrix.find((m) => m.key === 'impact');

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    byMatrix,
    winning,
    absent: byMatrix.filter((m) => m.key !== 'admin' && m.hours === 0).map((m) => m.key),
    impactCrowding: (impact?.share ?? 0) > IMPACT_WARN_SHARE,
  };
}

// ---------------------------------------------------------------------------
// Prep warnings.
// ---------------------------------------------------------------------------

function buildPrepWarning(
  event: CalendarEventRow,
  inbox: InboxItemRow[],
  openTasks: TaskRow[],
  projectById: Map<string, ProjectRow>,
  now: number,
): PrepWarning {
  const titleTokens = tokens(event.title);
  const domains = attendeeDomains(event.attendees);

  const related = inbox
    .map((item) => {
      const senderDomain = (item.sender_domain ?? '').toLowerCase();
      const domainHit = senderDomain !== '' && domains.has(senderDomain);
      const subjectHits = overlaps(titleTokens, tokens(item.subject));
      const score = (domainHit ? 3 : 0) + subjectHits;
      return { item, score };
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => ({
      id: item.id,
      sender: item.sender ?? item.sender_domain ?? 'Unknown sender',
      subject: item.subject ?? '(no subject)',
      receivedAt: item.received_at,
      webLink: item.web_link,
    }));

  const relatedTasks = openTasks
    .map((task) => {
      const project = task.project_id ? projectById.get(task.project_id) : undefined;
      const clientHit =
        project?.client && titleTokens.size > 0
          ? overlaps(titleTokens, tokens(project.client)) > 0
          : false;
      const titleHits = overlaps(titleTokens, tokens(task.title));
      const score = (clientHit ? 3 : 0) + titleHits;
      return { task, score, project };
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ task }) => ({
      id: task.id,
      title: task.title ?? '(untitled)',
      dueDate: task.due_date,
      sourceUrl: task.source_url,
    }));

  return {
    eventId: event.id,
    title: event.title ?? '(untitled)',
    startAt: event.start_at,
    day: event.start_at ? dayOf(event.start_at) : '',
    whenLabel: whenLabel(event.start_at),
    location: event.location,
    webLink: event.web_link,
    attendees: (event.attendees ?? []).slice(0, 8),
    matrix: matrixKeyFor(event.domain),
    hoursAway: event.start_at ? (new Date(event.start_at).getTime() - now) / 3_600_000 : null,
    inbox: related,
    tasks: relatedTasks,
  };
}

// ---------------------------------------------------------------------------
// Threads.
// ---------------------------------------------------------------------------

/**
 * Urgency, not recency.
 *
 * Age dominates — a thread nobody has answered for four days is the problem,
 * not the one that arrived an hour ago. The matrix breaks the ties, so a
 * family message and a vendor message of the same age do not sort by chance.
 */
function threadUrgency(ageHours: number | null, matrix: MatrixKey): number {
  const age = ageHours ?? 0;
  const matrixBonus = (MATRIX_ORDER.length - MATRIX_ORDER.indexOf(matrix)) * 6;
  return age + matrixBonus;
}

// ---------------------------------------------------------------------------
// Tasks.
// ---------------------------------------------------------------------------

function toBriefTask(
  row: TaskRow,
  projectById: Map<string, ProjectRow>,
  todayIso: string,
  now: number,
): BriefTask {
  const project = row.project_id ? projectById.get(row.project_id) : undefined;
  // A synced task inherits its project's domain when it has none of its own —
  // otherwise every unlabelled repo item lands in Admin and the matrix stops
  // describing the week.
  const domain = row.domain ?? project?.domain ?? null;
  const touched = row.edited_at ?? row.updated_at ?? row.created_at;
  const ageHours = hoursSince(touched, now);
  return {
    id: row.id,
    title: row.title ?? '(untitled)',
    matrix: matrixKeyFor(domain),
    dueDate: row.due_date,
    daysUntilDue: row.due_date ? daysBetween(todayIso, row.due_date) : null,
    priority: row.priority,
    project: project?.title ?? project?.slug ?? null,
    client: project?.client ?? null,
    sourceUrl: row.source_url,
    why: row.why,
    ageDays: ageHours === null ? null : Math.floor(ageHours / 24),
  };
}

function sortTasks(a: BriefTask, b: BriefTask): number {
  const m = MATRIX_ORDER.indexOf(a.matrix) - MATRIX_ORDER.indexOf(b.matrix);
  if (m !== 0) return m;
  const ad = a.daysUntilDue ?? 9999;
  const bd = b.daysUntilDue ?? 9999;
  if (ad !== bd) return ad - bd;
  return (a.priority ?? 9) - (b.priority ?? 9);
}

function buildTaskSections(
  openRows: TaskRow[],
  closedRows: TaskRow[],
  projectById: Map<string, ProjectRow>,
  todayIso: string,
  periodStart: string,
  periodEnd: string,
): TaskSections {
  const now = Date.now();
  const open = openRows.map((r) => toBriefTask(r, projectById, todayIso, now));

  const overdueTasks = open
    .filter((t) => t.daysUntilDue !== null && t.daysUntilDue < 0)
    .sort(sortTasks);

  const overdue: TaskGroup[] = MATRIX_ORDER.map((key) => ({
    key,
    label: MATRIX_LABEL[key],
    tasks: overdueTasks.filter((t) => t.matrix === key),
  })).filter((g) => g.tasks.length > 0);

  const dueThisPeriod = open
    .filter(
      (t) =>
        t.dueDate !== null &&
        daysBetween(periodStart, t.dueDate) >= 0 &&
        daysBetween(t.dueDate, periodEnd) >= 0 &&
        (t.daysUntilDue ?? 0) >= 0,
    )
    .sort(sortTasks);

  // Stale: open, untouched for a month, and not already shouting via a due
  // date. A dated task that has gone quiet is overdue, which is a different
  // and louder problem.
  const staleCandidates = open.filter(
    (t) => (t.ageDays ?? 0) >= TASK_STALE_AFTER_DAYS && (t.daysUntilDue ?? 1) >= 0,
  );

  const perProject = new Map<string, number>();
  for (const t of staleCandidates) {
    const key = t.project ?? '—';
    perProject.set(key, (perProject.get(key) ?? 0) + 1);
  }

  const stale: StaleTask[] = staleCandidates
    .map((t) => {
      const siblings = perProject.get(t.project ?? '—') ?? 0;
      let verdict: StaleVerdict = 'schedule';
      let reason = 'Give it a slot this week or it will still be here next month.';
      if ((t.priority ?? 3) >= 3 && t.dueDate === null) {
        verdict = 'kill';
        reason = 'Low priority, no date, untouched a month. Deleting it costs nothing.';
      } else if (siblings >= 3 && t.project) {
        verdict = 'collapse';
        reason = `${siblings} stale items on ${t.project}. Collapse them into one piece of work.`;
      } else if (t.priority === 1 || t.dueDate !== null) {
        verdict = 'schedule';
        reason = 'You called this important and then left it. Book the time or drop the claim.';
      }
      return { ...t, verdict, reason };
    })
    .sort((a, b) => sortTasks(a, b) || (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 15);

  const closed = closedRows
    .map((r) => toBriefTask(r, projectById, todayIso, now))
    .sort(sortTasks);

  return {
    overdue,
    overdueCount: overdueTasks.length,
    dueThisPeriod,
    stale,
    closed,
  };
}
