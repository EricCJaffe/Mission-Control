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
    byType: [...byType.entries()]
      .map(([type, v]) => ({ type, miles: Math.round(v.miles * 100) / 100, sessions: v.sessions }))
      .sort((a, b) => b.miles - a.miles),
  };
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
