'use client';

import Link from 'next/link';
import { bpFlagTailwindClass, bpFlagLabel } from '@/lib/fitness/alerts';
import type { BPFlagLevel } from '@/lib/fitness/types';
import type { ReactNode } from 'react';
import {
  Dumbbell, PersonStanding, Zap, Flame, Moon,
  AlertTriangle, AlertCircle,
  Sunrise, Scale, Heart, FileEdit, History, TrendingUp, Trophy,
  ClipboardList, FileHeart, Upload, FlaskConical, Pill, CalendarDays,
  Settings, Footprints, Activity, BedDouble, Gauge, Weight,
  ChevronRight, CalendarPlus, PenLine,
} from 'lucide-react';

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

const WORKOUT_ICONS: Record<string, ReactNode> = {
  strength: <Dumbbell size={20} />,
  cardio: <PersonStanding size={20} />,
  hiit: <Zap size={20} />,
  hybrid: <Flame size={20} />,
  rest: <Moon size={20} />,
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

function formStatusBg(status: string | null) {
  switch (status) {
    case 'fresh': return 'bg-blue-50 border-blue-200';
    case 'optimal': return 'bg-green-50 border-green-200';
    case 'fatigued': return 'bg-yellow-50 border-yellow-200';
    case 'overreaching': return 'bg-orange-50 border-orange-200';
    case 'critical': return 'bg-red-50 border-red-200';
    default: return 'bg-slate-50 border-slate-200';
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

const readinessTextColor: Record<string, string> = {
  green: 'text-emerald-600',
  yellow: 'text-amber-600',
  red: 'text-red-600',
};

const readinessRingColor: Record<string, string> = {
  green: 'stroke-emerald-500',
  yellow: 'stroke-amber-500',
  red: 'stroke-red-500',
};

// Pill tab navigation for fitness sub-sections
const TABS = [
  { href: '/fitness', label: 'Dashboard' },
  { href: '/fitness/morning', label: 'Briefing' },
  { href: '/fitness/metrics', label: 'Metrics' },
  { href: '/fitness/bp', label: 'BP' },
  { href: '/fitness/trends', label: 'Trends' },
  { href: '/fitness/history', label: 'History' },
  { href: '/fitness/labs', label: 'Labs' },
];

function ScoreRing({ score, size = 80, strokeWidth = 6, color }: { score: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-slate-100" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className={color} />
    </svg>
  );
}

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
  const logsByDate = new Map(weekLogs.map((l) => [l.workout_date.slice(0, 10), l]));

  return (
    <div className="space-y-6 relative">
      {/* Floating Action Button - Log Workout */}
      <Link
        href="/fitness/log"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all md:h-16 md:w-16"
        title="Log Workout"
      >
        <Dumbbell size={24} />
      </Link>

      {/* Pill tab navigation */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              tab.href === '/fitness'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

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
                <span className="inline-flex items-center gap-1.5">{alert.priority === 'critical' ? <AlertTriangle size={16} /> : <AlertCircle size={16} />}{alert.title}</span>
              </p>
              <p className={`text-xs mt-0.5 ${alert.priority === 'critical' ? 'text-red-700' : 'text-orange-700'}`}>
                {alert.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Hero: Readiness + Strain + Today's workout */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Readiness hero */}
        <Link href="/fitness/morning" className={`rounded-2xl border p-5 shadow-sm hover:shadow transition-shadow ${readinessColorClasses[readiness?.readiness_color ?? ''] ?? 'border-slate-100 bg-white'}`}>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Readiness</p>
          <div className="flex items-center gap-4">
            <div className="relative">
              <ScoreRing score={readiness?.readiness_score ?? 0} size={80} color={readinessRingColor[readiness?.readiness_color ?? ''] ?? 'stroke-slate-300'} />
              <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${readinessTextColor[readiness?.readiness_color ?? ''] ?? 'text-slate-400'}`}>
                {readiness?.readiness_score ?? '—'}
              </span>
            </div>
            <div>
              <p className={`text-lg font-semibold ${readinessTextColor[readiness?.readiness_color ?? ''] ?? 'text-slate-700'}`}>
                {readiness?.readiness_label ?? 'No data'}
              </p>
              {readiness?.recommendation && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{readiness.recommendation}</p>
              )}
            </div>
          </div>
        </Link>

        {/* Strain hero */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Strain</p>
          <div className="flex items-center gap-4">
            <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-slate-800">
              <span className="text-3xl font-bold text-white tabular-nums">
                {strain?.strain_score ?? '—'}
              </span>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-700 capitalize">{strain?.strain_level ?? 'No data'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Scale 0–21</p>
            </div>
          </div>
        </div>

        {/* Today's workout hero */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Today</p>
            <p className="text-xs text-slate-400">{new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {todayPlan ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-slate-600">{WORKOUT_ICONS[todayPlan.workout_type ?? 'strength'] ?? <Dumbbell size={20} />}</span>
                <p className="text-lg font-semibold text-slate-800">{todayPlan.day_label ?? todayPlan.workout_type ?? 'Planned Workout'}</p>
              </div>
            ) : (
              <p className="text-lg font-semibold text-slate-500 mt-2">Rest day</p>
            )}
            {latestMetrics?.body_battery != null && (
              <p className={`text-sm mt-2 font-medium ${bodyBatteryColor(latestMetrics.body_battery)}`}>
                <span className="inline-flex items-center gap-1"><Activity size={14} /> Battery: {latestMetrics.body_battery}/100</span>
              </p>
            )}
          </div>
          <Link
            href="/fitness/log"
            className="mt-4 rounded-xl bg-blue-700 text-white text-sm font-medium px-4 py-2.5 hover:bg-blue-600 min-h-[44px] flex items-center justify-center gap-2 transition-colors"
          >
            <Dumbbell size={16} /> Log Workout
          </Link>
        </div>
      </div>

      {/* Metric cards — 2x3 grid with larger numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard
          label="Resting HR"
          value={latestMetrics?.resting_hr != null ? latestMetrics.resting_hr : null}
          unit="bpm"
          target="< 70"
          good={latestMetrics?.resting_hr != null ? latestMetrics.resting_hr < 70 : undefined}
          icon={<HeartPulseIcon />}
        />
        <MetricCard
          label="HRV"
          value={latestMetrics?.hrv_ms != null ? latestMetrics.hrv_ms : null}
          unit="ms"
          note="higher = better"
          icon={<Activity size={16} className="text-slate-400" />}
        />
        <MetricCard
          label="Sleep Score"
          value={latestMetrics?.sleep_score != null ? latestMetrics.sleep_score : null}
          unit="/100"
          good={latestMetrics?.sleep_score != null ? latestMetrics.sleep_score >= 70 : undefined}
          icon={<BedDouble size={16} className="text-slate-400" />}
        />
        <MetricCard
          label="Form / TSB"
          value={latestForm?.form_tsb != null ? Math.round(latestForm.form_tsb) : null}
          unit=""
          statusLabel={latestForm?.form_status ?? undefined}
          statusColor={formStatusColor(latestForm?.form_status ?? null)}
          statusBg={formStatusBg(latestForm?.form_status ?? null)}
          icon={<Gauge size={16} className="text-slate-400" />}
        />
        <MetricCard
          label="Weight"
          value={latestMetrics?.weight_lbs != null ? latestMetrics.weight_lbs : null}
          unit="lbs"
          icon={<Weight size={16} className="text-slate-400" />}
        />
        {/* BP mini card */}
        {latestBP ? (
          <Link href="/fitness/bp" className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500 flex items-center gap-1"><Heart size={14} className="text-slate-400" /> Blood Pressure</p>
              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${bpFlagTailwindClass(latestBP.flag_level)}`}>
                {bpFlagLabel(latestBP.flag_level)}
              </span>
            </div>
            <p className="text-3xl font-bold tabular-nums text-slate-800">{latestBP.systolic}<span className="text-slate-400">/</span>{latestBP.diastolic}</p>
            {latestBP.pulse && <p className="text-xs text-slate-400 mt-0.5">{latestBP.pulse} bpm</p>}
          </Link>
        ) : (
          <Link href="/fitness/bp" className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors flex flex-col items-center justify-center gap-1">
            <Heart size={20} className="text-slate-300" />
            <span>Log BP</span>
          </Link>
        )}
      </div>

      {/* Weekly calendar strip */}
      {weekPlanned.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">This Week</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weekPlanned.map((pw) => {
              const dateStr = pw.scheduled_date;
              const log = logsByDate.get(dateStr);
              const isToday = dateStr === today;
              return (
                <div
                  key={pw.id}
                  className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 min-w-[60px] shrink-0 border transition-colors ${
                    isToday ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50/50'
                  }`}
                >
                  <span className="text-xs text-slate-400">
                    {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="text-slate-600">{WORKOUT_ICONS[pw.workout_type ?? ''] ?? <Dumbbell size={20} />}</span>
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
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Workouts</h2>
            <Link href="/fitness/history" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentLogs.map((log) => (
              <Link key={log.id} href="/fitness/history" className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                <span className="shrink-0 text-slate-500">{WORKOUT_ICONS[log.workout_type] ?? <Dumbbell size={20} />}</span>
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

      {/* Quick links - Organized by section */}
      <div className="space-y-8">
        {/* Standalone actions */}
        <div className="flex gap-3">
          <Link
            href="/fitness/morning"
            className="flex-1 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
          >
            <span className="text-blue-700/70"><Sunrise size={20} /></span>
            <span className="text-sm font-medium text-slate-700">Morning Brief</span>
          </Link>
          <Link
            href="/fitness/settings"
            className="flex-1 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
          >
            <span className="text-blue-700/70"><Settings size={20} /></span>
            <span className="text-sm font-medium text-slate-700">Settings</span>
          </Link>
        </div>

        {/* Fitness section */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Fitness</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              { href: '/fitness/history', label: 'Exercise History', icon: <History size={20} /> },
              { href: '/fitness/exercises', label: 'Exercises', icon: <Dumbbell size={20} /> },
              { href: '/fitness/templates', label: 'Workout Templates', icon: <FileEdit size={20} /> },
              { href: '/fitness/plans', label: 'Training Plans', icon: <ClipboardList size={20} /> },
              { href: '/fitness/records', label: 'Personal Records', icon: <Trophy size={20} /> },
              { href: '/fitness/equipment', label: 'Equipment', icon: <Footprints size={20} /> },
              { href: '/calendar', label: 'Schedule Workout', icon: <CalendarPlus size={20} /> },
              { href: '/fitness/log', label: 'Log Workout', icon: <PenLine size={20} /> },
            ] as { href: string; label: string; icon: ReactNode }[]).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
              >
                <span className="text-blue-700/70">{link.icon}</span>
                <span className="text-sm font-medium text-slate-700">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Health section */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Health</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              { href: '/fitness/metrics', label: 'Body Metrics', icon: <Scale size={20} /> },
              { href: '/fitness/health/view', label: 'Health Profile', icon: <FileHeart size={20} /> },
              { href: '/fitness/health/labs', label: 'Lab Review', icon: <FlaskConical size={20} /> },
              { href: '/fitness/medications', label: 'Medications', icon: <Pill size={20} /> },
              { href: '/fitness/appointments', label: "Dr's Appointments", icon: <CalendarDays size={20} /> },
            ] as { href: string; label: string; icon: ReactNode }[]).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
              >
                <span className="text-blue-700/70">{link.icon}</span>
                <span className="text-sm font-medium text-slate-700">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeartPulseIcon() {
  return <Heart size={16} className="text-red-400" />;
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
  statusBg,
  icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  target?: string;
  note?: string;
  good?: boolean;
  statusLabel?: string;
  statusColor?: string;
  statusBg?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${statusBg ?? 'border-slate-100 bg-white'}`}>
      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">{icon}{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${
        good === true ? 'text-green-600' : good === false ? 'text-orange-600' : 'text-slate-800'
      }`}>
        {value != null ? value : '—'}
        {unit && value != null && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </p>
      {target && <p className="text-xs text-slate-400 mt-0.5">Target: {target}</p>}
      {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
      {statusLabel && (
        <p className={`text-xs font-semibold mt-1 capitalize ${statusColor ?? 'text-slate-500'}`}>{statusLabel}</p>
      )}
    </div>
  );
}
