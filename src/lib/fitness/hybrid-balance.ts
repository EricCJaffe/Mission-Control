/**
 * Hybrid training balance — how evenly strength and cardio are split, with
 * mobility tracked alongside rather than folded in.
 *
 * Measured in MINUTES, not session count. A 15-minute run and a 75-minute
 * lifting session are not one-for-one, and minutes are the only unit that
 * compares honestly across modalities while still being something you can
 * sanity-check by eye. Session counts are reported too, as context.
 *
 * The subtle part is de-duplication: an Apple Watch strength workout and a
 * natively-logged strength session are usually the SAME session recorded
 * twice, which would double-count that day. See dedupeSessions.
 */

export type TrainingCategory = 'strength' | 'cardio' | 'mobility';

export type RawSession = {
  id: string;
  /** ISO timestamp of the session. */
  date: string;
  /** workout_logs.workout_type, or a recovery modality. */
  type: string;
  /** workout_logs.source — 'Apple Health' marks a watch-recorded session. */
  source: string | null;
  minutes: number;
};

export type ClassifiedSession = RawSession & {
  category: TrainingCategory;
  day: string;
  fromApple: boolean;
};

export const APPLE_SOURCE = 'Apple Health';

/** Weekly mobility target, minutes. Tracked separately from the balance. */
export const MOBILITY_WEEKLY_TARGET_MIN = 60;

/** Default look-back. A rolling week matches how training actually cycles. */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Which source wins when the same category shows up twice in one day.
 *
 * Strength prefers the native log because that's where the sets and weights
 * live — the watch only knows "you did something for 43 minutes". Cardio
 * prefers Apple because the watch has heart rate, distance and GPS that a
 * manual entry lacks. Mobility prefers the native recovery log for the
 * same reason as strength.
 */
const SOURCE_PREFERENCE: Record<TrainingCategory, 'native' | 'apple'> = {
  strength: 'native',
  cardio: 'apple',
  mobility: 'native',
};

/** Checked in order — first match wins, so put specific terms before loose ones. */
const CATEGORY_PATTERNS: Array<{ category: TrainingCategory; patterns: RegExp }> = [
  {
    category: 'mobility',
    patterns:
      /\b(flexibility|yoga|pilates|stretch|stretching|mobility|mind and body|barre|tai chi|cooldown|cool down|foam roll)\b/,
  },
  {
    category: 'strength',
    patterns:
      /\b(strength|lifting|weight|weights|weightlifting|resistance|core training|functional strength|traditional strength|calisthenic|bodyweight)\b/,
  },
  {
    category: 'cardio',
    patterns:
      /\b(run|running|jog|walk|walking|hike|hiking|cycl|cycling|bike|biking|spin|swim|swimming|row|rowing|elliptical|stair|cardio|hiit|interval|jump rope|skiing|skating|dance|tennis|basketball|soccer|boxing|kickbox)\b/,
  },
];

/**
 * Buckets a workout type into a training category, or null when it doesn't
 * clearly belong to one ("Other"). Unclassified time is reported separately
 * rather than being silently assigned to a side.
 */
export function classifyWorkout(type: string | null | undefined): TrainingCategory | null {
  if (!type) return null;
  const t = type.toLowerCase().replace(/[_-]+/g, ' ');
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.test(t)) return category;
  }
  return null;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Drops same-day duplicates of the same category recorded by both the watch
 * and a native log.
 *
 * Timestamps can't be trusted to overlap — a natively-logged session is often
 * saved when it ENDS, so it abuts rather than intersects the watch's record of
 * the same workout. So this works per (day, category): if both sources are
 * present, only the preferred one is kept.
 *
 * Trade-off: a genuinely separate second session of the same category on the
 * same day, recorded by the non-preferred source, is dropped too. That's rarer
 * than the double-count it prevents, and the dropped minutes are reported.
 */
export function dedupeSessions(sessions: ClassifiedSession[]): {
  kept: ClassifiedSession[];
  droppedMinutes: number;
} {
  const groups = new Map<string, ClassifiedSession[]>();
  for (const s of sessions) {
    const key = `${s.day}:${s.category}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }

  const kept: ClassifiedSession[] = [];
  let droppedMinutes = 0;

  for (const [key, list] of groups) {
    const category = key.split(':')[1] as TrainingCategory;
    const hasApple = list.some((s) => s.fromApple);
    const hasNative = list.some((s) => !s.fromApple);
    if (!hasApple || !hasNative) {
      kept.push(...list);
      continue;
    }
    const preferApple = SOURCE_PREFERENCE[category] === 'apple';
    for (const s of list) {
      if (s.fromApple === preferApple) kept.push(s);
      else droppedMinutes += s.minutes;
    }
  }

  return { kept, droppedMinutes };
}

export type HybridBalance = {
  windowDays: number;
  strengthMinutes: number;
  cardioMinutes: number;
  mobilityMinutes: number;
  strengthSessions: number;
  cardioSessions: number;
  mobilitySessions: number;
  /** Share of strength+cardio minutes, 0–1. Null when neither has happened. */
  strengthShare: number | null;
  cardioShare: number | null;
  /** 100 = a perfect 50/50 split, 0 = entirely one-sided. Null when no data. */
  balanceScore: number | null;
  /** Which way it's leaning, for a plain-language nudge. */
  leaning: 'strength' | 'cardio' | 'balanced' | null;
  mobilityTargetMin: number;
  mobilityPct: number;
  /** Minutes discarded as same-day cross-source duplicates. */
  droppedDuplicateMinutes: number;
  /** Minutes in workouts that matched no category. */
  unclassifiedMinutes: number;
};

/** Within this many points of even, call it balanced rather than leaning. */
const BALANCED_TOLERANCE = 10;

export function computeHybridBalance(
  sessions: RawSession[],
  opts: { windowDays?: number; now?: Date } = {}
): HybridBalance {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  let unclassifiedMinutes = 0;
  const classified: ClassifiedSession[] = [];

  for (const s of sessions) {
    const when = new Date(s.date);
    if (Number.isNaN(when.getTime()) || when < cutoff || when > now) continue;
    const minutes = Number.isFinite(s.minutes) && s.minutes > 0 ? s.minutes : 0;
    if (minutes === 0) continue;

    const category = classifyWorkout(s.type);
    if (!category) {
      unclassifiedMinutes += minutes;
      continue;
    }
    classified.push({
      ...s,
      minutes,
      category,
      day: dayOf(s.date),
      fromApple: s.source === APPLE_SOURCE,
    });
  }

  const { kept, droppedMinutes } = dedupeSessions(classified);

  const totals: Record<TrainingCategory, { minutes: number; sessions: number }> = {
    strength: { minutes: 0, sessions: 0 },
    cardio: { minutes: 0, sessions: 0 },
    mobility: { minutes: 0, sessions: 0 },
  };
  for (const s of kept) {
    totals[s.category].minutes += s.minutes;
    totals[s.category].sessions += 1;
  }

  const strengthMinutes = Math.round(totals.strength.minutes);
  const cardioMinutes = Math.round(totals.cardio.minutes);
  const mobilityMinutes = Math.round(totals.mobility.minutes);

  // Balance deliberately covers strength vs cardio only. Mobility has its own
  // target so that adding it can't dilute the 50/50 goal.
  const balanceTotal = strengthMinutes + cardioMinutes;
  const strengthShare = balanceTotal > 0 ? strengthMinutes / balanceTotal : null;
  const cardioShare = strengthShare === null ? null : 1 - strengthShare;
  const balanceScore =
    strengthShare === null ? null : Math.round(100 * (1 - 2 * Math.abs(strengthShare - 0.5)));

  let leaning: HybridBalance['leaning'] = null;
  if (balanceScore !== null && strengthShare !== null) {
    if (balanceScore >= 100 - BALANCED_TOLERANCE) leaning = 'balanced';
    else leaning = strengthShare > 0.5 ? 'strength' : 'cardio';
  }

  const mobilityTargetMin = Math.round((MOBILITY_WEEKLY_TARGET_MIN * windowDays) / 7);

  return {
    windowDays,
    strengthMinutes,
    cardioMinutes,
    mobilityMinutes,
    strengthSessions: totals.strength.sessions,
    cardioSessions: totals.cardio.sessions,
    mobilitySessions: totals.mobility.sessions,
    strengthShare,
    cardioShare,
    balanceScore,
    leaning,
    mobilityTargetMin,
    mobilityPct:
      mobilityTargetMin > 0
        ? Math.min(100, Math.round((mobilityMinutes / mobilityTargetMin) * 100))
        : 0,
    droppedDuplicateMinutes: Math.round(droppedMinutes),
    unclassifiedMinutes: Math.round(unclassifiedMinutes),
  };
}
