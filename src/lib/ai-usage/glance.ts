/*
 * The quick-glance row for each plan at the top of /ai-usage. It only
 * restates a PlanStatus (same rag, same thresholds as the cards), so the
 * table and the cards cannot disagree.
 */
import type { PlanStatus } from './forecast.ts';

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });

export function glanceNote(s: Pick<PlanStatus, 'usedPct' | 'note' | 'runOutAt' | 'window' | 'rag'>): string {
  if (s.usedPct === null) {
    if (s.note === 'reset-since-reading') return 'reset since last reading';
    if (s.note === 'no-cap-known') return 'no cap known';
    return 'no reading';
  }
  if (s.usedPct >= 100) return 'used up';
  if (s.note === 'too-early') return 'too early to forecast';
  if (!s.runOutAt) return 'on track';
  if (s.runOutAt.getTime() < s.window.resetAt.getTime()) return `runs out ${DAY.format(s.runOutAt)}`;
  return 'lasts to reset';
}

export const glanceAnchor = (slug: string) => `plan-${slug.replace(/[^a-z0-9-]/gi, '-')}`;

const RESET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
/** "Tue 7:00 PM" within 6.5 days, else "Oct 25 8:29 AM" (a weekday a week out reads as today). */
export function glanceReset(at: Date, now: Date): string {
  const days = (at.getTime() - now.getTime()) / 86_400_000;
  if (days >= 0 && days < 6.5) return RESET.format(at).replace(',', '');
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at).replace(',', '');
}
