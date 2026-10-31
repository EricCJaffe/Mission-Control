/**
 * The in-app "practices still to log today" nudge on the dashboard and /spirit.
 *
 * Same idea as the Flourishing retake prompt: a dismissible card, no push, no
 * email. It shows while any practice due today is unlogged, and goes away for
 * the rest of the day once dismissed or once everything due is logged. A
 * dismissal is per day on purpose — tomorrow is a new set of practices.
 *
 * Dates are 'YYYY-MM-DD' strings, as in practices.ts.
 */

import { isPracticeDue, type Practice, type PracticeLog } from './practices.ts';

export type PracticeNudge =
  | { show: false; reason: 'none_due' | 'all_done' | 'dismissed' }
  | { show: true; remaining: Array<{ id: string; label: string }> };

/** localStorage key holding the date the nudge was last dismissed. */
export const NUDGE_DISMISS_KEY = 'mc:practice-nudge-dismissed';

/** Practices due on `today` with no completed log for that day, in list order. */
export function unloggedPracticesDue(
  practices: Practice[],
  logs: PracticeLog[],
  today: string,
): Array<{ id: string; label: string }> {
  const done = new Set(
    logs.filter((l) => l.log_date === today && l.completed).map((l) => l.practice_id),
  );
  return practices
    .filter((p) => isPracticeDue(p, today) && !done.has(p.id))
    .map((p) => ({ id: p.id, label: p.label }));
}

/**
 * @param dismissedOn the date stored under NUDGE_DISMISS_KEY, or null
 */
export function practiceNudge(
  practices: Practice[],
  logs: PracticeLog[],
  today: string,
  dismissedOn: string | null,
): PracticeNudge {
  if (!practices.some((p) => isPracticeDue(p, today))) return { show: false, reason: 'none_due' };
  const remaining = unloggedPracticesDue(practices, logs, today);
  if (remaining.length === 0) return { show: false, reason: 'all_done' };
  if (dismissedOn === today) return { show: false, reason: 'dismissed' };
  return { show: true, remaining };
}

/** "Prayer, Scripture and 2 more" — names get you moving, a bare count doesn't. */
export function nudgeSummary(remaining: Array<{ label: string }>, max = 2): string {
  const names = remaining.slice(0, max).map((r) => r.label);
  const extra = remaining.length - names.length;
  if (extra > 0) return `${names.join(', ')} and ${extra} more`;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names[0] ?? '';
}
