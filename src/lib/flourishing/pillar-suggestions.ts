/**
 * Concrete next steps when a pillar lags.
 *
 * When a Spirit / Soul / Body score lands in needs_attention, the dashboard
 * shows what to do about it: the weakest domain inside that pillar, its
 * scripture, and its first tips — the same content the Flourishing results
 * page already shows per domain. Rule-based on purpose: no model call, no
 * spend, and the same input always gives the same advice.
 */

import { domainSupport } from './domain-support.ts';
import type { PillarScore } from './spirit-soul-body.ts';
import { FLOURISHING_DOMAIN_LABELS, type CoreFlourishingDomain } from './types.ts';

export type PillarSuggestion = {
  pillar: PillarScore['pillar'];
  pillarLabel: string;
  domain: CoreFlourishingDomain;
  domainLabel: string;
  domainScore: number;
  scripture: { reference: string; text: string };
  tips: string[];
};

/** Two steps is something you can do this week; five is a reading list. */
export const DEFAULT_TIP_COUNT = 2;

/** Null unless the pillar needs attention and has a scored domain to point at. */
export function pillarSuggestion(
  pillar: PillarScore,
  tipCount = DEFAULT_TIP_COUNT,
): PillarSuggestion | null {
  if (pillar.standing !== 'needs_attention') return null;
  const weakest = pillar.contributing[0];
  if (!weakest) return null;

  // The domain's own band, not the pillar's: a pillar can need attention while
  // its weakest domain is merely steady, and the tips should fit the domain.
  const support = domainSupport(weakest.domain, weakest.score);
  return {
    pillar: pillar.pillar,
    pillarLabel: pillar.label,
    domain: weakest.domain,
    domainLabel: FLOURISHING_DOMAIN_LABELS[weakest.domain],
    domainScore: weakest.score,
    scripture: { reference: support.reference, text: support.text },
    tips: support.tips.slice(0, Math.max(0, tipCount)),
  };
}

/** One suggestion per lagging pillar, in the pillars' own order (Spirit first). */
export function pillarSuggestions(
  pillars: PillarScore[],
  tipCount = DEFAULT_TIP_COUNT,
): PillarSuggestion[] {
  return pillars
    .map((p) => pillarSuggestion(p, tipCount))
    .filter((s): s is PillarSuggestion => s !== null);
}
