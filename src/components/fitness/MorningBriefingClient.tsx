'use client';

import { useState, useEffect } from 'react';
import { HeartPulse, Dumbbell, Zap } from 'lucide-react';

type Props = {
  date: string;
  metrics: {
    resting_hr: number | null;
    hrv_ms: number | null;
    body_battery: number | null;
    sleep_score: number | null;
    sleep_duration_min: number | null;
    stress_avg: number | null;
    training_readiness: number | null;
    meds_taken_at: string | null;
  } | null;
  form: {
    form_tsb: number | null;
    form_status: string | null;
    fitness_ctl: number | null;
    fatigue_atl: number | null;
  } | null;
  latestBP: {
    systolic: number;
    diastolic: number;
    pulse: number | null;
    reading_date: string;
    flag_level: string | null;
  } | null;
  profile: {
    rhr_baseline: number | null;
    hrv_baseline: number | null;
    sleep_target_min: number | null;
    max_hr_ceiling: number | null;
  } | null;
  todayPlan: {
    id: string;
    day_label: string | null;
    workout_type: string | null;
    prescribed: Record<string, unknown>;
  } | null;
  readiness: {
    readiness_score: number;
    readiness_color: string;
    readiness_label: string;
    hrv_score: number | null;
    rhr_score: number | null;
    sleep_score: number | null;
    body_battery_score: number | null;
    form_score: number | null;
    bp_score: number | null;
    weather_score: number | null;
    recommendation: string | null;
  } | null;
  strain: {
    strain_score: number;
    strain_level: string;
  } | null;
  daysSinceBP: number | null;
};

const readinessColorClasses = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  yellow: 'text-amber-700 bg-amber-50 border-amber-200',
  red: 'text-red-700 bg-red-50 border-red-200',
};

const readinessCircleBg = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

export default function MorningBriefingClient(props: Props) {
  const { date, metrics, form, latestBP, profile, todayPlan, readiness, strain, daysSinceBP } = props;
  const [aiBriefing, setAiBriefing] = useState<{ recommendation: string; alerts: string[]; motivation: string } | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  useEffect(() => {
    async function fetchBriefing() {
      setLoadingBriefing(true);
      try {
        const res = await fetch('/api/fitness/morning-briefing');
        if (res.ok) {
          const data = await res.json();
          setAiBriefing(data.briefing);
        }
      } catch { /* non-critical */ }
      setLoadingBriefing(false);
    }
    if (!readiness) {
      // Trigger readiness calculation first
      fetch('/api/fitness/readiness').then(() => fetchBriefing());
    } else {
      fetchBriefing();
    }
  }, [readiness]);

  const rhrBaseline = profile?.rhr_baseline ?? 72;
  const hrvBaseline = profile?.hrv_baseline ?? 35;
  const sleepTarget = profile?.sleep_target_min ?? 450;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Morning Briefing</h1>
        <p className="text-sm text-slate-500">{dateLabel}</p>
      </div>

      {/* Readiness Score — Primary Widget */}
      <div className={`rounded-2xl border p-6 text-center shadow-sm ${readinessColorClasses[readiness?.readiness_color as keyof typeof readinessColorClasses] ?? 'border-slate-200 bg-white'}`}>
        <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white ${readinessCircleBg[readiness?.readiness_color as keyof typeof readinessCircleBg] ?? 'bg-slate-400'}`}>
          <span className="text-3xl font-bold">{readiness?.readiness_score ?? '—'}</span>
        </div>
        <p className="mt-2 text-lg font-medium">
          {readiness?.readiness_label ?? 'Calculating...'}
        </p>
        {readiness?.recommendation && (
          <p className="mt-1 text-sm opacity-80">{readiness.recommendation}</p>
        )}
      </div>

      {/* Overnight Stats */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Overnight</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MetricRow label="RHR" value={metrics?.resting_hr ? `${metrics.resting_hr} bpm` : '—'} sub={metrics?.resting_hr ? `${diffLabel(metrics.resting_hr - rhrBaseline)} from baseline` : undefined} />
          <MetricRow label="HRV" value={metrics?.hrv_ms ? `${metrics.hrv_ms} ms` : '—'} sub={metrics?.hrv_ms ? `${diffLabel(metrics.hrv_ms - hrvBaseline)} from baseline` : undefined} />
          <MetricRow label="Sleep" value={metrics?.sleep_score ? `${metrics.sleep_score}/100` : '—'} sub={metrics?.sleep_duration_min ? `${(metrics.sleep_duration_min / 60).toFixed(1)}h` : undefined} />
          <MetricRow label="Body Battery" value={metrics?.body_battery ? `${metrics.body_battery}` : '—'} />
        </div>
      </div>

      {/* Today's Plan */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Today&apos;s Plan</h2>
        {todayPlan ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {todayPlan.workout_type === 'cardio' ? <HeartPulse size={28} /> : todayPlan.workout_type === 'strength' ? <Dumbbell size={28} /> : todayPlan.workout_type === 'hiit' ? <Zap size={28} /> : <Dumbbell size={28} />}
            </span>
            <div>
              <p className="font-medium">{todayPlan.day_label ?? todayPlan.workout_type}</p>
              {todayPlan.workout_type === 'cardio' && (
                <p className="text-xs text-slate-500">Target HR: {profile?.max_hr_ceiling ? `115–${Math.round((profile.max_hr_ceiling ?? 155) * 0.86)}` : '115–133'} bpm</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-slate-400">Rest day — recovery is training.</p>
        )}
        {todayPlan && (
          <a href="/fitness/log" className="mt-3 block w-full rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700">
            Start Workout
          </a>
        )}
      </div>

      {/* Form + Strain */}
      {(form || strain) && (
        <div className="grid grid-cols-2 gap-3">
          {form && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-slate-500">Form (TSB)</p>
              <p className="text-2xl font-bold">{form.form_tsb != null ? Math.round(form.form_tsb) : '—'}</p>
              <p className="text-xs text-slate-400">{form.form_status ?? ''}</p>
            </div>
          )}
          {strain && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-slate-500">Today&apos;s Strain</p>
              <p className="text-2xl font-bold">{strain.strain_score}</p>
              <p className="text-xs text-slate-400">{strain.strain_level}</p>
            </div>
          )}
        </div>
      )}

      {/* BP Quick View */}
      {latestBP && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Blood Pressure</h2>
            <a href="/fitness/bp" className="text-xs text-blue-600 hover:underline">View all</a>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-xl font-bold">{latestBP.systolic}/{latestBP.diastolic}</p>
            {latestBP.pulse && <span className="text-sm text-slate-400">{latestBP.pulse} bpm</span>}
          </div>
        </div>
      )}

      {/* Alerts */}
      {daysSinceBP != null && daysSinceBP >= 3 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          No BP reading in {daysSinceBP} days — <a href="/fitness/bp" className="underline">log one now</a>
        </div>
      )}

      {/* AI Briefing */}
      {loadingBriefing && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-200 rounded w-full"></div>
        </div>
      )}
      {aiBriefing && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">AI Coach</h2>
          <p className="text-sm">{aiBriefing.recommendation}</p>
          {aiBriefing.motivation && (
            <p className="text-xs text-slate-500 italic">{aiBriefing.motivation}</p>
          )}
          {aiBriefing.alerts.length > 0 && (
            <div className="space-y-1">
              {aiBriefing.alerts.map((alert, i) => (
                <p key={i} className="text-xs text-amber-700">{alert}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Factor Breakdown */}
      {readiness && (
        <details className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-500">Readiness Breakdown</summary>
          <div className="border-t border-slate-100 p-4 space-y-2">
            {[
              { label: 'HRV', score: readiness.hrv_score },
              { label: 'Resting HR', score: readiness.rhr_score },
              { label: 'Sleep', score: readiness.sleep_score },
              { label: 'Body Battery', score: readiness.body_battery_score },
              { label: 'Form (TSB)', score: readiness.form_score },
              { label: 'Blood Pressure', score: readiness.bp_score },
              { label: 'Weather', score: readiness.weather_score },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-slate-500">{f.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(f.score ?? 0)}`} style={{ width: `${f.score ?? 0}%` }} />
                </div>
                <span className="w-8 text-right font-mono">{f.score ?? '—'}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <a href="/fitness/metrics" className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm hover:shadow">Metrics</a>
        <a href="/fitness/bp" className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm hover:shadow">BP</a>
        <a href="/fitness/trends" className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm hover:shadow">Trends</a>
      </div>
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function diffLabel(diff: number): string {
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff}`;
}

function barColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}
