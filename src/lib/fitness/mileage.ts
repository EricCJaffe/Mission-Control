/**
 * Distance totals over week, month and year.
 *
 * Two different numbers live here and conflating them would make both useless.
 * DAILY distance is everything you covered on foot — walking to the car counts
 * — and comes from daily_summaries, which has years of history. WORKOUT
 * distance is only what was logged as a session. The first tells you how much
 * you move; the second tells you how much you train, and they are usually
 * different by a factor of two.
 *
 * All arithmetic is on 'YYYY-MM-DD' strings and UTC dates. Parsing to local
 * time is how a total silently shifts by a day at month boundaries.
 */

export type DayDistance = {
  summary_date: string;
  distance_miles: number | null;
  total_steps: number | null;
};

export type WorkoutDistance = {
  workout_date: string;
  workout_type: string | null;
  miles: number;
  minutes: number | null;
};

export type PeriodKey = 'week' | 'month' | 'year' | 'all';

/**
 * Disciplines, grouped from the raw workout_type strings.
 *
 * Apple and Garmin have written the same activity under several names over the
 * years — "Running", "Outdoor Run" and "Indoor Run" are all running, and
 * splitting them across three rows makes the totals meaningless. Grouping
 * happens here so every view agrees.
 */
export type Discipline = 'run' | 'bike' | 'walk' | 'swim' | 'other';

export const DISCIPLINES: Array<{ key: Discipline | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Run' },
  { key: 'bike', label: 'Bike' },
  { key: 'walk', label: 'Walk' },
  { key: 'swim', label: 'Swim' },
];

export function disciplineOf(workoutType: string | null | undefined): Discipline {
  const t = (workoutType ?? '').toLowerCase();
  if (/\brun|jog|treadmill\b/.test(t)) return 'run';
  if (/cycl|bike|spin/.test(t)) return 'bike';
  if (/walk|hik/.test(t)) return 'walk';
  if (/swim/.test(t)) return 'swim';
  return 'other';
}

/**
 * Named ranges for the activity breakdown.
 *
 * A single rolling window cannot answer "how did last month compare" or
 * "what did I do last year", which are the two questions a mileage page is
 * actually opened for.
 */
export type RangeKey = 'this_month' | 'last_month' | 'last_3' | 'ytd' | 'last_year';

export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3', label: 'Last 3 months' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'last_year', label: 'Last year' },
];

/** Inclusive [from, to] for a named range, both 'YYYY-MM-DD'. */
export function rangeBounds(range: RangeKey, today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (range === 'this_month') return { from: startOfMonth(today), to: today };

  if (range === 'last_month') {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    const mm = String(m).padStart(2, '0');
    // Day 0 of the following month is the last day of this one.
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
  }

  if (range === 'last_3') {
    const d = new Date(Date.UTC(year, month - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 2);
    return { from: d.toISOString().slice(0, 10), to: today };
  }

  if (range === 'ytd') return { from: `${year}-01-01`, to: today };

  return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the ISO week (Monday) containing `iso`. */
export function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay is Sunday-0; shift so Monday starts the week, which is what a
  // training week means to everyone who runs.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return toIso(d);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function periodStart(period: PeriodKey, today: string): string {
  if (period === 'week') return startOfWeek(today);
  if (period === 'month') return startOfMonth(today);
  if (period === 'year') return startOfYear(today);
  return '0000-01-01';
}

/** Shifts a date by whole days, staying in UTC. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export type PeriodTotal = {
  period: PeriodKey;
  label: string;
  start: string;
  end: string;
  miles: number;
  steps: number;
  activeDays: number;
  /** Days elapsed in the period so far, for a fair average. */
  daysElapsed: number;
  milesPerDay: number;
  /** Same-length window immediately before this one. */
  previousMiles: number;
  /**
   * Change against the equivalent stretch of the previous period — the first
   * N days of last month, not all of it. Comparing three days of August to a
   * whole July would report a collapse every month.
   */
  changePct: number | null;
};

const LABELS: Record<PeriodKey, string> = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

function sumRange(days: DayDistance[], from: string, to: string) {
  let miles = 0;
  let steps = 0;
  let activeDays = 0;
  for (const d of days) {
    if (d.summary_date < from || d.summary_date > to) continue;
    const m = d.distance_miles ?? 0;
    if (m > 0) activeDays += 1;
    miles += m;
    steps += d.total_steps ?? 0;
  }
  return { miles, steps, activeDays };
}

export function periodTotal(
  days: DayDistance[],
  period: PeriodKey,
  today: string
): PeriodTotal {
  const start = periodStart(period, today);
  const { miles, steps, activeDays } = sumRange(days, start, today);

  // All-time counts from the first day with data, not from the sentinel start
  // date — otherwise the per-day average divides by two thousand years.
  const effectiveStart =
    period === 'all'
      ? days.reduce<string | null>(
          (min, d) => (min === null || d.summary_date < min ? d.summary_date : min),
          null
        ) ?? today
      : start;

  const daysElapsed =
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${effectiveStart}T00:00:00Z`)) / 86_400_000
    ) + 1;

  // The comparison window is the same number of days, ending the day before
  // this period began.
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(daysElapsed - 1));
  const previousMiles = period === 'all' ? 0 : sumRange(days, prevStart, prevEnd).miles;

  return {
    period,
    label: LABELS[period],
    start: effectiveStart,
    end: today,
    miles: Math.round(miles * 100) / 100,
    steps,
    activeDays,
    daysElapsed,
    milesPerDay: daysElapsed > 0 ? Math.round((miles / daysElapsed) * 100) / 100 : 0,
    previousMiles: Math.round(previousMiles * 100) / 100,
    changePct:
      period === 'all' || previousMiles <= 0
        ? null
        : Math.round(((miles - previousMiles) / previousMiles) * 1000) / 10,
  };
}

export type Bucket = { key: string; label: string; miles: number; steps: number };

/** Monthly totals for a calendar year, always twelve buckets so gaps show. */
export function monthlyBuckets(days: DayDistance[], year: string): Bucket[] {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const buckets: Bucket[] = names.map((label, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label,
    miles: 0,
    steps: 0,
  }));

  for (const d of days) {
    if (!d.summary_date.startsWith(year)) continue;
    const idx = Number(d.summary_date.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    buckets[idx].miles += d.distance_miles ?? 0;
    buckets[idx].steps += d.total_steps ?? 0;
  }

  return buckets.map((b) => ({ ...b, miles: Math.round(b.miles * 10) / 10 }));
}

/** The last `count` ISO weeks, oldest first. */
export function weeklyBuckets(days: DayDistance[], today: string, count = 12): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = startOfWeek(today);

  for (let i = 0; i < count; i++) {
    const end = addDays(cursor, 6);
    const { miles, steps } = sumRange(days, cursor, end);
    buckets.unshift({
      key: cursor,
      label: `${cursor.slice(5, 7)}/${cursor.slice(8, 10)}`,
      miles: Math.round(miles * 10) / 10,
      steps,
    });
    cursor = addDays(cursor, -7);
  }

  return buckets;
}

export type WorkoutTotals = {
  miles: number;
  sessions: number;
  minutes: number;
  byType: Array<{ type: string; miles: number; sessions: number }>;
};

/** Session-only mileage, split by activity, for a date range. */
export function workoutTotals(
  workouts: WorkoutDistance[],
  from: string,
  to: string
): WorkoutTotals {
  const inRange = workouts.filter((w) => {
    const day = w.workout_date.slice(0, 10);
    return day >= from && day <= to;
  });

  const byType = new Map<string, { miles: number; sessions: number }>();
  let miles = 0;
  let minutes = 0;

  for (const w of inRange) {
    miles += w.miles;
    minutes += w.minutes ?? 0;
    const key = w.workout_type || 'Other';
    const entry = byType.get(key) ?? { miles: 0, sessions: 0 };
    entry.miles += w.miles;
    entry.sessions += 1;
    byType.set(key, entry);
  }

  return {
    miles: Math.round(miles * 100) / 100,
    sessions: inRange.length,
    minutes: Math.round(minutes),
    // Strength and flexibility sessions carry no distance; listing them at
    // 0.0 mi in a mileage breakdown is a row that only ever says "not this".
    byType: [...byType.entries()]
      .map(([type, v]) => ({ type, miles: Math.round(v.miles * 100) / 100, sessions: v.sessions }))
      .filter((t) => t.miles > 0)
      .sort((a, b) => b.miles - a.miles),
  };
}

export type WorkoutPeriodTotal = WorkoutTotals & {
  period: PeriodKey;
  label: string;
  start: string;
  end: string;
  daysElapsed: number;
  previousMiles: number;
  changePct: number | null;
  /** Longest single session in the period, miles. */
  longestMiles: number;
};

/**
 * Session mileage for a period, with the same like-for-like comparison the
 * daily totals use — the first N days of last month, not all of it.
 *
 * This is the number that answers "how much did I train", which is the one
 * Eric actually cares about. Everyday walking is real distance but it is not
 * training, and averaging the two together hides whether a week of running
 * happened at all.
 */
export function workoutPeriodTotal(
  workouts: WorkoutDistance[],
  period: PeriodKey,
  today: string
): WorkoutPeriodTotal {
  const start =
    period === 'all'
      ? workouts.reduce<string>(
          (min, w) => (w.workout_date.slice(0, 10) < min ? w.workout_date.slice(0, 10) : min),
          today
        )
      : periodStart(period, today);

  const totals = workoutTotals(workouts, start, today);

  const daysElapsed =
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
    ) + 1;

  const prevEnd = addDays(periodStart(period, today), -1);
  const prevStart = addDays(prevEnd, -(daysElapsed - 1));
  const previousMiles =
    period === 'all' ? 0 : workoutTotals(workouts, prevStart, prevEnd).miles;

  const longestMiles = workouts
    .filter((w) => {
      const day = w.workout_date.slice(0, 10);
      return day >= start && day <= today;
    })
    .reduce((max, w) => Math.max(max, w.miles), 0);

  return {
    ...totals,
    period,
    label: LABELS[period],
    start,
    end: today,
    daysElapsed,
    previousMiles,
    changePct:
      period === 'all' || previousMiles <= 0
        ? null
        : Math.round(((totals.miles - previousMiles) / previousMiles) * 1000) / 10,
    longestMiles: Math.round(longestMiles * 100) / 100,
  };
}

/** Session mileage per month for a calendar year. */
export function workoutMonthlyBuckets(
  workouts: WorkoutDistance[],
  year: string
): Bucket[] {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const buckets: Bucket[] = names.map((label, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label,
    miles: 0,
    steps: 0,
  }));

  for (const w of workouts) {
    const day = w.workout_date.slice(0, 10);
    if (!day.startsWith(year)) continue;
    const idx = Number(day.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    buckets[idx].miles += w.miles;
  }

  return buckets.map((b) => ({ ...b, miles: Math.round(b.miles * 10) / 10 }));
}

/** Session mileage for the last `count` ISO weeks, oldest first. */
export function workoutWeeklyBuckets(
  workouts: WorkoutDistance[],
  today: string,
  count = 12
): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = startOfWeek(today);

  for (let i = 0; i < count; i++) {
    const end = addDays(cursor, 6);
    buckets.unshift({
      key: cursor,
      label: `${cursor.slice(5, 7)}/${cursor.slice(8, 10)}`,
      miles: workoutTotals(workouts, cursor, end).miles,
      steps: 0,
    });
    cursor = addDays(cursor, -7);
  }

  return buckets;
}

/**
 * Projects a period's finishing total from the pace so far.
 *
 * Straight-line, and labelled as a projection wherever it is shown — three
 * good days in January do not really imply a 1,400-mile year, and the number
 * is only useful as "here is the current run rate extended".
 */
export function projectPeriod(total: PeriodTotal, today: string): number | null {
  if (total.period === 'all' || total.daysElapsed <= 0) return null;

  let totalDays: number;
  if (total.period === 'week') {
    totalDays = 7;
  } else if (total.period === 'month') {
    const [y, m] = today.split('-').map(Number);
    totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  } else {
    const y = Number(today.slice(0, 4));
    totalDays = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  }

  return Math.round(total.milesPerDay * totalDays * 10) / 10;
}
