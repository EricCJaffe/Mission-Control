'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { Bucket, PeriodTotal, WorkoutTotals } from '@/lib/fitness/mileage';

/**
 * Distance totals over week, month and year.
 *
 * The comparison is against the SAME stretch of the previous period — the
 * first three days of last month, not all of it — because otherwise every
 * month opens by reporting a 90% collapse and the number becomes noise you
 * learn to skip.
 */
export default function MileageClient({
  totals,
  monthly,
  weekly,
  workoutsByPeriod,
  projections,
  year,
}: {
  totals: PeriodTotal[];
  monthly: Bucket[];
  weekly: Bucket[];
  workoutsByPeriod: Record<string, WorkoutTotals>;
  projections: Record<string, number | null>;
  year: string;
}) {
  const [focus, setFocus] = useState<string>('month');
  const focused = totals.find((t) => t.period === focus) ?? totals[0];
  const workouts = workoutsByPeriod[focus];
  const projection = projections[focus];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((t) => (
          <button
            key={t.period}
            type="button"
            onClick={() => setFocus(t.period)}
            className={`rounded-2xl border-2 p-4 text-left shadow-sm transition-colors ${
              focus === t.period
                ? 'border-blue-700 bg-blue-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t.label}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
              {t.miles.toFixed(1)}
              <span className="ml-1 text-sm font-semibold text-slate-500">mi</span>
            </p>
            {t.changePct !== null ? (
              <p
                className={`flex items-center gap-0.5 text-[11px] font-semibold ${
                  t.changePct > 2
                    ? 'text-emerald-600'
                    : t.changePct < -2
                      ? 'text-rose-600'
                      : 'text-slate-400'
                }`}
              >
                {t.changePct > 2 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : t.changePct < -2 ? (
                  <ArrowDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {Math.abs(t.changePct)}% vs prior {t.period}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">{t.activeDays} active days</p>
            )}
          </button>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Daily average" value={`${focused.milesPerDay.toFixed(2)} mi`} sub={`over ${focused.daysElapsed} days`} />
        <Stat
          label="Steps"
          value={focused.steps.toLocaleString()}
          sub={`${Math.round(focused.steps / Math.max(1, focused.daysElapsed)).toLocaleString()}/day`}
        />
        {projection !== null && projection !== undefined ? (
          <Stat
            label="On pace for"
            value={`${projection.toFixed(0)} mi`}
            sub={`full ${focused.period} at this rate`}
          />
        ) : (
          <Stat label="Active days" value={String(focused.activeDays)} sub={`of ${focused.daysElapsed}`} />
        )}
      </section>

      {workouts && workouts.sessions > 0 && (
        <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Logged sessions — {focused.label.toLowerCase()}
            </p>
            <p className="text-xs text-slate-400">
              {workouts.sessions} session{workouts.sessions === 1 ? '' : 's'} ·{' '}
              {Math.round(workouts.minutes / 60)}h {workouts.minutes % 60}m
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {workouts.miles.toFixed(2)}
            <span className="ml-1 text-sm font-semibold text-slate-500">mi in workouts</span>
          </p>
          <p className="text-xs text-slate-500">
            Of {focused.miles.toFixed(1)} mi total on foot — the rest is everyday walking.
          </p>
          <div className="mt-2 space-y-1">
            {workouts.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-slate-600">{t.type}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-blue-700"
                    style={{ width: `${(t.miles / Math.max(...workouts.byType.map((x) => x.miles))) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums font-semibold text-slate-900">
                  {t.miles.toFixed(1)} mi
                </span>
                <span className="w-8 shrink-0 text-right text-slate-400">{t.sessions}x</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <BarChart title={`${year} by month`} buckets={monthly} unit="mi" />
      <BarChart title="Last 12 weeks" buckets={weekly} unit="mi" />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function BarChart({ title, buckets, unit }: { title: string; buckets: Bucket[]; unit: string }) {
  const max = Math.max(...buckets.map((b) => b.miles), 1);
  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-3 flex items-end gap-1 overflow-x-auto" style={{ height: 140 }}>
        {buckets.map((b) => (
          <div key={b.key} className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold tabular-nums text-slate-500">
              {b.miles > 0 ? b.miles.toFixed(0) : ''}
            </span>
            <div
              className={`w-full rounded-t ${b.miles > 0 ? 'bg-blue-700' : 'bg-slate-100'}`}
              style={{ height: `${Math.max((b.miles / max) * 100, b.miles > 0 ? 3 : 1)}%` }}
              title={`${b.label}: ${b.miles} ${unit}`}
            />
            <span className="text-[10px] text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
