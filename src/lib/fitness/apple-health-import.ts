/**
 * Normalises a Health Auto Export (HAE) payload into Mission Control's tables.
 *
 * Payload shape: https://github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format
 *
 * Two things drive the design:
 *  - HAE's public docs document the metric *structures* but not the exact
 *    `name` strings, so the mapping below is best-effort and anything
 *    unrecognised is reported back in `unmappedMetrics` rather than dropped
 *    silently. The route stores the raw payload alongside it.
 *  - Dates arrive as "yyyy-MM-dd HH:mm:ss Z" (e.g. "2026-07-29 06:30:00 -0400"),
 *    which `new Date()` does not parse reliably — see parseHaeDate.
 */

export type HaeQuantity = { qty?: number; units?: string };

export type HaeMetric = {
  name?: string;
  units?: string;
  data?: Array<Record<string, unknown>>;
};

export type HaeWorkout = {
  id?: string;
  name?: string;
  start?: string;
  end?: string;
  duration?: number;
  activeEnergyBurned?: HaeQuantity;
  totalEnergy?: HaeQuantity;
  distance?: HaeQuantity;
  elevation?: { ascent?: number; descent?: number; units?: string };
  heartRate?: { min?: HaeQuantity; avg?: HaeQuantity; max?: HaeQuantity };
  stepCount?: HaeQuantity;
  isIndoor?: boolean;
  location?: string;
};

export type HaePayload = {
  data?: {
    metrics?: HaeMetric[];
    workouts?: HaeWorkout[];
  };
};

/** Row shaped for body_metrics, keyed by metric_date. */
export type BodyMetricRow = {
  metric_date: string;
  resting_hr?: number;
  hrv_ms?: number;
  vo2_max?: number;
  weight_lbs?: number;
  body_fat_pct?: number;
  muscle_mass_lbs?: number;
  bmi?: number;
};

export type DailySummaryRow = {
  summary_date: string;
  total_steps?: number;
  distance_miles?: number;
  floors_climbed?: number;
  active_calories?: number;
  bmr_calories?: number;
  total_calories?: number;
  resting_hr?: number;
  min_hr?: number;
  max_hr?: number;
};

export type SleepRow = {
  sleep_date: string;
  sleep_start?: string;
  sleep_end?: string;
  total_sleep_seconds?: number;
  light_sleep_seconds?: number;
  deep_sleep_seconds?: number;
  rem_sleep_seconds?: number;
  /** Column is `awake_seconds` in sleep_logs, not `awake_sleep_seconds`. */
  awake_seconds?: number;
};

export type BpRow = {
  reading_date: string;
  systolic: number;
  diastolic: number;
};

export type WorkoutRow = {
  apple_workout_id: string;
  workout_type: string;
  workout_date: string;
  duration_minutes: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  cardio: {
    avg_hr: number | null;
    max_hr: number | null;
    distance_miles: number | null;
    calories: number | null;
  } | null;
};

export type RunningDynamicsRow = {
  metric_date: string;
  ground_contact_ms?: number;
  stride_length_m?: number;
  vertical_oscillation_cm?: number;
  power_watts?: number;
  speed_mph?: number;
};

export type MobilityRow = {
  metric_date: string;
  walking_asymmetry_pct?: number;
  double_support_pct?: number;
  walking_speed_mph?: number;
  step_length_in?: number;
  walking_hr_avg?: number;
  stair_speed_up_fps?: number;
  stair_speed_down_fps?: number;
  six_minute_walk_m?: number;
  cardio_recovery_bpm?: number;
};

export type RoutePoint = { lat: number; lon: number; alt?: number; ts?: string; speed?: number };

export type RouteRow = {
  apple_workout_id: string;
  point_count: number;
  start_lat: number;
  start_lon: number;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  points: RoutePoint[];
};

export type NormalizedAppleHealth = {
  bodyMetrics: BodyMetricRow[];
  dailySummaries: DailySummaryRow[];
  sleep: SleepRow[];
  bloodPressure: BpRow[];
  workouts: WorkoutRow[];
  runningDynamics: RunningDynamicsRow[];
  mobility: MobilityRow[];
  routes: RouteRow[];
  /** Every metric name present in the payload. */
  seenMetrics: string[];
  /** Names we had no mapping for — surfaced so the mapping can be extended. */
  unmappedMetrics: string[];
};

/**
 * HAE emits "2026-07-29 06:30:00 -0400". Safari and Node both refuse that
 * (space separator, offset without a colon), so rewrite it into ISO 8601
 * before handing it to Date. Plain "yyyy-MM-dd" is passed through as a date.
 */
export function parseHaeDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();

  // Date-only, e.g. sleep_analysis aggregated rows.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (m) {
    const [, date, time, offsetRaw] = m;
    let offset = offsetRaw ?? '';
    if (offset && offset !== 'Z' && !offset.includes(':')) {
      offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
    }
    const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}${offset}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * The calendar day a sample belongs to, in the offset the phone reported.
 * Using the raw offset rather than the server's timezone keeps a 11pm workout
 * on the day you did it instead of pushing it to tomorrow in UTC.
 */
export function haeLocalDate(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const direct = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const d = parseHaeDate(raw);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

const LB_PER_KG = 2.2046226218;
const MI_PER_KM = 0.621371;

function toLbs(qty: number, units?: string): number {
  const u = (units ?? '').toLowerCase();
  if (u.includes('kg')) return qty * LB_PER_KG;
  return qty;
}

function toMiles(qty: number, units?: string): number {
  const u = (units ?? '').toLowerCase();
  if (u.includes('km')) return qty * MI_PER_KM;
  return qty;
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Case/spacing-insensitive lookup key, so "Step Count" == "step_count". */
function metricKey(name: string): string {
  return name.toLowerCase().replace(/[\s-]+/g, '_');
}

type Target = 'body' | 'daily' | 'running' | 'mobility';
type Agg = 'sum' | 'last' | 'avg';

type MetricSpec = {
  target: Target;
  field: string;
  agg: Agg;
  convert?: (qty: number, units?: string) => number;
};

/**
 * Known HAE metric names → destination column. Aliases are included because
 * the exact strings aren't published; unknown names are reported, not dropped.
 */
const METRIC_MAP: Record<string, MetricSpec> = {
  // Point-in-time body metrics.
  resting_heart_rate: { target: 'body', field: 'resting_hr', agg: 'last' },
  heart_rate_variability: { target: 'body', field: 'hrv_ms', agg: 'avg' },
  heart_rate_variability_sdnn: { target: 'body', field: 'hrv_ms', agg: 'avg' },
  vo2_max: { target: 'body', field: 'vo2_max', agg: 'last' },
  weight_body_mass: { target: 'body', field: 'weight_lbs', agg: 'last', convert: toLbs },
  body_mass: { target: 'body', field: 'weight_lbs', agg: 'last', convert: toLbs },
  weight: { target: 'body', field: 'weight_lbs', agg: 'last', convert: toLbs },
  body_fat_percentage: { target: 'body', field: 'body_fat_pct', agg: 'last' },
  lean_body_mass: { target: 'body', field: 'muscle_mass_lbs', agg: 'last', convert: toLbs },
  body_mass_index: { target: 'body', field: 'bmi', agg: 'last' },

  // Cumulative daily totals.
  step_count: { target: 'daily', field: 'total_steps', agg: 'sum' },
  steps: { target: 'daily', field: 'total_steps', agg: 'sum' },
  walking_running_distance: { target: 'daily', field: 'distance_miles', agg: 'sum', convert: toMiles },
  distance_walking_running: { target: 'daily', field: 'distance_miles', agg: 'sum', convert: toMiles },
  flights_climbed: { target: 'daily', field: 'floors_climbed', agg: 'sum' },
  active_energy: { target: 'daily', field: 'active_calories', agg: 'sum' },
  active_energy_burned: { target: 'daily', field: 'active_calories', agg: 'sum' },
  basal_energy_burned: { target: 'daily', field: 'bmr_calories', agg: 'sum' },
  resting_energy: { target: 'daily', field: 'bmr_calories', agg: 'sum' },

  // Vitals that ride along with the wearable.
  blood_oxygen_saturation: { target: 'body', field: 'blood_oxygen_pct', agg: 'avg' },
  respiratory_rate: { target: 'body', field: 'respiratory_rate', agg: 'avg' },

  // Apple activity rings.
  apple_exercise_time: { target: 'daily', field: 'exercise_minutes', agg: 'sum' },
  apple_stand_time: { target: 'daily', field: 'stand_minutes', agg: 'sum' },
  apple_stand_hour: { target: 'daily', field: 'stand_hours', agg: 'sum' },
  time_in_daylight: { target: 'daily', field: 'daylight_minutes', agg: 'sum' },

  // Running dynamics — reported as daily aggregates on run days.
  running_ground_contact_time: { target: 'running', field: 'ground_contact_ms', agg: 'avg' },
  running_stride_length: { target: 'running', field: 'stride_length_m', agg: 'avg' },
  running_vertical_oscillation: { target: 'running', field: 'vertical_oscillation_cm', agg: 'avg' },
  running_power: { target: 'running', field: 'power_watts', agg: 'avg' },
  running_speed: { target: 'running', field: 'speed_mph', agg: 'avg' },

  // Mobility / gait.
  walking_asymmetry_percentage: { target: 'mobility', field: 'walking_asymmetry_pct', agg: 'avg' },
  walking_double_support_percentage: { target: 'mobility', field: 'double_support_pct', agg: 'avg' },
  walking_speed: { target: 'mobility', field: 'walking_speed_mph', agg: 'avg' },
  walking_step_length: { target: 'mobility', field: 'step_length_in', agg: 'avg' },
  walking_heart_rate_average: { target: 'mobility', field: 'walking_hr_avg', agg: 'avg' },
  stair_speed_up: { target: 'mobility', field: 'stair_speed_up_fps', agg: 'avg' },
  stair_speed_down: { target: 'mobility', field: 'stair_speed_down_fps', agg: 'avg' },
  six_minute_walking_test_distance: { target: 'mobility', field: 'six_minute_walk_m', agg: 'last' },
  cardio_recovery: { target: 'mobility', field: 'cardio_recovery_bpm', agg: 'last' },
};

/** body_metrics columns typed `integer` rather than `numeric`. */
const BODY_INT_FIELDS = new Set(['resting_hr', 'hrv_ms']);

/** Metrics handled by bespoke branches rather than METRIC_MAP. */
const SPECIAL_METRICS = new Set(['sleep_analysis', 'blood_pressure', 'heart_rate']);

export function normalizeApplePayload(payload: HaePayload): NormalizedAppleHealth {
  const metrics = payload?.data?.metrics ?? [];
  const workouts = payload?.data?.workouts ?? [];

  const seenMetrics: string[] = [];
  const unmappedMetrics: string[] = [];

  // date -> field -> running value
  const body = new Map<string, Record<string, number>>();
  const daily = new Map<string, Record<string, number>>();
  const running = new Map<string, Record<string, number>>();
  const mobility = new Map<string, Record<string, number>>();
  const counts = new Map<string, number>(); // for 'avg'
  const sleep = new Map<string, SleepRow>();
  const bp: BpRow[] = [];

  const stores: Record<Target, Map<string, Record<string, number>>> = {
    body,
    daily,
    running,
    mobility,
  };

  const bucket = (target: Target, date: string) => {
    const store = stores[target];
    let row = store.get(date);
    if (!row) {
      row = {};
      store.set(date, row);
    }
    return row;
  };

  for (const metric of metrics) {
    const rawName = typeof metric?.name === 'string' ? metric.name : '';
    if (!rawName) continue;
    const key = metricKey(rawName);
    seenMetrics.push(rawName);

    const points = Array.isArray(metric.data) ? metric.data : [];

    if (key === 'sleep_analysis') {
      for (const p of points) {
        const date = haeLocalDate(p.sleepEnd ?? p.date);
        if (!date) continue;
        const hours = (v: unknown) => {
          const n = num(v);
          return n === undefined ? undefined : Math.round(n * 3600);
        };
        const start = parseHaeDate(p.sleepStart);
        const end = parseHaeDate(p.sleepEnd);
        // sleep_start / sleep_end / total_sleep_seconds are NOT NULL in
        // sleep_logs, so an entry missing any of them is skipped rather than
        // failing the whole batch.
        const total = hours(p.totalSleep ?? p.asleep);
        if (!start || !end || total === undefined) continue;

        const row: SleepRow = {
          sleep_date: date,
          sleep_start: start.toISOString(),
          sleep_end: end.toISOString(),
          total_sleep_seconds: total,
          light_sleep_seconds: hours(p.core),
          deep_sleep_seconds: hours(p.deep),
          rem_sleep_seconds: hours(p.rem),
          awake_seconds: hours(p.awake),
        };
        // Apple records naps and fragments as their own sessions — roughly
        // two thirds of them in practice. Keep the longest session for a day
        // so an afternoon nap can't overwrite the night's sleep; last-write
        // would make the winner depend on payload ordering.
        const existing = sleep.get(date);
        if (!existing || (row.total_sleep_seconds ?? 0) > (existing.total_sleep_seconds ?? 0)) {
          sleep.set(date, row);
        }
      }
      continue;
    }

    if (key === 'blood_pressure') {
      for (const p of points) {
        const systolic = num(p.systolic);
        const diastolic = num(p.diastolic);
        const d = parseHaeDate(p.date);
        if (systolic === undefined || diastolic === undefined || !d) continue;
        bp.push({ reading_date: d.toISOString(), systolic, diastolic });
      }
      continue;
    }

    if (key === 'heart_rate') {
      // Daily HR envelope; resting HR comes from its own metric.
      for (const p of points) {
        const date = haeLocalDate(p.date);
        if (!date) continue;
        const row = bucket('daily', date);
        const min = num(p.Min ?? p.min);
        const max = num(p.Max ?? p.max);
        if (min !== undefined) row.min_hr = Math.min(row.min_hr ?? min, min);
        if (max !== undefined) row.max_hr = Math.max(row.max_hr ?? max, max);
      }
      continue;
    }

    const spec = METRIC_MAP[key];
    if (!spec) {
      if (!SPECIAL_METRICS.has(key)) unmappedMetrics.push(rawName);
      continue;
    }

    for (const p of points) {
      const date = haeLocalDate(p.date);
      if (!date) continue;
      const raw = num(p.qty ?? p.Avg ?? p.avg);
      if (raw === undefined) continue;
      const value = spec.convert ? spec.convert(raw, (p.units as string) ?? metric.units) : raw;

      const row = bucket(spec.target, date);
      const countKey = `${spec.target}:${date}:${spec.field}`;
      if (spec.agg === 'sum') {
        row[spec.field] = (row[spec.field] ?? 0) + value;
      } else if (spec.agg === 'last') {
        row[spec.field] = value;
      } else {
        const n = (counts.get(countKey) ?? 0) + 1;
        counts.set(countKey, n);
        row[spec.field] = ((row[spec.field] ?? 0) * (n - 1) + value) / n;
      }
    }
  }

  const bodyMetrics: BodyMetricRow[] = [...body.entries()].map(([metric_date, fields]) => {
    const out: BodyMetricRow = { metric_date };
    for (const [k, v] of Object.entries(fields)) {
      // resting_hr and hrv_ms are integer columns; the rest are numeric.
      (out as Record<string, unknown>)[k] = BODY_INT_FIELDS.has(k)
        ? Math.round(v)
        : round(v, k === 'weight_lbs' ? 1 : 2);
    }
    return out;
  });

  const dailySummaries: DailySummaryRow[] = [...daily.entries()].map(([summary_date, fields]) => {
    const out: DailySummaryRow = { summary_date };
    for (const [k, v] of Object.entries(fields)) {
      const isInt = k !== 'distance_miles';
      (out as Record<string, unknown>)[k] = isInt ? Math.round(v) : round(v, 2);
    }
    if (out.active_calories !== undefined || out.bmr_calories !== undefined) {
      out.total_calories = (out.active_calories ?? 0) + (out.bmr_calories ?? 0);
    }
    return out;
  });

  const simpleRows = <T extends { metric_date: string }>(
    store: Map<string, Record<string, number>>,
    intFields: string[] = []
  ): T[] =>
    [...store.entries()].map(([metric_date, fields]) => {
      const out: Record<string, unknown> = { metric_date };
      for (const [k, v] of Object.entries(fields)) {
        out[k] = intFields.includes(k) ? Math.round(v) : round(v, 2);
      }
      return out as T;
    });

  return {
    bodyMetrics,
    dailySummaries,
    sleep: [...sleep.values()],
    bloodPressure: bp,
    workouts: normalizeWorkouts(workouts),
    runningDynamics: simpleRows<RunningDynamicsRow>(running),
    mobility: simpleRows<MobilityRow>(mobility, ['walking_hr_avg', 'cardio_recovery_bpm']),
    routes: extractRoutes(workouts),
    seenMetrics: [...new Set(seenMetrics)],
    unmappedMetrics: [...new Set(unmappedMetrics)],
  };
}

/** Beyond this many GPS points we thin evenly — plenty for drawing a map. */
const MAX_ROUTE_POINTS = 4000;

function extractRoutes(workouts: HaeWorkout[]): RouteRow[] {
  const out: RouteRow[] = [];
  for (const w of workouts) {
    const raw = (w as { route?: unknown }).route;
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const start = parseHaeDate(w?.start);
    const id =
      (typeof w?.id === 'string' && w.id.trim()) ||
      (start ? `${w?.name ?? 'workout'}-${start.toISOString()}` : '');
    if (!id) continue;

    const parsed: RoutePoint[] = [];
    for (const p of raw as Array<Record<string, unknown>>) {
      const lat = num(p.latitude);
      const lon = num(p.longitude);
      if (lat === undefined || lon === undefined) continue;
      const alt = num(p.altitude);
      const speed = num(p.speed);
      const ts = parseHaeDate(p.timestamp);
      parsed.push({
        lat,
        lon,
        ...(alt === undefined ? {} : { alt: round(alt, 1) }),
        ...(speed === undefined ? {} : { speed: round(speed, 2) }),
        ...(ts ? { ts: ts.toISOString() } : {}),
      });
    }
    if (!parsed.length) continue;

    // Elevation change is computed before thinning, so a downsampled route
    // still reports the climb it actually had.
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < parsed.length; i++) {
      const prev = parsed[i - 1].alt;
      const cur = parsed[i].alt;
      if (prev === undefined || cur === undefined) continue;
      const delta = cur - prev;
      if (delta > 0) gain += delta;
      else loss -= delta;
    }

    let points = parsed;
    if (parsed.length > MAX_ROUTE_POINTS) {
      const stride = Math.ceil(parsed.length / MAX_ROUTE_POINTS);
      points = parsed.filter((_, i) => i % stride === 0);
      // Always keep the finish so the trace closes where the run ended.
      const last = parsed[parsed.length - 1];
      if (points[points.length - 1] !== last) points.push(last);
    }

    const lats = parsed.map((p) => p.lat);
    const lons = parsed.map((p) => p.lon);

    out.push({
      apple_workout_id: id,
      point_count: points.length,
      start_lat: round(parsed[0].lat, 6),
      start_lon: round(parsed[0].lon, 6),
      min_lat: round(Math.min(...lats), 6),
      max_lat: round(Math.max(...lats), 6),
      min_lon: round(Math.min(...lons), 6),
      max_lon: round(Math.max(...lons), 6),
      elevation_gain_m: round(gain, 1),
      elevation_loss_m: round(loss, 1),
      points,
    });
  }
  return out;
}

function normalizeWorkouts(workouts: HaeWorkout[]): WorkoutRow[] {
  const out: WorkoutRow[] = [];
  for (const w of workouts) {
    const start = parseHaeDate(w?.start);
    // Without a stable id we can't dedupe, so fall back to a deterministic
    // key built from the workout's identity rather than risk duplicates.
    const id =
      (typeof w?.id === 'string' && w.id.trim()) ||
      (start ? `${w?.name ?? 'workout'}-${start.toISOString()}` : '');
    if (!id || !start) continue;

    const end = parseHaeDate(w?.end);
    let minutes: number | null = null;
    if (end) minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if ((minutes === null || minutes <= 0) && num(w?.duration) !== undefined) {
      // HAE reports duration in seconds.
      minutes = Math.round((num(w.duration) as number) / 60);
    }
    if (minutes !== null && minutes <= 0) minutes = null;

    const avg = num(w?.heartRate?.avg?.qty);
    const max = num(w?.heartRate?.max?.qty);
    const distanceQty = num(w?.distance?.qty);
    const distance = distanceQty === undefined ? null : toMiles(distanceQty, w?.distance?.units);
    const calories = num(w?.activeEnergyBurned?.qty) ?? num(w?.totalEnergy?.qty) ?? null;

    const hasCardio = avg !== undefined || max !== undefined || distance !== null || calories !== null;

    out.push({
      apple_workout_id: id,
      workout_type: (typeof w?.name === 'string' && w.name.trim()) || 'Workout',
      workout_date: start.toISOString(),
      duration_minutes: minutes,
      avg_hr: avg === undefined ? null : Math.round(avg),
      max_hr: max === undefined ? null : Math.round(max),
      cardio: hasCardio
        ? {
            avg_hr: avg === undefined ? null : Math.round(avg),
            max_hr: max === undefined ? null : Math.round(max),
            distance_miles: distance === null ? null : Math.round(distance * 100) / 100,
            calories: calories === null ? null : Math.round(calories),
          }
        : null,
    });
  }
  return out;
}
