/**
 * How logged recovery relates to readiness.
 *
 * The instinct is to credit the readiness score when a recovery session is
 * logged — sauna today, so readiness up tomorrow. That is the wrong shape, for
 * two reasons.
 *
 * First, it double-counts. A sauna does not MAKE you recovered; it may help you
 * recover, and if it worked, the effect lands in HRV, resting HR and sleep —
 * all of which readiness already measures. Adding a bonus on top counts the
 * same benefit twice: once as the intervention, once as its actual result.
 *
 * Second, it makes the score gameable by its own owner. Any number you can
 * raise by logging an activity rather than by being recovered stops being a
 * measurement and becomes a scoreboard.
 *
 * So modality logging (sauna, cold plunge, massage, compression) contributes
 * NOTHING to the score. It is shown beside readiness as context, and it feeds
 * the recommendation — "you have not taken a recovery session in nine days" is
 * useful advice — but it does not move the number.
 *
 * What DOES enter the score is the self-report attached to those sessions:
 * soreness and perceived recovery. Musculoskeletal readiness is genuinely
 * distinct from autonomic readiness — you can have excellent HRV and still have
 * legs too sore to squat — and nothing else in the model captures it. That is a
 * new signal rather than a second look at an existing one.
 */

export type RecoverySessionInput = {
  session_date: string;
  modality: string | null;
  /** 1–10 self-rating, higher is better. */
  perceived_recovery: number | null;
  /** 1–10 self-rating, higher means MORE sore. */
  soreness_after: number | null;
  soreness_before: number | null;
  energy_after: number | null;
};

/** Ratings older than this tell you nothing about today. */
export const SUBJECTIVE_WINDOW_DAYS = 3;

/** How far back to look when reporting recovery habit as context. */
export const HABIT_WINDOW_DAYS = 14;

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const toUtc = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  );
  return Math.round((toUtc.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Converts one session's self-report into a 0–100 musculoskeletal readiness
 * score, or null when the session carried no ratings at all.
 *
 * Soreness is inverted (10 = wrecked → 0) and weighted above perceived
 * recovery, because "how beaten up am I" predicts whether today's session is
 * safe better than a general sense of recovery does. Energy is a weak third
 * signal and only used when it is the only thing present.
 */
export function scoreSelfReport(s: RecoverySessionInput): number | null {
  const parts: Array<{ value: number; weight: number }> = [];

  if (s.soreness_after != null) {
    parts.push({ value: ((10 - s.soreness_after) / 9) * 100, weight: 0.6 });
  }
  if (s.perceived_recovery != null) {
    parts.push({ value: ((s.perceived_recovery - 1) / 9) * 100, weight: 0.4 });
  }
  if (parts.length === 0 && s.energy_after != null) {
    parts.push({ value: ((s.energy_after - 1) / 9) * 100, weight: 1 });
  }
  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const raw = parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export type RecoveryReadiness = {
  /** 0–100 musculoskeletal readiness, or null when nothing recent was rated. */
  score: number | null;
  detail: string;
  /** Sessions logged in the habit window, for context beside the score. */
  sessionsInWindow: number;
  /** Days since the most recent session of any kind, null if never. */
  daysSinceLast: number | null;
  modalities: string[];
};

/**
 * Summarises recent recovery. `score` is deliberately null rather than a
 * neutral default when there is nothing to go on — a fabricated middling number
 * is indistinguishable from a real one downstream, and the honest move is to
 * leave the factor out and let the remaining weights renormalise.
 */
export function summariseRecovery(
  sessions: RecoverySessionInput[],
  now: Date = new Date()
): RecoveryReadiness {
  const dated = sessions
    .filter((s) => s.session_date)
    .map((s) => ({ session: s, age: daysBetween(s.session_date, now) }))
    .filter((s) => s.age >= 0)
    .sort((a, b) => a.age - b.age);

  const inHabitWindow = dated.filter((d) => d.age < HABIT_WINDOW_DAYS);
  const modalities = [
    ...new Set(inHabitWindow.map((d) => d.session.modality).filter((m): m is string => !!m)),
  ];
  const daysSinceLast = dated.length ? dated[0].age : null;

  // Recency decay across the subjective window: a rating from this morning
  // should dominate one from two days ago rather than being averaged flat
  // against it.
  const rated = dated
    .filter((d) => d.age < SUBJECTIVE_WINDOW_DAYS)
    .map((d) => ({ score: scoreSelfReport(d.session), age: d.age }))
    .filter((d): d is { score: number; age: number } => d.score !== null);

  let score: number | null = null;
  let detail: string;

  if (rated.length === 0) {
    detail =
      daysSinceLast === null
        ? 'No recovery sessions logged'
        : `No recent self-ratings (last session ${daysSinceLast}d ago)`;
  } else {
    const weighted = rated.map((r) => ({ ...r, weight: 1 / (1 + r.age) }));
    const totalWeight = weighted.reduce((sum, r) => sum + r.weight, 0);
    score = Math.round(
      weighted.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight
    );
    const label = score >= 70 ? 'feeling good' : score >= 45 ? 'some soreness' : 'beaten up';
    detail = `Self-rated ${label} (${rated.length} rating${rated.length === 1 ? '' : 's'} in ${SUBJECTIVE_WINDOW_DAYS}d)`;
  }

  return {
    score,
    detail,
    sessionsInWindow: inHabitWindow.length,
    daysSinceLast,
    modalities,
  };
}

/**
 * A nudge about recovery HABIT, kept separate from the score on purpose.
 *
 * This is where logged modalities are allowed to matter: as advice, where being
 * wrong costs a suggestion, rather than as score input, where being wrong
 * corrupts a measurement.
 */
export function recoveryNudge(r: RecoveryReadiness, readinessScore: number): string | null {
  if (readinessScore < 55 && (r.daysSinceLast === null || r.daysSinceLast >= 3)) {
    return r.daysSinceLast === null
      ? 'Readiness is low and no recovery work is logged. Sauna, a walk, or an early night all count.'
      : `Readiness is low and it has been ${r.daysSinceLast} days since any recovery work.`;
  }
  if (r.daysSinceLast !== null && r.daysSinceLast >= 10) {
    return `No recovery session in ${r.daysSinceLast} days.`;
  }
  if (r.score !== null && r.score < 45) {
    return 'You rated yourself sore. Readiness reflects that — consider swapping intensity for volume.';
  }
  return null;
}
