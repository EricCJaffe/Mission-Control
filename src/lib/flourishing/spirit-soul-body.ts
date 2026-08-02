/**
 * Rolls the six Flourishing domains up into the Spirit / Soul / Body scores
 * shown on the dashboard.
 *
 * The grouping is the classic tripartite reading: spirit is the God-facing
 * life, soul is mind/will/emotions (which is where stewardship of work, money
 * and time sits — it's an exercise of the will), and body is the physical.
 *
 * Each score is a WEIGHTED mean of its domains on the survey's 0–10 scale —
 * see DOMAIN_WEIGHTS. The weighting is inherited from the retired Monthly
 * Alignment review, which encoded a deliberate priority order; treating every
 * domain as equal would have flattened that when the two instruments merged.
 */

import type { CoreFlourishingDomain } from './types';

export type Pillar = 'spirit' | 'soul' | 'body';

export const PILLAR_DOMAINS: Record<Pillar, CoreFlourishingDomain[]> = {
  spirit: ['faith_spiritual', 'meaning_purpose_calling'],
  soul: ['mental_emotional', 'relational', 'work_money_time'],
  body: ['physical_brain'],
};

/**
 * Relative weight of each domain inside its pillar.
 *
 * Carried over from the retired Monthly Alignment review, which was the only
 * instrument that encoded a priority ORDER rather than treating every area as
 * equal: God First 30%, Family 25%, Health 20%, Impact 20%, Stewardship 5%.
 * That ordering is a deliberate claim about what matters most, and losing it
 * when the two instruments merged would have quietly flattened it.
 *
 * So within Spirit, walking with God outweighs sense of calling; within Soul,
 * relationships outweigh mental state, which outweighs stewardship of work,
 * money and time. Body has a single domain and needs no weighting.
 *
 * Weights are renormalised over whichever domains were actually answered, so
 * a partial assessment doesn't silently skew toward whatever survived.
 */
export const DOMAIN_WEIGHTS: Partial<Record<CoreFlourishingDomain, number>> = {
  faith_spiritual: 0.6,
  meaning_purpose_calling: 0.4,

  relational: 0.5,
  mental_emotional: 0.3,
  work_money_time: 0.2,

  physical_brain: 1,
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

/** Weighted mean, renormalised over the domains actually present. */
function weightedMean(entries: Array<{ domain: CoreFlourishingDomain; score: number }>): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    const weight = DOMAIN_WEIGHTS[entry.domain] ?? 1;
    weighted += entry.score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 100) / 100;
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

    const score = contributing.length > 0 ? weightedMean(contributing) : null;

    const priorContributing = domains
      .filter((d) => prior.has(d))
      .map((d) => ({ domain: d, score: prior.get(d)! }));
    const previous = priorContributing.length > 0 ? weightedMean(priorContributing) : null;

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
