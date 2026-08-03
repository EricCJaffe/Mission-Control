/**
 * Derives detailed run statistics from a stored GPS route.
 *
 * The route already holds a point per second — timestamp, position, altitude
 * and instantaneous speed — but nothing read it except the map. Everything
 * here comes out of that: distance, splits, elevation, and the split between
 * running and walking, which for a couch-to-5K block is the number that
 * actually matters. The plan's goal is 3.1 miles CONTINUOUS, so "how long was
 * the longest unbroken run" is the progress measure, not total distance.
 *
 * Nothing here needs new ingestion. It is arithmetic on data already sitting
 * in workout_routes.
 */

export type RoutePoint = {
  ts: string;
  lat: number;
  lon: number;
  alt?: number | null;
  /** Metres per second, as recorded by the watch. */
  speed?: number | null;
};

const EARTH_RADIUS_M = 6_371_000;
const M_PER_MILE = 1609.344;

/** Great-circle distance in metres. */
export function haversine(a: RoutePoint, b: RoutePoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Speed threshold separating running from walking, in metres per second.
 *
 * 1.6 m/s is about 16:45 per mile. Eric's usual walk sits near 1.18 m/s and
 * his jog near 1.99, so the boundary falls in genuinely empty space between
 * them rather than slicing through either.
 */
export const RUN_SPEED_MS = 1.6;

/**
 * Hysteresis band. A point must clear the threshold by this margin to flip the
 * state, so a stride that momentarily dips does not end the run segment.
 */
const HYSTERESIS_MS = 0.25;

/** Segments shorter than this are absorbed into their neighbour. */
export const MIN_SEGMENT_SECONDS = 20;

/** Gaps longer than this mean the watch paused; distance is not interpolated across. */
const MAX_GAP_SECONDS = 30;

/**
 * Smooths altitude before any climb is summed.
 *
 * Barometric altitude jitters by tens of centimetres every second. Summing raw
 * per-point deltas invents hundreds of metres of climb on flat ground, and
 * filtering each delta against a threshold instead discards the real climb
 * entirely, because genuine gain arrives a few centimetres at a time. Smoothing
 * first, then summing, is what actually works.
 */
function smoothAltitudes(points: RoutePoint[], window = 15): number[] {
  const raw = points.map((p) => (typeof p.alt === 'number' && Number.isFinite(p.alt) ? p.alt : NaN));
  const half = Math.floor(window / 2);
  return raw.map((_, i) => {
    const slice = raw
      .slice(Math.max(0, i - half), Math.min(raw.length, i + half + 1))
      .filter((v) => !Number.isNaN(v));
    if (slice.length === 0) return NaN;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function accumulateElevation(
  altitudes: number[],
  gaps: number[]
): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < altitudes.length; i++) {
    if (gaps[i] > MAX_GAP_SECONDS) continue;
    const a = altitudes[i - 1];
    const b = altitudes[i];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const delta = b - a;
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { gain, loss };
}

function smoothSpeeds(points: RoutePoint[], window = 5): number[] {
  const raw = points.map((p) =>
    typeof p.speed === 'number' && Number.isFinite(p.speed) && p.speed >= 0 ? p.speed : 0
  );
  const half = Math.floor(window / 2);
  // Median rather than mean: GPS throws occasional wild speed spikes, and one
  // 12 m/s sample should not drag a walking stretch over the run threshold.
  return raw.map((_, i) => {
    const slice = raw.slice(Math.max(0, i - half), Math.min(raw.length, i + half + 1)).sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });
}

export type Segment = {
  kind: 'run' | 'walk';
  startIndex: number;
  endIndex: number;
  seconds: number;
  meters: number;
  /** Minutes per mile, null when the segment covered no ground. */
  paceMinPerMile: number | null;
};

export type Split = {
  mile: number;
  seconds: number;
  paceMinPerMile: number;
  /** Share of this mile spent running rather than walking, 0–1. */
  runShare: number;
  elevationGainM: number;
};

export type RunAnalysis = {
  totalMeters: number;
  totalMiles: number;
  totalSeconds: number;
  movingSeconds: number;
  runSeconds: number;
  walkSeconds: number;
  runMeters: number;
  walkMeters: number;
  /** The headline for a couch-to-5K block. */
  longestRunSeconds: number;
  longestRunMeters: number;
  avgPaceMinPerMile: number | null;
  runPaceMinPerMile: number | null;
  walkPaceMinPerMile: number | null;
  elevationGainM: number;
  elevationLossM: number;
  segments: Segment[];
  splits: Split[];
  /** Downsampled speed trace for charting, in metres per second. */
  speedTrace: Array<{ t: number; speed: number; kind: 'run' | 'walk' }>;
};

function paceFrom(meters: number, seconds: number): number | null {
  if (meters <= 0 || seconds <= 0) return null;
  return seconds / 60 / (meters / M_PER_MILE);
}

/**
 * Classifies each point as running or walking, then merges runs of the same
 * kind into segments and absorbs any too short to be real.
 */
function buildSegments(points: RoutePoint[], speeds: number[], gaps: number[]): Segment[] {
  if (points.length === 0) return [];

  const kinds: Array<'run' | 'walk'> = [];
  let state: 'run' | 'walk' = speeds[0] >= RUN_SPEED_MS ? 'run' : 'walk';
  for (const speed of speeds) {
    if (state === 'walk' && speed >= RUN_SPEED_MS + HYSTERESIS_MS) state = 'run';
    else if (state === 'run' && speed < RUN_SPEED_MS - HYSTERESIS_MS) state = 'walk';
    kinds.push(state);
  }

  const raw: Array<{ kind: 'run' | 'walk'; startIndex: number; endIndex: number }> = [];
  for (let i = 0; i < kinds.length; i++) {
    const last = raw[raw.length - 1];
    if (last && last.kind === kinds[i]) last.endIndex = i;
    else raw.push({ kind: kinds[i], startIndex: i, endIndex: i });
  }

  const measure = (s: { startIndex: number; endIndex: number }) => {
    let seconds = 0;
    let meters = 0;
    for (let i = s.startIndex + 1; i <= s.endIndex; i++) {
      if (gaps[i] > MAX_GAP_SECONDS) continue;
      seconds += gaps[i];
      meters += haversine(points[i - 1], points[i]);
    }
    return { seconds, meters };
  };

  // Absorb blips. A 6-second dip below threshold mid-run is a hill or a kerb,
  // not a walk break, and leaving it in fragments the segment list into noise.
  const merged: typeof raw = [];
  for (const seg of raw) {
    const { seconds } = measure(seg);
    const prev = merged[merged.length - 1];
    if (seconds < MIN_SEGMENT_SECONDS && prev) {
      prev.endIndex = seg.endIndex;
    } else if (prev && prev.kind === seg.kind) {
      prev.endIndex = seg.endIndex;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.map((seg) => {
    const { seconds, meters } = measure(seg);
    return {
      kind: seg.kind,
      startIndex: seg.startIndex,
      endIndex: seg.endIndex,
      seconds: Math.round(seconds),
      meters: Math.round(meters),
      paceMinPerMile: paceFrom(meters, seconds),
    };
  });
}

export function analyseRun(rawPoints: RoutePoint[]): RunAnalysis | null {
  const points = rawPoints
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.ts)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  if (points.length < 2) return null;

  const times = points.map((p) => Date.parse(p.ts) / 1000);
  const gaps = points.map((_, i) => (i === 0 ? 0 : Math.max(0, times[i] - times[i - 1])));
  const speeds = smoothSpeeds(points);

  const altitudes = smoothAltitudes(points);
  const { gain: elevationGainM, loss: elevationLossM } = accumulateElevation(altitudes, gaps);

  let totalMeters = 0;
  let movingSeconds = 0;

  for (let i = 1; i < points.length; i++) {
    if (gaps[i] > MAX_GAP_SECONDS) continue;
    const step = haversine(points[i - 1], points[i]);
    totalMeters += step;
    // Standing still still burns clock but is not "moving time" — the
    // distinction is what makes moving pace comparable between runs.
    if (step > 0.4) movingSeconds += gaps[i];
  }

  const totalSeconds = Math.max(0, times[times.length - 1] - times[0]);
  const segments = buildSegments(points, speeds, gaps);

  const runSeconds = segments.filter((s) => s.kind === 'run').reduce((a, s) => a + s.seconds, 0);
  const walkSeconds = segments.filter((s) => s.kind === 'walk').reduce((a, s) => a + s.seconds, 0);
  const runMeters = segments.filter((s) => s.kind === 'run').reduce((a, s) => a + s.meters, 0);
  const walkMeters = segments.filter((s) => s.kind === 'walk').reduce((a, s) => a + s.meters, 0);
  const longest = segments
    .filter((s) => s.kind === 'run')
    .reduce<Segment | null>((best, s) => (!best || s.seconds > best.seconds ? s : best), null);

  return {
    totalMeters: Math.round(totalMeters),
    totalMiles: totalMeters / M_PER_MILE,
    totalSeconds: Math.round(totalSeconds),
    movingSeconds: Math.round(movingSeconds),
    runSeconds,
    walkSeconds,
    runMeters,
    walkMeters,
    longestRunSeconds: longest?.seconds ?? 0,
    longestRunMeters: longest?.meters ?? 0,
    avgPaceMinPerMile: paceFrom(totalMeters, movingSeconds || totalSeconds),
    runPaceMinPerMile: paceFrom(runMeters, runSeconds),
    walkPaceMinPerMile: paceFrom(walkMeters, walkSeconds),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    segments,
    splits: buildSplits(points, gaps, segments, altitudes),
    speedTrace: buildTrace(points, speeds, segments, times),
  };
}

/** Per-mile splits, with how much of each mile was actually run. */
function buildSplits(
  points: RoutePoint[],
  gaps: number[],
  segments: Segment[],
  altitudes: number[]
): Split[] {
  const kindAt = new Map<number, 'run' | 'walk'>();
  for (const seg of segments) {
    for (let i = seg.startIndex; i <= seg.endIndex; i++) kindAt.set(i, seg.kind);
  }

  const splits: Split[] = [];
  let cumulative = 0;
  let mileStartDistance = 0;
  let seconds = 0;
  let runSeconds = 0;
  let gain = 0;

  for (let i = 1; i < points.length; i++) {
    if (gaps[i] > MAX_GAP_SECONDS) continue;
    const step = haversine(points[i - 1], points[i]);
    cumulative += step;
    seconds += gaps[i];
    if (kindAt.get(i) === 'run') runSeconds += gaps[i];

    const a = altitudes[i - 1];
    const b = altitudes[i];
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) gain += b - a;

    if (cumulative - mileStartDistance >= M_PER_MILE) {
      splits.push({
        mile: splits.length + 1,
        seconds: Math.round(seconds),
        paceMinPerMile: seconds / 60,
        runShare: seconds > 0 ? runSeconds / seconds : 0,
        elevationGainM: Math.round(gain),
      });
      mileStartDistance += M_PER_MILE;
      seconds = 0;
      runSeconds = 0;
      gain = 0;
    }
  }

  // The trailing partial mile, scaled to a full-mile pace so it is comparable.
  const remaining = cumulative - mileStartDistance;
  if (remaining > M_PER_MILE * 0.1 && seconds > 0) {
    splits.push({
      mile: splits.length + 1,
      seconds: Math.round(seconds),
      paceMinPerMile: seconds / 60 / (remaining / M_PER_MILE),
      runShare: runSeconds / seconds,
      elevationGainM: Math.round(gain),
    });
  }

  return splits;
}

/** Downsamples to roughly 240 points — enough shape for a chart, small enough to ship. */
function buildTrace(
  points: RoutePoint[],
  speeds: number[],
  segments: Segment[],
  times: number[]
): RunAnalysis['speedTrace'] {
  const kindAt = new Map<number, 'run' | 'walk'>();
  for (const seg of segments) {
    for (let i = seg.startIndex; i <= seg.endIndex; i++) kindAt.set(i, seg.kind);
  }

  const target = 240;
  const stride = Math.max(1, Math.floor(points.length / target));
  const trace: RunAnalysis['speedTrace'] = [];
  for (let i = 0; i < points.length; i += stride) {
    trace.push({
      t: Math.round(times[i] - times[0]),
      speed: Math.round(speeds[i] * 100) / 100,
      kind: kindAt.get(i) ?? 'walk',
    });
  }
  return trace;
}

/** "13:24" from 13.4 minutes per mile. */
export function formatPace(minPerMile: number | null): string {
  if (minPerMile === null || !Number.isFinite(minPerMile) || minPerMile <= 0) return '—';
  const mins = Math.floor(minPerMile);
  const secs = Math.round((minPerMile - mins) * 60);
  return secs === 60 ? `${mins + 1}:00` : `${mins}:${String(secs).padStart(2, '0')}`;
}

/** "1:04:12" or "7:30". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
