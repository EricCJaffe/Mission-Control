/**
 * Heart-rate zone analysis for a single cardio session.
 *
 * IMPORTANT LIMITATION, and the reason this module is shaped the way it is:
 * Apple Health sends one average, one peak and sometimes one minimum per
 * workout. It does not send the per-second series. So TIME IN ZONE cannot be
 * computed, and nothing here pretends to.
 *
 * Deriving "22 minutes in Z2" from an average of 124 would be inventing a
 * measurement — the same failure as scoring a missing blood-pressure reading
 * as 80. What an average and a peak genuinely support is: which zone the
 * session sat in, how high it reached, and whether it went past the ceiling.
 * That is what this reports.
 *
 * The columns for real time-in-zone already exist on cardio_logs and are empty
 * on all 121 rows. They fill in only if a source that carries samples is added
 * — Garmin .FIT files carry per-second heart rate, and the parser currently
 * reads only resting HR from them.
 */

import type { HRZones } from './types';

export type ZoneNumber = 0 | 1 | 2 | 3 | 4;

export type ZoneMeta = {
  zone: ZoneNumber;
  name: string;
  description: string;
  /** Tailwind classes rather than hex, so it matches the rest of the UI. */
  bar: string;
  text: string;
  bg: string;
};

export const ZONE_META: Record<ZoneNumber, ZoneMeta> = {
  0: { zone: 0, name: 'Below Z1', description: 'Resting or very light', bar: 'bg-slate-300', text: 'text-slate-600', bg: 'bg-slate-50' },
  1: { zone: 1, name: 'Z1 Recovery', description: 'Warm-up, cool-down, easy days', bar: 'bg-sky-400', text: 'text-sky-700', bg: 'bg-sky-50' },
  2: { zone: 2, name: 'Z2 Endurance', description: 'Aerobic base — the zone that builds cardiac fitness', bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  3: { zone: 3, name: 'Z3 Tempo', description: 'Controlled pushing', bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  4: { zone: 4, name: 'Z4 Threshold', description: 'Hard — approach with caution', bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
};

/** Which zone a single reading falls in. Above Z4 still reports Z4. */
export function zoneOf(bpm: number | null | undefined, zones: HRZones): ZoneNumber {
  if (bpm == null || !Number.isFinite(bpm)) return 0;
  if (bpm >= zones.z4[0]) return 4;
  if (bpm >= zones.z3[0]) return 3;
  if (bpm >= zones.z2[0]) return 2;
  if (bpm >= zones.z1[0]) return 1;
  return 0;
}

export type ZoneBand = {
  zone: ZoneNumber;
  meta: ZoneMeta;
  low: number;
  high: number;
  /** Share of the full displayed range this band occupies, for bar widths. */
  widthPct: number;
};

/**
 * The zone ladder as bands, scaled across the span actually being displayed.
 *
 * The scale starts at the bottom of Z1 rather than zero — a bar that spends
 * two thirds of its width on heart rates you will never see while exercising
 * makes the zones themselves unreadable.
 */
export function zoneBands(zones: HRZones): ZoneBand[] {
  const low = zones.z1[0];
  const high = zones.z4[1];
  const span = Math.max(1, high - low);

  return ([1, 2, 3, 4] as ZoneNumber[]).map((z) => {
    const [bandLow, bandHigh] = zones[`z${z}` as 'z1' | 'z2' | 'z3' | 'z4'];
    return {
      zone: z,
      meta: ZONE_META[z],
      low: bandLow,
      high: bandHigh,
      widthPct: ((bandHigh - bandLow) / span) * 100,
    };
  });
}

/** Where a reading sits along the same scale, 0-100. Null when unknown. */
export function positionPct(bpm: number | null | undefined, zones: HRZones): number | null {
  if (bpm == null || !Number.isFinite(bpm)) return null;
  const low = zones.z1[0];
  const high = zones.z4[1];
  const span = Math.max(1, high - low);
  return Math.max(0, Math.min(100, ((bpm - low) / span) * 100));
}

export type SessionZoneAnalysis = {
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  avgZone: ZoneNumber | null;
  maxZone: ZoneNumber | null;
  /** True when the peak went past the configured cardiac ceiling. */
  exceededCeiling: boolean;
  ceiling: number;
  /** Ceiling actually applied after any seasonal adjustment. */
  effectiveCeiling: number;
  bands: ZoneBand[];
  /** One-line reading of the session. */
  summary: string;
  /**
   * Always false with the current data sources. Present so the UI can switch
   * to real time-in-zone the moment a sample-carrying source is wired up,
   * rather than needing to be rewritten.
   */
  hasTimeInZone: boolean;
};

export function analyseSessionZones(
  input: { avg_hr: number | null; max_hr: number | null; min_hr?: number | null },
  zones: HRZones,
  opts: { ceiling: number; effectiveCeiling?: number } = { ceiling: 155 }
): SessionZoneAnalysis {
  const avgZone = input.avg_hr != null ? zoneOf(input.avg_hr, zones) : null;
  const maxZone = input.max_hr != null ? zoneOf(input.max_hr, zones) : null;
  const effectiveCeiling = opts.effectiveCeiling ?? opts.ceiling;

  let summary: string;
  if (avgZone === null) {
    summary = 'No heart-rate data for this session.';
  } else {
    const avgMeta = ZONE_META[avgZone];
    summary =
      maxZone !== null && maxZone > avgZone
        ? `Mostly ${avgMeta.name}, peaking into ${ZONE_META[maxZone].name}.`
        : `${avgMeta.name} throughout.`;
  }

  return {
    avgHr: input.avg_hr,
    maxHr: input.max_hr,
    minHr: input.min_hr ?? null,
    avgZone,
    maxZone,
    exceededCeiling: input.max_hr != null && input.max_hr > effectiveCeiling,
    ceiling: opts.ceiling,
    effectiveCeiling,
    bands: zoneBands(zones),
    summary,
    hasTimeInZone: false,
  };
}
