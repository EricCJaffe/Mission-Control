/**
 * Take every reading for a period, and score it.
 *
 * Nothing here talks to a model and nothing here asks Eric a question. The
 * caller supplies the user id — auth is the route's job — and gets back the
 * readings already judged, ready to be written to `mission.review_readings`.
 *
 * WHY EACH AREA READS WHAT IT READS, since these are judgements and not facts:
 *
 * - GOD FIRST reads the practice log, not the Flourishing survey. The survey
 *   is how a week FELT; the practice log is what was done. `practices.ts` is
 *   explicit that the two must never be averaged, because the disagreement is
 *   the insight. A review wants the lived number.
 *
 * - HEALTH — BODY counts logged sessions rather than TSS or strain. A number
 *   that only a device can produce goes red whenever the device is off his
 *   wrist, which measures the watch and not the man.
 *
 * - FAMILY is entered by hand, and that is a finding rather than a shortcut.
 *   Of 240 calendar events, ZERO carry the `family` domain. An automatic
 *   reading would print red every week about the tagging, not about his family.
 *
 * - IMPACT counts overdue open tasks, not open tasks. A long list is a full
 *   life; a late list is a broken promise, and only one of those is a review
 *   finding.
 *
 * - PROJECTS is scored by rule and rolls up to a count of reds, so adding a
 *   project needs no migration. The per-project rows travel in `detail`.
 */

import { daysBetween, dayOf, today as todayInAppTz } from '@/lib/day';
import {
  computePillarScores,
  type DomainScoreInput,
  type Pillar,
} from '@/lib/flourishing/spirit-soul-body';
import {
  pillarPracticeScore,
  summarisePractices,
  type Practice,
  type PracticeLog,
} from '@/lib/spirit/practices';
import type { MissionClient } from '@/lib/supabase/schema';
import { periodDays, periodFor, previousPeriod, type CycleKind, type Period } from './periods';
import { carryFrom, overallStatus, unitLabelFor, verdictFor, type ReviewStatus } from './status';
import type { CollectedReading, ProjectLine, ReviewArea } from './types';

/**
 * A project is stale once a month has passed with nothing moving on it. The
 * same 30 days the brief's stale-task verdict uses, deliberately — two
 * different definitions of "stale" in one app is how a number stops being
 * trusted.
 */
export const PROJECT_STALE_DAYS = 30;
/** Drifting, but not yet stale. */
export const PROJECT_DRIFT_DAYS = 14;

// ---------------------------------------------------------------------------
// The collectors. One per `source`, each returning what it measured.
// ---------------------------------------------------------------------------

/** God First: spirit-practice adherence over the period, on the 0–10 scale. */
async function collectPractices(
  db: MissionClient,
  userId: string,
  period: Period
): Promise<CollectedReading> {
  const { data: practices } = await db
    .from('practices')
    .select('id,key,label,pillar,cadence,target_per_period,sort_order,due_weekday,due_day_of_month,created_at,active')
    .eq('user_id', userId)
    .eq('pillar', 'spirit')
    .eq('active', true);

  const rows = (practices ?? []) as Array<Practice & { pillar: string }>;
  if (rows.length === 0) {
    return { hasReading: false, value: null, detail: { reason: 'no active spirit practices' } };
  }

  const { data: logs } = await db
    .from('practice_logs')
    .select('practice_id,log_date,completed')
    .eq('user_id', userId)
    .gte('log_date', period.start)
    .lte('log_date', period.end);

  const practiceLogs = (logs ?? []) as PracticeLog[];
  const completed = practiceLogs.filter((l) => l.completed);

  // Nothing ticked all period is silence, not a score of zero. The difference
  // matters: both are red, but only one of them is "you did not log it".
  if (completed.length === 0) {
    return {
      hasReading: false,
      value: null,
      detail: { practices: rows.length, logged: 0, window: [period.start, period.end] },
    };
  }

  const summaries = summarisePractices(rows, practiceLogs, {
    windowDays: periodDays(period),
    today: period.end,
  });
  const score = pillarPracticeScore(summaries);

  return {
    hasReading: score !== null,
    value: score,
    detail: {
      logged: completed.length,
      practices: summaries.map((s) => ({
        key: s.practice.key,
        label: s.practice.label,
        score: s.adherence.score,
        met: s.adherence.met,
        periods: s.adherence.periods,
        streak: s.adherence.streak,
      })),
    },
  };
}

/** Health — Body: training sessions logged inside the period. */
async function collectTraining(
  db: MissionClient,
  userId: string,
  period: Period
): Promise<CollectedReading> {
  const { data } = await db
    .from('workout_logs')
    .select('id,workout_date,workout_type,duration_minutes')
    .eq('user_id', userId)
    .gte('workout_date', period.start)
    .lte('workout_date', period.end);

  const sessions = data ?? [];
  // Zero sessions IS a reading here, unlike the practice log: a workout is
  // recorded by the device as well as by hand, so an empty week is much more
  // likely to be an empty week than a logging gap.
  const minutes = sessions.reduce(
    (sum: number, s: { duration_minutes: number | null }) => sum + (s.duration_minutes ?? 0),
    0
  );

  return {
    hasReading: true,
    value: sessions.length,
    detail: {
      sessions: sessions.length,
      minutes,
      types: sessions.map((s: { workout_type: string | null }) => s.workout_type).filter(Boolean),
    },
  };
}

/** Impact: open tasks that are past their due date, across every project. */
async function collectTasks(
  db: MissionClient,
  userId: string,
  period: Period
): Promise<CollectedReading> {
  // Judged as at the END of the period, not as at today. A closed cycle must
  // read the same next month as it did the day it closed.
  const asAt = period.end < todayInAppTz() ? period.end : todayInAppTz();

  const { data } = await db
    .from('tasks')
    .select('id,title,status,due_date,domain,project_id')
    .eq('user_id', userId)
    .neq('status', 'done');

  const open = data ?? [];
  const overdue = open.filter(
    (t: { due_date: string | null }) => t.due_date !== null && t.due_date < asAt
  );
  const undated = open.filter((t: { due_date: string | null }) => t.due_date === null);

  return {
    hasReading: true,
    value: overdue.length,
    detail: {
      open: open.length,
      overdue: overdue.length,
      undated: undated.length,
      asAt,
      worst: overdue
        .slice()
        .sort((a: { due_date: string | null }, b: { due_date: string | null }) =>
          String(a.due_date).localeCompare(String(b.due_date))
        )
        .slice(0, 5)
        .map((t: { id: string; title: string; due_date: string | null }) => ({
          id: t.id,
          title: t.title,
          due: t.due_date,
          daysLate: t.due_date ? daysBetween(t.due_date, asAt) : null,
        })),
    },
  };
}

/** Family, or anything else on `calendar`: scheduled hours in that domain. */
async function collectCalendar(
  db: MissionClient,
  userId: string,
  period: Period,
  domain: string
): Promise<CollectedReading> {
  const { data } = await db
    .from('calendar_events')
    .select('id,title,start_at,end_at,domain')
    .eq('user_id', userId)
    .eq('domain', domain)
    .gte('start_at', `${period.start}T00:00:00Z`)
    .lte('start_at', `${period.end}T23:59:59Z`);

  const events = data ?? [];
  if (events.length === 0) {
    return { hasReading: false, value: null, detail: { domain, events: 0 } };
  }

  const hours = events.reduce((sum: number, e: { start_at: string; end_at: string | null }) => {
    if (!e.end_at) return sum;
    const ms = new Date(e.end_at).getTime() - new Date(e.start_at).getTime();
    return sum + (Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0);
  }, 0);

  return {
    hasReading: true,
    value: Math.round(hours * 10) / 10,
    detail: { domain, events: events.length, hours: Math.round(hours * 10) / 10 },
  };
}

/**
 * Health — Soul: the newest Flourishing assessment taken inside the period.
 *
 * `domain_scores` is an ARRAY of per-domain objects, not a `{spirit, soul,
 * body}` map — the six survey domains, each with its own `score`, `label`,
 * tips and scripture. There is no `soul` key anywhere in it. The Spirit / Soul
 * / Body rollup is a WEIGHTED mean computed by `computePillarScores`, and the
 * weights are not decorative: they carry the priority order inherited from the
 * retired Monthly Alignment review. Averaging the domains here instead would
 * produce a different number from the one the dashboard shows for the same
 * assessment, which is the precise way a metric stops being believed.
 */
async function collectFlourishing(
  db: MissionClient,
  userId: string,
  period: Period,
  pillar: Pillar
): Promise<CollectedReading> {
  const { data } = await db
    .from('flourishing_assessments')
    .select('id,created_at,domain_scores')
    .eq('user_id', userId)
    .gte('created_at', `${period.start}T00:00:00Z`)
    .lte('created_at', `${period.end}T23:59:59Z`)
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = (data ?? [])[0] as
    | { id: string; created_at: string; domain_scores: unknown }
    | undefined;

  // Not taken in the period is exactly the silence Eric's rule is about.
  if (!latest) {
    return { hasReading: false, value: null, detail: { assessments: 0, pillar } };
  }

  const raw = Array.isArray(latest.domain_scores) ? latest.domain_scores : [];
  const inputs: DomainScoreInput[] = raw
    .map((entry) => entry as { domain?: unknown; score?: unknown })
    .filter((entry) => typeof entry.domain === 'string' && typeof entry.score === 'number')
    .map((entry) => ({ domain: entry.domain as string, score: entry.score as number }));

  const pillars = computePillarScores(inputs);
  const match = pillars.find((p) => p.pillar === pillar);

  return {
    hasReading: match?.score !== null && match?.score !== undefined,
    value: match?.score ?? null,
    detail: {
      assessmentId: latest.id,
      takenOn: dayOf(latest.created_at),
      pillar,
      contributing: match?.contributing ?? [],
      allPillars: pillars.map((p) => ({ pillar: p.pillar, score: p.score, trend: p.trend })),
    },
  };
}

/**
 * Projects: each active project scored by rule, rolled up to a count of reds.
 *
 * THE RULES, and they print verbatim on the row so a red is always arguable:
 *
 *   red    — it has overdue work, or nothing has moved on it in 30 days
 *   yellow — drifting: nothing in 14 days, or open work with no dates on it,
 *            or an active project with no open tasks at all
 *   green  — open work, none late, touched inside a fortnight
 *
 * "Active with no open tasks" is yellow rather than green on purpose. Twenty
 * of the twenty-two projects on this board say `active` and thirteen have no
 * open task, which means the status field is carrying no information at all.
 * A project that is genuinely finished should say so; one that is genuinely
 * running should have something in it. Either way it is a question, which is
 * what yellow means.
 */
async function collectProjects(
  db: MissionClient,
  userId: string,
  period: Period
): Promise<CollectedReading> {
  const asAt = period.end < todayInAppTz() ? period.end : todayInAppTz();

  const { data: projectRows } = await db
    .from('projects')
    .select('id,title,status,domain,client,updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('priority', { ascending: true });

  const projects = projectRows ?? [];
  if (projects.length === 0) {
    return { hasReading: true, value: 0, detail: { projects: [] } };
  }

  const { data: taskRows } = await db
    .from('tasks')
    .select('id,project_id,status,due_date,updated_at')
    .eq('user_id', userId)
    .neq('status', 'done')
    .not('project_id', 'is', null);

  const byProject = new Map<string, Array<{ due_date: string | null }>>();
  for (const task of (taskRows ?? []) as Array<{ project_id: string; due_date: string | null }>) {
    const list = byProject.get(task.project_id) ?? [];
    list.push(task);
    byProject.set(task.project_id, list);
  }

  const lines: ProjectLine[] = projects.map(
    (p: {
      id: string;
      title: string;
      client: string | null;
      domain: string | null;
      updated_at: string | null;
    }) => {
      const tasks = byProject.get(p.id) ?? [];
      const overdue = tasks.filter((t) => t.due_date !== null && t.due_date < asAt).length;
      const undated = tasks.filter((t) => t.due_date === null).length;
      const touched = p.updated_at ? dayOf(p.updated_at) : null;
      const idle = touched ? daysBetween(touched, asAt) : null;

      let status: ReviewStatus = 'green';
      let reason = `${tasks.length} open, none late, touched ${idle ?? 0}d ago.`;

      if (overdue > 0) {
        status = 'red';
        reason = `${overdue} overdue task${overdue === 1 ? '' : 's'}.`;
      } else if (idle !== null && idle >= PROJECT_STALE_DAYS) {
        status = 'red';
        reason = `No movement in ${idle} days.`;
      } else if (tasks.length === 0) {
        status = 'yellow';
        reason = 'Active, but no open tasks — finished, or forgotten?';
      } else if (idle !== null && idle >= PROJECT_DRIFT_DAYS) {
        status = 'yellow';
        reason = `Nothing moved in ${idle} days.`;
      } else if (undated === tasks.length) {
        status = 'yellow';
        reason = `${tasks.length} open, none with a date.`;
      }

      return {
        id: p.id,
        title: p.title,
        client: p.client,
        domain: p.domain,
        status,
        reason,
        openTasks: tasks.length,
        overdueTasks: overdue,
        undatedTasks: undated,
        daysSinceTouch: idle,
      };
    }
  );

  const rank = { red: 0, yellow: 1, green: 2, not_due: 3 } as const;
  lines.sort((a, b) => rank[a.status] - rank[b.status] || a.title.localeCompare(b.title));

  return {
    hasReading: true,
    value: lines.filter((l) => l.status === 'red').length,
    detail: {
      asAt,
      total: lines.length,
      red: lines.filter((l) => l.status === 'red').length,
      yellow: lines.filter((l) => l.status === 'yellow').length,
      green: lines.filter((l) => l.status === 'green').length,
      projects: lines,
    },
  };
}

/**
 * Manual: whatever he last entered for this area inside the period.
 *
 * Nothing is carried forward from last week. A number that persists until it
 * is overwritten would let one good week report itself for a year, which is
 * worse than no number — and the whole point of this module is that silence
 * shows up as red rather than as the last thing anybody said.
 */
async function collectManual(
  db: MissionClient,
  userId: string,
  period: Period,
  areaKey: string
): Promise<CollectedReading> {
  const { data } = await db
    .from('review_readings')
    .select('value,has_reading,computed_at,cycle_id,review_cycles!inner(period_start)')
    .eq('user_id', userId)
    .eq('area_key', areaKey)
    .eq('review_cycles.period_start', period.start)
    .limit(1);

  const existing = (data ?? [])[0] as { value: number | null; has_reading: boolean } | undefined;
  if (!existing || !existing.has_reading || existing.value === null) {
    return { hasReading: false, value: null, detail: { entered: false } };
  }
  return { hasReading: true, value: existing.value, detail: { entered: true } };
}

// ---------------------------------------------------------------------------
// Scoring a whole cycle.
// ---------------------------------------------------------------------------

/** Should this area be read in a cycle of this kind and period? */
export function areaIsDue(area: ReviewArea, kind: CycleKind, period: Period): { due: boolean; reason: string } {
  if (!area.active) return { due: false, reason: 'Area is switched off.' };

  if (area.cadence !== kind) {
    return { due: false, reason: `Read ${area.cadence}, not ${kind}.` };
  }

  /*
   * An area cannot be judged on a period that was already OVER when it was
   * invented. `computeAdherence` applies the same guard to a newly added
   * practice, and for the same reason: scoring a month red for not meeting a
   * line nobody had drawn yet is just noise.
   *
   * The comparison is against `period.end`, NOT `period.start`, and that
   * distinction is the whole difference between a module that works on its
   * first day and one that does not. The underlying data — practice logs,
   * workouts, the task board — is historical and covers the period whether or
   * not the area existed on its first morning. Guarding on `period.start`
   * meant every tile read "added after this period began" the day the module
   * shipped, which is a blank page, which is what killed the last one.
   *
   * A period still running is always fair game: there is time left to act on
   * it, which is the point of reading it at all.
   */
  const created = area.created_at ? dayOf(area.created_at) : null;
  if (created && created > period.end) {
    return { due: false, reason: `Added ${created}, after this period had ended.` };
  }

  return { due: true, reason: '' };
}

export type ScoredReading = {
  area: ReviewArea;
  status: ReviewStatus;
  reason: string;
  hasReading: boolean;
  value: number | null;
  detail: Record<string, unknown>;
};

async function readFor(
  db: MissionClient,
  userId: string,
  area: ReviewArea,
  period: Period
): Promise<CollectedReading> {
  switch (area.source) {
    case 'practices':
      return collectPractices(db, userId, period);
    case 'training':
      return collectTraining(db, userId, period);
    case 'tasks':
      return collectTasks(db, userId, period);
    case 'calendar':
      return collectCalendar(db, userId, period, area.matrix_key === 'family' ? 'family' : 'work');
    case 'flourishing':
      // The area's key names the pillar it wants: `health_soul` -> soul.
      return collectFlourishing(
        db,
        userId,
        period,
        area.key.endsWith('_body') ? 'body' : area.key.endsWith('_spirit') ? 'spirit' : 'soul'
      );
    case 'projects':
      return collectProjects(db, userId, period);
    case 'manual':
      return collectManual(db, userId, period, area.key);
    default:
      return { hasReading: false, value: null, detail: { reason: `no collector for ${area.source}` } };
  }
}

/** Every area read and scored for one period. */
export async function scoreCycle(
  db: MissionClient,
  userId: string,
  kind: CycleKind,
  period: Period
): Promise<ScoredReading[]> {
  const { data } = await db
    .from('review_areas')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  const areas = (data ?? []) as ReviewArea[];
  const scored: ScoredReading[] = [];

  for (const area of areas) {
    const due = areaIsDue(area, kind, period);

    if (!due.due) {
      // An area that is not due is skipped entirely rather than stored as a
      // grey row, unless it belongs to this cadence — a monthly area has no
      // business appearing in fifty-two weekly cycles.
      if (area.cadence !== kind) continue;
      scored.push({
        area,
        status: 'not_due',
        reason: due.reason,
        hasReading: false,
        value: null,
        detail: {},
      });
      continue;
    }

    const reading = await readFor(db, userId, area, period);
    const verdict =
      reading.status !== undefined
        ? { status: reading.status, reason: reading.reason ?? '' }
        : verdictFor(reading, { target: area.target, warnAt: area.warn_at, direction: area.direction }, {
            unitLabel: unitLabelFor(area.unit),
          });

    scored.push({
      area,
      status: verdict.status,
      reason: verdict.reason,
      hasReading: reading.hasReading,
      value: reading.value,
      detail: reading.detail,
    });
  }

  return scored;
}

/**
 * Score a period and write the result, preserving anything Eric has written.
 *
 * Recomputing must never erase a note or an action. The numbers are the
 * machine's and the words are his, and an upsert that dropped his line every
 * Monday morning would be the fastest possible way to make him stop writing
 * one.
 */
export async function collectInto(
  db: MissionClient,
  userId: string,
  cycle: { id: string; kind: CycleKind; period_start: string; period_end: string }
): Promise<{ written: number; overall: 'red' | 'yellow' | 'green' | null }> {
  const period: Period = {
    kind: cycle.kind,
    start: cycle.period_start,
    end: cycle.period_end,
  };

  const scored = await scoreCycle(db, userId, cycle.kind, period);

  // What the previous cycle of this kind said, so a repeat can be counted.
  const prior = previousPeriod(period);
  const { data: priorRows } = await db
    .from('review_readings')
    .select('area_key,status,carried_cycles,review_cycles!inner(period_start,kind)')
    .eq('user_id', userId)
    .eq('review_cycles.period_start', prior.start)
    .eq('review_cycles.kind', cycle.kind);

  const priorByKey = new Map<string, { status: ReviewStatus; carried: number }>();
  for (const row of (priorRows ?? []) as Array<{
    area_key: string;
    status: ReviewStatus;
    carried_cycles: number;
  }>) {
    priorByKey.set(row.area_key, { status: row.status, carried: row.carried_cycles });
  }

  // His words, so the recompute can put them back.
  const { data: existingRows } = await db
    .from('review_readings')
    .select('area_key,note_md,action_md')
    .eq('cycle_id', cycle.id);

  const words = new Map<string, { note_md: string | null; action_md: string | null }>();
  for (const row of (existingRows ?? []) as Array<{
    area_key: string;
    note_md: string | null;
    action_md: string | null;
  }>) {
    words.set(row.area_key, { note_md: row.note_md, action_md: row.action_md });
  }

  const now = new Date().toISOString();
  const rows = scored.map((s) => {
    const priorEntry = priorByKey.get(s.area.key) ?? null;
    const kept = words.get(s.area.key);
    return {
      user_id: userId,
      cycle_id: cycle.id,
      area_id: s.area.id,
      area_key: s.area.key,
      label: s.area.label,
      matrix_key: s.area.matrix_key,
      kind: s.area.kind,
      unit: s.area.unit,
      direction: s.area.direction,
      target: s.area.target,
      warn_at: s.area.warn_at,
      has_reading: s.hasReading,
      value: s.hasReading ? s.value : null,
      status: s.status,
      status_reason: s.reason,
      detail: s.detail,
      note_md: kept?.note_md ?? null,
      action_md: kept?.action_md ?? null,
      prior_status: priorEntry?.status ?? null,
      carried_cycles: carryFrom(s.status, priorEntry),
      computed_at: now,
      updated_at: now,
    };
  });

  if (rows.length > 0) {
    const { error } = await db
      .from('review_readings')
      .upsert(rows, { onConflict: 'cycle_id,area_key' });
    if (error) throw new Error(`review readings upsert failed: ${error.message}`);
  }

  const overall = overallStatus(scored.map((s) => s.status));

  await db
    .from('review_cycles')
    .update({ overall, collected_at: now, updated_at: now })
    .eq('id', cycle.id);

  return { written: rows.length, overall };
}

/** Open the cycle for a period if it is not already there, and score it. */
export async function ensureCycle(
  db: MissionClient,
  userId: string,
  kind: CycleKind,
  on: string = todayInAppTz()
): Promise<{ id: string; created: boolean; period: Period }> {
  const period = periodFor(kind, on);

  const { data: existing } = await db
    .from('review_cycles')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('period_start', period.start)
    .maybeSingle();

  if (existing) return { id: existing.id as string, created: false, period };

  const { data, error } = await db
    .from('review_cycles')
    .insert({
      user_id: userId,
      kind,
      period_start: period.start,
      period_end: period.end,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) throw new Error(`review cycle insert failed: ${error.message}`);
  return { id: data.id as string, created: true, period };
}
