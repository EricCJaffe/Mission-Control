/**
 * The shape of a brief, before anything is rendered and before Claude has
 * written a word.
 *
 * Two rules govern everything in this file.
 *
 * 1. THE PRIORITY MATRIX IS THE POINT. God First → Health → Family → Impact.
 *    Every list that ranks or groups reads `MATRIX` or `MATRIX_ORDER` rather
 *    than sorting by due date alone. A brief that opens with client work and
 *    buries the rest is a failed brief, however accurate its dates are.
 *
 * 2. THE PAYLOAD IS THE TRUTH; THE NARRATIVE IS COMMENTARY. Every number,
 *    date, table row and link in the email is computed here and in
 *    `collect.ts`, and rendered from this payload. Claude is handed a copy and
 *    asked only for prose. It never supplies a figure, and `render.ts` never
 *    reads one from it. That is what makes a brief with no model call — no key,
 *    a 500, a timeout — still a correct brief rather than a blank page.
 */

// ---------------------------------------------------------------------------
// The domain vocabulary, and the matrix it rolls up into.
// ---------------------------------------------------------------------------

/** The five domains, exactly as stored (see the `*_domain_check` constraints). */
export const DOMAINS = ['spirit', 'body', 'soul', 'family', 'work'] as const;
export type Domain = (typeof DOMAINS)[number];

export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && (DOMAINS as readonly string[]).includes(value);
}

/**
 * The buckets, in the only order they are ever allowed to appear in.
 * `admin` is not a domain — it is where an unclassified item lands, and it
 * sits last so that "I never labelled it" never outranks "God first".
 */
export type MatrixKey = 'god_first' | 'health' | 'family' | 'impact' | 'admin';

export const MATRIX: ReadonlyArray<{
  key: MatrixKey;
  label: string;
  domains: readonly Domain[];
}> = [
  { key: 'god_first', label: 'God First', domains: ['spirit'] },
  { key: 'health', label: 'Health', domains: ['body', 'soul'] },
  { key: 'family', label: 'Family', domains: ['family'] },
  { key: 'impact', label: 'Impact', domains: ['work'] },
  { key: 'admin', label: 'Admin', domains: [] },
] as const;

/** God First → Health → Family → Impact → Admin. Not negotiable. */
export const MATRIX_ORDER: readonly MatrixKey[] = MATRIX.map((m) => m.key);

export const MATRIX_LABEL: Record<MatrixKey, string> = {
  god_first: 'God First',
  health: 'Health',
  family: 'Family',
  impact: 'Impact',
  admin: 'Admin',
};

/** Where a stored domain sits in the matrix. Unlabelled work is Admin. */
export function matrixKeyFor(domain: string | null | undefined): MatrixKey {
  if (domain === 'spirit') return 'god_first';
  if (domain === 'body' || domain === 'soul') return 'health';
  if (domain === 'family') return 'family';
  if (domain === 'work') return 'impact';
  return 'admin';
}

/** Sort comparator that puts the matrix first and anything else after it. */
export function byMatrix(a: MatrixKey, b: MatrixKey): number {
  return MATRIX_ORDER.indexOf(a) - MATRIX_ORDER.indexOf(b);
}

// ---------------------------------------------------------------------------
// Rows, as they arrive from the `mission` schema.
// ---------------------------------------------------------------------------

export type BriefKind = 'weekly' | 'daily';

export type TaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: number | null;
  due_date: string | null;
  domain: string | null;
  category: string | null;
  why: string | null;
  project_id: string | null;
  source: string | null;
  source_url: string | null;
  assignee: string | null;
  external_status: string | null;
  edited_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type ProjectRow = {
  id: string;
  title: string | null;
  slug: string | null;
  domain: string | null;
  client: string | null;
};

export type CalendarEventRow = {
  id: string;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  domain: string | null;
  is_external: boolean | null;
  has_prep: boolean | null;
  location: string | null;
  web_link: string | null;
  attendees: string[] | null;
};

export type InboxItemRow = {
  id: string;
  sender: string | null;
  sender_domain: string | null;
  subject: string | null;
  received_at: string | null;
  snippet: string | null;
  needs_reply: boolean | null;
  replied_at: string | null;
  web_link: string | null;
  domain: string | null;
};

// ---------------------------------------------------------------------------
// Staleness — the single most important correctness rule in the brief.
// ---------------------------------------------------------------------------

/** How long a source may go unheard from before its data is called stale. */
export const STALE_AFTER_HOURS = 36;

export type SourceHealth = {
  source: string;
  /** Human label, e.g. "Outlook calendar". */
  label: string;
  /** ISO timestamp of the newest run, or null when the source has never run. */
  lastRunAt: string | null;
  lastStatus: string | null;
  itemsSeen: number | null;
  ageHours: number | null;
  stale: boolean;
};

// ---------------------------------------------------------------------------
// Derived sections.
// ---------------------------------------------------------------------------

export type MatrixHours = {
  key: MatrixKey;
  label: string;
  hours: number;
  /** 0–1 of the period's scheduled hours. 0 when nothing is scheduled. */
  share: number;
  meetings: number;
};

export type Alignment = {
  totalHours: number;
  byMatrix: MatrixHours[];
  /** The bucket taking the largest share of scheduled time. */
  winning: MatrixKey | null;
  /** Matrix buckets with no scheduled hours at all, in matrix order. */
  absent: MatrixKey[];
  /** True when Impact has taken more than `IMPACT_WARN_SHARE` of the week. */
  impactCrowding: boolean;
};

/** Share of scheduled hours above which Impact is flagged as crowding. */
export const IMPACT_WARN_SHARE = 0.7;

export type RelatedInbox = {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string | null;
  webLink: string | null;
};

export type RelatedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  sourceUrl: string | null;
};

export type PrepWarning = {
  eventId: string;
  title: string;
  startAt: string | null;
  /** 'YYYY-MM-DD' in the app timezone. */
  day: string;
  /** e.g. "Tue 9 Sep, 2:00 PM". */
  whenLabel: string;
  location: string | null;
  webLink: string | null;
  attendees: string[];
  matrix: MatrixKey;
  /** Hours from generation time until the meeting starts. Negative if past. */
  hoursAway: number | null;
  inbox: RelatedInbox[];
  tasks: RelatedTask[];
};

export type DayEvent = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  timeLabel: string;
  matrix: MatrixKey;
  isExternal: boolean;
  hasPrep: boolean;
  location: string | null;
  webLink: string | null;
  /** In-person meetings get a leave-by time; calls and blanks do not. */
  leaveBy: string | null;
  /** True when this event overlaps another on the same day. */
  conflict: boolean;
};

export type OpenBlock = {
  startLabel: string;
  endLabel: string;
  hours: number;
};

export type DayCell = {
  /** 'YYYY-MM-DD'. */
  date: string;
  /** e.g. "Mon 8 Sep". */
  label: string;
  isToday: boolean;
  events: DayEvent[];
  conflicts: number;
  /** Open stretches of 2h or more inside the working window. */
  openBlocks: OpenBlock[];
  hours: number;
};

export type Thread = {
  id: string;
  sender: string;
  senderDomain: string | null;
  subject: string;
  snippet: string | null;
  receivedAt: string | null;
  ageHours: number | null;
  ageLabel: string;
  webLink: string | null;
  matrix: MatrixKey;
  /** Computed rank; higher is more urgent. Ordering only, never displayed. */
  urgency: number;
};

export type BriefTask = {
  id: string;
  title: string;
  matrix: MatrixKey;
  dueDate: string | null;
  /** Negative when overdue, e.g. -3 = three days late. */
  daysUntilDue: number | null;
  priority: number | null;
  project: string | null;
  client: string | null;
  sourceUrl: string | null;
  why: string | null;
  /** Days since the row was last touched, by anyone or anything. */
  ageDays: number | null;
};

export type StaleVerdict = 'kill' | 'collapse' | 'schedule';

export type StaleTask = BriefTask & {
  verdict: StaleVerdict;
  /** Why that verdict — deterministic, from the row, not from the model. */
  reason: string;
};

export type TaskGroup = {
  key: MatrixKey;
  label: string;
  tasks: BriefTask[];
};

export type TaskSections = {
  /** Overdue, grouped in matrix order. Empty groups are dropped. */
  overdue: TaskGroup[];
  overdueCount: number;
  /** Due inside the period, in matrix order then by date. */
  dueThisPeriod: BriefTask[];
  /** Open and untouched for 30+ days, with a suggestion. */
  stale: StaleTask[];
  /** Closed inside the look-back window. */
  closed: BriefTask[];
};

/** Open tasks are called stale after this many untouched days. */
export const TASK_STALE_AFTER_DAYS = 30;

// ---------------------------------------------------------------------------
// The payload handed to render.ts, and to Claude.
// ---------------------------------------------------------------------------

export type BriefPayload = {
  kind: BriefKind;
  /** 'YYYY-MM-DD', inclusive. */
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  timezone: string;
  /** Every source, healthy or not. `staleSources` is the subset that matters. */
  sources: SourceHealth[];
  staleSources: SourceHealth[];
  alignment: Alignment;
  prepWarnings: PrepWarning[];
  days: DayCell[];
  /** For a daily brief: tomorrow's meetings, so prep can still be done tonight. */
  tomorrow: DayCell | null;
  threads: Thread[];
  tasks: TaskSections;
};

// ---------------------------------------------------------------------------
// What Claude returns. Every field optional — a missing field drops its slot
// rather than failing the render.
// ---------------------------------------------------------------------------

export type Outcome = {
  /** One line, imperative. */
  outcome: string;
  /** A concrete slot: "Tuesday 6:00–7:30 AM, before the Honey Lake call". */
  when: string;
  why?: string;
};

export type NextStep = {
  step: string;
  /** A time cue: "15 min, tonight" / "Thursday, first thing". */
  when: string;
};

export type BriefNarrative = {
  /** 2–4 sentences on the matrix balance. Reads the numbers; never invents. */
  alignmentSummary?: string;
  prepCommentary?: string;
  weekCommentary?: string;
  threadsCommentary?: string;
  tasksCommentary?: string;
  outcomes?: Outcome[];
  nextSteps?: NextStep[];
  challenge?: string;
  scriptureReference?: string;
  scriptureApplication?: string;
};

export type BriefStats = {
  kind: BriefKind;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** True when the model wrote the prose; false when the brief is numbers only. */
  narrative: boolean;
  /** Populated when the model was asked and could not answer. */
  narrativeError: string | null;
  model: string | null;
  staleSources: string[];
  meetings: number;
  externalMeetingsWithoutPrep: number;
  scheduledHours: number;
  hoursByMatrix: Record<MatrixKey, number>;
  threadsWaiting: number;
  tasksOverdue: number;
  tasksDueThisPeriod: number;
  tasksStale: number;
  tasksClosed: number;
};

export type GeneratedBrief = {
  html: string;
  stats: BriefStats;
  periodStart: string;
  periodEnd: string;
};
