/**
 * Points, streaks and badges for a running plan.
 *
 * Scoring rewards consistency and safety, not speed: miles count, staying
 * under the plan's HR ceiling counts, time in zone 2 counts, and stopping a run
 * early for a warning sign counts. There are no penalties. Inputs the session
 * does not have (no HR strap, no feel score) drop out of the score rather than
 * being guessed.
 *
 * Everything is derived from logged sessions on every render; nothing here is
 * stored, so a corrected log re-scores itself.
 */

import { daysBetween } from '../day.ts';
import type { PlanWeek, RunningPlan } from './running-plan.ts';

export interface RunSession {
  date: string;
  distanceMi: number;
  durationSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Percent of the session in the plan's zone 2, when known. */
  z2Pct: number | null;
  feel: number | null;
  notes: string | null;
}

export const POINTS = {
  perMile: 10,
  ceilingKeeper: 15,
  zoneMaster: 10,
  loggedIt: 5,
  smartStop: 5,
  weekComplete: 20,
  monthStreak: 50,
} as const;

const ZONE_MASTER_PCT = 80;
const SMART_STOP = /smart stop|stopped early|cut (it|the run) short/i;

export interface SessionScore {
  points: number;
  bonuses: string[];
}

export function scoreSession(s: RunSession, rules: RunningPlan['rules']): SessionScore {
  const bonuses: string[] = [];
  let points = Math.round(s.distanceMi * POINTS.perMile);
  if (rules.hr_ceiling != null && s.maxHr != null && s.maxHr <= rules.hr_ceiling) {
    points += POINTS.ceilingKeeper;
    bonuses.push('Ceiling Keeper');
  }
  if (s.z2Pct != null && s.z2Pct >= ZONE_MASTER_PCT) {
    points += POINTS.zoneMaster;
    bonuses.push('Zone Master');
  }
  if (s.avgHr != null && s.maxHr != null && s.durationSec && s.feel != null && s.notes?.trim()) {
    points += POINTS.loggedIt;
    bonuses.push('Logged it');
  }
  if (s.notes && SMART_STOP.test(s.notes)) {
    points += POINTS.smartStop;
    bonuses.push('Smart Stop');
  }
  return { points, bonuses };
}

export interface WeekSummary {
  week: PlanWeek;
  miles: number;
  runs: number;
  longestMi: number;
  avgPaceSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  z2Pct: number | null;
  feel: number | null;
  points: number;
  complete: boolean;
  overCeiling: boolean;
}

export interface Badge {
  id: string;
  label: string;
  emoji: string;
  earnedOn: string | null;
  progress?: string;
}

export interface RunningSummary {
  weeks: WeekSummary[];
  current: WeekSummary | null;
  previous: WeekSummary | null;
  totalMiles: number;
  totalPoints: number;
  longestRunMi: number;
  sessions: number;
  streakWeeks: number;
  daysToRace: number;
  badges: Badge[];
}

export function summarize(
  plan: RunningPlan,
  weeks: PlanWeek[],
  sessions: RunSession[],
  todayIso: string,
): RunningSummary {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const summaries = weeks.map((week) => summarizeWeek(week, sorted.filter((s) => s.date >= week.start && s.date <= week.end), plan));

  // Streak: consecutive complete weeks, newest first. The current week only
  // counts once it is complete; while it is still open the streak runs from
  // the week before.
  let streak = 0;
  let streakBonus = 0;
  let run = 0;
  for (const w of summaries) {
    if (w.week.start > todayIso) break;
    if (w.complete) {
      run += 1;
      streakBonus += POINTS.weekComplete;
      if (run % 4 === 0) streakBonus += POINTS.monthStreak;
    } else if (w.week.end < todayIso) {
      run = 0;
    }
  }
  for (let i = summaries.length - 1; i >= 0; i--) {
    const w = summaries[i];
    if (w.week.start > todayIso) continue;
    if (w.complete) streak += 1;
    else if (w.week.end < todayIso) break;
  }

  const current = summaries.find((w) => todayIso >= w.week.start && todayIso <= w.week.end) ?? null;
  const previous = current ? summaries[current.week.index - 2] ?? null : null;
  const totalMiles = round1(sorted.reduce((a, s) => a + s.distanceMi, 0));
  const sessionPoints = sorted.reduce((a, s) => a + scoreSession(s, plan.rules).points, 0);

  return {
    weeks: summaries,
    current,
    previous,
    totalMiles,
    totalPoints: sessionPoints + streakBonus,
    longestRunMi: sorted.reduce((a, s) => Math.max(a, s.distanceMi), 0),
    sessions: sorted.length,
    streakWeeks: streak,
    daysToRace: Math.max(0, daysBetween(todayIso, plan.race.date)),
    badges: badges(plan, sorted, summaries),
  };
}

function summarizeWeek(week: PlanWeek, sessions: RunSession[], plan: RunningPlan): WeekSummary {
  const miles = round1(sessions.reduce((a, s) => a + s.distanceMi, 0));
  const timed = sessions.filter((s) => s.durationSec && s.distanceMi > 0);
  const timedMiles = timed.reduce((a, s) => a + s.distanceMi, 0);
  const hr = sessions.filter((s) => s.avgHr != null);
  const z2 = sessions.filter((s) => s.z2Pct != null);
  const feel = sessions.filter((s) => s.feel != null);
  const maxHrs = sessions.map((s) => s.maxHr).filter((h): h is number => h != null);
  const maxHr = maxHrs.length ? Math.max(...maxHrs) : null;
  return {
    week,
    miles,
    runs: sessions.length,
    longestMi: sessions.reduce((a, s) => Math.max(a, s.distanceMi), 0),
    avgPaceSec: timedMiles > 0 ? Math.round(timed.reduce((a, s) => a + (s.durationSec ?? 0), 0) / timedMiles) : null,
    avgHr: hr.length ? Math.round(hr.reduce((a, s) => a + (s.avgHr ?? 0), 0) / hr.length) : null,
    maxHr,
    z2Pct: z2.length ? Math.round(z2.reduce((a, s) => a + (s.z2Pct ?? 0), 0) / z2.length) : null,
    feel: feel.length ? round1(feel.reduce((a, s) => a + (s.feel ?? 0), 0) / feel.length) : null,
    points: sessions.reduce((a, s) => a + scoreSession(s, plan.rules).points, 0),
    complete: week.runs > 0 && sessions.length >= week.runs,
    overCeiling: plan.rules.hr_ceiling != null && maxHr != null && maxHr > plan.rules.hr_ceiling,
  };
}

function badges(plan: RunningPlan, sessions: RunSession[], weeks: WeekSummary[]): Badge[] {
  const firstReaching = (mi: number, by?: string) =>
    sessions.find((s) => s.distanceMi >= mi && (!by || s.date <= by))?.date ?? null;

  const ceiling = plan.rules.hr_ceiling;
  const keepers = ceiling != null ? sessions.filter((s) => s.maxHr != null && s.maxHr <= ceiling) : [];
  let cumulative = 0;
  const hundred = sessions.find((s) => (cumulative += s.distanceMi) >= 100)?.date ?? null;
  let run = 0;
  const month = weeks.find((w) => (run = w.complete ? run + 1 : 0) >= 4)?.week.end ?? null;
  const raceDay = sessions.find((s) => s.date === plan.race.date && s.distanceMi >= plan.race.distance_mi * 0.95);

  const list: Badge[] = [
    { id: 'day-one', label: 'Day One', emoji: '🏁', earnedOn: sessions[0]?.date ?? null },
    ...(ceiling != null
      ? [{
          id: 'ceiling-keeper-10', label: 'Ceiling Keeper x10', emoji: '🎯',
          earnedOn: keepers[9]?.date ?? null, progress: `${Math.min(keepers.length, 10)}/10`,
        }]
      : []),
    { id: 'first-5k', label: 'First 5K', emoji: '🥉', earnedOn: firstReaching(3.1) },
    ...(plan.milestones ?? []).map((m) => ({
      id: m.id, label: m.label, emoji: m.emoji ?? '⭐', earnedOn: firstReaching(m.distance_mi, m.by),
    })),
    { id: 'first-10k', label: 'First 10K', emoji: '🥈', earnedOn: firstReaching(6.2) },
    { id: 'month-streak', label: 'Month Streak', emoji: '🔥', earnedOn: month },
    { id: 'race-distance', label: 'Race Distance', emoji: '🥇', earnedOn: firstReaching(plan.race.distance_mi) },
    { id: 'race-finisher', label: `${plan.race.name} Finisher`, emoji: '🏅', earnedOn: raceDay?.date ?? null },
    {
      id: 'hundred-miles', label: '100-Mile Club', emoji: '⭐', earnedOn: hundred,
      progress: `${Math.min(100, Math.round(sessions.reduce((a, s) => a + s.distanceMi, 0)))}/100 mi`,
    },
  ];
  return list;
}

/** Short, data-driven encouragement for the cards. Never medical advice. */
export function encouragement(summary: RunningSummary): string[] {
  const out: string[] = [];
  const cur = summary.current;
  if (summary.sessions === 0) out.push('First run logged is the first badge. Upload it when you are back.');
  if (cur && cur.week.runs > 0) {
    const left = cur.week.runs - cur.runs;
    out.push(left > 0 ? `${left} run${left === 1 ? '' : 's'} left this week to keep the streak.` : 'Every planned run this week is done.');
  }
  if (summary.streakWeeks >= 2) out.push(`${summary.streakWeeks}-week streak. Consistency is the whole plan.`);
  if (cur && summary.previous && cur.miles > summary.previous.miles && summary.previous.miles > 0) {
    out.push(`${round1(cur.miles - summary.previous.miles)} mi more than last week.`);
  }
  if (cur?.overCeiling) out.push('Max HR went over the ceiling this week: note it for the weekly review.');
  const next = summary.badges.find((b) => !b.earnedOn);
  if (next) out.push(`Next badge: ${next.emoji} ${next.label}${next.progress ? ` (${next.progress})` : ''}.`);
  return out;
}

export function paceText(secPerMile: number | null): string {
  if (secPerMile == null) return '—';
  return `${Math.floor(secPerMile / 60)}:${String(secPerMile % 60).padStart(2, '0')}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
