'use client';

import { Footprints, Mountain, Timer, TrendingUp } from 'lucide-react';
import {
  formatDuration,
  formatPace,
  type RunAnalysis,
} from '@/lib/fitness/run-analysis';

/**
 * The detail behind a GPS run.
 *
 * The headline is deliberately "longest continuous run", not distance. The
 * active plan's goal is 3.1 miles unbroken, so that is the number that says
 * whether a session moved the block forward — a four-mile walk with jogging
 * sprinkled through it is not the same as a mile straight.
 */
// Heart rate is rendered by HeartRateZones above this, which says everything
// the old avg/max card did and places it against the zone ladder.
export default function RunBreakdown({ analysis }: { analysis: RunAnalysis }) {
  const a = analysis;
  const runShare = a.runSeconds + a.walkSeconds > 0
    ? a.runSeconds / (a.runSeconds + a.walkSeconds)
    : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Longest continuous run
            </p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">
              {(a.longestRunMeters / 1609.344).toFixed(2)}
              <span className="ml-1 text-lg font-semibold text-slate-500">mi</span>
            </p>
            <p className="text-sm text-slate-600">
              {formatDuration(a.longestRunSeconds)} without stopping
            </p>
            <p className="mt-1 text-xs text-slate-500">
              The 5K block is measured on this, not total distance.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Distance" value={`${a.totalMiles.toFixed(2)} mi`} sub="GPS measured" />
        <Stat
          label="Moving time"
          value={formatDuration(a.movingSeconds)}
          sub={`${formatDuration(a.totalSeconds)} elapsed`}
        />
        <Stat
          label="Avg pace"
          value={`${formatPace(a.avgPaceMinPerMile)}`}
          sub="per mile, moving"
        />
        <Stat
          label="Elevation"
          value={`+${a.elevationGainM} m`}
          sub={`−${a.elevationLossM} m`}
          icon={<Mountain className="h-3.5 w-3.5" />}
        />
      </section>

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Footprints className="h-3.5 w-3.5" />
          Running vs walking
        </p>

        <div className="mt-2 flex h-6 overflow-hidden rounded-lg">
          <div
            className="flex items-center justify-center bg-blue-700 text-[11px] font-bold text-white"
            style={{ width: `${Math.max(runShare * 100, 0)}%` }}
          >
            {runShare > 0.12 && `${Math.round(runShare * 100)}%`}
          </div>
          <div
            className="flex items-center justify-center bg-slate-300 text-[11px] font-bold text-slate-700"
            style={{ width: `${Math.max((1 - runShare) * 100, 0)}%` }}
          >
            {1 - runShare > 0.12 && `${Math.round((1 - runShare) * 100)}%`}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-blue-700">Running</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {formatDuration(a.runSeconds)}
            </p>
            <p className="text-xs text-slate-500">
              {(a.runMeters / 1609.344).toFixed(2)} mi @ {formatPace(a.runPaceMinPerMile)}/mi
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Walking</p>
            <p className="text-lg font-bold tabular-nums text-slate-600">
              {formatDuration(a.walkSeconds)}
            </p>
            <p className="text-xs text-slate-500">
              {(a.walkMeters / 1609.344).toFixed(2)} mi @ {formatPace(a.walkPaceMinPerMile)}/mi
            </p>
          </div>
        </div>
      </section>

      {a.speedTrace.length > 1 && <SpeedChart trace={a.speedTrace} />}

      {a.splits.length > 0 && (
        <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Mile splits
          </p>
          <div className="mt-2 space-y-1.5">
            {a.splits.map((s) => {
              const fastest = Math.min(...a.splits.map((x) => x.paceMinPerMile));
              const slowest = Math.max(...a.splits.map((x) => x.paceMinPerMile));
              const range = slowest - fastest || 1;
              // Bar length is inverted: faster mile, longer bar.
              const width = 30 + 70 * (1 - (s.paceMinPerMile - fastest) / range);
              return (
                <div key={s.mile} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 font-semibold text-slate-500">
                    Mi {s.mile}
                  </span>
                  <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="flex items-center bg-blue-700/85 pl-2 text-[11px] font-bold text-white"
                      style={{ width: `${width}%` }}
                    >
                      {formatPace(s.paceMinPerMile)}
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-slate-500">
                    {Math.round(s.runShare * 100)}% run
                  </span>
                  <span className="hidden w-12 shrink-0 text-right text-slate-400 sm:inline">
                    +{s.elevationGainM}m
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Timer className="h-3.5 w-3.5" />
          Segments
          <span className="font-normal normal-case tracking-normal text-slate-400">
            {a.segments.length}
          </span>
        </p>
        <div className="mt-2 space-y-1">
          {a.segments.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase ${
                  s.kind === 'run' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {s.kind}
              </span>
              <span className="w-14 shrink-0 tabular-nums font-semibold text-slate-900">
                {formatDuration(s.seconds)}
              </span>
              <span className="w-16 shrink-0 tabular-nums text-slate-500">
                {(s.meters / 1609.344).toFixed(2)} mi
              </span>
              <span className="tabular-nums text-slate-500">
                {formatPace(s.paceMinPerMile)}/mi
              </span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * Speed over time, coloured by run/walk state.
 *
 * Drawn as plain SVG rects rather than pulling in a chart library — it is a
 * bar per sample and the shape is the whole point, so the dependency would buy
 * nothing.
 */
function SpeedChart({ trace }: { trace: RunAnalysis['speedTrace'] }) {
  const max = Math.max(...trace.map((p) => p.speed), 2.5);
  const H = 64;

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Pace through the run
      </p>
      <svg
        viewBox={`0 0 ${trace.length} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-16 w-full"
        role="img"
        aria-label="Speed over the course of the run, with running stretches in blue"
      >
        {trace.map((p, i) => (
          <rect
            key={i}
            x={i}
            y={H - (p.speed / max) * H}
            width={1}
            height={(p.speed / max) * H}
            className={p.kind === 'run' ? 'fill-blue-700' : 'fill-slate-300'}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>start</span>
        <span>
          <span className="font-semibold text-blue-700">blue</span> = running
        </span>
        <span>finish</span>
      </div>
    </section>
  );
}
