/**
 * What a helper sees, as pure functions: which shared jobs, in which order,
 * and which fields. The page renders exactly what `helperView` returns, so
 * this file is the boundary — a field not copied here cannot reach a helper.
 */

export const SKILLS = ['helper', 'handyman', 'carpenter', 'electrician', 'plumber', 'roofer', 'equipment'] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  helper: 'Helper',
  handyman: 'Handyman',
  carpenter: 'Carpenter',
  electrician: 'Electrician',
  plumber: 'Plumber',
  roofer: 'Roofer',
  equipment: 'Equipment / machine',
};

export function isSkill(v: unknown): v is Skill {
  return typeof v === 'string' && (SKILLS as readonly string[]).includes(v);
}

/* A maintenance item appears this many days before it is due. */
export const DUE_SOON_DAYS = 14;

const CLOSED = new Set(['done', 'canceled', 'cancelled']);

/** A shared task joined to its sharing row: everything the owner side holds. */
export type WorkRow = {
  task_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  recurrence_rule: string | null;
  created_at: string;
  shared: boolean;
  skill: string;
  location_label: string | null;
  pinned: boolean;
  sort_order: number | null;
  assignee_worker_id: string | null;
  assignee_name: string | null;
  instructions: string | null;
  materials: string | null;
  gift_card_note: string | null;
  gift_card_sent_at: string | null;
  claimed_at: string | null;
};

/** One job as a helper sees it. Nothing else about the task leaves the server. */
export type HelperItem = {
  id: string;
  title: string;
  skill: Skill;
  location: string | null;
  pinned: boolean;
  due_date: string | null;
  overdue: boolean;
  assignee: string | null;
  mine: boolean;
  /* On the open board: shared, assigned to nobody, anyone with the skill may take it. */
  board: boolean;
  /* Mine because I took it off the board (not because Eric assigned it). */
  claimed: boolean;
  instructions: string | null;
  materials: string | null;
  gift_card: string | null;
};

/** Who is looking. `null` skills means Eric's preview of everything. */
export type Viewer = { worker_id: string | null; skills: string[] | null };

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function assigneeLabel(row: WorkRow, workerNames: Map<string, string>): string | null {
  if (row.assignee_worker_id) return workerNames.get(row.assignee_worker_id) ?? null;
  return row.assignee_name?.trim() || null;
}

function unassigned(r: WorkRow): boolean {
  return !r.assignee_worker_id && !r.assignee_name?.trim();
}

/**
 * The two sections. Maintenance: recurring jobs due within DUE_SOON_DAYS (or
 * overdue), soonest first. One-off: everything else, pinned first, then Eric's
 * order, then due date, then oldest.
 *
 * A job reaches a helper when it is assigned to them, or it is on the open
 * board (assigned to nobody) and its skill is one of theirs. A job assigned to
 * someone else is theirs alone. A helper never sees an electrician's job
 * unless it is theirs. Eric's preview (`skills: null`) sees every shared job.
 */
export function helperView(
  rows: WorkRow[],
  viewer: Viewer,
  workerNames: Map<string, string>,
  todayIso: string,
): { maintenance: HelperItem[]; oneOff: HelperItem[] } {
  const horizon = addDays(todayIso, DUE_SOON_DAYS);
  const visible = rows.filter((r) => {
    if (!r.shared || CLOSED.has(r.status ?? '')) return false;
    if (viewer.skills === null) return true;
    const mine = viewer.worker_id !== null && r.assignee_worker_id === viewer.worker_id;
    return mine || (unassigned(r) && viewer.skills.includes(r.skill));
  });

  const toItem = (r: WorkRow): HelperItem => ({
    id: r.task_id,
    title: r.title,
    skill: isSkill(r.skill) ? r.skill : 'helper',
    location: r.location_label,
    pinned: r.pinned,
    due_date: r.due_date,
    overdue: r.due_date !== null && r.due_date < todayIso,
    assignee: assigneeLabel(r, workerNames),
    mine: viewer.worker_id !== null && r.assignee_worker_id === viewer.worker_id,
    board: unassigned(r),
    claimed: viewer.worker_id !== null && r.assignee_worker_id === viewer.worker_id && r.claimed_at !== null,
    instructions: r.instructions,
    materials: r.materials,
    gift_card: r.gift_card_note ? r.gift_card_note : null,
  });

  const maintenance = visible
    .filter((r) => r.recurrence_rule && r.due_date && r.due_date <= horizon)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .map(toItem);

  const oneOff = visible
    .filter((r) => !r.recurrence_rule)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
        a.created_at.localeCompare(b.created_at),
    )
    .map(toItem);

  return { maintenance, oneOff };
}

/** Minutes between two instants, for the hours report. Open entries count to `now`. */
export function minutesWorked(startedAt: string, endedAt: string | null, now: Date = new Date()): number {
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  const ms = end - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0;
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
