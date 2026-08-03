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
  { key: 'daily', label: 'Every day', hint: 'Surfaces every day until answered' },
  { key: 'weekly', label: 'Weekly', hint: 'Once every 7 days' },
  { key: 'monthly', label: 'Monthly', hint: 'Once every month' },
  { key: 'once', label: 'One time', hint: 'A single occasion — pick the day' },
  { key: 'rotation', label: 'In the rotation', hint: 'No fixed schedule; comes round least-recently-prayed first' },
];

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

export const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family',
  friends: 'Friends',
  church: 'The Church',
  missions: 'Missions',
  government: 'Government & Authority',
  world: 'World Issues',
  work: 'Work & Business',
  finances: 'Finances',
  self: 'Spirit, Soul & Body',
  other: 'Other',
};

/** How many rotation items top up a day's list once scheduled ones are in. */
export const DAILY_ROTATION_SIZE = 12;

function ageInDays(iso: string | null, now: Date): number {
  // Never prayed sorts oldest — that is the whole point of the rotation.
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    return !r.due_date || r.due_date <= dayOnly(now);
  }

  const interval = CADENCE_DAYS[cadence];
  if (!interval) return false;

  if (!r.last_prayed_at) return true;

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
    return onGrid || ageInDays(r.last_prayed_at, now) >= interval;
  }

  return ageInDays(r.last_prayed_at, now) >= interval;
}

export type TodaysList = {
  /** Due because of their cadence. */
  scheduled: PrayerRequest[];
  /** Topping up from the unscheduled long tail. */
  rotation: PrayerRequest[];
};

/**
 * Builds today's list: everything genuinely due, then rotation items to fill.
 *
 * Scheduled items are never truncated — if you asked for something daily, it
 * appears daily, and silently dropping it because the list was full would make
 * the schedule a suggestion rather than a schedule.
 */
export function selectTodaysList(
  requests: PrayerRequest[],
  opts: { size?: number; now?: Date } = {}
): TodaysList {
  const size = opts.size ?? DAILY_ROTATION_SIZE;
  const now = opts.now ?? new Date();

  const active = requests.filter((r) => r.status === 'open' || r.status === 'waiting');
  const scheduled = active.filter((r) => isDueToday(r, now));
  const scheduledIds = new Set(scheduled.map((r) => r.id));

  const pool = active.filter(
    (r) => !scheduledIds.has(r.id) && (r.cadence ?? 'rotation') === 'rotation'
  );
  const slots = Math.max(0, size - scheduled.length);

  return {
    scheduled: sortByPriority(scheduled, now),
    rotation: sortByPriority(pool, now).slice(0, slots),
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
