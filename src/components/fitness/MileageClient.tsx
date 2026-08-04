'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Footprints } from 'lucide-react';
import {
  DISCIPLINES,
  RANGES,
  disciplineOf,
  rangeBounds,
  workoutTotals as computeWorkoutTotals,
  workoutMonthlyBuckets,
  workoutWeeklyBuckets,
  workoutPeriodTotal,
  type Bucket,
  type Discipline,
  type PeriodTotal,
  type RangeKey,
  type WorkoutDistance,
} from '@/lib/fitness/mileage';

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
  sessions,
  today,
  dailyTotals,
  dailyMonthly,
  projections,
  year,
}: {
  sessions: WorkoutDistance[];
  today: string;
  dailyTotals: PeriodTotal[];
  dailyMonthly: Bucket[];
  projections: Record<string, number | null>;
  year: string;
}) {
  const [focus, setFocus] = useState<string>('month');
  const [discipline, setDiscipline] = useState<Discipline | 'all'>('all');
  const [range, setRange] = useState<RangeKey>('this_month');

  /** Only offer disciplines that actually have sessions with distance. */
  const availableDisciplines = useMemo(() => {
    const present = new Set(sessions.map((s) => disciplineOf(s.workout_type)));
    return DISCIPLINES.filter((d) => d.key === 'all' || present.has(d.key as Discipline));
  }, [sessions]);

  const filtered = useMemo(
    () =>
      discipline === 'all'
        ? sessions
        : sessions.filter((s) => disciplineOf(s.workout_type) === discipline),
    [sessions, discipline]
  );

  /** Period cards recompute against the chosen discipline. */
  const periodTotals = useMemo(
    () => (['week', 'month', 'year', 'all'] as const).map((p) => workoutPeriodTotal(filtered, p, today)),
    [filtered, today]
  );

  /** The activity breakdown answers a named range, not the focused period. */
  const rangeTotals = useMemo(() => {
    const { from, to } = rangeBounds(range, today);
    return { ...computeWorkoutTotals(filtered, from, to), from, to };
  }, [filtered, range, today]);

  const charts = useMemo(
    () => ({
      monthly: workoutMonthlyBuckets(filtered, today.slice(0, 4)),
      weekly: workoutWeeklyBuckets(filtered, today, 12),
    }),
    [filtered, today]
  );
  const focused = periodTotals.find((t) => t.period === focus) ?? periodTotals[0];
  const daily = dailyTotals.find((t) => t.period === focus);
  const projection = projections[focus];

  return (
    <div className="space-y-4">
      {/* Which sport. Running, Outdoor Run and Indoor Run are all running —
          grouped so the totals mean something. */}
      <div className="flex flex-wrap gap-1.5">
        {availableDisciplines.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDiscipline(d.key)}
            className={`min-h-[36px] rounded-xl px-3 text-sm font-semibold transition-colors ${
              discipline === d.key
                ? 'bg-blue-700 text-white'
                : 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {periodTotals.map((t) => (
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
            {/* The card said a number and nothing else. The trace shows
                whether that number is rising or falling. */}
            <CardSpark
              values={
                t.period === 'week'
                  ? charts.weekly.slice(-8).map((b) => b.miles)
                  : charts.monthly.map((b) => b.miles)
              }
              active={focus === t.period}
            />
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

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            By activity
          </p>
          <span className="text-[11px] text-slate-400">
            {rangeTotals.from} → {rangeTotals.to}
          </span>
        </div>

        {/* Named ranges, because a single rolling window cannot answer "how did
            last month compare" or "what did I do last year". */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                range === r.key
                  ? 'bg-slate-800 text-white'
                  : 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
          {rangeTotals.miles.toFixed(1)}
          <span className="ml-1 text-sm font-semibold text-slate-500">mi</span>
          <span className="ml-2 text-sm font-normal text-slate-500">
            {rangeTotals.sessions} session{rangeTotals.sessions === 1 ? '' : 's'}
            {rangeTotals.minutes > 0 &&
              ` · ${Math.floor(rangeTotals.minutes / 60)}h ${rangeTotals.minutes % 60}m`}
          </span>
        </p>

        {rangeTotals.byType.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing logged in this range.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {rangeTotals.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-slate-600">{t.type}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-blue-700"
                    style={{
                      width: `${(t.miles / Math.max(...rangeTotals.byType.map((x) => x.miles))) * 100}%`,
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
        )}
      </section>

      <BarChart title={`Training miles — ${year} by month`} buckets={charts.monthly} />
      <BarChart title="Training miles — last 12 weeks" buckets={charts.weekly} />

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

/**
 * A bare trace of the last few buckets.
 *
 * No axes or labels — at this size they would be unreadable, and the card
 * already states the figure. The line is only there to say which way it is
 * going.
 */
function CardSpark({ values, active }: { values: number[]; active: boolean }) {
  const points = values.filter((v) => Number.isFinite(v));
  if (points.length < 2 || Math.max(...points) === 0) return <div className="mt-1.5 h-6" />;

  const max = Math.max(...points);
  const w = 100;
  const h = 24;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-1.5 h-6 w-full"
      aria-hidden="true"
    >
      <path
        d={`${path} L ${w} ${h} L 0 ${h} Z`}
        className={active ? 'fill-blue-200/60' : 'fill-slate-100'}
      />
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={active ? 'stroke-blue-700' : 'stroke-slate-400'}
      />
    </svg>
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
