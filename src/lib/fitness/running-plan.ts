/**
 * A periodized running plan: race, standing rules, phases and milestones.
 *
 * Stored as `mission.running_plans.body` (one active plan per user, owner-only
 * RLS). The plan's own numbers (HR ceiling, zone 2) live in that row, never in
 * this repo; nothing here hard-codes a person's limits.
 *
 * Weeks are derived, not stored: 7-day blocks from `start_date` through the
 * race. The long-run target ramps linearly across each phase, and a deload
 * week cuts it by about 30%, which is how the plan itself is written.
 */

import { addDays, daysBetween } from '../day.ts';

export interface RunningPlanPhase {
  name: string;
  start: string;
  end: string;
  runs_per_week: number;
  long_run_start_mi: number | null;
  long_run_end_mi: number | null;
  intensity: string;
  /** Any date inside a deload week. */
  deload_weeks?: string[];
  /** Set when an element of this phase needs a clinician's OK before it starts. */
  needs_clearance?: string;
}

export interface RunningPlanMilestone {
  id: string;
  label: string;
  emoji?: string;
  distance_mi: number;
  /** Earned only if reached on or before this date. */
  by?: string;
}

export interface RunningPlan {
  version: 1;
  name: string;
  start_date: string;
  race: { name: string; date: string; distance_mi: number; goal?: string; url?: string };
  rules: { hr_ceiling?: number; z2_low?: number; z2_high?: number; notes?: string[] };
  phases: RunningPlanPhase[];
  milestones?: RunningPlanMilestone[];
  warning_signs?: string[];
}

export interface PlanWeek {
  index: number;
  start: string;
  end: string;
  phase: string | null;
  runs: number;
  longRunMi: number | null;
  deload: boolean;
  intensity: string | null;
  needsClearance: string | null;
  raceWeek: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DELOAD_FACTOR = 0.7;

export function validateRunningPlan(
  input: unknown,
): { ok: true; plan: RunningPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const p = input as Partial<RunningPlan> | null;
  if (!p || typeof p !== 'object') return { ok: false, errors: ['plan must be a JSON object'] };
  if (p.version !== 1) errors.push('version must be 1');
  if (!p.name || typeof p.name !== 'string') errors.push('name is required');
  if (!p.start_date || !ISO.test(p.start_date)) errors.push('start_date must be YYYY-MM-DD');
  const race = p.race;
  if (!race || !race.name || !race.date || !ISO.test(race.date) || !(race.distance_mi > 0)) {
    errors.push('race needs name, date (YYYY-MM-DD) and distance_mi > 0');
  } else if (p.start_date && ISO.test(p.start_date) && race.date < p.start_date) {
    errors.push('race.date is before start_date');
  }
  if (!p.rules || typeof p.rules !== 'object') errors.push('rules is required (may be {})');
  const r = p.rules ?? {};
  if (r.z2_low != null && r.z2_high != null && r.z2_low >= r.z2_high) errors.push('rules.z2_low must be below z2_high');
  if (!Array.isArray(p.phases) || p.phases.length === 0) {
    errors.push('phases must be a non-empty array');
  } else {
    p.phases.forEach((ph, i) => {
      if (!ph?.name) errors.push(`phases[${i}].name is required`);
      if (!ISO.test(ph?.start ?? '') || !ISO.test(ph?.end ?? '') || ph.start > ph.end) {
        errors.push(`phases[${i}] needs start <= end as YYYY-MM-DD`);
      }
      if (!(Number.isInteger(ph?.runs_per_week) && ph.runs_per_week >= 0 && ph.runs_per_week <= 14)) {
        errors.push(`phases[${i}].runs_per_week must be an integer 0-14`);
      }
    });
  }
  for (const [i, m] of (p.milestones ?? []).entries()) {
    if (!m?.id || !m?.label || !(m.distance_mi > 0)) errors.push(`milestones[${i}] needs id, label, distance_mi > 0`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan: p as RunningPlan };
}

export function planWeeks(plan: RunningPlan): PlanWeek[] {
  const total = Math.floor(daysBetween(plan.start_date, plan.race.date) / 7) + 1;
  const weeks: PlanWeek[] = [];
  for (let i = 0; i < total; i++) {
    const start = addDays(plan.start_date, i * 7);
    const end = addDays(start, 6);
    const phase = phaseFor(plan, start, end);
    weeks.push({
      index: i + 1,
      start,
      end,
      phase: phase?.name ?? null,
      runs: phase?.runs_per_week ?? 0,
      longRunMi: null,
      deload: !!phase?.deload_weeks?.some((d) => d >= start && d <= end),
      intensity: phase?.intensity ?? null,
      needsClearance: phase?.needs_clearance ?? null,
      raceWeek: plan.race.date >= start && plan.race.date <= end,
    });
  }
  // Ramp each phase's long run across the weeks that belong to it.
  for (const phase of plan.phases) {
    const own = weeks.filter((w) => w.phase === phase.name);
    const from = phase.long_run_start_mi;
    const to = phase.long_run_end_mi ?? from;
    if (from == null || to == null) continue;
    own.forEach((w, i) => {
      const ramp = own.length > 1 ? from + ((to - from) * i) / (own.length - 1) : to;
      w.longRunMi = halfMile(w.deload ? ramp * DELOAD_FACTOR : ramp);
    });
  }
  return weeks;
}

/** The phase covering most of the week (ties go to the earlier phase). */
function phaseFor(plan: RunningPlan, start: string, end: string): RunningPlanPhase | null {
  let best: RunningPlanPhase | null = null;
  let bestDays = 0;
  for (const ph of plan.phases) {
    const from = ph.start > start ? ph.start : start;
    const to = ph.end < end ? ph.end : end;
    const days = from <= to ? daysBetween(from, to) + 1 : 0;
    if (days > bestDays) {
      best = ph;
      bestDays = days;
    }
  }
  return best;
}

export function weekFor(weeks: PlanWeek[], date: string): PlanWeek | null {
  return weeks.find((w) => date >= w.start && date <= w.end) ?? null;
}

function halfMile(n: number): number {
  return Math.round(n * 2) / 2;
}
