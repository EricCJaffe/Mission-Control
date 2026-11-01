/**
 * Server-side loader for the running plan function. It reads only the four
 * tables that are its source of truth (migration 20261101160000):
 *
 *   running_plans             the active plan (body = RunningPlan JSON)
 *   running_sessions          the session log, from every source
 *   coaching_recommendations  coaching notes for the plan, with review status
 *   health_access_docs        reference docs (how Apple Health reaches the app)
 *
 * Before the migration is applied every read fails; that is treated as "no
 * plan yet" rather than an error, so the page still renders.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { planWeeks, validateRunningPlan, type PlanWeek, type RunningPlan } from './running-plan';
import type { RunSession } from './running-score';

export interface LoggedRun extends RunSession {
  id: string;
  source: string;
  pace: string | null;
  gainFt: number | null;
  kcal: number | null;
  longestContinuousMin: number | null;
}

export interface CoachingRec {
  id: string;
  ordinal: number;
  text: string;
  status: string;
  reviewer: string | null;
}

export interface HealthDoc {
  id: string;
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface RunningData {
  planId: string;
  title: string;
  version: string | null;
  plan: RunningPlan;
  weeks: PlanWeek[];
  runs: LoggedRun[];
  recs: CoachingRec[];
}

export async function loadActivePlan(
  supabase: MissionClient,
  userId: string,
): Promise<{ id: string; title: string; version: string | null; plan: RunningPlan } | null> {
  const { data, error } = await supabase
    .from('running_plans')
    .select('id, title, version, body')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  const checked = validateRunningPlan(data.body);
  if (!checked.ok) return null;
  return { id: data.id, title: data.title, version: data.version, plan: checked.plan };
}

export async function loadRunningData(supabase: MissionClient, userId: string): Promise<RunningData | null> {
  const active = await loadActivePlan(supabase, userId);
  if (!active) return null;
  const { plan } = active;

  const [{ data: sessions }, { data: recs }] = await Promise.all([
    supabase
      .from('running_sessions')
      .select('id, session_date, distance_mi, duration_s, pace, avg_hr, max_hr, z2_pct, longest_continuous_min, gain_ft, kcal, feel, notes, source')
      .eq('user_id', userId)
      .gte('session_date', plan.start_date)
      .lte('session_date', plan.race.date)
      .order('session_date', { ascending: true }),
    supabase
      .from('coaching_recommendations')
      .select('id, ordinal, text, status, reviewer')
      .eq('user_id', userId)
      .eq('plan_id', active.id)
      .order('ordinal', { ascending: true }),
  ]);

  const runs: LoggedRun[] = (sessions ?? []).map((r) => ({
    id: r.id,
    date: r.session_date,
    distanceMi: Number(r.distance_mi),
    durationSec: r.duration_s,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    z2Pct: r.z2_pct,
    feel: r.feel,
    notes: r.notes,
    source: r.source,
    pace: r.pace,
    gainFt: r.gain_ft,
    kcal: r.kcal,
    longestContinuousMin: r.longest_continuous_min != null ? Number(r.longest_continuous_min) : null,
  }));

  return {
    planId: active.id,
    title: active.title,
    version: active.version,
    plan,
    weeks: planWeeks(plan),
    runs,
    recs: (recs ?? []) as CoachingRec[],
  };
}

export async function loadHealthDocs(supabase: MissionClient, userId: string): Promise<HealthDoc[]> {
  const { data, error } = await supabase
    .from('health_access_docs')
    .select('id, slug, title, body, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((d) => ({ id: d.id, slug: d.slug, title: d.title, body: d.body, updatedAt: d.updated_at }));
}
