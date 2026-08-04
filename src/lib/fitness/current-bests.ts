/**
 * Where you are now, as distinct from where you have ever been.
 *
 * personal_records only stores a row when something is a NEW best, so by
 * construction it is a table of all-time peaks. Read on its own it says Eric's
 * bench is 253 lbs — true in June 2022, and not a number he can act on today.
 * Nothing in that table can express "here is what you are currently lifting",
 * because a current lift below the peak never gets written.
 *
 * So current bests are computed from actual training instead: the best set
 * performed inside a recent window. All-time stays visible beside it as
 * context — the thing you once did, and might again — rather than being the
 * headline.
 */

import { estimated1RM } from './estimated1rm';

export type SetRow = {
  exercise_id: string | null;
  set_type: string | null;
  reps: number | null;
  weight_lbs: number | null;
  workout_date: string;
};

export type CurrentBest = {
  exerciseId: string;
  /** Best estimated 1RM in the window. */
  e1rm: number;
  /** Heaviest single set in the window. */
  maxWeight: number;
  /** Most reps in one set. */
  maxReps: number;
  /** The set the e1rm came from, so the number is checkable. */
  basedOnWeight: number;
  basedOnReps: number;
  achievedOn: string;
  lastTrainedOn: string;
  sessions: number;
};

/** Reps above this make the 1RM estimate unreliable. */
const MAX_RELIABLE_REPS = 12;

export function computeCurrentBests(sets: SetRow[], sinceIso: string): Map<string, CurrentBest> {
  const out = new Map<string, CurrentBest>();
  const sessionsSeen = new Map<string, Set<string>>();

  for (const s of sets) {
    if (!s.exercise_id) continue;
    const day = s.workout_date.slice(0, 10);
    if (day < sinceIso) continue;

    // Track training frequency across all set types, so "last trained" is
    // honest even for a session that was all warm-ups.
    const seen = sessionsSeen.get(s.exercise_id) ?? new Set<string>();
    seen.add(day);
    sessionsSeen.set(s.exercise_id, seen);

    const weight = Number(s.weight_lbs) || 0;
    const reps = Number(s.reps) || 0;

    const existing = out.get(s.exercise_id);
    const base: CurrentBest = existing ?? {
      exerciseId: s.exercise_id,
      e1rm: 0,
      maxWeight: 0,
      maxReps: 0,
      basedOnWeight: 0,
      basedOnReps: 0,
      achievedOn: day,
      lastTrainedOn: day,
      sessions: 0,
    };

    if (day > base.lastTrainedOn) base.lastTrainedOn = day;
    if (weight > base.maxWeight) base.maxWeight = weight;
    if (reps > base.maxReps) base.maxReps = reps;

    // 1RM only from real working sets — a warm-up single is not a max effort.
    if ((s.set_type === 'working' || s.set_type === 'amrap') && weight > 0 && reps > 0 && reps <= MAX_RELIABLE_REPS) {
      const e = estimated1RM(weight, reps);
      if (e > base.e1rm) {
        base.e1rm = e;
        base.basedOnWeight = weight;
        base.basedOnReps = reps;
        base.achievedOn = day;
      }
    }

    out.set(s.exercise_id, base);
  }

  for (const [id, best] of out) {
    best.sessions = sessionsSeen.get(id)?.size ?? 0;
  }

  return out;
}

/** 'YYYY-MM-DD' N months before today. */
export function monthsAgo(months: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export const WINDOWS = [
  { key: '6', label: '6 months', months: 6 },
  { key: '12', label: '12 months', months: 12 },
  { key: 'all', label: 'All time', months: 0 },
] as const;
