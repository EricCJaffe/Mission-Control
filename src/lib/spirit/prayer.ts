/**
 * Prayer list rotation and shaping.
 *
 * The problem this solves is the one that kills paper prayer journals: Eric's
 * 2025 list runs to roughly 120 named people and causes across ten categories.
 * Nobody prays through 120 items daily, so in practice you pray the first page
 * and the rest quietly rot. PrayerMate's central idea — and the reason it is
 * the app people with long lists actually stay with — is that you see a small
 * rotating subset each day and the rotation guarantees nothing is dropped.
 *
 * So the ordering rule is least-recently-prayed first, with urgent items
 * jumping the queue. Not random: random sampling leaves gaps you cannot see,
 * and the whole value of the rotation is being able to trust it.
 */

export type PrayerRequest = {
  id: string;
  subject_id: string | null;
  body: string;
  mode: PrayerMode | null;
  status: PrayerStatus;
  urgent: boolean;
  last_prayed_at: string | null;
  prayed_count: number;
  answered_at?: string | null;
  answer_note?: string | null;
  cadence?: PrayerCadence;
  cadence_anchor?: string | null;
  due_date?: string | null;
};

/**
 * How often a request should come round.
 *
 * daily / weekly / monthly match the calendar's vocabulary so the two
 * schedulers cannot disagree about what "weekly" means. 'once' is a one-off
 * petition with a date. 'rotation' is the default and means no fixed schedule:
 * surfaced least-recently-prayed first, which is right for the long tail of a
 * list this size — you want to reach the school board eventually, not on a
 * particular Tuesday.
 */
export type PrayerCadence = 'daily' | 'weekly' | 'monthly' | 'once' | 'rotation';

export const CADENCES: Array<{ key: PrayerCadence; label: string; hint: string }> = [
  { key: 'once', label: 'Once', hint: 'No repeat — shows until you have prayed it once, then it is done' },
  { key: 'daily', label: 'Daily', hint: 'Comes back every day until answered' },
  { key: 'weekly', label: 'Weekly', hint: 'Comes back every 7 days' },
  { key: 'monthly', label: 'Monthly', hint: 'Comes back every month' },
  { key: 'rotation', label: 'Rotation', hint: 'No fixed schedule — cycles round with the rest of the list' },
];

/** New prayers do not repeat unless you say so. */
export const DEFAULT_CADENCE: PrayerCadence = 'once';

const CADENCE_DAYS: Partial<Record<PrayerCadence, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export type PrayerMode =
  | 'praise'
  | 'submission'
  | 'provision'
  | 'repentance'
  | 'protection'
  | 'kingdom';

export type PrayerStatus = 'open' | 'waiting' | 'answered' | 'closed';

/**
 * The Lord's Prayer as a framework, in the order Eric's journal walks it.
 *
 * His note is that Jesus "laid out more of a framework and set of principles
 * than a set of rules that must be perfectly followed", which is why nothing
 * in the module requires a mode or enforces this sequence — it is offered as a
 * path through a session, not a checklist.
 */
export const PRAYER_MODES: Array<{
  key: PrayerMode;
  label: string;
  anchor: string;
  prompt: string;
}> = [
  {
    key: 'praise',
    label: 'Praise',
    anchor: 'Our Father in heaven, hallowed be Your name',
    prompt: 'Who He is and what He has done. Adoration and awe before anything is asked.',
  },
  {
    key: 'submission',
    label: 'Submission',
    anchor: 'Your will be done',
    prompt: 'Not about me, but about Him. Surrender to His purposes for this season.',
  },
  {
    key: 'provision',
    label: 'Provision',
    anchor: 'Give us this day our daily bread',
    prompt: 'Necessities, not luxuries. Stewardship of what has already been entrusted.',
  },
  {
    key: 'repentance',
    label: 'Repentance',
    anchor: 'Forgive us our debts, as we forgive our debtors',
    prompt: 'Personal repentance and relational wholeness. Forgiveness, and an end to bitterness.',
  },
  {
    key: 'protection',
    label: 'Protection',
    anchor: 'Do not lead us into temptation, but deliver us from evil',
    prompt: 'Deliverance from evil within and without. Intercession against what afflicts others.',
  },
  {
    key: 'kingdom',
    label: 'Kingdom focus',
    anchor: 'For Yours is the kingdom and the power and the glory forever',
    prompt: 'Remembering who wins. Honouring the King rather than ending on our own needs.',
  },
];

/**
 * A heading in the list — "Family", "Missions", "Government & Authority".
 *
 * These used to be a CHECK constraint, which made them unchangeable without a
 * migration. They are now rows the user owns, so the app has to treat any key
 * it is handed as legitimate rather than validating against a constant.
 */
export type PrayerCategory = {
  id: string;
  key: string;
  label: string;
  position: number;
  archived: boolean;
};

/**
 * The ten headings from Eric's 2025 journal, in the order he wrote them.
 *
 * Still the starting taxonomy for a new list and the fallback when the
 * categories table has not been seeded yet — but a starting point now, not a
 * fixed set.
 */
export const DEFAULT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'family', label: 'Family' },
  { key: 'friends', label: 'Friends' },
  { key: 'church', label: 'The Church' },
  { key: 'missions', label: 'Missions' },
  { key: 'government', label: 'Government & Authority' },
  { key: 'world', label: 'World Issues' },
  { key: 'work', label: 'Work & Business' },
  { key: 'finances', label: 'Finances' },
  { key: 'self', label: 'Spirit, Soul & Body' },
  { key: 'other', label: 'Other' },
];

/** Fallback labels for the defaults, used where no category rows are loaded. */
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.key, c.label])
);

/**
 * Builds the stable slug stored on every subject from a typed-in label.
 *
 * The slug is what 120 subject rows point at, so it is generated once at
 * creation and never regenerated on rename — renaming "Friends" to "Friends &
 * Neighbours" must not silently detach everyone filed under it.
 */
export function slugifyCategory(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'category';
}

/** Ensures a generated slug does not collide with one already in use. */
export function uniqueCategoryKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugifyCategory(label);
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Math.abs(hashString(base))}`;
}

/** Small deterministic hash, only used as a last-resort slug suffix. */
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

/** Labels for whatever categories the user actually has, defaults filled in. */
export function categoryLabels(categories: PrayerCategory[]): Record<string, string> {
  const map: Record<string, string> = { ...CATEGORY_LABELS };
  for (const c of categories) map[c.key] = c.label;
  return map;
}

/** How many rotation items top up a day's list once scheduled ones are in. */
export const DAILY_ROTATION_SIZE = 12;

function ageInDays(iso: string | null, now: Date): number {
  // Never prayed sorts oldest — that is the whole point of the rotation.
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * The calendar day in the viewer's own timezone.
 *
 * toISOString() gives the UTC day, and that is what "prayed today" was
 * comparing against. East of UTC-0 the two diverge every evening: praying at
 * 4pm in Jacksonville is 20:00 UTC the same day, but by 8pm local it is
 * already tomorrow in UTC — so the morning's prayers stopped counting as
 * today's and the whole list came back. A prayer list has to agree with the
 * day the person is actually living in.
 */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days between two instants, in local time. */
export function calendarDaysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Is this request due today?
 *
 * Scheduled cadences count from when it was last prayed rather than from a
 * fixed calendar grid, unless an anchor pins them. That is deliberate: missing
 * a Tuesday should not mean waiting until the next Tuesday, and a prayer list
 * that accrues a backlog of "overdue" items is one you stop opening.
 */
export function isDueToday(r: PrayerRequest, now: Date = new Date()): boolean {
  if (r.status !== 'open' && r.status !== 'waiting') return false;
  const cadence = r.cadence ?? 'rotation';
  if (cadence === 'rotation') return false;

  if (cadence === 'once') {
    if (r.last_prayed_at) return false;
    return !r.due_date || r.due_date <= localDay(now);
  }

  const interval = CADENCE_DAYS[cadence];
  if (!interval) return false;

  if (!r.last_prayed_at) return true;

  // Calendar days, not elapsed hours: something prayed at 9am yesterday is due
  // again this morning, even though only 22 hours have passed.
  const daysSince = calendarDaysBetween(r.last_prayed_at, now);
  if (!r.cadence_anchor) return daysSince >= interval;

  if (r.cadence_anchor) {
    const anchor = new Date(`${r.cadence_anchor}T00:00:00Z`);
    const elapsed = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
    if (elapsed < 0) return false;
    const onGrid =
      cadence === 'monthly'
        ? anchor.getUTCDate() === now.getUTCDate()
        : elapsed % interval === 0;
    // Still show it if it was missed, rather than hiding it until the grid
    // comes back round.
    return onGrid || daysSince >= interval;
  }

  return daysSince >= interval;
}

export type TodaysList = {
  /** Due because of their cadence. */
  scheduled: PrayerRequest[];
  /** Topping up from the unscheduled long tail. */
  rotation: PrayerRequest[];
  /** Already prayed today — kept in the list, shown as done. */
  done: PrayerRequest[];
  /** True once nothing is left outstanding. */
  complete: boolean;
};

function prayedToday(r: PrayerRequest, now: Date): boolean {
  if (!r.last_prayed_at) return false;
  return localDay(new Date(r.last_prayed_at)) === localDay(now);
}

/**
 * Builds today's list: everything genuinely due, then rotation items to fill.
 *
 * The subtlety is that the list has to DRAIN. Naively taking the top N
 * least-recently-prayed each time produces a treadmill — pray one, it drops
 * out, the next-oldest is promoted into the free slot, and the list is
 * perpetually full no matter how many you get through. That is not a prayer
 * list, it is a hydra, and it makes finishing impossible.
 *
 * So the day's slate is fixed at N: anything already prayed today occupies a
 * slot and is shown as done, and only the remainder is filled from the pool.
 * Praying one converts an outstanding slot into a completed one instead of
 * summoning a replacement, and the list reaches zero outstanding.
 *
 * This stays stateless — no stored slate to go out of sync — because the items
 * prayed today are exactly the ones that left the pool, so the remainder is
 * the same set it was before, minus the one just prayed.
 */
export function selectTodaysList(
  requests: PrayerRequest[],
  opts: { size?: number; now?: Date } = {}
): TodaysList {
  const size = opts.size ?? DAILY_ROTATION_SIZE;
  const now = opts.now ?? new Date();

  const active = requests.filter((r) => r.status === 'open' || r.status === 'waiting');
  const done = active.filter((r) => prayedToday(r, now));
  const doneIds = new Set(done.map((r) => r.id));

  const outstanding = active.filter((r) => !doneIds.has(r.id));
  const scheduled = outstanding.filter((r) => isDueToday(r, now));
  const scheduledIds = new Set(scheduled.map((r) => r.id));

  const pool = outstanding.filter(
    (r) => !scheduledIds.has(r.id) && (r.cadence ?? 'rotation') === 'rotation'
  );

  // Slots already spent: everything prayed today, plus everything scheduled.
  // Scheduled items are never truncated — asking for something daily and
  // having it silently dropped would make the schedule a suggestion.
  const slots = Math.max(0, size - done.length - scheduled.length);

  const rotation = sortByPriority(pool, now).slice(0, slots);

  return {
    scheduled: sortByPriority(scheduled, now),
    rotation,
    done: sortByPriority(done, now),
    complete: scheduled.length === 0 && rotation.length === 0,
  };
}

function sortByPriority(list: PrayerRequest[], now: Date): PrayerRequest[] {
  return [...list].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

    const ageA = ageInDays(a.last_prayed_at, now);
    const ageB = ageInDays(b.last_prayed_at, now);
    // Two never-prayed requests are both Infinity, and Infinity - Infinity is
    // NaN — which a comparator reads as "equal" only if you remember to check.
    // Compare first, subtract second, so the later tiebreakers are still
    // reached instead of the sort silently giving up here.
    if (ageA !== ageB) return ageB - ageA;

    if (a.prayed_count !== b.prayed_count) return a.prayed_count - b.prayed_count;
    return a.id.localeCompare(b.id);
  });
}

/** Backwards-compatible rotation-only view, used by the dashboard card. */
export function selectDailyRotation(
  requests: PrayerRequest[],
  opts: { size?: number; now?: Date } = {}
): PrayerRequest[] {
  // Outstanding only — the dashboard card is a prompt to act, so showing what
  // is already done would be noise there.
  const { scheduled, rotation } = selectTodaysList(requests, opts);
  return [...scheduled, ...rotation].slice(0, opts.size ?? DAILY_ROTATION_SIZE);
}

export type RotationHealth = {
  total: number;
  neverPrayed: number;
  /** Untouched for over a month — the items a paper list would have lost. */
  stale: number;
  urgent: number;
  /** Days to get through everything at the current rotation size. */
  cycleDays: number | null;
};

export function rotationHealth(
  requests: PrayerRequest[],
  opts: { size?: number; now?: Date } = {}
): RotationHealth {
  const size = opts.size ?? DAILY_ROTATION_SIZE;
  const now = opts.now ?? new Date();
  const active = requests.filter((r) => r.status === 'open' || r.status === 'waiting');

  return {
    total: active.length,
    neverPrayed: active.filter((r) => !r.last_prayed_at).length,
    stale: active.filter((r) => r.last_prayed_at && ageInDays(r.last_prayed_at, now) > 30).length,
    urgent: active.filter((r) => r.urgent).length,
    // Only unscheduled items cycle — a daily prayer is not waiting its turn.
    cycleDays: (() => {
      const inRotation = active.filter((r) => (r.cadence ?? 'rotation') === 'rotation').length;
      return inRotation > 0 ? Math.ceil(inRotation / size) : null;
    })(),
  };
}

export type PrayerSubjectNode = {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  scripture_refs: string[];
  parent_id: string | null;
  position: number;
  /** Retired from the active list without being deleted. */
  archived: boolean;
  children: PrayerSubjectNode[];
  requests: PrayerRequest[];
};

/**
 * Rebuilds the subject tree from flat rows.
 *
 * Orphans — a child whose parent is archived or missing — are promoted to the
 * root rather than dropped. Silently losing someone from a prayer list is the
 * worst failure this module could have.
 */
export function buildSubjectTree(
  subjects: Array<Omit<PrayerSubjectNode, 'children' | 'requests'>>,
  requests: PrayerRequest[]
): PrayerSubjectNode[] {
  const byId = new Map<string, PrayerSubjectNode>();
  for (const s of subjects) {
    byId.set(s.id, { ...s, children: [], requests: [] });
  }

  for (const r of requests) {
    // Answered and closed requests are deliberately excluded. They live in the
    // Answered view; leaving them struck through in the list they were
    // resolved out of makes an active list look permanently half-finished.
    if (r.status === 'answered' || r.status === 'closed') continue;
    if (r.subject_id && byId.has(r.subject_id)) {
      byId.get(r.subject_id)!.requests.push(r);
    }
  }

  const roots: PrayerSubjectNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (nodes: PrayerSubjectNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);

  return roots;
}

export type SubjectContext = {
  name: string;
  category: string;
  /** Ancestor names, outermost first, excluding the subject itself. */
  ancestors: string[];
};

/**
 * Where each subject sits, for showing a request in context.
 *
 * A bare "Freedom from alcoholism" tells you what to pray but not who for, and
 * "Amanda" alone is thin when the list holds three of them across two sides of
 * the family. Category and ancestry are what make a line legible at a glance.
 *
 * Walks parents iteratively with a seen-set rather than recursing, so a cycle
 * introduced by a bad reparent cannot hang the render.
 */
export function buildSubjectIndex(
  subjects: Array<{ id: string; name: string; category: string; parent_id: string | null }>
): Map<string, SubjectContext> {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const index = new Map<string, SubjectContext>();

  for (const subject of subjects) {
    const ancestors: string[] = [];
    const seen = new Set<string>([subject.id]);
    let cursor = subject.parent_id ? byId.get(subject.parent_id) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      ancestors.unshift(cursor.name);
      seen.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    index.set(subject.id, { name: subject.name, category: subject.category, ancestors });
  }

  return index;
}

/** Flattens a tree for search and counting, depth-first, preserving order. */
export function flattenTree(nodes: PrayerSubjectNode[], depth = 0): Array<PrayerSubjectNode & { depth: number }> {
  const out: Array<PrayerSubjectNode & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

/**
 * Answered prayers worth resurfacing.
 *
 * Remembering answers is the practice that sustains the rest — the journal's
 * own framing is that waiting only *feels* like unanswered prayer. Newest
 * first, and only those carrying a note, since an answer with no record of
 * what happened is not much to look back on.
 */
export function recentAnswers(requests: PrayerRequest[], limit = 5): PrayerRequest[] {
  return requests
    .filter((r) => r.status === 'answered' && r.answered_at)
    .sort((a, b) => new Date(b.answered_at!).getTime() - new Date(a.answered_at!).getTime())
    .slice(0, limit);
}

/**
 * One line of a prayer's history.
 *
 * 'prayed' is the checkmark — it advances the rotation and is the reason the
 * item left today's list. 'note' is a reflection written on a day, which
 * changes nothing about the schedule. They share a timeline because that is
 * how the history gets reread: what was happening, and when.
 */
export type PrayerLogEntry = {
  id: string;
  kind: 'prayed' | 'note';
  prayed_at: string;
  note: string | null;
};

/**
 * Requests still worth showing, given which subjects have been retired.
 *
 * Archiving "the Hendersons" has to take their requests out of the rotation
 * too. Without this the subject vanishes from the list while its prayers keep
 * surfacing every morning attached to nothing — which reads as a bug and, more
 * to the point, means marking a subject inactive does not actually do the one
 * thing it was pressed to do.
 *
 * Unattached requests are always kept: they belong to no subject, so no
 * subject can retire them.
 */
export function activeRequests(
  requests: PrayerRequest[],
  subjects: Array<{ id: string; archived?: boolean }>
): PrayerRequest[] {
  const retired = new Set(subjects.filter((s) => s.archived).map((s) => s.id));
  if (retired.size === 0) return requests;
  return requests.filter((r) => !r.subject_id || !retired.has(r.subject_id));
}

/**
 * The order to write back after a drag, as a sparse list of changed rows.
 *
 * Positions are respaced by tens rather than renumbered 0..n so that the next
 * drag usually only has to move one row. Only rows that actually changed are
 * returned — sending 120 updates because one item moved is how a reorder ends
 * up feeling slower than the list it is reordering.
 */
export function reorderMoves(
  siblings: Array<{ id: string; position: number; parent_id: string | null; category: string }>,
  target: { parentId: string | null; category: string }
): Array<{ id: string; position: number; parent_id: string | null; category: string }> {
  const moves: Array<{ id: string; position: number; parent_id: string | null; category: string }> = [];
  siblings.forEach((s, i) => {
    const position = (i + 1) * 10;
    if (
      s.position !== position ||
      s.parent_id !== target.parentId ||
      s.category !== target.category
    ) {
      moves.push({ id: s.id, position, parent_id: target.parentId, category: target.category });
    }
  });
  return moves;
}

/**
 * Would reparenting `id` under `parentId` create a loop?
 *
 * The subject picker excludes descendants, but a drag onto a collapsed branch
 * and a stale client both get here, and a cycle in this tree means the render
 * never terminates. Cheap to check, catastrophic to miss.
 */
export function wouldCycle(
  subjects: Array<{ id: string; parent_id: string | null }>,
  id: string,
  parentId: string | null
): boolean {
  if (!parentId) return false;
  if (parentId === id) return true;
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const seen = new Set<string>();
  let cursor = byId.get(parentId);
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === id) return true;
    seen.add(cursor.id);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return false;
}
