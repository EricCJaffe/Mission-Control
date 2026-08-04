'use client';

import { AlertTriangle, Heart } from 'lucide-react';
import {
  ZONE_META,
  positionPct,
  type SessionZoneAnalysis,
} from '@/lib/fitness/hr-zone-analysis';
import type { HRZones } from '@/lib/fitness/types';

/**
 * Where a session's heart rate sat on the zone ladder.
 *
 * Shows the range min → avg → max against the bands rather than a
 * time-in-zone breakdown, because Apple Health sends three numbers per
 * workout and not the per-second series. A percentage split derived from an
 * average would be a fabricated measurement, so the caveat is stated on the
 * card rather than left for the reader to assume otherwise.
 */
export default function HeartRateZones({
  analysis,
  zones,
  seasonalNote,
}: {
  analysis: SessionZoneAnalysis;
  zones: HRZones;
  seasonalNote?: string | null;
}) {
  const a = analysis;
  if (a.avgHr === null && a.maxHr === null) return null;

  const avgPos = positionPct(a.avgHr, zones);
  const maxPos = positionPct(a.maxHr, zones);
  const minPos = positionPct(a.minHr, zones);

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Heart className="h-3.5 w-3.5 text-rose-600" />
          Heart rate zones
        </p>
        {a.avgZone !== null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ZONE_META[a.avgZone].bg} ${ZONE_META[a.avgZone].text}`}
          >
            {ZONE_META[a.avgZone].name}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-slate-700">{a.summary}</p>

      {/* The ladder. Bands are proportional to their bpm width, so a wide zone
          looks wide — the shape carries information rather than being decorative. */}
      <div className="mt-3">
        <div className="flex h-7 w-full overflow-hidden rounded-lg">
          {a.bands.map((b) => (
            <div
              key={b.zone}
              className={`${b.meta.bar} flex items-center justify-center`}
              style={{ width: `${b.widthPct}%` }}
              title={`${b.meta.name}: ${b.low}–${b.high} bpm`}
            >
              <span className="text-[10px] font-bold text-white/90">Z{b.zone}</span>
            </div>
          ))}
        </div>

        {/* Markers sit on a track beneath the bands rather than on top of them,
            so a marker never obscures the zone it is pointing at. */}
        <div className="relative mt-1 h-9">
          {minPos !== null && a.minHr !== null && (
            <Marker pct={minPos} label="min" value={a.minHr} muted />
          )}
          {avgPos !== null && a.avgHr !== null && (
            <Marker pct={avgPos} label="avg" value={a.avgHr} strong />
          )}
          {maxPos !== null && a.maxHr !== null && (
            <Marker pct={maxPos} label="max" value={a.maxHr} />
          )}
        </div>

        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{a.bands[0]?.low} bpm</span>
          <span>ceiling {a.effectiveCeiling}</span>
        </div>
      </div>

      {a.exceededCeiling && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Peak of {a.maxHr} went above your {a.effectiveCeiling} bpm ceiling. Worth a mention to
            Dr. Chandler if it is happening often, and worth easing the hard intervals until then.
          </span>
        </p>
      )}

      {seasonalNote && <p className="mt-2 text-[11px] text-slate-500">{seasonalNote}</p>}

      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
        This is the range the session covered, not time spent in each zone. Apple Health sends an
        average and a peak per workout, not the second-by-second trace, and a split derived from an
        average would be invented rather than measured. Importing Garmin .FIT files would give real
        time-in-zone.
      </p>
    </section>
  );
}

function Marker({
  pct,
  label,
  value,
  strong,
  muted,
}: {
  pct: number;
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${pct}%` }}
    >
      <div className={`h-2 w-0.5 ${muted ? 'bg-slate-300' : strong ? 'bg-slate-900' : 'bg-slate-500'}`} />
      <span
        className={`whitespace-nowrap text-[10px] tabular-nums ${
          muted ? 'text-slate-400' : strong ? 'font-bold text-slate-900' : 'text-slate-600'
        }`}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}
