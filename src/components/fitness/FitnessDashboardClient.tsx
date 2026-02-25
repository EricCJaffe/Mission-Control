'use client';

import Link from 'next/link';
import { bpFlagTailwindClass, bpFlagLabel } from '@/lib/fitness/alerts';
import type { BPFlagLevel } from '@/lib/fitness/types';

type Props = {
  today: string;
  todayPlan: {
    id: string;
    day_label?: string | null;
    workout_type?: string | null;
    prescribed: Record<string, unknown>;
    template_id?: string | null;
  } | null;
  recentLogs: Array<{
    id: string;
    workout_date: string;
    workout_type: string;
    duration_minutes: number | null;
    tss: number | null;
    compliance_color: string | null;
    rpe_session: number | null;
  }>;
  latestMetrics: {
    resting_hr: number | null;
    hrv_ms: number | null;
    body_battery: number | null;
    sleep_score: number | null;
    training_readiness: number | null;
    weight_lbs: number | null;
    metric_date: string;
  } | null;
  latestBP: {
    systolic: number;
    diastolic: number;
    pulse: number | null;
    flag_level: BPFlagLevel;
    reading_date: string;
  } | null;
  latestForm: {
    form_tsb: number | null;
    form_status: string | null;
    fitness_ctl: number | null;
    fatigue_atl: number | null;
    calc_date: string;
  } | null;
  alerts: Array<{
    id: string;
    title: string;
    content: string;
    priority: string;
    insight_type: string;
    insight_date: string;
  }>;
  weekPlanned: Array<{
    id: string;
    scheduled_date: string;
    day_label?: string | null;
    workout_type?: string | null;
    prescribed: Record<string, unknown>;
  }>;
  weekLogs: Array<{
    id: string;
    workout_date: string;
    workout_type: string;
    duration_minutes: number | null;
    compliance_color: string | null;
  }>;
  readiness: {
    readiness_score: number;
    readiness_color: string;
    readiness_label: string;
    recommendation: string | null;
  } | null;
  strain: {
    strain_score: number;
    strain_level: string;
  } | null;
};

const WORKOUT_ICONS: Record<string, string> = {
  strength: '🏋️',
  cardio: '🏃',
  hiit: '⚡',
  hybrid: '🔥',
  rest: '😴',
};

const COMPLIANCE_BG: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

function formStatusColor(status: string | null) {
  switch (status) {
    case 'fresh': return 'text-blue-600';
    case 'optimal': return 'text-green-600';
    case 'fatigued': return 'text-yellow-600';
    case 'overreaching': return 'text-orange-600';
    case 'critical': return 'text-red-600';
    default: return 'text-slate-500';
  }
}

function bodyBatteryColor(bb: number) {
  if (bb >= 75) return 'text-green-600';
  if (bb >= 40) return 'text-yellow-600';
  if (bb >= 25) return 'text-orange-600';
  return 'text-red-600';
}

const readinessColorClasses: Record<string, string> = {
  green: 'border-emerald-200 bg-emerald-50',
  yellow: 'border-amber-200 bg-amber-50',
  red: 'border-red-200 bg-red-50',
};

const readinessCircleBg: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

const readinessTextColor: Record<string, string> = {
  green: 'text-emerald-700',
  yellow: 'text-amber-700',
  red: 'text-red-700',
};

export default function FitnessDashboardClient({
  today,
  todayPlan,
  recentLogs,
  latestMetrics,
  latestBP,
  latestForm,
  alerts,
  weekPlanned,
  weekLogs,
  readiness,
  strain,
}: Props) {
  // Map week logs by date for quick lookup
  const logsByDate = new Map(weekLogs.map((l) => [l.workout_date.slice(0, 10), l]));

  return (
    <div className="space-y-6">
      {/* Alerts banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-2xl border p-4 ${
                alert.priority === 'critical'
                  ? 'border-red-300 bg-red-50'
                  : 'border-orange-200 bg-orange-50'
              }`}
            >
              <p className={`text-sm font-semibold ${alert.priority === 'critical' ? 'text-red-800' : 'text-orange-800'}`}>
                {alert.priority === 'critical' ? '🚨 ' : '⚠️ '}{alert.title}
              </p>
              <p className={`text-xs mt-0.5 ${alert.priority === 'critical' ? 'text-red-700' : 'text-orange-700'}`}>
                {alert.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Readiness + Strain row */}
      {(readiness || strain) && (
        <div className="grid grid-cols-2 gap-3">
          {readiness && (
            <Link href="/fitness/morning" className={`rounded-2xl border p-4 shadow-sm hover:shadow transition-shadow ${readinessColorClasses[readiness.readiness_color] ?? 'border-slate-200 bg-white/70'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-white text-lg font-bold ${readinessCircleBg[readiness.readiness_color] ?? 'bg-slate-400'}`}>
                  {readiness.readiness_score}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Readiness</p>
                  <p className={`text-sm font-semibold ${readinessTextColor[readiness.readiness_color] ?? 'text-slate-700'}`}>
                    {readiness.readiness_label}
                  </p>
                </div>
              </div>
            </Link>
          )}
          {strain && (
            <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white text-lg font-bold">
                  {strain.strain_score}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Strain</p>
                  <p className="text-sm font-semibold text-slate-700 capitalize">{strain.strain_level}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today card */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">{new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {todayPlan ? (
              <>
                <h2 className="text-lg font-semibold text-slate-800">
                  {WORKOUT_ICONS[todayPlan.workout_type ?? 'strength'] ?? '💪'} {todayPlan.day_label ?? todayPlan.workout_type ?? 'Planned Workout'}
                </h2>
                {latestMetrics?.body_battery != null && (
                  <p className={`text-sm mt-1 font-medium ${bodyBatteryColor(latestMetrics.body_battery)}`}>
                    Body battery: {latestMetrics.body_battery}/100
                    {latestMetrics.body_battery < 25 && ' — Recovery day recommended'}
                  </p>
                )}
              </>
            ) : (
              <h2 className="text-lg font-semibold text-slate-600">No planned workout today</h2>
            )}
          </div>
          <Link
            href="/fitness/log"
            className="shrink-0 rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 min-h-[44px] flex items-center"
          >
            Log Workout
          </Link>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Resting HR"
          value={latestMetrics?.resting_hr != null ? `${latestMetrics.resting_hr}` : '—'}
          unit="bpm"
          target="< 70"
          good={latestMetrics?.resting_hr != null && latestMetrics.resting_hr < 70}
        />
        <MetricCard
          label="HRV"
          value={latestMetrics?.hrv_ms != null ? `${latestMetrics.hrv_ms}` : '—'}
          unit="ms"
          note="higher = better"
        />
        <MetricCard
          label="Form / TSB"
          value={latestForm?.form_tsb != null ? `${Math.round(latestForm.form_tsb)}` : '—'}
          unit=""
          statusLabel={latestForm?.form_status ?? undefined}
          statusColor={formStatusColor(latestForm?.form_status ?? null)}
        />
        <MetricCard
          label="Weight"
          value={latestMetrics?.weight_lbs != null ? `${latestMetrics.weight_lbs}` : '—'}
          unit="lbs"
        />
      </div>

      {/* BP quick view */}
      {latestBP && (
        <Link href="/fitness/bp" className="block rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm hover:bg-white/90 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Blood Pressure</p>
              <p className="text-xl font-bold tabular-nums">{latestBP.systolic}/{latestBP.diastolic}
                {latestBP.pulse ? <span className="text-sm font-normal text-slate-500 ml-2">{latestBP.pulse} bpm</span> : null}
              </p>
            </div>
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${bpFlagTailwindClass(latestBP.flag_level)}`}>
              {bpFlagLabel(latestBP.flag_level)}
            </span>
          </div>
        </Link>
      )}

      {!latestBP && (
        <Link href="/fitness/bp" className="block rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors">
          + Log blood pressure reading
        </Link>
      )}

      {/* Weekly calendar strip */}
      {weekPlanned.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">This Week</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weekPlanned.map((pw) => {
              const dateStr = pw.scheduled_date;
              const log = logsByDate.get(dateStr);
              const isToday = dateStr === today;
              return (
                <div
                  key={pw.id}
                  className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 min-w-[60px] shrink-0 border ${
                    isToday ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white/60'
                  }`}
                >
                  <span className="text-xs text-slate-400">
                    {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="text-lg">{WORKOUT_ICONS[pw.workout_type ?? ''] ?? '💪'}</span>
                  {log ? (
                    <span className={`h-2 w-2 rounded-full ${COMPLIANCE_BG[log.compliance_color ?? 'green'] ?? 'bg-green-500'}`} title="Completed" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-slate-200" title="Pending" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent workouts */}
      {recentLogs.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Workouts</h2>
            <Link href="/fitness/history" className="text-xs text-slate-400 hover:text-slate-600">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentLogs.map((log) => (
              <Link key={log.id} href="/fitness/history" className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                <span className="text-lg shrink-0">{WORKOUT_ICONS[log.workout_type] ?? '💪'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 capitalize">{log.workout_type}</p>
                  <p className="text-xs text-slate-400">
                    {log.duration_minutes ? `${log.duration_minutes} min · ` : ''}
                    {log.tss ? `TSS ${Math.round(log.tss)} · ` : ''}
                    {new Date(log.workout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {log.compliance_color && (
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COMPLIANCE_BG[log.compliance_color] ?? ''}`} />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { href: '/fitness/morning', label: 'Morning Brief', icon: '🌅' },
          { href: '/fitness/metrics', label: 'Body Metrics', icon: '⚖️' },
          { href: '/fitness/bp', label: 'Blood Pressure', icon: '❤️' },
          { href: '/fitness/exercises', label: 'Exercises', icon: '🏋️' },
          { href: '/fitness/templates', label: 'Templates', icon: '📝' },
          { href: '/fitness/history', label: 'History', icon: '📜' },
          { href: '/fitness/trends', label: 'Trends', icon: '📈' },
          { href: '/fitness/records', label: 'Personal Records', icon: '🏆' },
          { href: '/fitness/plans', label: 'Training Plan', icon: '📋' },
          { href: '/fitness/labs', label: 'Lab Results', icon: '🧪' },
          { href: '/fitness/medications', label: 'Medications', icon: '💊' },
          { href: '/fitness/appointments', label: 'Appointments', icon: '📅' },
          { href: '/fitness/settings', label: 'Settings', icon: '⚙️' },
          { href: '/fitness/equipment', label: 'Equipment', icon: '👟' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm hover:bg-white/90 transition-colors flex flex-col items-center gap-2 text-center"
          >
            <span className="text-2xl">{link.icon}</span>
            <span className="text-xs font-medium text-slate-700">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  target,
  note,
  good,
  statusLabel,
  statusColor,
}: {
  label: string;
  value: string;
  unit: string;
  target?: string;
  note?: string;
  good?: boolean;
  statusLabel?: string;
  statusColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${good === true ? 'text-green-600' : good === false ? 'text-orange-600' : 'text-slate-800'}`}>
        {value}
        {unit && <span className="text-sm font-normal text-slate-500 ml-1">{unit}</span>}
      </p>
      {target && <p className="text-xs text-slate-400 mt-0.5">Target: {target}</p>}
      {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
      {statusLabel && (
        <p className={`text-xs font-medium mt-0.5 capitalize ${statusColor ?? 'text-slate-500'}`}>{statusLabel}</p>
      )}
    </div>
  );
}
