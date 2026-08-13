/**
 * Progress, pace and streak for a reading plan.
 *
 * Two things the plan view was missing, both standard in the apps people
 * actually stick with (YouVersion, Bible Recap):
 *
 * 1. A sense of PACE. A percentage says how much of the plan is done but not
 *    whether you are keeping up. Day 2 of 31 is 3% either way, but on day two
 *    that is on track and on day twenty it is not.
 *
 * 2. A way to STOP BEING BEHIND. Missing a week of a daily plan leaves seven
 *    unread days in front of you, and the usual outcome is abandoning the plan
 *    rather than reading eight passages. YouVersion's answer is "Catch Me Up":
 *    jump to the current day without marking the skipped ones read, so the
 *    backlog stops growing and the record stays honest about what was read.
 *
 * The day grid is deliberately the main visual. A bar shows one number; a grid
 * shows which days were kept and which were dropped, which is the thing worth
 * seeing.
 */

import { daysBetween, today as todayInAppTz } from '@/lib/day';

export type DayState = 'done' | 'today' | 'upcoming' | 'missed';

export type PlanDay = {
  day: number;
  state: DayState;
  completedOn: string | null;
};

export type PlanProgress = {
  dayCount: number;
  completedCount: number;
  /** Next unread day — the one to read now. */
  currentDay: number;
  /** Where the calendar says you should be, if you had read one a day. */
  expectedDay: number;
  /** Days behind the calendar. Zero when on or ahead of pace. */
  daysBehind: number;
  onTrack: boolean;
  percent: number;
  streak: number;
  longestStreak: number;
  days: PlanDay[];
  /** Something was read today. Informational only — see `currentDayDone`. */
  doneToday: boolean;
  /**
   * The day being offered is itself already read, which only happens once the
   * whole plan is finished. Gate "mark read" on THIS, never on `doneToday`:
   * reading two days in one sitting to catch up is the normal way back on pace.
   */
  currentDayDone: boolean;
};

export type ProgressRow = { day_number: number; completed_on: string | null };

function longestRun(sortedDays: string[]): number {
  if (sortedDays.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    if (daysBetween(sortedDays[i - 1], sortedDays[i]) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (daysBetween(sortedDays[i - 1], sortedDays[i]) > 1) {
      run = 1;
    }
  }
  return best;
}

/**
 * @param startedOn 'YYYY-MM-DD' the subscription began. Pace is measured from
 *   here rather than from the first completed day, so a plan started and
 *   ignored for a week correctly reads as a week behind.
 */
export function computeProgress(
  progress: ProgressRow[],
  dayCount: number,
  startedOn: string | null,
  now?: string
): PlanProgress {
  const todayIso = now ?? todayInAppTz();
  const doneByDay = new Map<number, string | null>();
  for (const p of progress) doneByDay.set(p.day_number, p.completed_on);

  // The next unread day, not a date offset — missing a day must not skip its
  // passage, only delay it.
  let currentDay = 1;
  while (doneByDay.has(currentDay) && currentDay <= dayCount) currentDay += 1;
  currentDay = Math.min(currentDay, dayCount);

  const expectedDay = startedOn
    ? Math.min(dayCount, Math.max(1, daysBetween(startedOn, todayIso) + 1))
    : currentDay;

  const days: PlanDay[] = [];
  for (let day = 1; day <= dayCount; day++) {
    let state: DayState;
    if (doneByDay.has(day)) state = 'done';
    else if (day === currentDay) state = 'today';
    // Unread and already past on the calendar — the days actually dropped.
    else if (day < expectedDay) state = 'missed';
    else state = 'upcoming';
    days.push({ day, state, completedOn: doneByDay.get(day) ?? null });
  }

  const completedDates = [...doneByDay.values()]
    .filter((d): d is string => Boolean(d))
    .sort();

  const uniqueDates = [...new Set(completedDates)];
  const gapToNewest =
    uniqueDates.length > 0 ? daysBetween(uniqueDates[uniqueDates.length - 1], todayIso) : Infinity;

  let streak = 0;
  if (gapToNewest <= 1) {
    streak = 1;
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      if (daysBetween(uniqueDates[i], uniqueDates[i + 1]) === 1) streak += 1;
      else break;
    }
  }

  const completedCount = doneByDay.size;
  const daysBehind = Math.max(0, expectedDay - currentDay);

  return {
    dayCount,
    completedCount,
    currentDay,
    expectedDay,
    daysBehind,
    onTrack: daysBehind === 0,
    percent: dayCount > 0 ? Math.round((completedCount / dayCount) * 100) : 0,
    streak,
    longestStreak: longestRun(uniqueDates),
    days,
    doneToday: completedDates.includes(todayIso),
    currentDayDone: doneByDay.has(currentDay),
  };
}

/**
 * The day "Catch me up" should jump to.
 *
 * YouVersion's semantics, and the right ones: move forward to the current
 * calendar day WITHOUT marking anything read. The skipped days stay skipped in
 * the record — the point is to stop carrying a backlog, not to pretend the
 * reading happened.
 *
 * Returns null when there is nothing to catch up on.
 */
export function catchUpTarget(progress: PlanProgress): number | null {
  if (progress.daysBehind <= 0) return null;
  return progress.expectedDay;
}
