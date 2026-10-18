/*
 * Concrete pause / move suggestions from the numbers, in the shape of the
 * inspiration (a daily red/yellow/green audit that says what to do, not only
 * what happened):
 *
 *   "Codex weekly at 92%, resets Thu: move reviews to Claude until then"
 *   "fsaos is 48% of Claude this week: pause low-value fsaos sessions"
 *   "Grok reading missing for 2 days: ask CoS"
 *
 * Pure: statuses and shares in, sentences out. Ordered red first.
 */

import type { PlanStatus } from './forecast.ts';
import type { Share } from './shares.ts';
import { UNATTRIBUTED } from './types.ts';
import { DAY_MS, formatReset } from './window.ts';

export type Suggestion = { tone: 'red' | 'yellow'; plan: string; text: string };

/** A project at or above this share of a strained plan gets named. */
export const HEAVY_PROJECT_PCT = 40;
/** Unattributed at or above this share means the mapping needs work. */
export const UNATTRIBUTED_PCT = 25;

const SHORT: Record<string, string> = {
  'claude-max': 'Claude main',
  'claude-4lot': 'Claude 4lot',
  'chatgpt-codex': 'Codex',
  'grok-ultra': 'Grok',
};

/** Where a strained plan's work can go, and what that work is. */
const MOVE: Record<string, { to: string; what: string }> = {
  'chatgpt-codex': { to: 'claude-max', what: 'reviews' },
  // Claude main overflows to the 4lot account, never to Codex (Codex is kept
  // for cross-model reviews and hard bugs). 4lot is a Team Standard seat at
  // about 1/16 of main's capacity (config/ai-usage-capacity.json), so only
  // small jobs move; big builds wait for main (Eric, 2026-10-18 2:09 PM).
  'claude-max': { to: 'claude-4lot', what: 'small jobs and short follow-ups (big builds wait for main)' },
  'claude-4lot': { to: 'claude-max', what: 'its jobs' },
};

export const shortName = (s: Pick<PlanStatus, 'slug' | 'name'>): string => SHORT[s.slug] ?? s.name;

const pct = (n: number) => `${Math.round(n)}%`;

function cadenceWord(s: PlanStatus): string {
  const ms = s.window.resetAt.getTime() - s.window.startAt.getTime();
  if (ms >= 27 * DAY_MS) return ' monthly';
  if (ms >= 6 * DAY_MS) return ' weekly';
  return '';
}

export function suggestions(statuses: PlanStatus[], shares: Record<string, Share[]>, now: Date): Suggestion[] {
  const out: Suggestion[] = [];
  const bySlug = new Map(statuses.map((s) => [s.slug, s]));

  for (const s of statuses) {
    const name = shortName(s);
    const resets = formatReset(s.window.resetAt, now);

    // A plan with no published cap and no % reading yet: its card already says
    // "no cap known"; that is not a collector fault, so no nag (its
    // unattributed check below still runs).
    if (s.rag === 'none' && s.note !== 'no-cap-known') {
      const days = s.hoursSinceReading === null ? null : Math.floor(s.hoursSinceReading / 24);
      const since =
        s.note === 'reset-since-reading' && (s.hoursSinceReading ?? Infinity) <= 48
          ? 'reset since last reading'
          : days === null
            ? 'no reading yet'
            : `reading missing for ${days} day${days === 1 ? '' : 's'}`;
      const who = s.lastSource === 'manual' || s.slug === 'grok-ultra' ? 'ask CoS' : 'check the usage collector';
      out.push({ tone: 'yellow', plan: s.slug, text: `${name} ${since}: ${who}` });
      continue;
    }

    if (s.rag === 'red' || s.rag === 'yellow') {
      const move = MOVE[s.slug];
      const target = move ? bySlug.get(move.to) : undefined;
      // A green target, or a no-cap plan with no reading yet (e.g. Claude 4lot
      // before its first manual %): it is not known to be strained.
      const targetOk = target && (target.rag === 'green' || (target.rag === 'none' && target.note === 'no-cap-known'));
      const action = move && targetOk
        ? `move ${move.what} to ${shortName(target)} until then`
        : 'pause low-value sessions until then';
      const used = s.usedPct === null ? '' : ` at ${pct(s.usedPct)}${s.isEstimate ? ' (estimate)' : ''}`;
      const early =
        s.runOutAt && s.runOutAt.getTime() < s.window.resetAt.getTime()
          ? `, projected to run out ${formatReset(s.runOutAt, now)}`
          : '';
      out.push({ tone: s.rag, plan: s.slug, text: `${name}${cadenceWord(s)}${used}${early}, resets ${resets}: ${action}` });

      for (const share of shares[s.slug] ?? []) {
        if (share.key === UNATTRIBUTED || share.percent < HEAVY_PROJECT_PCT) continue;
        out.push({
          tone: s.rag,
          plan: s.slug,
          text: `${share.key} is ${pct(share.percent)} of ${name} this window: pause low-value ${share.key} sessions`,
        });
      }
    }

    const un = (shares[s.slug] ?? []).find((x) => x.key === UNATTRIBUTED);
    if (un && un.tokens > 0 && un.percent >= UNATTRIBUTED_PCT) {
      out.push({
        tone: 'yellow',
        plan: s.slug,
        text: `${pct(un.percent)} of ${name} is unattributed: add the missing paths to config/ai-usage-projects.json`,
      });
    }
  }

  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'red' ? -1 : 1));
}
