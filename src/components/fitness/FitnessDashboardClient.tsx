'use client';

import { useState } from 'react';
import Link from 'next/link';
import QuickRecoveryLog from '@/components/fitness/QuickRecoveryLog';
import { bpFlagTailwindClass, bpFlagLabel } from '@/lib/fitness/alerts';
import type { BPFlagLevel } from '@/lib/fitness/types';
import type { ReactNode } from 'react';
import {
  Dumbbell, PersonStanding, Zap, Flame, Moon,
  AlertTriangle, AlertCircle,
  Sunrise, Scale, Heart, FileEdit, History, Trophy,
  ClipboardList, FlaskConical, Pill, CalendarDays,
  Plus, Settings, Footprints, Activity, BedDouble, Gauge, Droplets, Utensils, Waves, Compass,
  CalendarPlus, } from 'lucide-react';

type Props = {
  today: string;
  todayPlan: {
    id: string;
    day_label?: string | null;
    workout_type?: string | null;
    prescribed: Record<string, unknown>;
    template_id?: string | null;
  } | null;
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
  briefing: { summary: string; isToday: boolean } | null;
  latestWeight: {
    weight_lbs: number | null;
    body_fat_pct: number | null;
    metric_date: string;
    weight_source: string | null;
  } | null;
  latestSleep: {
    total_sleep_seconds: number;
    sleep_score: number | null;
    avg_hr: number | null;
    sleep_date: string;
    avg_hours: number | null;
    avg_score: number | null;
    days_counted: number;
  } | null;
};

const WORKOUT_ICONS: Record<string, ReactNode> = {
  strength: <Dumbbell size={20} />,
  cardio: <PersonStanding size={20} />,
  hiit: <Zap size={20} />,
  hybrid: <Flame size={20} />,
  rest: <Moon size={20} />,
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


/*
 * Five sections instead of eight tabs.
 *
 * The old row was Dashboard, Briefing, Metrics, BP, Trends, Body Comp,
 * History and Labs — four of which were variations on "look at a chart" — and
 * on a phone it was a horizontal scroll of chips. Each section now has a
 * landing page that says what is inside it, which also gives the fifty-odd
 * fitness routes somewhere to be found other than by knowing the URL.
 */
const TABS = [
  { href: '/fitness', label: 'Today' },
  { href: '/fitness/train', label: 'Train' },
  { href: '/fitness/body', label: 'Body' },
  { href: '/fitness/health-overview', label: 'Health' },
  { href: '/fitness/recovery', label: 'Recovery' },
];


/** "Today" / "3 days ago" / "Jul 1" — weight is only as current as the
    last weigh-in, and the card should say so. */
function weightAgeLabel(metricDate: string): string {
  const then = new Date(`${metricDate}T12:00:00`);
  if (Number.isNaN(then.getTime())) return 'Body composition →';
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FitnessDashboardClient({
  today,
  todayPlan,
  latestMetrics,
  latestBP,
  latestForm,
  alerts,
  weekPlanned,
  weekLogs,
  readiness,
  strain,
  latestSleep,
  latestWeight,
  briefing,
}: Props) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const logsByDate = new Map(weekLogs.map((l) => [l.workout_date.slice(0, 10), l]));

  return (
    <div className="space-y-6 relative">
      {/* Actions live together, top right. Previously Log Workout was a
          floating button that sat over the content on a phone, and Log
          Recovery was a full-width panel far down the page. */}
      <div className="flex items-center justify-end gap-2">
        <Link
          href="/fitness/log"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus size={16} strokeWidth={3} />
          Workout
        </Link>
        <button
          type="button"
          onClick={() => setRecoveryOpen((v) => !v)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus size={16} strokeWidth={3} />
          Recovery
        </button>
      </div>

      {recoveryOpen && <QuickRecoveryLog />}

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

      {/*
        One block for everything measured. Readiness, strain and today's
        session were three large hero cards above a separate grid of small
        metric cards — the same kind of information at two different sizes,
        which made the page read as two dashboards stacked. They are all one
        grid now, at the size the metric cards already were.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/fitness/morning"
          className={`rounded-2xl border-2 p-4 shadow-sm transition-shadow hover:shadow ${readinessColorClasses[readiness?.readiness_color ?? ''] ?? 'border-slate-300 bg-white'}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Readiness</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${readinessTextColor[readiness?.readiness_color ?? ''] ?? 'text-slate-400'}`}>
            {readiness?.readiness_score ?? '—'}
          </p>
          <p className="text-[11px] text-slate-500">{readiness?.readiness_label ?? 'No data'}</p>
        </Link>

        <Link
          href="/fitness/body?view=trends"
          className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Strain</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
            {strain?.strain_score != null ? strain.strain_score.toFixed(1) : '—'}
          </p>
          <p className="text-[11px] text-slate-500">{strain?.strain_level ?? 'Scale 0–21'}</p>
        </Link>

        <Link
          href={todayPlan ? '/fitness/log' : '/fitness/plans'}
          className="col-span-2 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Today</p>
          <p className="mt-0.5 truncate text-base font-bold text-slate-900">
            {todayPlan?.day_label ?? todayPlan?.workout_type ?? 'Nothing scheduled'}
          </p>
          <p className="text-[11px] text-slate-500">
            {todayPlan ? 'Tap to start' : 'Log whatever you do'}
          </p>
        </Link>

        {/* The metric cards continue in the same grid — same size, same block. */}
        <MetricCard
          label="Resting HR"
          value={latestMetrics?.resting_hr != null ? latestMetrics.resting_hr : null}
          unit="bpm"
          target="< 70"
          good={latestMetrics?.resting_hr != null ? latestMetrics.resting_hr < 70 : undefined}
          icon={<Heart size={16} className="text-red-500" />}
          href="/fitness/metrics/rhr"
          cardBg="border-red-100 bg-red-50/30"
          textColor="text-red-600"
        />
        <MetricCard
          label="HRV"
          value={latestMetrics?.hrv_ms != null ? latestMetrics.hrv_ms : null}
          unit="ms"
          note="higher = better"
          icon={<Activity size={16} className="text-purple-500" />}
          href="/fitness/metrics/hrv"
          cardBg="border-purple-100 bg-purple-50/30"
          textColor="text-purple-600"
        />
        <MetricCard
          label="Form / TSB"
          value={latestForm?.form_tsb != null ? Math.round(latestForm.form_tsb) : null}
          unit=""
          statusLabel={latestForm?.form_status ?? undefined}
          statusColor={formStatusColor(latestForm?.form_status ?? null)}
          statusBg={formStatusBg(latestForm?.form_status ?? null)}
          icon={<Gauge size={16} className="text-slate-400" />}
          href="/fitness/body?view=trends"
        />
        {/* BP mini card */}
        {latestBP ? (
          <Link href="/fitness/body?view=bp" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm hover:shadow transition-shadow">
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
          <Link href="/fitness/body?view=bp" className="rounded-2xl border-2 border-slate-400 bg-slate-50 p-4 text-center text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-1">
            <Heart size={20} className="text-slate-300" />
            <span>Log BP</span>
          </Link>
        )}

        {/* Sleep mini card */}
        {latestSleep ? (
          <Link href="/fitness/body?view=sleep" className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-indigo-600 font-medium flex items-center gap-1"><BedDouble size={14} /> Sleep</p>
              {latestSleep.sleep_score && (
                <span className="text-[10px] font-medium rounded-full px-2 py-0.5 border border-indigo-300 bg-indigo-100 text-indigo-700">
                  {latestSleep.sleep_score}/100
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-2xl font-bold tabular-nums text-indigo-900">{(latestSleep.total_sleep_seconds / 3600).toFixed(1)}<span className="text-sm text-indigo-500">h</span></p>
              {Number.isFinite(latestSleep.avg_hours) && (
                <p className="text-xs text-indigo-600">avg: {latestSleep.avg_hours!.toFixed(1)}h</p>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-indigo-500">
              {/* Explicit boolean guards: `{value && <span/>}` renders the
                  literal "NaN" (or "0") when value is a non-truthy number. */}
              {Number.isFinite(latestSleep.avg_score) && (
                <span>Avg score: {latestSleep.avg_score}/100</span>
              )}
              {Number.isFinite(latestSleep.avg_hr) && <span>{latestSleep.avg_hr} bpm</span>}
            </div>
          </Link>
        ) : (
          <Link href="/fitness/body?view=sleep" className="rounded-2xl border-2 border-slate-400 bg-slate-50 p-4 text-center text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-1">
            <BedDouble size={20} className="text-slate-300" />
            <span>Track Sleep</span>
          </Link>
        )}

        {/* Weight / Body Comp mini card */}
        {latestWeight?.weight_lbs ? (
          <Link href="/fitness/body?view=composition" className="rounded-2xl border border-green-100 bg-green-50/30 p-4 shadow-sm hover:shadow transition-shadow">
            <p className="text-xs text-green-600 font-medium flex items-center gap-1 mb-1"><Scale size={14} /> Weight</p>
            <p className="text-2xl font-bold tabular-nums text-green-900">{latestWeight.weight_lbs.toFixed(1)}<span className="text-sm text-green-500"> lbs</span></p>
            {/* The scale only reports on days you step on it, so show WHEN —
                a weeks-old number presented as current is worse than none. */}
            <p className="text-xs text-green-600 mt-0.5">
              {weightAgeLabel(latestWeight.metric_date)}
              {latestWeight.body_fat_pct != null && ` · ${latestWeight.body_fat_pct.toFixed(1)}% bf`}
            </p>
          </Link>
        ) : (
          <Link href="/fitness/body?view=trends" className="rounded-2xl border-2 border-slate-400 bg-slate-50 p-4 text-center text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-1">
            <Scale size={20} className="text-slate-300" />
            <span>Track Weight</span>
          </Link>
        )}
      </div>

      {/* The morning briefing, read from cache. Generating it costs an AI
          call, so the dashboard shows the last one and links out for a fresh
          one rather than generating on every load. */}
      <Link
        href="/fitness/morning"
        className="block rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Morning briefing
          </p>
          {briefing && !briefing.isToday && (
            <span className="text-[11px] font-medium text-amber-700">from an earlier day</span>
          )}
        </div>
        {briefing ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-700">
            {briefing.summary}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            No briefing yet today — tap to generate one.
          </p>
        )}
      </Link>

      {/*
        The week, as sessions rather than icons.
        
        This was a strip of weekday initials with a coloured dot, which told
        you a workout existed but not what it was — so it said nothing you
        could act on. Each day is a card now with the session name, coloured by
        what actually happened: done, still to come, or missed.
      */}
      {weekPlanned.length > 0 && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">This week</h2>
          <div className="space-y-1.5">
            {weekPlanned.map((pw) => {
              const dateStr = pw.scheduled_date;
              const log = logsByDate.get(dateStr);
              const isToday = dateStr === today;
              // Missed means the day has passed with nothing logged. A future
              // day with nothing logged is simply pending.
              const isMissed = !log && dateStr < today;
              const style = log
                ? 'border-emerald-300 bg-emerald-50'
                : isMissed
                  ? 'border-rose-300 bg-rose-50'
                  : isToday
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-white';
              const status = log ? 'Done' : isMissed ? 'Missed' : isToday ? 'Today' : 'Planned';
              const statusColor = log
                ? 'text-emerald-700'
                : isMissed
                  ? 'text-rose-700'
                  : isToday
                    ? 'text-blue-700'
                    : 'text-slate-400';
              return (
                <Link
                  key={pw.id}
                  href={log ? `/fitness/history/${log.id}` : `/fitness/log?planned_workout_id=${pw.id}`}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition-shadow hover:shadow-sm ${style}`}
                >
                  <span className="w-9 shrink-0 text-xs font-semibold text-slate-500">
                    {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {WORKOUT_ICONS[pw.workout_type ?? ''] ?? <Dumbbell size={16} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {pw.day_label ?? pw.workout_type ?? 'Session'}
                  </span>
                  <span className={`shrink-0 text-[11px] font-semibold ${statusColor}`}>{status}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick links - Organized by section */}
      <div className="space-y-8">
        {/* Standalone actions */}
        <div className="flex gap-3">
          <Link
            href="/fitness/morning"
            className="flex-1 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
          >
            <span className="text-blue-700/70"><Sunrise size={20} /></span>
            <span className="text-sm font-medium text-slate-700">Morning Brief</span>
          </Link>
          <Link
            href="/fitness/settings"
            className="flex-1 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
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
              { href: '/fitness/coverage', label: 'Movement Coverage', icon: <Compass size={20} /> },
              { href: '/fitness/records', label: 'Personal Records', icon: <Trophy size={20} /> },
              { href: '/fitness/equipment', label: 'Equipment', icon: <Footprints size={20} /> },
              { href: '/calendar', label: 'Schedule Workout', icon: <CalendarPlus size={20} /> },
            ] as { href: string; label: string; icon: ReactNode }[]).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
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
              { href: '/fitness/body?view=composition', label: 'Body & Composition', icon: <Scale size={20} /> },
              { href: '/fitness/health/command-center', label: 'Command Center', icon: <Activity size={20} /> },
              { href: '/fitness/health/labs/dashboard', label: 'Lab Review', icon: <FlaskConical size={20} /> },
              { href: '/fitness/medications', label: 'Medications', icon: <Pill size={20} /> },
              { href: '/fitness/hydration', label: 'Hydration', icon: <Droplets size={20} /> },
              { href: '/fitness/nutrition', label: 'Nutrition', icon: <Utensils size={20} /> },
              { href: '/fitness/recovery', label: 'Recovery', icon: <Waves size={20} /> },
              { href: '/fitness/appointments', label: "Dr's Appointments", icon: <CalendarDays size={20} /> },
            ] as { href: string; label: string; icon: ReactNode }[]).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm hover:shadow hover:border-slate-200 transition-all flex items-center gap-3"
              >
                <span className="text-blue-700/70">{link.icon}</span>
                <span className="text-sm font-medium text-slate-700">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recovery sits at the bottom for now — it matters, but it is not what
          you open this page to check. */}
      <div className="text-right">
        <Link href="/fitness/recovery" className="text-xs font-medium text-blue-700 hover:text-blue-800">
          Recovery trends &rarr;
        </Link>
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
  statusBg,
  icon,
  href,
  cardBg,
  textColor,
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
  href?: string;
  cardBg?: string;
  textColor?: string;
}) {
  const bgClass = cardBg ?? statusBg ?? 'border-slate-100 bg-white';
  const valueColor = textColor ?? (good === true ? 'text-green-600' : good === false ? 'text-orange-600' : 'text-slate-800');
  const labelColor = textColor ? textColor.replace('600', '600 font-medium') : 'text-slate-500';

  const content = (
    <div className={`rounded-2xl border p-4 shadow-sm ${bgClass} ${href ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}>
      <p className={`text-xs mb-1 flex items-center gap-1 ${labelColor}`}>{icon}{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${valueColor}`}>
        {value != null ? value : '—'}
        {unit && value != null && <span className={`text-sm font-normal ml-1 ${textColor ? textColor.replace('600', '500') : 'text-slate-400'}`}>{unit}</span>}
      </p>
      {target && <p className={`text-xs mt-0.5 ${textColor ? textColor.replace('600', '600') : 'text-slate-400'}`}>Target: {target}</p>}
      {note && <p className={`text-xs mt-0.5 ${textColor ? textColor.replace('600', '600') : 'text-slate-400'}`}>{note}</p>}
      {statusLabel && (
        <p className={`text-xs font-semibold mt-1 capitalize ${statusColor ?? 'text-slate-500'}`}>{statusLabel}</p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
