'use client';

import { useState, useCallback } from 'react';
import { bpFlagTailwindClass } from '@/lib/fitness/alerts';
import type { BPFlagLevel } from '@/lib/fitness/types';
import DateRangeFilter, { getDefaultRange, type DateRange } from './DateRangeFilter';

type BodyMetricRow = {
  metric_date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  muscle_mass_lbs: number | null;
  bone_mass_lbs: number | null;
  hydration_lbs: number | null;
  sleep_score: number | null;
  vo2_max: number | null;
};

type BPRow = {
  reading_date: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  flag_level: BPFlagLevel;
};

type WorkoutRow = {
  workout_date: string;
  workout_type: string;
  duration_minutes: number | null;
  tss: number | null;
  compliance_color: string | null;
  rpe_session: number | null;
};

type FormRow = {
  calc_date: string;
  fitness_ctl: number | null;
  fatigue_atl: number | null;
  form_tsb: number | null;
  form_status: string | null;
  daily_tss: number;
};

type Props = {
  bodyMetrics: BodyMetricRow[];
  bpReadings: BPRow[];
  workoutLogs: WorkoutRow[];
  formHistory: FormRow[];
};

const COMPLIANCE_BG: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

function Sparkline({ values, color = '#3b82f6', height = 40 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div className="text-xs text-slate-400">Not enough data</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FitnessTrendsClient({ bodyMetrics: initialBody, bpReadings: initialBp, workoutLogs: initialWorkouts, formHistory: initialForm }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange('trends'));
  const [bodyMetrics, setBodyMetrics] = useState(initialBody);
  const [bpReadings, setBpReadings] = useState(initialBp);
  const [workoutLogs, setWorkoutLogs] = useState(initialWorkouts);
  const [formHistory, setFormHistory] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  const handleDateRangeChange = useCallback(async (range: DateRange) => {
    setDateRange(range);
    setLoading(true);
    try {
      const res = await fetch(`/api/fitness/trends?start=${range.startDate}&end=${range.endDate}`);
      const data = await res.json();
      setBodyMetrics(data.bodyMetrics);
      setBpReadings(data.bpReadings);
      setWorkoutLogs(data.workoutLogs);
      setFormHistory(data.formHistory);
    } catch (err) {
      console.error('Failed to fetch trends', err);
    }
    setLoading(false);
  }, []);

  const rhrValues = bodyMetrics.filter((m) => m.resting_hr != null).map((m) => m.resting_hr!);
  const hrvValues = bodyMetrics.filter((m) => m.hrv_ms != null).map((m) => m.hrv_ms!);
  const weightValues = bodyMetrics.filter((m) => m.weight_lbs != null).map((m) => m.weight_lbs!);
  const bodyFatValues = bodyMetrics.filter((m) => m.body_fat_pct != null).map((m) => m.body_fat_pct!);
  const muscleValues = bodyMetrics.filter((m) => m.muscle_mass_lbs != null).map((m) => m.muscle_mass_lbs!);
  const boneValues = bodyMetrics.filter((m) => m.bone_mass_lbs != null).map((m) => m.bone_mass_lbs!);
  const hydrationValues = bodyMetrics.filter((m) => m.hydration_lbs != null).map((m) => m.hydration_lbs!);
  const ctlValues = formHistory.filter((f) => f.fitness_ctl != null).map((f) => f.fitness_ctl!);
  const atlValues = formHistory.filter((f) => f.fatigue_atl != null).map((f) => f.fatigue_atl!);
  const tsbValues = formHistory.filter((f) => f.form_tsb != null).map((f) => f.form_tsb!);

  const totalVolume = workoutLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
  const avgTss = workoutLogs.filter((l) => l.tss).length > 0
    ? Math.round(workoutLogs.filter((l) => l.tss).reduce((s, l) => s + (l.tss ?? 0), 0) / workoutLogs.filter((l) => l.tss).length)
    : null;

  const latestRhr = rhrValues[rhrValues.length - 1];
  const latestHrv = hrvValues[hrvValues.length - 1];
  const latestWeight = weightValues[weightValues.length - 1];
  const latestBodyFat = bodyFatValues[bodyFatValues.length - 1];
  const latestMuscle = muscleValues[muscleValues.length - 1];
  const latestBone = boneValues[boneValues.length - 1];
  const latestHydration = hydrationValues[hydrationValues.length - 1];
  const latestTsb = tsbValues[tsbValues.length - 1];
  const latestForm = formHistory[formHistory.length - 1];

  const rangeDays = Math.round((new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) / 86400000);
  const rangeLabel = rangeDays <= 7 ? '7d' : rangeDays <= 30 ? '30d' : rangeDays <= 60 ? '60d' : rangeDays <= 90 ? '90d' : rangeDays <= 180 ? '6mo' : rangeDays <= 365 ? '1yr' : 'all';

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} storageKey="trends" />

      {loading && (
        <div className="text-center py-4">
          <p className="text-sm text-slate-400">Loading trends...</p>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Workouts (${rangeLabel})`} value={String(workoutLogs.length)} />
        <StatCard label="Total Volume" value={`${Math.round(totalVolume / 60)}h`} />
        <StatCard label="Avg TSS" value={avgTss != null ? String(avgTss) : '—'} />
        <StatCard label="Form / TSB" value={latestTsb != null ? String(Math.round(latestTsb)) : '—'} sub={latestForm?.form_status ?? undefined} />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Source Of Truth</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
            <div className="text-sm font-semibold text-slate-800">Withings</div>
            <p className="mt-1 text-sm text-slate-600">Weight, body fat, muscle mass, bone mass, hydration, and blood-pressure/sleep detail imports.</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-sm font-semibold text-slate-800">Garmin</div>
            <p className="mt-1 text-sm text-slate-600">Resting HR, HRV, body battery, sleep score, VO2 max, and training-readiness style metrics.</p>
          </div>
        </div>
      </div>

      {/* Cardiac metrics charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <TrendCard
          title="Resting HR"
          subtitle={latestRhr ? `Latest: ${latestRhr} bpm` : 'No data'}
          target="Target < 70 bpm"
          note={latestRhr != null && latestRhr < 70 ? '✓ At target' : undefined}
        >
          <Sparkline values={rhrValues} color="#ef4444" />
        </TrendCard>

        <TrendCard
          title="HRV"
          subtitle={latestHrv ? `Latest: ${latestHrv} ms` : 'No data'}
          note="Higher is better"
        >
          <Sparkline values={hrvValues} color="#10b981" />
        </TrendCard>

        <TrendCard
          title="Weight"
          subtitle={latestWeight ? `Latest: ${latestWeight} lbs` : 'No data'}
          note="Withings scale trend"
        >
          <Sparkline values={weightValues} color="#8b5cf6" />
        </TrendCard>

        <TrendCard
          title="PMC — Fitness / Fatigue / Form"
          subtitle={latestTsb != null ? `Form (TSB): ${Math.round(latestTsb)} · CTL: ${Math.round(ctlValues[ctlValues.length - 1] ?? 0)}` : 'No data'}
        >
          <div className="relative">
            <Sparkline values={ctlValues} color="#3b82f6" height={60} />
            <div className="absolute inset-0 opacity-50">
              <Sparkline values={atlValues} color="#ef4444" height={60} />
            </div>
            <div className="absolute inset-0 opacity-50">
              <Sparkline values={tsbValues.map((v) => v + 50)} color="#10b981" height={60} />
            </div>
          </div>
          <div className="flex gap-4 mt-1 text-xs">
            <span className="text-blue-500">— Fitness (CTL)</span>
            <span className="text-red-500">— Fatigue (ATL)</span>
            <span className="text-green-500">— Form (TSB)</span>
          </div>
        </TrendCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendCard
          title="Body Fat"
          subtitle={latestBodyFat != null ? `Latest: ${latestBodyFat}%` : 'No data'}
          note="Withings body composition"
        >
          <Sparkline values={bodyFatValues} color="#f97316" />
        </TrendCard>

        <TrendCard
          title="Detailed Body Composition"
          subtitle={[
            latestMuscle != null ? `Muscle ${latestMuscle} lbs` : null,
            latestBone != null ? `Bone ${latestBone} lbs` : null,
            latestHydration != null ? `Hydration ${latestHydration} lbs` : null,
          ].filter(Boolean).join(' · ') || 'No data'}
          note="Withings-derived"
        >
          <div className="space-y-2">
            <Sparkline values={muscleValues} color="#10b981" />
            <div className="opacity-70">
              <Sparkline values={boneValues} color="#6366f1" />
            </div>
            <div className="opacity-70">
              <Sparkline values={hydrationValues} color="#06b6d4" />
            </div>
            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-emerald-500">— Muscle</span>
              <span className="text-indigo-500">— Bone</span>
              <span className="text-cyan-500">— Hydration</span>
            </div>
          </div>
        </TrendCard>
      </div>

      {/* BP trend */}
      {bpReadings.length > 0 && (
        <TrendCard
          title="Blood Pressure"
          subtitle={`${bpReadings[bpReadings.length - 1]?.systolic}/${bpReadings[bpReadings.length - 1]?.diastolic} (latest)`}
        >
          <div>
            <Sparkline values={bpReadings.map((r) => r.systolic)} color="#ef4444" />
            <div className="opacity-60">
              <Sparkline values={bpReadings.map((r) => r.diastolic)} color="#f97316" />
            </div>
            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-red-500">— Systolic</span>
              <span className="text-orange-500">— Diastolic</span>
            </div>
          </div>
          {/* Flag summary */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(['normal','elevated','high_stage1','high_stage2','crisis'] as BPFlagLevel[]).map((flag) => {
              const count = bpReadings.filter((r) => r.flag_level === flag).length;
              if (!count) return null;
              return (
                <span key={flag} className={`text-xs rounded-full px-2 py-0.5 border font-medium ${bpFlagTailwindClass(flag)}`}>
                  {flag.replace(/_/g, ' ')}: {count}
                </span>
              );
            })}
          </div>
        </TrendCard>
      )}

      {/* Workout log table */}
      {workoutLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Workout Log ({rangeLabel})</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {[...workoutLogs].reverse().slice(0, 50).map((log, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-xs text-slate-400 w-24 shrink-0 font-mono">
                  {new Date(log.workout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="capitalize text-slate-700 flex-1">{log.workout_type}</span>
                <span className="text-xs text-slate-400">{log.duration_minutes ? `${log.duration_minutes}m` : ''}</span>
                <span className="text-xs text-slate-400">{log.tss ? `TSS ${Math.round(log.tss)}` : ''}</span>
                {log.compliance_color && (
                  <span className={`h-2 w-2 rounded-full shrink-0 ${COMPLIANCE_BG[log.compliance_color] ?? ''}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {workoutLogs.length === 0 && bpReadings.length === 0 && bodyMetrics.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          <p className="text-lg">No data yet.</p>
          <p className="text-sm mt-1">Start logging workouts and body metrics to see trends here.</p>
        </div>
      )}
    </div>
  );
}

function TrendCard({ title, subtitle, target, note, children }: {
  title: string;
  subtitle?: string;
  target?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        {target && <p className="text-xs text-slate-400">{target}</p>}
        {note && <p className="text-xs text-green-600 font-medium">{note}</p>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500 capitalize mt-0.5">{sub}</p>}
    </div>
  );
}
