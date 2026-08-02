/**
 * Adherence scoring for spiritual practices.
 *
 * Produces an outward, behavioural score for the Spirit pillar to sit BESIDE
 * the Flourishing survey's self-reported one — never averaged into it. The
 * signal worth having is the disagreement: the survey saying 8 while the
 * practice log says 4 is the insight, and a blended 6 erases it.
 *
 * All dates are handled as 'YYYY-MM-DD' strings. Parsing them into Date
 * objects invites timezone drift, where a late-evening check-in lands on
 * tomorrow for a server running in UTC.
 */

export type Cadence = 'daily' | 'weekly' | 'monthly';

export type Practice = {
  id: string;
  key: string;
  label: string;
  cadence: Cadence;
  target_per_period: number;
  icon?: string | null;
  sort_order?: number;
  /** ISO date the practice was created. Periods before it existed are not
      counted against you — otherwise adding a weekly practice today scores 0
      for the three prior weeks it couldn't possibly have been kept. */
  created_at?: string | null;
};

export type PracticeLog = {
  practice_id: string;
  log_date: string;
  completed: boolean;
};

/** Four weeks: divides evenly into weeks and still spans a monthly practice. */
export const DEFAULT_WINDOW_DAYS = 28;

export function todayIso(now: Date = new Date()): string {
  return toIso(now);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIso(dt);
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Monday-based week key, so a Sunday church visit belongs to the week it ends. */
function weekKey(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function periodKey(iso: string, cadence: Cadence): string {
  if (cadence === 'daily') return iso;
  if (cadence === 'weekly') return weekKey(iso);
  return monthKey(iso);
}

export type Adherence = {
  /** Periods that counted toward the denominator. */
  periods: number;
  /** Periods where the target was met. */
  met: number;
  /** 0–1, or null when no period has closed yet. */
  rate: number | null;
  /** 0–10, aligned to the survey's scale. */
  score: number | null;
  /** Consecutive completed days ending today or yesterday. Daily only. */
  streak: number;
  /** Whether it's already satisfied for the current period. */
  doneThisPeriod: boolean;
};

/**
 * Adherence over a trailing window.
 *
 * The current period is excluded from the denominator unless it's already
 * satisfied. Counting an unfinished week as a failure would mean a weekly
 * practice scores badly every Monday through Saturday, which trains you to
 * distrust the number.
 */
export function computeAdherence(
  practice: Practice,
  logs: PracticeLog[],
  opts: { windowDays?: number; today?: string } = {}
): Adherence {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const today = opts.today ?? todayIso();
  const windowStart = addDays(today, -(windowDays - 1));
  // Never look back past the practice's own creation.
  const createdIso = practice.created_at ? practice.created_at.slice(0, 10) : null;
  const start = createdIso && createdIso > windowStart ? createdIso : windowStart;
  const span = daysBetween(start, today) + 1;

  const mine = logs.filter(
    (l) => l.practice_id === practice.id && l.completed && l.log_date >= start && l.log_date <= today
  );

  // period key -> completions
  const counts = new Map<string, number>();
  for (const l of mine) {
    const k = periodKey(l.log_date, practice.cadence);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  // Enumerate the periods the window covers.
  const periodKeys: string[] = [];
  for (let i = 0; i < span; i++) {
    const iso = addDays(start, i);
    const k = periodKey(iso, practice.cadence);
    if (periodKeys[periodKeys.length - 1] !== k) periodKeys.push(k);
  }

  const currentKey = periodKey(today, practice.cadence);
  const doneThisPeriod = (counts.get(currentKey) ?? 0) >= practice.target_per_period;

  let periods = 0;
  let met = 0;
  for (const k of periodKeys) {
    const satisfied = (counts.get(k) ?? 0) >= practice.target_per_period;
    // The in-progress period only counts once it's been satisfied.
    if (k === currentKey && !satisfied) continue;
    periods += 1;
    if (satisfied) met += 1;
  }

  const rate = periods > 0 ? met / periods : null;

  return {
    periods,
    met,
    rate,
    score: rate === null ? null : Math.round(rate * 10 * 100) / 100,
    streak: practice.cadence === 'daily' ? dailyStreak(mine, today) : 0,
    doneThisPeriod,
  };
}

/** Consecutive days ending today, or yesterday if today isn't logged yet. */
function dailyStreak(logs: PracticeLog[], today: string): number {
  const done = new Set(logs.map((l) => l.log_date));
  let cursor = done.has(today) ? today : addDays(today, -1);
  // Not done today AND not done yesterday means the streak is broken.
  if (!done.has(cursor)) return 0;
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type PracticeStanding = 'good' | 'watch' | 'concern';

/** Same 0–10 bands the Flourishing pillars use, so the two read alike. */
export function standingFor(score: number | null): PracticeStanding | null {
  if (score === null) return null;
  if (score >= 8) return 'good';
  if (score >= 6) return 'watch';
  return 'concern';
}

export type PracticeSummary = {
  practice: Practice;
  adherence: Adherence;
  standing: PracticeStanding | null;
};

export function summarisePractices(
  practices: Practice[],
  logs: PracticeLog[],
  opts: { windowDays?: number; today?: string } = {}
): PracticeSummary[] {
  return practices
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((practice) => {
      const adherence = computeAdherence(practice, logs, opts);
      return { practice, adherence, standing: standingFor(adherence.score) };
    });
}

/**
 * Overall practice score for a pillar: the mean of each practice's adherence.
 * Practices with no closed period yet are skipped rather than counted as zero,
 * so a newly added practice can't tank the score before it's had a chance.
 */
export function pillarPracticeScore(summaries: PracticeSummary[]): number | null {
  const scored = summaries.map((s) => s.adherence.score).filter((v): v is number => v !== null);
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((sum, v) => sum + v, 0) / scored.length) * 100) / 100;
}

/**
 * How the felt score and the lived score compare. The gap is the point.
 */
export function surveyPracticeGap(
  surveyScore: number | null,
  practiceScore: number | null
): { gap: number | null; reading: 'aligned' | 'feeling_ahead' | 'doing_ahead' | 'unknown' } {
  if (surveyScore === null || practiceScore === null) return { gap: null, reading: 'unknown' };
  const gap = Math.round((surveyScore - practiceScore) * 100) / 100;
  if (Math.abs(gap) < 1.5) return { gap, reading: 'aligned' };
  return { gap, reading: gap > 0 ? 'feeling_ahead' : 'doing_ahead' };
}
