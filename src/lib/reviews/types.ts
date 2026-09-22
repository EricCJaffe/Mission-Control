/**
 * The shape of a review cycle, and the contract its collectors honor.
 *
 * ONE RULE GOVERNS THIS FILE. THE READING IS COMPUTED; THE JUDGEMENT IS HIS.
 *
 * The August review module (`mission.monthly_reviews`, still zero rows) asked
 * Eric to produce both. It asked him to remember how the week had gone, score
 * it, and then say what to do — and it was never completed once. Everything
 * except the last part is arithmetic over data this app already holds, so the
 * cycle opens with the numbers in. What is left for him is one line per area
 * that is not green, plus the action that would fix it, which is the only part
 * a machine has no business writing.
 */

import type { ReviewStatus, Direction } from './status';
import type { CycleKind, Period } from './periods';

/** Where a reading comes from. Each value names a collector in `collect.ts`. */
export const READING_SOURCES = [
  'practices',
  'training',
  'tasks',
  'calendar',
  'flourishing',
  'projects',
  'manual',
] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export type ReviewArea = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  matrix_key: 'god_first' | 'health' | 'family' | 'impact' | 'admin';
  kind: 'matrix' | 'project' | 'metric';
  project_id: string | null;
  source: ReadingSource;
  green_at: number | null;
  yellow_at: number | null;
  target_value: number | null;
  direction: Direction;
  unit: string;
  cadence: CycleKind;
  active: boolean;
  sort_order: number;
  created_at: string;
};

/**
 * What a collector returns. It reports what it measured and, where it scores
 * by rule rather than by number, the status it reached and why.
 *
 * `hasReading: false` is the silence case and is always red — the collector
 * does not decide that, `verdictFor` does, so there is exactly one place in
 * the codebase where Eric's rule is implemented.
 */
export type CollectedReading = {
  hasReading: boolean;
  value: number | null;
  /** Rule-scored areas supply their own verdict; numeric ones leave it unset. */
  status?: ReviewStatus;
  reason?: string;
  /** The components behind the number, so a tile can be opened up. */
  detail: Record<string, unknown>;
};

/** A reading as stored and as rendered. */
export type ReviewReading = {
  id: string;
  cycle_id: string;
  area_id: string | null;
  area_key: string;
  label: string;
  matrix_key: ReviewArea['matrix_key'];
  kind: ReviewArea['kind'];
  unit: string;
  direction: Direction;
  green_at: number | null;
  yellow_at: number | null;
  target_value: number | null;
  has_reading: boolean;
  value: number | null;
  status: ReviewStatus;
  status_reason: string;
  detail: Record<string, unknown>;
  note_md: string | null;
  action_md: string | null;
  prior_status: ReviewStatus | null;
  carried_cycles: number;
  computed_at: string;
};

export type ReviewCycle = {
  id: string;
  kind: CycleKind;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
  overall: 'red' | 'yellow' | 'green' | null;
  summary_md: string | null;
  opened_at: string;
  closed_at: string | null;
  collected_at: string | null;
};

export type CycleWithReadings = {
  cycle: ReviewCycle;
  period: Period;
  readings: ReviewReading[];
};

/**
 * One project's line in the Projects roll-up.
 *
 * Projects are scored by RULE, not by a number, because "how healthy is this
 * project" has no single metric that is not gameable. The rules are stated in
 * `collect.ts` and print verbatim on the row, so a red is always arguable
 * against the evidence rather than a black box.
 */
export type ProjectLine = {
  id: string;
  title: string;
  client: string | null;
  domain: string | null;
  status: ReviewStatus;
  reason: string;
  openTasks: number;
  overdueTasks: number;
  undatedTasks: number;
  daysSinceTouch: number | null;
};

/** What the dashboard needs, in one object. */
export type ReviewDashboard = {
  current: CycleWithReadings | null;
  /** Most recent first, current cycle included. For the trend strip. */
  history: Array<{
    id: string;
    kind: CycleKind;
    period_start: string;
    period_end: string;
    status: 'open' | 'closed';
    overall: 'red' | 'yellow' | 'green' | null;
    label: string;
  }>;
  /** Readings that need a line from him: not green, and nothing written yet. */
  needsAttention: ReviewReading[];
};

/** Anything not green needs an action. That is the whole ask. */
export function needsAction(reading: ReviewReading): boolean {
  if (reading.status === 'green' || reading.status === 'not_due') return false;
  return !reading.action_md || reading.action_md.trim().length === 0;
}
