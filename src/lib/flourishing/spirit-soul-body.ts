/**
 * Rolls the six Flourishing domains up into the Spirit / Soul / Body scores
 * shown on the dashboard.
 *
 * The grouping is the classic tripartite reading: spirit is the God-facing
 * life, soul is mind/will/emotions (which is where stewardship of work, money
 * and time sits — it's an exercise of the will), and body is the physical.
 *
 * Each score is a plain mean of its domains on the survey's 0–10 scale. No
 * weighting: every domain is measured with the same number of questions on the
 * same scale, so weighting would be an opinion dressed up as arithmetic.
 */

import type { CoreFlourishingDomain } from './types';

export type Pillar = 'spirit' | 'soul' | 'body';

export const PILLAR_DOMAINS: Record<Pillar, CoreFlourishingDomain[]> = {
  spirit: ['faith_spiritual', 'meaning_purpose_calling'],
  soul: ['mental_emotional', 'relational', 'work_money_time'],
  body: ['physical_brain'],
};

export const PILLAR_LABELS: Record<Pillar, string> = {
  spirit: 'Spirit',
  soul: 'Soul',
  body: 'Body',
};

/** How a pillar is doing right now, on the survey's own 0–10 scale. */
export type PillarStanding = 'thriving' | 'maintaining' | 'needs_attention';

/**
 * Movement since the previous assessment. Deliberately insensitive to noise:
 * self-reported scores wobble, and calling a 0.2 drift "declining" would train
 * you to ignore the indicator.
 */
export type PillarTrend = 'progressing' | 'holding' | 'slipping' | 'unknown';

const TREND_TOLERANCE = 0.5;

export type PillarScore = {
  pillar: Pillar;
  label: string;
  /** 0–10, or null when none of its domains were answered. */
  score: number | null;
  standing: PillarStanding | null;
  trend: PillarTrend;
  /** Change vs the previous assessment, in points. */
  delta: number | null;
  /** The domain scores that produced this, weakest first. */
  contributing: Array<{ domain: CoreFlourishingDomain; score: number }>;
  /** Weakest contributing domain — where attention would go first. */
  weakest: CoreFlourishingDomain | null;
};

export type DomainScoreInput = { domain: string; score: number | null };

function standingFor(score: number): PillarStanding {
  if (score >= 8) return 'thriving';
  if (score >= 6) return 'maintaining';
  return 'needs_attention';
}

function trendFor(score: number | null, previous: number | null): { trend: PillarTrend; delta: number | null } {
  if (score === null || previous === null) return { trend: 'unknown', delta: null };
  const delta = Math.round((score - previous) * 100) / 100;
  if (Math.abs(delta) < TREND_TOLERANCE) return { trend: 'holding', delta };
  return { trend: delta > 0 ? 'progressing' : 'slipping', delta };
}

function toMap(scores: DomainScoreInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of scores) {
    if (typeof s.score === 'number' && Number.isFinite(s.score)) map.set(s.domain, s.score);
  }
  return map;
}

/**
 * @param domainScores  current assessment's per-domain scores
 * @param previousScores previous assessment's, for trend. Omit if none.
 */
export function computePillarScores(
  domainScores: DomainScoreInput[],
  previousScores: DomainScoreInput[] = []
): PillarScore[] {
  const current = toMap(domainScores);
  const prior = toMap(previousScores);

  return (Object.keys(PILLAR_DOMAINS) as Pillar[]).map((pillar) => {
    const domains = PILLAR_DOMAINS[pillar];

    const contributing = domains
      .filter((d) => current.has(d))
      .map((d) => ({ domain: d, score: current.get(d)! }))
      .sort((a, b) => a.score - b.score);

    const score =
      contributing.length > 0
        ? Math.round((contributing.reduce((sum, c) => sum + c.score, 0) / contributing.length) * 100) / 100
        : null;

    const priorContributing = domains.filter((d) => prior.has(d)).map((d) => prior.get(d)!);
    const previous =
      priorContributing.length > 0
        ? priorContributing.reduce((sum, v) => sum + v, 0) / priorContributing.length
        : null;

    const { trend, delta } = trendFor(score, previous);

    return {
      pillar,
      label: PILLAR_LABELS[pillar],
      score,
      standing: score === null ? null : standingFor(score),
      trend,
      delta,
      contributing,
      weakest: contributing[0]?.domain ?? null,
    };
  });
}

/** Convenience: the shape `dashboard_scores` stores. */
export function pillarScoresToRow(scores: PillarScore[]): {
  spirit: number | null;
  soul: number | null;
  body: number | null;
} {
  const byPillar = new Map(scores.map((s) => [s.pillar, s.score]));
  return {
    spirit: byPillar.get('spirit') ?? null,
    soul: byPillar.get('soul') ?? null,
    body: byPillar.get('body') ?? null,
  };
}

/** Days between assessments before the dashboard asks you to retake. */
export const REASSESS_INTERVAL_DAYS = 30;

export type ReassessStatus = {
  daysSince: number | null;
  due: boolean;
  /** Negative once overdue. */
  daysUntilDue: number | null;
};

export function reassessStatus(
  lastAssessedAt: string | null | undefined,
  now: Date = new Date()
): ReassessStatus {
  if (!lastAssessedAt) return { daysSince: null, due: true, daysUntilDue: null };
  const then = new Date(lastAssessedAt).getTime();
  if (Number.isNaN(then)) return { daysSince: null, due: true, daysUntilDue: null };
  const daysSince = Math.floor((now.getTime() - then) / 86_400_000);
  return {
    daysSince,
    due: daysSince >= REASSESS_INTERVAL_DAYS,
    daysUntilDue: REASSESS_INTERVAL_DAYS - daysSince,
  };
}
