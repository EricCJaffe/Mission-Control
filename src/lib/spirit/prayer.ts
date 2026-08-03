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

/** How many requests a daily session offers by default. */
export const DAILY_ROTATION_SIZE = 12;

function ageInDays(iso: string | null, now: Date): number {
  // Never prayed sorts oldest — that is the whole point of the rotation.
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Picks today's rotation.
 *
 * Urgent first, then longest-untouched. Ties break on lowest prayed_count so a
 * newly added request is not stuck behind older ones that have already had
 * many turns, then on id so the order is stable across renders rather than
 * reshuffling under the user mid-session.
 */
export function selectDailyRotation(
  requests: PrayerRequest[],
  opts: { size?: number; now?: Date } = {}
): PrayerRequest[] {
  const size = opts.size ?? DAILY_ROTATION_SIZE;
  const now = opts.now ?? new Date();

  const eligible = requests.filter((r) => r.status === 'open' || r.status === 'waiting');

  const sorted = [...eligible].sort((a, b) => {
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

  return sorted.slice(0, size);
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
    cycleDays: active.length > 0 ? Math.ceil(active.length / size) : null,
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
