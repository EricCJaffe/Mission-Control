import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import TrainingPlanActionsClient from '@/components/fitness/TrainingPlanActionsClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

export default async function TrainingPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/login');

  const { id } = await params;
  const { data: plan } = await supabase
    .from('training_plans')
    .select('id, name, start_date, end_date, cycle_weeks, plan_type, status, weekly_template, config, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plan) notFound();

  const [{ data: plannedWorkouts }, { data: workoutLogs }, { data: bodyMetrics }, { data: recoverySessions }] = await Promise.all([
    supabase
      .from('planned_workouts')
      .select('id, scheduled_date, week_number, day_label, workout_type, prescribed, status')
      .eq('user_id', user.id)
      .eq('plan_id', plan.id)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('id, planned_workout_id, workout_date, workout_type, duration_minutes, compliance_pct, cardio_logs(time_in_zone2_min)')
      .eq('user_id', user.id)
      .gte('workout_date', `${plan.start_date}T00:00:00`)
      .lte('workout_date', `${plan.end_date}T23:59:59`)
      .order('workout_date', { ascending: true }),
    supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, weight_lbs')
      .eq('user_id', user.id)
      .gte('metric_date', plan.start_date)
      .lte('metric_date', plan.end_date)
      .order('metric_date', { ascending: true }),
    supabase
      .from('recovery_sessions')
      .select('session_date, duration_min, modality')
      .eq('user_id', user.id)
      .gte('session_date', plan.start_date)
      .lte('session_date', plan.end_date)
      .order('session_date', { ascending: true }),
  ]);

  const config = (plan.config || {}) as JsonRecord;
  const targetMetrics = asRecordArray(config.target_metrics);
  const weeklyFramework = asRecordArray(config.weekly_framework);
  const dayTypeGuidance = asRecordArray(config.day_type_guidance);
  const phases = asRecordArray(config.phases);
  const weeklyTracking = asStringArray(config.weekly_tracking);
  const weeklyTemplate = Array.isArray(plan.weekly_template) ? (plan.weekly_template as JsonRecord[]) : [];

  const progress = buildProgress(plannedWorkouts || [], workoutLogs || [], bodyMetrics || [], recoverySessions || []);

  return (
    <main className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Training Plan</p>
            <h1 className="mt-2 text-3xl font-semibold">{plan.name}</h1>
            <p className="mt-3 text-sm text-slate-300">
              {plan.start_date} to {plan.end_date} · {plan.plan_type || 'training'} · {plan.cycle_weeks || 12} weeks · {plan.status}
            </p>
            {typeof config.primary_objective === 'string' && config.primary_objective ? (
              <p className="mt-4 text-sm leading-7 text-slate-200">{config.primary_objective}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/fitness/plans/report?id=${plan.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              Download PDF
            </a>
            <Link href="/fitness/plans" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10">
              Back to Plans
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Executive Summary</h2>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {typeof config.executive_summary === 'string' && config.executive_summary
              ? config.executive_summary
              : 'No executive summary saved for this plan yet.'}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Plan Management</h2>
            <p className="mt-1 text-sm text-slate-500">
              Turn the framework into scheduled workouts, then manage exact workouts on the calendar.
            </p>
          </div>
          <TrainingPlanActionsClient planId={plan.id} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Plan Adherence" value={progress.adherenceLabel} sub={`${progress.completedPlanned}/${progress.totalPlanned} scheduled sessions completed`} />
        <MetricCard label="Zone 2 Minutes" value={String(progress.zone2Minutes)} sub="Logged during this plan window" />
        <MetricCard label="Strength Days" value={`${progress.completedStrength}/${progress.plannedStrength}`} sub="Completed vs planned" />
        <MetricCard label="RHR Trend" value={progress.rhrTrendLabel} sub="Start to latest within block" />
        <MetricCard label="HRV Trend" value={progress.hrvTrendLabel} sub="Start to latest within block" />
        <MetricCard label="Recovery Work" value={`${progress.recoverySessions}`} sub={`${progress.recoveryMinutes} min logged in plan window`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Targets vs Actuals</h2>
          {targetMetrics.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No explicit targets saved.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {targetMetrics.map((target, index) => (
                <div key={`${String(target.metric)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{String(target.metric || 'Metric')}</p>
                      <p className="mt-1 text-sm text-slate-700">Baseline: {String(target.current || '—')}</p>
                      <p className="text-sm text-slate-700">Target: {String(target.target || '—')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{resolveMetricActual(target.metric, progress)}</p>
                    </div>
                  </div>
                  {target.why ? <p className="mt-2 text-xs leading-6 text-slate-500">{String(target.why)}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Weekly Progress</h2>
          {progress.weeklyRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No scheduled or completed plan activity yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">Week</th>
                    <th className="pb-2 pr-4">Planned</th>
                    <th className="pb-2 pr-4">Done</th>
                    <th className="pb-2 pr-4">Adherence</th>
                    <th className="pb-2 pr-4">Z2 Min</th>
                    <th className="pb-2 pr-4">Strength</th>
                    <th className="pb-2">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.weeklyRows.map((row) => (
                    <tr key={row.week} className="border-t border-slate-100">
                      <td className="py-3 pr-4 font-medium text-slate-900">Week {row.week}</td>
                      <td className="py-3 pr-4 text-slate-700">{row.planned}</td>
                      <td className="py-3 pr-4 text-slate-700">{row.completed}</td>
                      <td className="py-3 pr-4 text-slate-700">{row.adherence}%</td>
                      <td className="py-3 pr-4 text-slate-700">{row.zone2Minutes}</td>
                      <td className="py-3 pr-4 text-slate-700">{row.strengthCompleted}/{row.strengthPlanned}</td>
                      <td className="py-3 text-slate-700">{row.recoverySessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Weekly Framework">
          {weeklyFramework.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly framework saved.</p>
          ) : (
            <div className="space-y-3">
              {weeklyFramework.map((day, index) => (
                <div key={`${String(day.day_name)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-900">{String(day.day_name || `Day ${index + 1}`)}</p>
                    <p className="text-xs text-slate-500">{String(day.duration_min || '—')} min</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{String(day.session_type || 'Session')}</p>
                  {day.purpose ? <p className="mt-2 text-xs leading-6 text-slate-500">{String(day.purpose)}</p> : null}
                  {day.notes ? <p className="mt-1 text-xs leading-6 text-slate-500">{String(day.notes)}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Day-Type Guidance">
          {dayTypeGuidance.length === 0 ? (
            <p className="text-sm text-slate-500">No day-type guidance saved.</p>
          ) : (
            <div className="space-y-3">
              {dayTypeGuidance.map((dayType, index) => (
                <div key={`${String(dayType.type)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{String(dayType.type || `Type ${index + 1}`)}</p>
                  {dayType.description ? <p className="mt-1 text-sm text-slate-700">{String(dayType.description)}</p> : null}
                  {dayType.intensity_guidance ? <p className="mt-2 text-xs leading-6 text-slate-500">Intensity: {String(dayType.intensity_guidance)}</p> : null}
                  {dayType.duration_guidance ? <p className="text-xs leading-6 text-slate-500">Duration: {String(dayType.duration_guidance)}</p> : null}
                  {Array.isArray(dayType.examples) && dayType.examples.length > 0 ? (
                    <p className="text-xs leading-6 text-slate-500">Examples: {(dayType.examples as unknown[]).map(String).join(', ')}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">12-Week Progression</h2>
        {phases.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No phase progression saved.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {phases.map((phase, index) => (
              <div key={`${String(phase.phase_name)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{String(phase.phase_name || `Phase ${index + 1}`)}</p>
                {Array.isArray(phase.weeks) && phase.weeks.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Weeks {(phase.weeks as unknown[]).map(String).join(', ')}</p>
                ) : null}
                {phase.focus ? <p className="mt-2 text-sm text-slate-700">{String(phase.focus)}</p> : null}
                {phase.intensity_pct ? <p className="mt-2 text-xs text-slate-500">Intensity {String(phase.intensity_pct)}%</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Tracking Recommendations">
          {weeklyTracking.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly tracking prompts saved.</p>
          ) : (
            <ul className="space-y-3 text-sm text-slate-700">
              {weeklyTracking.map((item) => (
                <li key={item} className="rounded-2xl bg-slate-50 px-4 py-3">{item}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Saved Weekly Template">
          {weeklyTemplate.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly template saved.</p>
          ) : (
            <div className="space-y-3">
              {weeklyTemplate.map((day, index) => (
                <div key={`${String(day.day_label)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Day {String(day.day_number || index + 1)} · {String(day.day_label || day.workout_type || 'Workout')}
                  </p>
                  {day.target_duration_min ? <p className="mt-1 text-xs text-slate-500">Duration {String(day.target_duration_min)} min</p> : null}
                  {day.notes ? <p className="mt-2 text-sm text-slate-700">{String(day.notes)}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  );
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function buildProgress(
  plannedWorkouts: Array<Record<string, unknown>>,
  workoutLogs: Array<Record<string, unknown>>,
  bodyMetrics: Array<Record<string, unknown>>,
  recoverySessions: Array<Record<string, unknown>>
) {
  const completedPlannedIds = new Set<string>();
  let zone2Minutes = 0;
  let recoveryMinutes = 0;
  const weeklyMap = new Map<number, {
    week: number;
    planned: number;
    completed: number;
    zone2Minutes: number;
    strengthPlanned: number;
    strengthCompleted: number;
    recoverySessions: number;
  }>();

  for (const planned of plannedWorkouts) {
    const week = Number(planned.week_number) || 1;
    if (!weeklyMap.has(week)) {
      weeklyMap.set(week, { week, planned: 0, completed: 0, zone2Minutes: 0, strengthPlanned: 0, strengthCompleted: 0, recoverySessions: 0 });
    }
    const bucket = weeklyMap.get(week)!;
    bucket.planned += 1;
    if (String(planned.workout_type || '').toLowerCase() === 'strength' || String(planned.day_label || '').toLowerCase().includes('strength')) {
      bucket.strengthPlanned += 1;
    }
  }

  for (const log of workoutLogs) {
    const plannedWorkoutId = typeof log.planned_workout_id === 'string' ? log.planned_workout_id : null;
    if (plannedWorkoutId) completedPlannedIds.add(plannedWorkoutId);

    const cardioRows = Array.isArray(log.cardio_logs) ? (log.cardio_logs as Array<Record<string, unknown>>) : [];
    const logZone2 = cardioRows.reduce((sum, row) => sum + (Number(row.time_in_zone2_min) || 0), 0);
    zone2Minutes += logZone2;

    const week = matchWorkoutToWeek(log, plannedWorkouts);
    if (!weeklyMap.has(week)) {
      weeklyMap.set(week, { week, planned: 0, completed: 0, zone2Minutes: 0, strengthPlanned: 0, strengthCompleted: 0, recoverySessions: 0 });
    }
    const bucket = weeklyMap.get(week)!;
    bucket.completed += 1;
    bucket.zone2Minutes += logZone2;
    if (String(log.workout_type || '').toLowerCase().includes('strength')) {
      bucket.strengthCompleted += 1;
    }
  }

  const plannedStrength = plannedWorkouts.filter((row) =>
    String(row.workout_type || '').toLowerCase() === 'strength' || String(row.day_label || '').toLowerCase().includes('strength')
  ).length;

  const completedStrength = workoutLogs.filter((row) =>
    String(row.workout_type || '').toLowerCase().includes('strength')
  ).length;

  for (const session of recoverySessions) {
    const week = matchRecoveryToWeek(session, plannedWorkouts);
    if (!weeklyMap.has(week)) {
      weeklyMap.set(week, { week, planned: 0, completed: 0, zone2Minutes: 0, strengthPlanned: 0, strengthCompleted: 0, recoverySessions: 0 });
    }
    const bucket = weeklyMap.get(week)!;
    bucket.recoverySessions += 1;
    recoveryMinutes += Number(session.duration_min || 0);
  }

  const rhrSeries = bodyMetrics.filter((row) => typeof row.resting_hr === 'number');
  const hrvSeries = bodyMetrics.filter((row) => typeof row.hrv_ms === 'number');
  const weightSeries = bodyMetrics.filter((row) => typeof row.weight_lbs === 'number');

  const totalPlanned = plannedWorkouts.length;
  const completedPlanned = completedPlannedIds.size;

  return {
    totalPlanned,
    completedPlanned,
    adherencePct: totalPlanned > 0 ? Math.round((completedPlanned / totalPlanned) * 100) : 0,
    adherenceLabel: totalPlanned > 0 ? `${Math.round((completedPlanned / totalPlanned) * 100)}%` : '—',
    zone2Minutes: Math.round(zone2Minutes),
    plannedStrength,
    completedStrength,
    recoverySessions: recoverySessions.length,
    recoveryMinutes: Math.round(recoveryMinutes),
    rhrTrendLabel: trendLabel(rhrSeries, 'resting_hr', 'bpm'),
    hrvTrendLabel: trendLabel(hrvSeries, 'hrv_ms', 'ms'),
    weightTrendLabel: trendLabel(weightSeries, 'weight_lbs', 'lb'),
    latestRhr: latestValue(rhrSeries, 'resting_hr'),
    latestHrv: latestValue(hrvSeries, 'hrv_ms'),
    latestWeight: latestValue(weightSeries, 'weight_lbs'),
    weeklyRows: Array.from(weeklyMap.values())
      .sort((a, b) => a.week - b.week)
      .map((row) => ({
        ...row,
        adherence: row.planned > 0 ? Math.round((row.completed / row.planned) * 100) : 0,
        zone2Minutes: Math.round(row.zone2Minutes),
      })),
  };
}

function matchRecoveryToWeek(
  session: Record<string, unknown>,
  plannedWorkouts: Array<Record<string, unknown>>
) {
  const sessionDate = typeof session.session_date === 'string' ? session.session_date : null;
  if (!sessionDate) return 1;
  const byDate = plannedWorkouts.find((row) => row.scheduled_date === sessionDate);
  return byDate?.week_number != null ? Number(byDate.week_number) || 1 : 1;
}

function matchWorkoutToWeek(
  log: Record<string, unknown>,
  plannedWorkouts: Array<Record<string, unknown>>
) {
  const plannedWorkoutId = typeof log.planned_workout_id === 'string' ? log.planned_workout_id : null;
  if (plannedWorkoutId) {
    const matched = plannedWorkouts.find((row) => row.id === plannedWorkoutId);
    if (matched?.week_number != null) {
      return Number(matched.week_number) || 1;
    }
  }

  const workoutDate = typeof log.workout_date === 'string' ? log.workout_date.slice(0, 10) : null;
  if (!workoutDate) return 1;
  const byDate = plannedWorkouts.find((row) => row.scheduled_date === workoutDate);
  return byDate?.week_number != null ? Number(byDate.week_number) || 1 : 1;
}

function trendLabel(
  rows: Array<Record<string, unknown>>,
  field: 'resting_hr' | 'hrv_ms' | 'weight_lbs',
  unit: string
) {
  if (rows.length === 0) return '—';
  const start = Number(rows[0][field]);
  const end = Number(rows[rows.length - 1][field]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  return `${Math.round(start)} → ${Math.round(end)} ${unit}`;
}

function latestValue(
  rows: Array<Record<string, unknown>>,
  field: 'resting_hr' | 'hrv_ms' | 'weight_lbs'
) {
  if (rows.length === 0) return null;
  const value = Number(rows[rows.length - 1][field]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function resolveMetricActual(metric: unknown, progress: ReturnType<typeof buildProgress>) {
  const normalized = String(metric || '').toLowerCase();
  if (normalized.includes('resting hr') || normalized === 'rhr') {
    return progress.latestRhr != null ? `${progress.latestRhr} bpm` : 'No recent data';
  }
  if (normalized.includes('hrv')) {
    return progress.latestHrv != null ? `${progress.latestHrv} ms` : 'No recent data';
  }
  if (normalized.includes('weight')) {
    return progress.latestWeight != null ? `${progress.latestWeight} lb` : 'No recent data';
  }
  if (normalized.includes('zone 2')) {
    return `${progress.zone2Minutes} min logged`;
  }
  if (normalized.includes('strength')) {
    return `${progress.completedStrength}/${progress.plannedStrength} sessions`;
  }
  if (normalized.includes('adherence')) {
    return progress.adherenceLabel;
  }
  return 'See weekly progress';
}
