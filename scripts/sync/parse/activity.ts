/*
 * The bot activity page's rules, as pure functions.
 *
 * Everything that decides what /activity says lives here, and nothing here
 * touches the disk or the database, so every rule is unit-tested against
 * fixtures: which column a note lands in, which tag a waiting item gets, which
 * display name a bot is shown under, and, above all, what is scrubbed before a
 * row leaves the box.
 *
 * THE SCRUB IS THE POINT. The app reads only what the harvester wrote, so this
 * file is the last place an id, an address or a client's words can be stopped.
 * The rules (from the job note, Eric 2026-10-27):
 *   - bot display names only, never an internal id;
 *   - no UUIDs, bc-* ids, herdr pane ids, PIDs, long git shas, message ids,
 *     agent or session ids, email addresses, phone numbers, or URLs other
 *     than a github.com pull request (which travels in pr_url, not the text);
 *   - Honey Lake: "Honey Lake session: <status>" and nothing more;
 *   - dropped topics never appear at all;
 *   - 120 characters at most.
 */

export type Kind = 'waiting' | 'in_progress' | 'finished' | 'event';
export type Tag = 'due_today' | 'yes_no' | 'approve' | 'reply' | 'sign' | 'action';
export type Source = 'channel' | 'loops' | 'runs';

export type ActivityItem = {
  source: Source;
  sourceKey: string;
  bot: string;
  kind: Kind;
  title: string;
  tag: Tag | null;
  project: string | null;
  startedAt: string | null;
  endedAt: string | null;
  dueAt: string | null;
  prUrl: string | null;
  occurredAt: string;
};

export const TITLE_MAX = 120;
export const WINDOW_DAYS = 7;
const TZ = 'America/New_York';

// ─── Dates, all in Eastern time ─────────────────────────────────────────────

/** The ET calendar day of an instant, 'YYYY-MM-DD'. */
export function etDay(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** ET's UTC offset at an instant, e.g. '-04:00'. */
function etOffset(at: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '-05:00';
}

/** A wall-clock time in ET as an ISO instant. */
function etWallClock(day: string, hh: number, mm: number, ss = 0): string | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Two passes: the offset depends on the instant, and the instant on the
  // offset. Noon on the day is always the right side of a DST change.
  const offset = etOffset(new Date(`${day}T12:00:00Z`));
  const d = new Date(`${day}T${pad(hh)}:${pad(mm)}:${pad(ss)}${offset}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/*
 * Every date shape the brain writes, to an ISO instant (or null).
 *
 *   2026-10-27                       -> 9 AM ET that day (a day, not a time)
 *   2026-10-27 6:33 PM ET (by hand)  -> that time in ET
 *   2026-10-27T18:15:16-04:00 / Z    -> as written
 *   2026-10-27T18:15:16-0400         -> offset without a colon
 *   2026-10-27T12-34-01              -> smoke.jsonl's dashes
 *   2026-10-19T19:02:06.50496        -> naive: the box's clock, which is ET
 */
export function parseWhen(raw: unknown, dayOnlyHour = 9): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (m) {
    let h = Number(m[2]) % 12;
    if (m[4].toUpperCase() === 'PM') h += 12;
    return etWallClock(m[1], h, Number(m[3]));
  }
  m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})[:-](\d{2})(?:[:-](\d{2}))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/);
  if (m) {
    if (m[6]) {
      const tz = m[6] === 'Z' ? 'Z' : m[6].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
      const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}${tz}`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return etWallClock(m[1], Number(m[2]), Number(m[3]), Number(m[4] ?? 0));
  }
  m = s.match(/^(\d{4}-\d{2}-\d{2})\b/);
  if (m) return etWallClock(m[1], dayOnlyHour, 0);
  return null;
}

/** The first ET day still inside the window, 'YYYY-MM-DD'. */
export function windowStart(now: Date, days = WINDOW_DAYS): string {
  return etDay(new Date(now.getTime() - (days - 1) * 864e5));
}

// ─── Frontmatter ────────────────────────────────────────────────────────────

export type Frontmatter = Record<string, string>;

/**
 * The `---` block at the top of a channel note, as flat strings. A trailing
 * `# comment` is dropped, as grok-pending.py does. Indented continuation lines
 * and YAML lists are ignored: nothing this page uses is written that way.
 */
export function parseFrontmatter(text: string): { fm: Frontmatter; end: number } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, end: 0 };
  const fm: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).split(' #')[0].trim();
    // First one wins: a note that repeats `status:` is read the way
    // grok-pending.py's set-status rewrites it, top line first.
    if (!(key in fm)) fm[key] = value.replace(/^["']|["']$/g, '');
  }
  return { fm, end: m[0].length };
}

/** The first `# ` heading after the frontmatter, or null. */
export function parseH1(body: string): string | null {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}

/**
 * The `**Options**` list grok-ask writes, labels only. Used to decide the
 * Yes/No tag and NEVER written anywhere: no option text reaches a row.
 */
export function parseOptions(body: string, fm: Frontmatter): string[] {
  if (fm.options) {
    return fm.options
      .replace(/^\[|\]$/g, '')
      .split(/[,|]/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const m = body.match(/\*\*Options\*\*\s*\n+((?:\s*-\s+.+\n?)+)/);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s+/, '').replace(/\s+←\s*recommended\s*$/i, '').trim())
    .filter(Boolean);
}

// ─── Who did it ─────────────────────────────────────────────────────────────

const PROJECTS: Record<string, string> = {
  'mission-control': 'Mission Control',
  businessos: 'BusinessOS',
  sjcos: 'SJCOS',
  eden: 'Eden',
  trellisv2: 'Trellis',
  trellis: 'Trellis',
  fsaos: 'FSAOS',
  reverbos: 'ReverbOS',
  tkos: 'TKOS',
  bibleos: 'BibleOS',
  financeos: 'FinanceOS',
  brain: 'Brain',
  harness: 'Harness',
  'dev-harness': 'Harness',
  integrityitos: 'IntegrityIT OS',
  icsgos: 'ICSG OS',
  impactworksos: 'Impact Works OS',
  csnos: 'CSN OS',
  emafinance: 'EMA Finance',
  fortworth: 'Fort Worth',
  churchsearch: 'Church Search',
  linksy: 'Linksy',
  'hlway-video': 'HL video',
};

const BOTS: Record<string, string> = {
  cos: 'Chief of Staff',
  'chief-of-staff': 'Chief of Staff',
  grokbot: 'Chief of Staff',
  'grok-ask': 'Chief of Staff',
  'grok-inbox': 'Chief of Staff',
  coding: 'Coding',
  inbox: 'Inbox',
  growth: 'Growth',
  jarvis: 'Jarvis',
  muse: 'Muse',
  fourlot: 'Fourlot (Team)',
  '4lot': 'Fourlot (Team)',
  dispatch: 'Dispatch',
  'dispatch-autostart': 'Dispatch',
  'service-desk': 'Service desk',
  'service-desk-run': 'Service desk',
  'notify-quiet': 'Notify quiet',
  'ticket-stale': 'Ticket stale',
  'ci-sweep': 'CI sweep',
  'green-keeper': 'Green keeper',
  'service-desk-digest': 'Service desk',
  'ticket-watch': 'Ticket watch',
  'mail-watch': 'Mail watch',
  'loop-stale': 'Loop stale',
  'daily-brief': 'Daily brief',
  'unifi-watch': 'UniFi watch',
  'self-improve': 'Self improve',
  'doorbell-reconcile': 'Doorbell',
  'grok-doorbell': 'Doorbell',
  ship: 'Ship window',
  'ship-repair': 'Ship window',
  'mission-control-ai-usage': 'AI usage',
  'mc-brief-outbox': 'Brief outbox',
};

const HONEY_LAKE_RE = /honey[\s_-]?lake|honeylakeos|\bhlcos\b|\bhlos\b/i;

export function isHoneyLake(...values: Array<string | null | undefined>): boolean {
  return values.some((v) => typeof v === 'string' && HONEY_LAKE_RE.test(v));
}

/**
 * A display name for whoever wrote or owns a note. "Coding (Grok Bot)" is
 * Coding; a project slug is "<Project> session"; anything else is "Bot".
 */
export function botName(raw: string | null | undefined): string {
  if (!raw) return 'Bot';
  const id = raw.toLowerCase().replace(/\(.*?\)/g, '').trim().split(/[\s,]+/)[0] ?? '';
  if (!id) return 'Bot';
  if (isHoneyLake(id)) return 'Honey Lake session';
  if (BOTS[id]) return BOTS[id];
  if (id.startsWith('coding')) return 'Coding';
  if (PROJECTS[id]) return `${PROJECTS[id]} session`;
  // A project's own lane or job ("businessos-lane2") is still that project.
  const prefix = Object.keys(PROJECTS).find((p) => id.startsWith(`${p}-`));
  if (prefix) return `${PROJECTS[prefix]} session`;
  return 'Bot';
}

/** A project slug to its display name, or null when it is not one we know. */
export function projectName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.toLowerCase().trim();
  if (isHoneyLake(id)) return 'Honey Lake';
  return PROJECTS[id] ?? null;
}

// ─── The scrub ──────────────────────────────────────────────────────────────

const SCRUBS: Array<[RegExp, string]> = [
  // URLs first, so the parts below do not half-match inside one.
  [/\bhttps?:\/\/\S+/gi, ''],
  [/\bwww\.\S+/gi, ''],
  // <message-id@host> and bare internetMessageId-ish tokens.
  [/<[^<>\s]+@[^<>\s]+>/g, ''],
  // Any token with an @ in it: a whole address, or one the source already
  // cut short ("from jgoldenberg@gmail" with no TLD), or a handle.
  [/[^\s()<>"',;]*@[^\s()<>"',;]*/g, ''],
  // Graph message ids (AAMk..., AQMk...), long base64-ish tokens.
  [/\bA[AQ]Mk[A-Za-z0-9+/=_-]{10,}/g, ''],
  [/\b(?=[\w+/-]*[A-Z])(?=[\w+/-]*[a-z])(?=[\w+/-]*\d)[\w+/-]{32,}={0,2}/g, ''],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ''],
  // Service-desk ids, herdr panes, agent/session/tool ids.
  [/\bbc-[A-Za-z0-9-]+/gi, ''],
  [/\bsd[- ][0-9a-f]{6,}\b/gi, 'ticket'],
  [/\b(?:herdr|pane)[\s:#_-]*[%\w-]*\d[\w-]*/gi, ''],
  [/%\d+\b/g, ''],
  [/\b(?:agent|session|toolu|msg|req|run|wf)_[A-Za-z0-9]{4,}/gi, ''],
  [/\bpid[\s:=#]*\d+/gi, ''],
  // Git shas longer than 7: keep nothing (a 7-char sha is allowed through).
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,40}\b/gi, ''],
  // Phone numbers: 904-483-6881, (904) 483 6881, +1 904.483.6881.
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, ''],
];

/** Strip every id, address and link, collapse whitespace, cut to 120. */
export function scrub(text: string | null | undefined, max = TITLE_MAX): string {
  if (!text) return '';
  let s = String(text);
  for (const [re, to] of SCRUBS) s = s.replace(re, to);
  s = s
    .replace(/[`*_]{1,3}/g, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:—–-]+|[\s,;:—–-]+$/g, '')
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

/** A github.com pull request URL, or null. Nothing else is ever kept. */
export function prUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/);
  return m ? m[0] : null;
}

// ─── Topics Eric dropped. Never shown, whatever their status. ───────────────

const DROPPED: RegExp[] = [
  /trellis.*\b(backups?|rd|r&d|research)\b/i,
  /\b(backups?|rd|r&d)\b.*trellis/i,
  /\bmuse\b.*\btoken\b|\btoken\b.*\bmuse\b/i,
  /\boption[\s-]*d\b/i,
  /impact[\s-]*(works|clay).*\bdemo\b/i,
  /honey[\s-]*lake.*\bmonday\b|\bmonday\b.*\bboards?\b/i,
];

export function isDropped(...values: Array<string | null | undefined>): boolean {
  const text = values.filter(Boolean).join(' ').replace(/[-_]/g, ' ');
  return DROPPED.some((re) => re.test(text));
}

// ─── Tags for "Waiting on Eric" ─────────────────────────────────────────────

export type TagInput = {
  dueAt: string | null;
  today: string;
  kind?: string | null;
  result?: string | null;
  text: string;
  options?: string[];
};

const APPROVE_RE = /\b(merge|merging|deploy\w*|approv\w*|go[\s-]?live|ship\w*|release)\b/i;
const SIGN_RE = /\b(e-?sign\w*|signature|docusign|sign)\b(?![\s-]?off)/i;

/**
 * The tag on a waiting item. Order matters and is the job note's:
 * Due today, Yes/No, Approve, Sign, Reply, Action.
 */
export function tagFor(input: TagInput): Tag {
  if (input.dueAt && etDay(input.dueAt) === input.today) return 'due_today';
  const opts = (input.options ?? []).map((o) => o.toLowerCase().replace(/[^a-z]/g, ''));
  if (opts.length === 2 && opts.includes('yes') && opts.includes('no')) return 'yes_no';
  const kind = (input.kind ?? '').toLowerCase();
  const text = `${kind} ${input.text}`;
  if (APPROVE_RE.test(text)) return 'approve';
  if (SIGN_RE.test(text)) return 'sign';
  if (['question', 'ask-eric', 'decision'].includes(kind) || (input.result ?? '').toLowerCase() === 'needs-eric') {
    return 'reply';
  }
  return 'action';
}

// ─── Channel notes → items ──────────────────────────────────────────────────

export type ChannelNote = {
  /** `from-grokbot/<file>.md` or `to-grokbot/<file>.md`. */
  path: string;
  fm: Frontmatter;
  /** Read only when the note is not Honey Lake. */
  h1: string | null;
  options: string[];
  /** When it arrived: first commit, else mtime. ISO. */
  addedAt: string;
  /** When it last changed. ISO. */
  modifiedAt: string;
};

// Not waiting on anyone any more (Eric, 6:57 PM 2026-10-27: done, acked,
// superseded, cancelled). `failed` and `closed` are finished too.
const DONE = new Set(['done', 'closed', 'superseded', 'failed', 'acked', 'cancelled', 'canceled', 'answered']);
const ANSWER_SUFFIX = /-(done|reply|answer|answered|ack|acked)$/;
// The job note's rule: running or queued is In progress. A note that is
// held, blocked or waiting on someone is neither, and is not shown as work.
const RUNNING = new Set(['running', 'in-progress', 'taken', 'started']);
const QUEUED = new Set(['queued', 'open', 'new']);

function slugOf(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

/** Does this note wait on Eric, by its frontmatter alone? */
export function asksEric(fm: Frontmatter): boolean {
  const kind = (fm.kind ?? '').toLowerCase();
  return (
    (fm.result ?? '').toLowerCase() === 'needs-eric' ||
    ['question', 'ask-eric', 'decision'].includes(kind) ||
    /\beric\b/i.test(fm.waiting ?? '') ||
    /\beric\b/i.test(fm.needs ?? '')
  );
}

/**
 * Every row a set of channel notes produces.
 *
 *   - every note in the window: one timeline event when it arrived;
 *   - a from-grokbot job running or queued: In progress;
 *   - a from-grokbot job done in the window: Finished, with the PR from
 *     itself or from the -done note that answers it;
 *   - any note that asks Eric, is not closed, and has no `re:` answer yet:
 *     Waiting on Eric, whatever its age (it is still waiting).
 */
export function channelItems(notes: ChannelNote[], now: Date): ActivityItem[] {
  const today = etDay(now);
  const from = windowStart(now);
  const items: ActivityItem[] = [];

  // Which notes something has answered, and the PR a reply carries.
  const answered = new Set<string>();
  const replyPr = new Map<string, string>();
  const replyAt = new Map<string, string>();
  for (const n of notes) {
    // A `<slug>-done.md` / `-reply.md` / `-answer.md` beside a note answers it
    // even when its `re:` is missing or points somewhere else.
    const base = slugOf(n.path);
    const m = base.match(ANSWER_SUFFIX);
    if (m) {
      const stem = base.slice(0, -m[0].length);
      answered.add(`from-grokbot/${stem}.md`);
      answered.add(`to-grokbot/${stem}.md`);
    }
    const re = (n.fm.re ?? '').replace(/^channel\//, '').trim();
    if (!re) continue;
    answered.add(re);
    const pr = prUrl(n.fm.pr);
    if (pr) replyPr.set(re, pr);
    replyAt.set(re, n.addedAt);
  }

  for (const n of notes) {
    const fm = n.fm;
    const slug = slugOf(n.path);
    const outbound = n.path.startsWith('from-grokbot/');
    const status = (fm.status ?? 'open').toLowerCase();
    const hl = isHoneyLake(fm.project, fm.for, fm.client, fm.from, slug);
    if (isDropped(slug, hl ? null : n.h1, fm.project, fm.client)) continue;

    const project = projectName(fm.project ?? (outbound ? fm.for : null));
    const statusWord = status.replace(/-/g, ' ');
    const title = hl
      ? `Honey Lake session: ${statusWord}`
      : scrub(n.h1 ?? slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' '));
    if (!title) continue;

    const writer = outbound ? botName(fm.from ?? 'cos') : botName(fm.from ?? fm.project);
    const owner = hl
      ? 'Honey Lake session'
      : /fourlot/i.test(fm.runner ?? '')
        ? 'Fourlot (Team)'
        : botName(outbound ? fm.for : fm.from ?? fm.project);
    const inWindow = etDay(n.addedAt) >= from;
    // Hashed: a filename can carry a ticket id or a name, and the key is
    // stored like any other column.
    const key = `channel:${n.path.startsWith('from-') ? 'from' : 'to'}:${hashText(n.path)}`;

    if (inWindow) {
      const verb = outbound
        ? fm.kind === 'handoff' || fm.kind === 'job' || fm.kind === 'task'
          ? `Handed to ${owner}`
          : 'Posted'
        : (fm.result ?? '').toLowerCase() === 'done' || fm.kind === 'completion' || fm.kind === 'done'
          ? 'Reported done'
          : (fm.result ?? '').toLowerCase() === 'failed'
            ? 'Reported failed'
            : asksEric(fm)
              ? 'Asked Eric'
              : 'Reported';
      items.push({
        source: 'channel',
        sourceKey: `${key}:event`,
        bot: writer,
        kind: 'event',
        title: hl ? title : scrub(`${verb}: ${title}`),
        tag: null,
        project,
        startedAt: null,
        endedAt: null,
        dueAt: null,
        prUrl: null,
        occurredAt: n.addedAt,
      });
    }

    const rel = n.path;
    if (asksEric(fm) && !DONE.has(status) && !answered.has(rel)) {
      const dueAt = parseWhen(fm.due, 23);
      items.push({
        source: 'channel',
        sourceKey: `${key}:waiting`,
        bot: hl ? 'Honey Lake session' : writer,
        kind: 'waiting',
        title: hl ? 'Honey Lake: item waiting' : title,
        tag: tagFor({
          dueAt,
          today,
          kind: fm.kind,
          result: fm.result,
          text: hl ? '' : title,
          options: hl ? [] : n.options,
        }),
        project,
        startedAt: null,
        endedAt: null,
        dueAt,
        prUrl: null,
        occurredAt: n.addedAt,
      });
      continue;
    }

    if (!outbound || !inWindow) continue;
    const startedAt = parseWhen(fm.started) ?? n.addedAt;
    if (RUNNING.has(status) || QUEUED.has(status)) {
      items.push({
        source: 'channel',
        sourceKey: `${key}:work`,
        bot: owner,
        kind: 'in_progress',
        title: hl ? `Honey Lake session: ${statusWord}` : title,
        tag: null,
        project,
        startedAt: RUNNING.has(status) ? startedAt : null,
        endedAt: null,
        dueAt: parseWhen(fm.due, 23),
        prUrl: null,
        occurredAt: startedAt,
      });
    } else if (status === 'done') {
      const endedAt = replyAt.get(rel) ?? n.modifiedAt;
      items.push({
        source: 'channel',
        sourceKey: `${key}:work`,
        bot: owner,
        kind: 'finished',
        title,
        tag: null,
        project,
        startedAt,
        endedAt,
        dueAt: null,
        prUrl: hl ? null : (prUrl(fm.pr) ?? replyPr.get(rel) ?? null),
        occurredAt: endedAt,
      });
    }
  }
  return items;
}

// ─── The open-loops ledger → items ──────────────────────────────────────────

export type LoopRow = {
  /**
   * hashText(first_seen|source|client|ref), computed by the reader so the ref
   * (a message id) itself never reaches this module. Matches a row in
   * open/triage-closed.tsv.
   */
  key?: string;
  first_seen?: string;
  touched?: string;
  source?: string;
  client?: string;
  owes?: string;
  note?: string;
  needs_eric?: string | boolean;
};
export type ClosedLoop = { closed?: string; client?: string; owed?: string; how?: string };

function loopBot(source: string | undefined): string {
  const s = (source ?? '').toLowerCase();
  if (s === 'email' || s === 'mail' || s === 'inbox') return 'Inbox';
  if (s === 'ticket') return 'Service desk';
  return 'Chief of Staff';
}

function clientLabel(client: string | undefined): string {
  const c = (client ?? '').trim();
  if (!c || c === 'fleet') return '';
  return projectName(c) ?? scrub(c.replace(/[-_]/g, ' '), 30);
}

/**
 * Loops Eric owes become Waiting rows; loops closed in the window become
 * timeline events. Client name and a short "what" only; `ref` (a message id)
 * is never read.
 */
/** The match key for a loop row, open or closed. */
export function loopKey(firstSeen: string, source: string, client: string, ref: string): string {
  return hashText([firstSeen, source, client, ref].map((v) => v.trim().toLowerCase()).join('|'));
}

/**
 * The open-loops ledger's needs-Eric rows, minus any loop that also appears
 * in open/triage-closed.tsv (`closedKeys`): the ledger can carry a row that
 * was closed but not removed, and that is not waiting on anyone.
 */
export function loopItems(
  needsEric: LoopRow[],
  closed: ClosedLoop[],
  now: Date,
  closedKeys: Set<string> = new Set(),
): ActivityItem[] {
  const today = etDay(now);
  const from = windowStart(now);
  const items: ActivityItem[] = [];
  const seen = new Map<string, number>();
  const keyFor = (base: string) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}~${n}`;
  };

  for (const row of needsEric) {
    if (row.key && closedKeys.has(row.key)) continue;
    const hl = isHoneyLake(row.client, row.note);
    if (isDropped(row.client, row.note)) continue;
    const label = clientLabel(row.client);
    // An email subject is shown only if it passes the leak test as written.
    // One that carries an address, link, phone or id is not scrubbed into
    // something half-legible: it becomes a generic line.
    const raw = label ? `${label}: ${row.note ?? ''}` : (row.note ?? '');
    const isMail = /^(email|mail|inbox)$/i.test(row.source ?? '');
    const what = hl
      ? 'Honey Lake: item waiting'
      : textLeaks(raw).length
        ? `${label || 'Inbox'}: ${isMail ? 'an email waits on your reply' : 'an item waits on you'}`
        : scrub(raw);
    if (!what) continue;
    const occurredAt = parseWhen(row.first_seen) ?? now.toISOString();
    items.push({
      source: 'loops',
      sourceKey: keyFor(`loops:${row.first_seen ?? ''}:${row.client ?? ''}:${hashText(row.note ?? '')}`),
      bot: hl ? 'Honey Lake session' : loopBot(row.source),
      kind: 'waiting',
      title: what,
      tag: tagFor({ dueAt: null, today, text: hl ? '' : what }),
      project: projectName(row.client),
      startedAt: null,
      endedAt: null,
      dueAt: null,
      prUrl: null,
      occurredAt,
    });
  }

  for (const row of closed) {
    if (!row.closed || row.closed < from) continue;
    const hl = isHoneyLake(row.client, row.how);
    if (isDropped(row.client, row.how)) continue;
    const label = clientLabel(row.client);
    const title = hl ? 'Honey Lake session: loop closed' : scrub(`Closed a loop${label ? ` for ${label}` : ''}: ${row.how ?? ''}`);
    items.push({
      source: 'loops',
      sourceKey: keyFor(`loops:closed:${row.closed}:${row.client ?? ''}:${hashText(row.how ?? '')}`),
      bot: 'Chief of Staff',
      kind: 'event',
      title,
      tag: null,
      project: projectName(row.client),
      startedAt: null,
      endedAt: null,
      dueAt: null,
      prUrl: null,
      // A day, not a time: the ledger records dates. Evening, so it sorts
      // after the day's timed events rather than before them.
      occurredAt: parseWhen(row.closed, 20) ?? now.toISOString(),
    });
  }
  return items;
}

/** A short stable hash, so a key never carries the text it was built from. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ─── runs/*.jsonl → items ───────────────────────────────────────────────────

/*
 * The job logs worth a line on the timeline, and their readable names. A log
 * not listed here is not read: several carry recipients, subjects, commands
 * or SQL (alert-sends, client-drafts, elicit-decisions, ship-overrides,
 * sd-notices), and a reader that started from "everything" would one day
 * forward one of them.
 */
export const RUN_LOGS: Record<string, string> = {
  'dispatch-autostart': 'Dispatch',
  'dispatch-routing': 'Dispatch',
  'ci-sweep': 'CI sweep',
  'green-keeper': 'Green keeper',
  'sd-dispatch': 'Service desk',
  'ticket-watch': 'Ticket watch',
  'mail-watch': 'Mail watch',
  'notify-reconcile': 'Notify reconcile',
  'notify-quiet': 'Notify quiet',
  verify: 'Verify',
  'worktree-self-reap': 'Worktree reaper',
  smoke: 'Smoke tests',
  'mc-brief-outbox': 'Brief outbox',
  'template-rollout': 'Template rollout',
  'code-health': 'Code health',
  'nightly-bugs': 'Nightly bugs',
  'loop-audit': 'Loop audit',
  'fleet-schema-drift': 'Schema drift',
  'disk-reap': 'Disk reaper',
  retries: 'Retries',
  'site-health': 'Site health',
  ship: 'Ship window',
};

/** One log line, cut down to the fields this page may use. */
export type RunLine = {
  at: string | null;
  ok: boolean | null;
  action: string | null;
  label: string | null;
  note: string | null;
};

/**
 * Keep `at`, `ok`, `action` (or an enum-like `event`), `label` and `note`.
 * `detail`, `reason`, `subject`, `to`, `command` and every other free-text
 * field are dropped here, before anything else sees them.
 */
export function pickRunFields(raw: Record<string, unknown>): RunLine {
  const enumish = (v: unknown) => (typeof v === 'string' && /^[a-z][a-z0-9_-]{0,30}$/i.test(v) ? v : null);
  const ok = raw.ok === true || raw.ok === 'True' || raw.ok === 'true'
    ? true
    : raw.ok === false || raw.ok === 'False' || raw.ok === 'false'
      ? false
      : null;
  const note = typeof raw.note === 'string' && /^channel\/(from|to)-grokbot\/[\w.-]+\.md$/.test(raw.note) ? raw.note : null;
  return {
    at: parseWhen(raw.at ?? raw.ts),
    ok,
    action: enumish(raw.action) ?? enumish(raw.event),
    label: enumish(raw.label),
    note,
  };
}

// Routing and advancing are bookkeeping around a start; the note's own
// arrival is already on the timeline. These are the lines that say something.
const DISPATCH_VERBS: Record<string, string> = {
  prompt: 'Started',
  close: 'Closed',
  blocker: 'Flagged a blocker on',
  escalate: 'Escalated',
  'give-up': 'Gave up on',
};

const FAILED_ACTION = /^(error|fail|failed|escalat\w*)$/i;

/**
 * Dispatch lines naming a note become their own events, titled from the
 * note (looked up, then scrubbed). Every other log becomes one line per job
 * per ET day: "ran 12 times, 1 failed".
 */
export function runItems(
  logs: Array<{ job: string; lines: RunLine[] }>,
  titleOf: (notePath: string) => { title: string | null; honeyLake: boolean; dropped: boolean },
  now: Date,
): ActivityItem[] {
  const from = windowStart(now);
  const items: ActivityItem[] = [];

  for (const { job, lines } of logs) {
    const name = RUN_LOGS[job];
    if (!name) continue;
    const perDay = new Map<string, { runs: number; failed: number; last: string }>();

    for (const line of lines) {
      if (!line.at || etDay(line.at) < from) continue;
      const day = etDay(line.at);

      if (job.startsWith('dispatch-')) {
        const verb = line.action ? DISPATCH_VERBS[line.action] : undefined;
        if (!verb || !line.note) continue;
        const t = titleOf(line.note);
        if (t.dropped) continue;
        const who = line.label ? botName(line.label) : null;
        const what = t.honeyLake ? 'Honey Lake session' : (t.title ?? 'a job');
        const tail = line.action === 'prompt' && who && !t.honeyLake ? ` (${who})` : '';
        items.push({
          source: 'runs',
          sourceKey: `runs:${job}:${line.at}:${line.action}:${hashText(line.note)}`,
          bot: name,
          kind: 'event',
          title: scrub(`${verb} ${what}${tail}`),
          tag: null,
          project: t.honeyLake ? 'Honey Lake' : projectName(line.label),
          startedAt: null,
          endedAt: null,
          dueAt: null,
          prUrl: null,
          occurredAt: line.at,
        });
        continue;
      }

      const d = perDay.get(day) ?? { runs: 0, failed: 0, last: line.at };
      d.runs += 1;
      if (line.ok === false || (line.action && FAILED_ACTION.test(line.action))) d.failed += 1;
      if (line.at > d.last) d.last = line.at;
      perDay.set(day, d);
    }

    for (const [day, d] of perDay) {
      items.push({
        source: 'runs',
        sourceKey: `runs:${job}:${day}`,
        bot: name,
        kind: 'event',
        title: `Ran ${d.runs} time${d.runs === 1 ? '' : 's'}${d.failed ? `, ${d.failed} failed` : ''}`,
        tag: null,
        project: null,
        startedAt: null,
        endedAt: null,
        dueAt: null,
        prUrl: null,
        occurredAt: d.last,
      });
    }
  }

  // Dispatch writes several lines for one decision a minute apart; one row
  // per key is the reconcile's contract, so keep the last.
  const byKey = new Map<string, ActivityItem>();
  for (const i of items) byKey.set(i.sourceKey, i);
  return [...byKey.values()];
}

// ─── The last gate ──────────────────────────────────────────────────────────

const LEAKS: Array<[string, RegExp]> = [
  ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['email', /@/],
  ['bc-id', /\bbc-[A-Za-z0-9]/i],
  ['url', /https?:\/\//i],
  ['phone', /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/],
];

/**
 * What would leak if this item were written, or [] if nothing. The harvester
 * drops any item this flags rather than writing it, and says so.
 */
export function leaksIn(item: ActivityItem): string[] {
  return textLeaks([item.bot, item.title, item.project ?? ''].join(' '));
}

/** The leak test on a piece of text: which patterns it trips, or []. */
export function textLeaks(text: string): string[] {
  return LEAKS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/**
 * Every generic Honey Lake waiting row, as ONE line with a count. Each row
 * already says nothing but "item waiting"; forty of them say it forty times.
 * The collapsed row keeps the oldest date, so it sorts where the oldest would.
 */
export function collapseHoneyLake(items: ActivityItem[]): ActivityItem[] {
  const hl = items.filter((i) => i.kind === 'waiting' && i.bot === 'Honey Lake session');
  if (hl.length === 0) return items;
  const rest = items.filter((i) => !(i.kind === 'waiting' && i.bot === 'Honey Lake session'));
  const oldest = hl.reduce((a, b) => (a.occurredAt <= b.occurredAt ? a : b));
  return [
    ...rest,
    {
      ...oldest,
      sourceKey: 'honeylake:waiting',
      title: `Honey Lake: ${hl.length} item${hl.length === 1 ? '' : 's'} waiting`,
      tag: hl.some((i) => i.tag === 'due_today') ? 'due_today' : 'action',
      dueAt: null,
    },
  ];
}
