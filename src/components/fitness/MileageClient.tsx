'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Footprints } from 'lucide-react';
import type { Bucket, PeriodTotal, WorkoutPeriodTotal } from '@/lib/fitness/mileage';

/**
 * Training mileage by week, month and year.
 *
 * Logged sessions are the whole point — everyday walking is real distance but
 * it is not training, and a week where the step count held up because of
 * errands should not read the same as a week of running. Daily movement is
 * kept, collapsed, at the bottom for context.
 *
 * Comparisons run against the SAME stretch of the previous period — the first
 * three days of last month, not all of it — or every month would open by
 * reporting a collapse and the number becomes noise you learn to skip.
 */
export default function MileageClient({
  workoutTotals,
  dailyTotals,
  monthly,
  weekly,
  dailyMonthly,
  projections,
  year,
}: {
  workoutTotals: WorkoutPeriodTotal[];
  dailyTotals: PeriodTotal[];
  monthly: Bucket[];
  weekly: Bucket[];
  dailyMonthly: Bucket[];
  projections: Record<string, number | null>;
  year: string;
}) {
  const [focus, setFocus] = useState<string>('month');
  const focused = workoutTotals.find((t) => t.period === focus) ?? workoutTotals[0];
  const daily = dailyTotals.find((t) => t.period === focus);
  const projection = projections[focus];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {workoutTotals.map((t) => (
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
            <p className="text-[11px] text-slate-500">
              {t.sessions} session{t.sessions === 1 ? '' : 's'}
            </p>
            {t.changePct !== null ? (
              <p
                className={`mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold ${
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
                {Math.abs(t.changePct)}% vs prior
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {t.previousMiles > 0 ? `${t.previousMiles.toFixed(1)} mi prior` : 'no prior data'}
              </p>
            )}
          </button>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Time training"
          value={`${Math.floor(focused.minutes / 60)}h ${focused.minutes % 60}m`}
          sub={`${focused.sessions} session${focused.sessions === 1 ? '' : 's'}`}
        />
        <Stat
          label="Longest session"
          value={`${focused.longestMiles.toFixed(2)} mi`}
          sub="single workout"
        />
        <Stat
          label="Avg session"
          value={
            focused.sessions > 0 ? `${(focused.miles / focused.sessions).toFixed(2)} mi` : '—'
          }
          sub="per workout"
        />
        {projection !== null && projection !== undefined ? (
          <Stat
            label="On pace for"
            value={`${projection.toFixed(0)} mi`}
            sub={`full ${focused.period} at this rate`}
          />
        ) : (
          <Stat
            label="Per week"
            value={`${((focused.miles / Math.max(1, focused.daysElapsed)) * 7).toFixed(1)} mi`}
            sub="average"
          />
        )}
      </section>

      {focused.byType.length > 0 && (
        <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            By activity — {focused.label.toLowerCase()}
          </p>
          <div className="mt-2 space-y-1.5">
            {focused.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-slate-600">{t.type}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-blue-700"
                    style={{
                      width: `${(t.miles / Math.max(...focused.byType.map((x) => x.miles))) * 100}%`,
                    }}
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

      <BarChart title={`Training miles — ${year} by month`} buckets={monthly} />
      <BarChart title="Training miles — last 12 weeks" buckets={weekly} />

      {daily && (
        <details className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-slate-600">
            <Footprints className="h-4 w-4 text-slate-400" />
            All movement, including everyday walking
            <span className="font-normal text-slate-400">
              {daily.miles.toFixed(0)} mi {focused.label.toLowerCase()}
            </span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">
              Everything Apple Health counted on foot, errands included. Kept separate from
              training on purpose — a week that held up on step count because of walking around
              is not a week of running.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total on foot" value={`${daily.miles.toFixed(1)} mi`} sub={`${daily.activeDays} active days`} />
              <Stat label="Steps" value={daily.steps.toLocaleString()} sub={`${Math.round(daily.steps / Math.max(1, daily.daysElapsed)).toLocaleString()}/day`} />
              <Stat
                label="Training share"
                value={daily.miles > 0 ? `${Math.round((focused.miles / daily.miles) * 100)}%` : '—'}
                sub="of distance on foot"
              />
            </div>
            <BarChart title={`All movement — ${year} by month`} buckets={dailyMonthly} muted />
          </div>
        </details>
      )}
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

function BarChart({
  title,
  buckets,
  muted,
}: {
  title: string;
  buckets: Bucket[];
  muted?: boolean;
}) {
  const max = Math.max(...buckets.map((b) => b.miles), 1);
  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-3 flex items-end gap-1 overflow-x-auto" style={{ height: 140 }}>
        {buckets.map((b) => (
          <div key={b.key} className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold tabular-nums text-slate-500">
              {b.miles > 0 ? b.miles.toFixed(b.miles < 10 ? 1 : 0) : ''}
            </span>
            <div
              className={`w-full rounded-t ${
                b.miles > 0 ? (muted ? 'bg-slate-400' : 'bg-blue-700') : 'bg-slate-100'
              }`}
              style={{ height: `${Math.max((b.miles / max) * 100, b.miles > 0 ? 3 : 1)}%` }}
              title={`${b.label}: ${b.miles} mi`}
            />
            <span className="text-[10px] text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
